import type { ParsedFile } from './repoParser';

export interface DependencyNode {
  id: string; // File path (e.g. "src/components/Button.tsx")
  name: string; // File name (e.g. "Button.tsx")
  size: number; // Size in bytes
  language: string;
  folder: string; // Parent folder
}

export interface DependencyLink {
  source: string; // Importer path
  target: string; // Imported path
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
}

export interface ClassLink {
  source: string;
  target: string; // Parent class / parent component
}

export interface CodebaseGraph {
  nodes: DependencyNode[];
  links: DependencyLink[];
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
function parseImports(file: ParsedFile, filePaths: Set<string>): string[] {
  const imports: string[] = [];
  const content = file.content;
  
  if (['typescript', 'javascript'].includes(file.language)) {
    // 1. ES6 import/export from syntax
    // matches: import ... from 'path'; or export ... from 'path';
    const es6Regex = /(?:import|export)\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = es6Regex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    // 2. ES6 dynamic import(...)
    const dynamicRegex = /\bimport\((['"])([^'"]+)\1\)/g;
    while ((match = dynamicRegex.exec(content)) !== null) {
      imports.push(match[2]);
    }
    
    // 3. CommonJS require('...')
    const cjsRegex = /\brequire\((['"])([^'"]+)\1\)/g;
    while ((match = cjsRegex.exec(content)) !== null) {
      imports.push(match[2]);
    }
  } else if (file.language === 'python') {
    // Matches: import module OR from module import name
    const pyImportRegex = /^\s*(?:import\s+([\w.]+)|from\s+([\w.]+)\s+import)/gm;
    let match;
    while ((match = pyImportRegex.exec(content)) !== null) {
      const moduleName = match[1] || match[2];
      if (moduleName) {
        // Python imports are dot-separated (e.g. src.utils.helper)
        const possiblePath = moduleName.replace(/\./g, '/');
        imports.push(possiblePath);
      }
    }
  } else if (file.language === 'rust') {
    // Matches: use crate::module::sub; or mod module;
    const rustRegex = /^\s*(?:use\s+(?:crate::|self::|super::)?([\w:]+)|mod\s+(\w+))/gm;
    let match;
    while ((match = rustRegex.exec(content)) !== null) {
      const modPath = match[1] || match[2];
      if (modPath) {
        imports.push(modPath.replace(/::/g, '/'));
      }
    }
  } else if (file.language === 'cpp' || file.language === 'c') {
    // Matches: #include "header.h"
    const cppRegex = /^\s*#\s*include\s+["']([^"']+)["']/gm;
    let match;
    while ((match = cppRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
  }
  
  // Resolve import paths relative to project
  const resolvedTargets = new Set<string>();
  for (const imp of imports) {
    const resolved = resolveImportPath(file.path, imp, filePaths);
    if (resolved && resolved !== file.path) {
      resolvedTargets.add(resolved);
    }
  }
  
  return Array.from(resolvedTargets);
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
    callNodes: Array.from(callNodesMap.values()).filter(node => node.callCount > 0 || callLinks.some(l => l.source === node.id)),
    callLinks,
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
      const reactCompRegex = /const\s+([A-Z]\w*)\s*=\s*(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>/g;
      const seenComp = new Set<string>();
      while ((match = reactCompRegex.exec(content)) !== null) {
        const name = match[1];
        if (name && !seenComp.has(name) && !classMap.has(name)) {
          seenComp.add(name);
          const id = `${file.path}::${name}`;
          const node: ClassNode = { id, name, file: file.path, type: 'component' };
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
  const nodes: DependencyNode[] = files.map((file) => ({
    id: file.path,
    name: file.name,
    size: file.size,
    language: file.language,
    folder: getFolder(file.path),
  }));
  
  // 2. Build links and build Adjacency List
  const links: DependencyLink[] = [];
  const adjList = new Map<string, string[]>();
  
  // Initialize adj list
  for (const file of files) {
    adjList.set(file.path, []);
  }
  
  for (const file of files) {
    const targets = parseImports(file, filePaths);
    for (const target of targets) {
      links.push({
        source: file.path,
        target: target,
      });
      adjList.get(file.path)?.push(target);
    }
  }
  
  // 3. Cycle Detection
  const cycles = findCircularDependencies(files.map((f) => f.path), adjList);
  
  // 4. Call Graph Extraction
  const { callNodes, callLinks } = extractCallGraph(files);
  
  // 5. Class / React Component Hierarchies
  const { classNodes, classLinks } = extractClassHierarchy(files);
  
  return {
    nodes,
    links,
    cycles,
    callNodes,
    callLinks,
    classNodes,
    classLinks,
  };
}
