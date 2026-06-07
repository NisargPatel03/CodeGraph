import type { ParsedFile } from './repoParser';

export interface DependencyNode {
  id: string; // File path (e.g. "src/components/Button.tsx")
  name: string; // File name (e.g. "Button.tsx")
  size: number; // Size in bytes
  language: string;
  folder: string; // Parent folder
  isNpm?: boolean;
  churn?: number;
  complexity?: number;
}

export interface DependencyLink {
  source: string; // Importer path
  target: string; // Imported path
  weight?: number; // Import weight / frequency
}

export interface CallNode {
  id: string; // "file::functionName"
  name: string;
  file: string;
  callCount: number;
}

export interface CallLink {
  source: string;
  target: string;
}

export interface ClassNode {
  id: string; // "file::className"
  name: string;
  file: string;
  type: 'class' | 'component';
  props?: string[];
  state?: string[];
  hooks?: string[];
}

export interface ClassLink {
  source: string;
  target: string; // Parent class / parent component
}

export interface CodebaseGraph {
  nodes: DependencyNode[];
  links: DependencyLink[];
  npmNodes: DependencyNode[];
  npmLinks: DependencyLink[];
  cycles: string[][];
  callNodes: CallNode[];
  callLinks: CallLink[];
  classNodes: ClassNode[];
  classLinks: ClassLink[];
}

// Helper to get directory name
function getDirectory(filePath: string): string {
  const parts = filePath.split('/');
  parts.pop();
  return parts.join('/');
}

