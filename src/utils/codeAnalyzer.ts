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

export interface CodeSmellWarning {
  id: string;
  file: string;
  type: 'file_length' | 'func_length' | 'nested_import' | 'unused_export' | 'circular_dep';
  severity: 'critical' | 'major' | 'minor';
  message: string;
  details?: string;
  line?: number;
}

export interface DuplicateFunctionGroup {
  name: string;
  locations: { file: string; line: number }[];
}

export interface CodebaseStats {
  totalFiles: number;
  totalFunctions: number;
  totalLoc: number;
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
  codeSmells: CodeSmellWarning[];
  duplicateFunctions: DuplicateFunctionGroup[];
  deadFiles: string[];
  stats: CodebaseStats;
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

function getFunctionLength(content: string, startIndex: number): number {
  let braceCount = 0;
  let started = false;
  let lines = 0;
  
  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];
    if (char === '\n') lines++;
    if (char === '{') {
      braceCount++;
      started = true;
    } else if (char === '}') {
      braceCount--;
      if (started && braceCount === 0) {
        return lines + 1;
      }
    }
  }
  return lines || 1;
}

function getPythonFunctionLength(lines: string[], startIndex: number): number {
  const startLine = lines[startIndex];
  const match = startLine.match(/^(\s*)/);
  const startIndent = match ? match[1].length : 0;
  
  let length = 1;
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      length++;
      continue;
    }
    const lineIndent = line.match(/^(\s*)/)?.[1].length || 0;
    if (lineIndent <= startIndent) {
      break;
    }
    length++;
  }
  return length;
}

interface ExtractedFunction {
  name: string;
  line: number;
  length: number;
}