// Clean path by resolving relative steps like ./ and ../
function resolveRelativePath(baseDir: string, relativePath: string): string {
  if (!baseDir) return relativePath.replace(/^\.\//, '');
  
  const baseParts = baseDir.split('/');
  const relParts = relativePath.split('/');
  
  for (const part of relParts) {
    if (part === '.') {
      continue;
    } else if (part === '..') {
      baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }
  
  return baseParts.join('/');
}

// Try resolving standard TS/JS import formats (extensions omission, index resolution, and @/ alias)
function resolveImportPath(importerPath: string, importString: string, filePaths: Set<string>): string | null {
  let targetPath = importString;
  
  // Resolve alias (e.g., "@/components/Header" -> "src/components/Header")
  if (targetPath.startsWith('@/')) {
    targetPath = 'src/' + targetPath.substring(2);
  }
  
  // Resolve relative imports (starts with . or ..)
  if (targetPath.startsWith('.')) {
    const baseDir = getDirectory(importerPath);
    targetPath = resolveRelativePath(baseDir, targetPath);
  } else if (!importString.startsWith('@/')) {
    // External dependency (e.g., "react", "d3")
    return null; 
  }

  // Extensions to search for
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.css', '.html', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
  
  // Check direct path match
  if (filePaths.has(targetPath)) return targetPath;
  
  // Try appending extensions
  for (const ext of extensions) {
    const checkPath = targetPath + ext;
    if (filePaths.has(checkPath)) {
      return checkPath;
    }
  }

  // If path is a folder without extension, check if it matches a prefix in the file paths list
  for (const path of filePaths) {
    if (path.startsWith(targetPath + '/')) {
      return path;
    }
  }

  return null;
}

// Parses imports in JavaScript, TypeScript, Python, and other languages via RegExp
function parseImports(file: ParsedFile, filePaths: Set<string>): { internal: { path: string; weight: number }[]; external: { name: string; weight: number }[] } {
  const internalMap = new Map<string, number>();
  const externalMap = new Map<string, number>();
  const content = file.content;
  
  if (['typescript', 'javascript'].includes(file.language)) {
    // 1. ES6 import/export from syntax
    // matches: import ... from 'path'; or export ... from 'path';
    const es6Regex = /(?:import|export)\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = es6Regex.exec(content)) !== null) {
      const imp = match[1];
      let symbolCount = 1;
      const braceMatch = match[0].match(/\{([\s\S]*?)\}/);
      if (braceMatch) {
        const symbols = braceMatch[1].split(',').map(s => s.trim()).filter(Boolean);
        symbolCount = symbols.length || 1;
      }
      
      const isRel = imp.startsWith('.') || imp.startsWith('@/');
      if (isRel) {
        const resolved = resolveImportPath(file.path, imp, filePaths);
        if (resolved && resolved !== file.path) {
          internalMap.set(resolved, (internalMap.get(resolved) || 0) + symbolCount);
        }
      } else {
        let pkg = imp;
        if (imp.startsWith('@')) {
          const parts = imp.split('/');
          if (parts.length >= 2) {
            pkg = `${parts[0]}/${parts[1]}`;
          }
        } else {
          pkg = imp.split('/')[0];
        }
        externalMap.set(pkg, (externalMap.get(pkg) || 0) + symbolCount);
      }
    }
    
    // 2. ES6 dynamic import(...)
    const dynamicRegex = /\bimport\((['"])([^'"]+)\1\)/g;
    while ((match = dynamicRegex.exec(content)) !== null) {
      const imp = match[2];
      const isRel = imp.startsWith('.') || imp.startsWith('@/');
      if (isRel) {
        const resolved = resolveImportPath(file.path, imp, filePaths);
        if (resolved && resolved !== file.path) {
          internalMap.set(resolved, (internalMap.get(resolved) || 0) + 1);
        }
      } else {
        const pkg = imp.startsWith('@') ? imp.split('/').slice(0, 2).join('/') : imp.split('/')[0];
        externalMap.set(pkg, (externalMap.get(pkg) || 0) + 1);
      }
    }
    
    // 3. CommonJS require('...')
    const cjsRegex = /\brequire\((['"])([^'"]+)\1\)/g;
    while ((match = cjsRegex.exec(content)) !== null) {
      const imp = match[2];
      const isRel = imp.startsWith('.') || imp.startsWith('@/');
      if (isRel) {
        const resolved = resolveImportPath(file.path, imp, filePaths);
        if (resolved && resolved !== file.path) {
          internalMap.set(resolved, (internalMap.get(resolved) || 0) + 1);
        }
      } else {
        const pkg = imp.startsWith('@') ? imp.split('/').slice(0, 2).join('/') : imp.split('/')[0];
        externalMap.set(pkg, (externalMap.get(pkg) || 0) + 1);
      }
    }
  } else if (file.language === 'python') {
    // Matches: import module OR from module import name
    const pyImportRegex = /^\s*(?:import\s+([\w.]+)|from\s+([\w.]+)\s+import)/gm;
    let match;
    while ((match = pyImportRegex.exec(content)) !== null) {
      const moduleName = match[1] || match[2];
      if (moduleName) {
        const possiblePath = moduleName.replace(/\./g, '/');
        const resolved = resolveImportPath(file.path, possiblePath, filePaths);
        if (resolved && resolved !== file.path) {
          internalMap.set(resolved, (internalMap.get(resolved) || 0) + 1);
        }
      }
    }
  } else if (file.language === 'rust') {
    // Matches: use crate::module::sub; or mod module;
    const rustRegex = /^\s*(?:use\s+(?:crate::|self::|super::)?([\w:]+)|mod\s+(\w+))/gm;
    let match;
    while ((match = rustRegex.exec(content)) !== null) {
      const modPath = match[1] || match[2];
      if (modPath) {
        const possiblePath = modPath.replace(/::/g, '/');
        const resolved = resolveImportPath(file.path, possiblePath, filePaths);
        if (resolved && resolved !== file.path) {
          internalMap.set(resolved, (internalMap.get(resolved) || 0) + 1);
        }
      }
    }
  } else if (file.language === 'cpp' || file.language === 'c') {
    // Matches: #include "header.h"
    const cppRegex = /^\s*#\s*include\s+["']([^"']+)["']/gm;
    let match;
    while ((match = cppRegex.exec(content)) !== null) {
      const imp = match[1];
      const resolved = resolveImportPath(file.path, imp, filePaths);
      if (resolved && resolved !== file.path) {
        internalMap.set(resolved, (internalMap.get(resolved) || 0) + 1);
      }
    }
  }
  
  const internal: { path: string; weight: number }[] = [];
  internalMap.forEach((weight, path) => {
    internal.push({ path, weight });
  });
  
  const external: { name: string; weight: number }[] = [];
  externalMap.forEach((weight, name) => {
    external.push({ name, weight });
  });
  
  return { internal, external };
}

// Find all simple cycles (circular dependencies) using Tarjan's or simple DFS cycle finder
function findCircularDependencies(nodes: string[], adjList: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack: string[] = [];
  const recStackSet = new Set<string>();

  function dfs(node: string) {
    visited.add(node);
    recStack.push(node);
    recStackSet.add(node);

    const neighbors = adjList.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStackSet.has(neighbor)) {
        // Cycle detected!
        const cycleStartIndex = recStack.indexOf(neighbor);
        const cyclePath = recStack.slice(cycleStartIndex);
        cyclePath.push(neighbor); // Close the loop visually
        cycles.push(cyclePath);
      }
    }

    recStack.pop();
    recStackSet.delete(node);
  }

  for (const node of nodes) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  // Deduplicate cycles (e.g. cycle paths starting at different nodes in same loop)
  const uniqueCyclesMap = new Map<string, string[]>();
  for (const cycle of cycles) {
    // The cycle path excludes the closed-loop tail for hashing, then sorts it
    const innerCycle = cycle.slice(0, -1);
    const sortedHash = [...innerCycle].sort().join('->');
    if (!uniqueCyclesMap.has(sortedHash)) {
      uniqueCyclesMap.set(sortedHash, cycle);
    }
  }

  return Array.from(uniqueCyclesMap.values());
}

// Helper to extract folder paths from files
function getFolder(filePath: string): string {
  const parts = filePath.split('/');
  if (parts.length <= 1) return 'root';
  parts.pop();
  return parts.join('/');
}

// Function parser for call graphs
function extractCallGraph(files: ParsedFile[]): { callNodes: CallNode[]; callLinks: CallLink[] } {
  const functions: { name: string; file: string; id: string }[] = [];
  const contentMap = new Map<string, string>();
  
  // 1. Find function declarations
  for (const file of files) {
    contentMap.set(file.path, file.content);
    if (!['typescript', 'javascript', 'python'].includes(file.language)) continue;
    
    let regex: RegExp;
    if (file.language === 'python') {
      regex = /def\s+(\w+)\s*\(/g;
    } else {
      // JS/TS functions, arrows, and class methods
      regex = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>|(\w+)\s*\([^)]*\)\s*\{)/g;
    }
    
    let match;
    const seenNames = new Set<string>();
    while ((match = regex.exec(file.content)) !== null) {
      const name = match[1] || match[2] || match[3];
      // Skip generic variable assignments and React hook invocations (e.g. useState)
      if (name && !seenNames.has(name) && name.length > 2 && !name.startsWith('use')) {
        seenNames.add(name);
        functions.push({
          name,
          file: file.path,
          id: `${file.path}::${name}`,
        });
      }
    }
  }

  // 2. Count calls & create links
  const callNodesMap = new Map<string, CallNode>();
  const callLinks: CallLink[] = [];
  
  // Initialize nodes
  for (const fn of functions) {
    callNodesMap.set(fn.id, {
      id: fn.id,
      name: fn.name,
      file: fn.file,
      callCount: 0,
    });
  }

  // Scan file contents for invocations of these functions
  for (const sourceFn of functions) {
    const sourceFileContent = contentMap.get(sourceFn.file) || '';
    
    // We isolate the search to lines in the source function body if possible,
    // but a simpler high-performance proxy is checking if the function name appears in other files.
    for (const targetFn of functions) {
      if (sourceFn.id === targetFn.id) continue;
      
      // Look for the target function name inside the source file (e.g. calling it)
      // Check if it's imported in the source file, or if the name is invoked
      const callRegex = new RegExp(`\\b${targetFn.name}\\(`, 'g');
      if (callRegex.test(sourceFileContent)) {
        // Increment target call count
        const node = callNodesMap.get(targetFn.id);
        if (node) {
          node.callCount++;
        }
        
        callLinks.push({
          source: sourceFn.id,
          target: targetFn.id,
        });
      }
    }
  }

  return {
    callNodes: Array.from(callNodesMap.values()),
    callLinks,
  };
}

function parseComponentDetails(content: string, name: string): { props: string[]; state: string[]; hooks: string[] } {
  const props: string[] = [];
  const state: string[] = [];
  const hooks: string[] = [];

  // Find component definition to extract props
  const defRegex = new RegExp(`(?:const|function)\\s+${name}\\s*(?:=\\s*)?\\(([^)]*)\\)`, 'i');
  const defMatch = defRegex.exec(content);
  if (defMatch) {
    const params = defMatch[1];
    const braceMatch = params.match(/\{([^}]+)\}/);
    if (braceMatch) {
      braceMatch[1]
        .split(',')
        .map(p => p.split(':')[0].trim())
        .map(p => p.replace(/[{}()]/g, '').trim())
        .filter(p => p && !p.startsWith('//') && !p.startsWith('/*'))
        .forEach(p => props.push(p));
    } else if (params.trim()) {
      props.push(params.trim());
    }
  }

  // Extract state variables: matches useState(...)
  const stateRegex = /const\s+\[\s*(\w+)\s*,\s*\w+\s*\]\s*=\s*useState/g;
  let match;
  while ((match = stateRegex.exec(content)) !== null) {
    if (match[1]) state.push(match[1]);
  }

  // Extract hooks: matches useXYZ(...)
  const hookRegex = /\b(use[A-Z]\w*)\b/g;
  while ((match = hookRegex.exec(content)) !== null) {
    if (match[1] && match[1] !== 'useState') {
      hooks.push(match[1]);
    }
  }

  return {
    props: Array.from(new Set(props)),
    state: Array.from(new Set(state)),
    hooks: Array.from(new Set(hooks))
  };
}

// React component hierarchy & Class hierarchy parser
function extractClassHierarchy(files: ParsedFile[]): { classNodes: ClassNode[]; classLinks: ClassLink[] } {
  const classNodes: ClassNode[] = [];
  const classLinks: ClassLink[] = [];
  const classMap = new Map<string, ClassNode>();
  
  // 1. Detect OOP classes and React Components
  for (const file of files) {
    const content = file.content;
    
    // ES6/TS Classes: "class Button extends Component"
    const classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?/g;
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      const name = match[1];
      const parent = match[2];
      const id = `${file.path}::${name}`;
      
      const node: ClassNode = { id, name, file: file.path, type: 'class' };
      classNodes.push(node);
      classMap.set(name, node); // Map for simple linking
      
      if (parent) {
        // Add inheritance link
        const parentId = classMap.has(parent) ? classMap.get(parent)!.id : `external::${parent}`;
        classLinks.push({
          source: id,
          target: parentId,
        });
        
        // If parent node is external and not registered, add a mock node
        if (parentId.startsWith('external::') && !classNodes.some(n => n.id === parentId)) {
          classNodes.push({ id: parentId, name: parent, file: 'External Library', type: 'class' });
        }
      }
    }

    // React functional components: PascalCase functions returning jsx
    if (['typescript', 'javascript'].includes(file.language) && (file.path.endsWith('.tsx') || file.path.endsWith('.jsx'))) {
      const reactCompRegex = /(?:const\s+([A-Z]\w*)\s*=\s*(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>|function\s+([A-Z]\w*)\s*\()/g;
      const seenComp = new Set<string>();
      while ((match = reactCompRegex.exec(content)) !== null) {
        const name = match[1] || match[2];
        if (name && !seenComp.has(name) && !classMap.has(name)) {
          seenComp.add(name);
          const id = `${file.path}::${name}`;
          const { props, state, hooks } = parseComponentDetails(content, name);
          const node: ClassNode = { 
            id, 
            name, 
            file: file.path, 
            type: 'component',
            props,
            state,
            hooks
          };
          classNodes.push(node);
          classMap.set(name, node);
        }
      }
    }
  }

  // 2. React Parent-Child Links: If component A renders component B (e.g. `<B ... />` or `<B>`)
  const componentNodes = classNodes.filter(n => n.type === 'component');
  for (const parentNode of componentNodes) {
    const parentContent = files.find(f => f.path === parentNode.file)?.content || '';
    
    for (const childNode of componentNodes) {
      if (parentNode.id === childNode.id) continue;
      
      // Look for JSX invocation: `<ComponentName`
      const jsxRegex = new RegExp(`<${childNode.name}\\b`, 'g');
      if (jsxRegex.test(parentContent)) {
        classLinks.push({
          source: parentNode.id,
          target: childNode.id,
        });
      }
    }
  }

  return { classNodes, classLinks };
}

// Main analyzer runner
export function analyzeCodebase(files: ParsedFile[]): CodebaseGraph {
  const filePaths = new Set(files.map((f) => f.path));
  
  // 1. Build nodes
  const nodes: DependencyNode[] = files.map((file) => {
    // Generate pseudo-random but reproducible churn score (e.g. 1 to 60 commits)
    const pathSum = file.path.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const churn = Math.floor(((file.size + pathSum) % 55) + 5);
    
    // Lines of code complexity
    const complexity = file.content.split('\n').length;
    
    return {
      id: file.path,
      name: file.name,
      size: file.size,
      language: file.language,
      folder: getFolder(file.path),
      churn,
      complexity,
    };
  });
  
  // 2. Build links and build Adjacency List
  const links: DependencyLink[] = [];
  const npmLinks: DependencyLink[] = [];
  const npmPackagesSeen = new Set<string>();
  const adjList = new Map<string, string[]>();
  
  // Initialize adj list
  for (const file of files) {
    adjList.set(file.path, []);
  }
  
  for (const file of files) {
    const { internal, external } = parseImports(file, filePaths);
    
    for (const target of internal) {
      links.push({
        source: file.path,
        target: target.path,
        weight: target.weight,
      });
      adjList.get(file.path)?.push(target.path);
    }
    
    for (const pkg of external) {
      npmPackagesSeen.add(pkg.name);
      npmLinks.push({
        source: file.path,
        target: `npm::${pkg.name}`,
        weight: pkg.weight,
      });
    }
  }
  
  // Build npm nodes
  const npmNodes: DependencyNode[] = Array.from(npmPackagesSeen).map((pkg) => ({
    id: `npm::${pkg}`,
    name: pkg,
    size: 200,
    language: 'npm',
    folder: 'node_modules',
    isNpm: true,
    churn: 1,
    complexity: 1,
  }));
  
  // 3. Cycle Detection
  const cycles = findCircularDependencies(files.map((f) => f.path), adjList);
  
  // 4. Call Graph Extraction
  const { callNodes, callLinks } = extractCallGraph(files);
  
  // 5. Class / React Component Hierarchies
  const { classNodes, classLinks } = extractClassHierarchy(files);
  
  return {
    nodes,
    links,
    npmNodes,
    npmLinks,
    cycles,
    callNodes,
    callLinks,
    classNodes,
    classLinks,
  };
}