function parseFunctionsInFile(content: string, language: string): ExtractedFunction[] {
  if (!content) return [];
  const lines = content.split('\n');
  const functions: ExtractedFunction[] = [];
  const lowerLang = language.toLowerCase();

  lines.forEach((line, index) => {
    let name = '';
    let isMatch = false;

    if (lowerLang === 'python') {
      const match = line.match(/^\s*def\s+([a-zA-Z0-9_]+)\s*\(/);
      if (match) {
        name = match[1];
        const len = getPythonFunctionLength(lines, index);
        functions.push({ name, line: index + 1, length: len });
      }
    } else if (lowerLang === 'go') {
      const match = line.match(/^\s*func\s+([a-zA-Z0-9_]+)\s*\(/);
      if (match) {
        name = match[1];
        isMatch = true;
      }
    } else if (lowerLang === 'rust') {
      const match = line.match(/^\s*(?:pub\s+)?fn\s+([a-zA-Z0-9_]+)\s*\(/);
      if (match) {
        name = match[1];
        isMatch = true;
      }
    } else if (['javascript', 'typescript'].includes(lowerLang)) {
      const f1 = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(/);
      if (f1) {
        name = f1[1];
        isMatch = true;
      } else {
        const f2 = line.match(/^\s*(?:export\s+)?const\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/);
        if (f2) {
          name = f2[1];
          isMatch = true;
        } else {
          const f3 = line.match(/^\s*(?:public|private|protected|async|static\s+)*([a-zA-Z0-9_]+)\s*\([^)]*\)\s*\{/);
          if (f3) {
            const tempName = f3[1];
            const reserved = ['if', 'for', 'while', 'switch', 'catch', 'constructor', 'return', 'else'];
            if (!reserved.includes(tempName)) {
              name = tempName;
              isMatch = true;
            }
          }
        }
      }
    }

    if (isMatch && name) {
      let charIndex = 0;
      for (let i = 0; i < index; i++) {
        charIndex += lines[i].length + 1;
      }
      const slice = content.slice(charIndex);
      const relativeIndex = slice.indexOf('{');
      const startBraceIndex = relativeIndex !== -1 ? charIndex + relativeIndex : charIndex;
      const len = getFunctionLength(content, startBraceIndex);
      functions.push({ name, line: index + 1, length: len });
    }
  });

  return functions;
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

  // --- CODE SMELL AND ADVANCED ANALYSIS ---
  const codeSmells: CodeSmellWarning[] = [];
  let totalLoc = 0;
  const fileFunctionsMap = new Map<string, ExtractedFunction[]>();
  let totalFunctions = 0;

  // Track all functions across files to find duplicates
  const allExtractedFunctions: { name: string; file: string; line: number }[] = [];

  files.forEach(file => {
    const loc = file.content.split('\n').length;
    totalLoc += loc;

    // 1. File over 500 lines check
    if (loc > 500) {
      codeSmells.push({
        id: `file-length-${file.path}`,
        file: file.path,
        type: 'file_length',
        severity: 'major',
        message: `File is too long (${loc} lines)`,
        details: `Files exceeding 500 lines are harder to maintain and test. Consider breaking this file into smaller, modular components.`
      });
    }

    // Parse functions in this file
    const funcs = parseFunctionsInFile(file.content, file.language);
    fileFunctionsMap.set(file.path, funcs);
    totalFunctions += funcs.length;

    funcs.forEach(fn => {
      // Track for duplicate check
      allExtractedFunctions.push({ name: fn.name, file: file.path, line: fn.line });

      // 2. Function over 50 lines check
      if (fn.length > 50) {
        codeSmells.push({
          id: `func-length-${file.path}-${fn.name}-${fn.line}`,
          file: file.path,
          type: 'func_length',
          severity: 'major',
          message: `Long function: "${fn.name}()" has ${fn.length} lines`,
          details: `Functions exceeding 50 lines of code should be refactored into smaller, helper functions.`,
          line: fn.line
        });
      }
    });

    // 3. Deeply nested imports (4+ levels) check
    if (['typescript', 'javascript'].includes(file.language)) {
      const importRegex = /(?:import|export)\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;
      const requireRegex = /\brequire\((['"])([^'"]+)\1\)/g;
      
      const checkImport = (impPath: string) => {
        const isDeep = impPath.includes('../../../../') || 
                       (!impPath.startsWith('.') && impPath.split('/').filter(Boolean).length >= 4);
        if (isDeep) {
          codeSmells.push({
            id: `nested-import-${file.path}-${impPath}`,
            file: file.path,
            type: 'nested_import',
            severity: 'minor',
            message: `Deeply nested import path: "${impPath}"`,
            details: `Nesting dependencies 4+ levels deep creates tight coupling. Consider path aliases or re-organizing directory structures.`
          });
        }
      };

      let m;
      while ((m = importRegex.exec(file.content)) !== null) {
        checkImport(m[1]);
      }
      while ((m = requireRegex.exec(file.content)) !== null) {
        checkImport(m[2]);
      }
    }
  });

  // 4. Duplicate function names check
  const duplicateFunctionsMap = new Map<string, { file: string; line: number }[]>();
  allExtractedFunctions.forEach(fn => {
    if (!duplicateFunctionsMap.has(fn.name)) {
      duplicateFunctionsMap.set(fn.name, []);
    }
    duplicateFunctionsMap.get(fn.name)!.push({ file: fn.file, line: fn.line });
  });

  const duplicateFunctions: DuplicateFunctionGroup[] = [];
  duplicateFunctionsMap.forEach((locations, name) => {
    if (locations.length > 1) {
      duplicateFunctions.push({ name, locations });
    }
  });

  // 5. Unused exports check
  files.forEach(file => {
    if (!['typescript', 'javascript'].includes(file.language)) return;

    const exportedSymbols: { name: string; line: number }[] = [];
    const lines = file.content.split('\n');
    
    lines.forEach((line, idx) => {
      const match = line.match(/export\s+(?:const|let|var|function\*?|class|type|interface|enum)\s+([a-zA-Z0-9_]+)/);
      if (match && match[1]) {
        if (match[1] !== 'default') {
          exportedSymbols.push({ name: match[1], line: idx + 1 });
        }
      }
    });

    const listExportRegex = /export\s+\{([^}]+)\}/g;
    let listMatch;
    while ((listMatch = listExportRegex.exec(file.content)) !== null) {
      if (listMatch[1]) {
        listMatch[1].split(',').forEach(s => {
          const name = s.trim().split(' as ')[0].trim();
          if (name) {
            const lineIdx = lines.findIndex(l => l.includes(listMatch![0]));
            exportedSymbols.push({ name, line: lineIdx !== -1 ? lineIdx + 1 : 1 });
          }
        });
      }
    }

    exportedSymbols.forEach(sym => {
      let referenced = false;
      for (const otherFile of files) {
        if (otherFile.path === file.path) continue;
        const wordRegex = new RegExp(`\\b${sym.name}\\b`);
        if (wordRegex.test(otherFile.content)) {
          referenced = true;
          break;
        }
      }

      if (!referenced) {
        codeSmells.push({
          id: `unused-export-${file.path}-${sym.name}`,
          file: file.path,
          type: 'unused_export',
          severity: 'minor',
          message: `Unused export: "${sym.name}" in ${file.name}`,
          details: `Exported variables or functions that are not referenced elsewhere clutter public APIs and can be safely removed or kept private.`,
          line: sym.line
        });
      }
    });
  });

  // 6. Circular dependency code smells
  cycles.forEach((cycle, idx) => {
    cycle.slice(0, -1).forEach(filePath => {
      codeSmells.push({
        id: `circular-dep-${idx}-${filePath}`,
        file: filePath,
        type: 'circular_dep',
        severity: 'critical',
        message: `Circular import cycle participant`,
        details: `This file is part of a circular dependency cycle: ${cycle.map(c => c.split('/').pop()).join(' -> ')}.`
      });
    });
  });

  // 7. Dead code files (0 incoming references)
  const incomingRefCount = new Map<string, number>();
  files.forEach(f => incomingRefCount.set(f.path, 0));
  links.forEach(l => {
    const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
    if (incomingRefCount.has(t)) {
      incomingRefCount.set(t, incomingRefCount.get(t)! + 1);
    }
  });

  const isEntryPoint = (path: string) => {
    const name = path.split('/').pop()?.toLowerCase() || '';
    return name === 'index.html' || 
           name === 'main.tsx' || 
           name === 'main.ts' || 
           name === 'index.tsx' || 
           name === 'index.ts' || 
           name === 'app.tsx' || 
           name === 'app.ts' || 
           name === 'vite.config.ts' || 
           name === 'vite.config.js' || 
           name.includes('.config.');
  };

  const deadFiles: string[] = [];
  incomingRefCount.forEach((count, path) => {
    if (count === 0 && !isEntryPoint(path)) {
      deadFiles.push(path);
      codeSmells.push({
        id: `dead-file-${path}`,
        file: path,
        type: 'unused_export',
        severity: 'major',
        message: `Dead Code: File has 0 incoming imports`,
        details: `No other file in the repository imports this file. It is likely unused/dead code that can be safely deleted.`
      });
    }
  });

  const stats: CodebaseStats = {
    totalFiles: files.length,
    totalFunctions,
    totalLoc
  };
  
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
    codeSmells,
    duplicateFunctions,
    deadFiles,
    stats,
  };
}

export interface SimulatedCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  filesAdded: string[];
  filesModified: string[];
  filesDeleted: string[];
}

export function generateGitHistory(files: ParsedFile[]): SimulatedCommit[] {
  if (!files || files.length === 0) return [];

  // Group files into logical developmental stages
  const configFiles: string[] = [];
  const utilFiles: string[] = [];
  const modelFiles: string[] = [];
  const componentFiles: string[] = [];
  const mainFiles: string[] = [];
  const otherFiles: string[] = [];

  files.forEach(f => {
    const pathLower = f.path.toLowerCase();
    if (pathLower.includes('config') || pathLower.includes('json') || pathLower.startsWith('.') || f.path === 'index.html') {
      configFiles.push(f.path);
    } else if (pathLower.includes('util') || pathLower.includes('helper') || pathLower.includes('parser') || pathLower.includes('analyzer')) {
      utilFiles.push(f.path);
    } else if (pathLower.includes('model') || pathLower.includes('types') || pathLower.includes('schema') || pathLower.includes('state') || pathLower.includes('context')) {
      modelFiles.push(f.path);
    } else if (pathLower.includes('component') || pathLower.includes('ui') || pathLower.includes('dialog') || pathLower.includes('drawer') || pathLower.includes('button') || pathLower.includes('panel') || pathLower.includes('canvas')) {
      componentFiles.push(f.path);
    } else if (f.path.includes('App.tsx') || f.path.includes('main.tsx') || f.path.includes('index.ts') || f.path.includes('App.jsx') || f.path.includes('main.js')) {
      mainFiles.push(f.path);
    } else {
      otherFiles.push(f.path);
    }
  });

  const commitsCount = 10;
  const commits: SimulatedCommit[] = [];
  
  const authors = ['Nisarg Patel', 'Jane Doe', 'Alex Rivera', 'Chen Wei', 'Sarah Jenkins'];
  const dates = [
    '2026-05-01', '2026-05-05', '2026-05-10', '2026-05-15', '2026-05-20',
    '2026-05-24', '2026-05-28', '2026-06-02', '2026-06-06', '2026-06-10'
  ];

  const shas = ['e93d8b1', 'fa20cc3', '98c76da', 'bc7d90e', '43df5a6', '0123ee0', '8fd7ac2', 'c7d043d', '1165ba0', '7a8626c'];

  const messages = [
    'Initial commit - setup project structures and environment configs',
    'feat: add core utility modules and helper functions',
    'feat: implement schema models and types',
    'feat: build layout containers and basic components',
    'refactor: optimize internal loop logic and parsing performance',
    'feat: integrate workspace sidebars and inspector panel',
    'feat: add reports manager and analytics dashboard',
    'test: implement unit tests and mock validation suite',
    'docs: update readme and release beta milestone',
    'refactor: resolve console key warnings and optimize layout styling'
  ];

  for (let i = 0; i < commitsCount; i++) {
    const filesAdded: string[] = [];
    const filesModified: string[] = [];
    const filesDeleted: string[] = [];

    if (i === 0) {
      filesAdded.push(...configFiles);
    } else if (i === 1) {
      filesAdded.push(...utilFiles);
    } else if (i === 2) {
      filesAdded.push(...modelFiles);
    } else if (i === 3) {
      const half = Math.ceil(componentFiles.length / 2);
      filesAdded.push(...componentFiles.slice(0, half));
    } else if (i === 4) {
      const half = Math.ceil(otherFiles.length / 2);
      filesAdded.push(...otherFiles.slice(0, half));
      if (utilFiles.length > 0) filesModified.push(utilFiles[0]);
    } else if (i === 5) {
      const half = Math.ceil(componentFiles.length / 2);
      filesAdded.push(...componentFiles.slice(half));
    } else if (i === 6) {
      filesAdded.push(...mainFiles);
      if (configFiles.length > 0) filesModified.push(configFiles[0]);
    } else if (i === 7) {
      const half = Math.ceil(otherFiles.length / 2);
      filesAdded.push(...otherFiles.slice(half));
    } else if (i === 8) {
      if (componentFiles.length > 0) filesModified.push(componentFiles[0]);
      if (utilFiles.length > 1) filesModified.push(utilFiles[1]);
    } else if (i === 9) {
      if (mainFiles.length > 0) filesModified.push(mainFiles[0]);
    }

    commits.push({
      sha: shas[i],
      message: messages[i],
      author: authors[i % authors.length],
      date: dates[i],
      filesAdded,
      filesModified,
      filesDeleted
    });
  }

  return commits;
}
