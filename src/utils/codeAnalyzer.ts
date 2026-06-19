import type { ParsedFile } from './repoParser';
import * as parser from '@babel/parser';

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
  isAmbiguous?: boolean;
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

// Fast, non-recursive AST walker to avoid stack overflows on large files
function walkAST(node: any, visitor: (node: any) => void) {
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    
    visitor(current);
    
    for (const key in current) {
      if (Object.prototype.hasOwnProperty.call(current, key)) {
        const value = current[key];
        if (Array.isArray(value)) {
          for (let i = value.length - 1; i >= 0; i--) {
            if (value[i] && typeof value[i] === 'object' && typeof value[i].type === 'string') {
              stack.push(value[i]);
            }
          }
        } else if (value && typeof value === 'object' && typeof value.type === 'string') {
          stack.push(value);
        }
      }
    }
  }
}

// Caching helper to get or parse the AST of a JS/TS file
function getOrParseAST(file: ParsedFile, astMap?: Map<string, any>): any {
  if (!['typescript', 'javascript'].includes(file.language)) {
    return null;
  }
  if (astMap && astMap.has(file.path)) {
    return astMap.get(file.path);
  }
  try {
    const ast = parser.parse(file.content, {
      sourceType: 'module',
      plugins: [
        'typescript',
        'jsx',
        'decorators-legacy',
        'classProperties',
        'objectRestSpread'
      ],
      errorRecovery: true
    });
    if (astMap) {
      astMap.set(file.path, ast);
    }
    return ast;
  } catch (err) {
    console.error('Babel parser failed for file:', file.path, err);
    return null;
  }
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

// Parses imports in JavaScript, TypeScript, Python, and other languages via AST/RegExp
function parseImports(
  file: ParsedFile, 
  filePaths: Set<string>, 
  astMap?: Map<string, any>
): { internal: { path: string; weight: number }[]; external: { name: string; weight: number }[] } {
  const internalMap = new Map<string, number>();
  const externalMap = new Map<string, number>();
  const content = file.content;
  
  if (['typescript', 'javascript'].includes(file.language)) {
    const ast = getOrParseAST(file, astMap);
    if (ast) {
      const recordImport = (imp: string, symbolCount: number) => {
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
      };

      try {
        walkAST(ast, (node) => {
          if (node.type === 'ImportDeclaration' && node.source && node.source.value) {
            const imp = node.source.value;
            const symbolCount = node.specifiers ? node.specifiers.length : 1;
            recordImport(imp, symbolCount || 1);
          } else if (node.type === 'ExportNamedDeclaration' && node.source && node.source.value) {
            const imp = node.source.value;
            const symbolCount = node.specifiers ? node.specifiers.length : 1;
            recordImport(imp, symbolCount || 1);
          } else if (node.type === 'ExportAllDeclaration' && node.source && node.source.value) {
            const imp = node.source.value;
            recordImport(imp, 1);
          } else if (node.type === 'CallExpression') {
            if (
              node.callee && 
              node.callee.type === 'Identifier' && 
              node.callee.name === 'require' && 
              node.arguments && 
              node.arguments.length === 1
            ) {
              const arg = node.arguments[0];
              if (arg && (arg.type === 'StringLiteral' || arg.type === 'Literal')) {
                const imp = arg.value;
                if (typeof imp === 'string') recordImport(imp, 1);
              } else if (arg && arg.type === 'TemplateLiteral' && arg.quasis && arg.quasis.length === 1) {
                const imp = arg.quasis[0].value.cooked;
                if (typeof imp === 'string') recordImport(imp, 1);
              }
            } else if (
              node.callee && 
              node.callee.type === 'Import' && 
              node.arguments && 
              node.arguments.length === 1
            ) {
              const arg = node.arguments[0];
              if (arg && (arg.type === 'StringLiteral' || arg.type === 'Literal')) {
                const imp = arg.value;
                if (typeof imp === 'string') recordImport(imp, 1);
              } else if (arg && arg.type === 'TemplateLiteral' && arg.quasis && arg.quasis.length === 1) {
                const imp = arg.quasis[0].value.cooked;
                if (typeof imp === 'string') recordImport(imp, 1);
              }
            }
          }
        });
      } catch (err) {
        console.error('Failed walking AST for imports, falling back to RegExp:', file.path, err);
      }
    } else {
      // Regexp fallback for JS/TS if AST parse fails
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

function buildImportBindings(
  file: ParsedFile,
  filePathsSet: Set<string>,
  astMap?: Map<string, any>
): { bindings: Map<string, string>; namespaces: Map<string, string> } {
  const bindings = new Map<string, string>();
  const namespaces = new Map<string, string>();
  
  if (!['typescript', 'javascript'].includes(file.language)) {
    return { bindings, namespaces };
  }
  
  const ast = getOrParseAST(file, astMap);
  if (!ast) return { bindings, namespaces };
  
  try {
    const body = ast.program ? ast.program.body : (ast.body || []);
    for (const node of body) {
      if (node.type === 'ImportDeclaration' && node.source && node.source.value) {
        const sourceVal = node.source.value;
        const resolved = resolveImportPath(file.path, sourceVal, filePathsSet);
        if (resolved) {
          for (const specifier of (node.specifiers || [])) {
            if (specifier.type === 'ImportSpecifier') {
              bindings.set(specifier.local.name, resolved);
            } else if (specifier.type === 'ImportDefaultSpecifier') {
              bindings.set(specifier.local.name, resolved);
            } else if (specifier.type === 'ImportNamespaceSpecifier') {
              namespaces.set(specifier.local.name, resolved);
            }
          }
        }
      } else if (node.type === 'VariableDeclaration') {
        for (const decl of (node.declarations || [])) {
          if (
            decl.init && 
            decl.init.type === 'CallExpression' && 
            decl.init.callee && 
            decl.init.callee.type === 'Identifier' && 
            decl.init.callee.name === 'require' && 
            decl.init.arguments && 
            decl.init.arguments.length === 1
          ) {
            const arg = decl.init.arguments[0];
            if (arg && (arg.type === 'StringLiteral' || arg.type === 'Literal') && typeof arg.value === 'string') {
              const resolved = resolveImportPath(file.path, arg.value, filePathsSet);
              if (resolved) {
                if (decl.id.type === 'Identifier') {
                  bindings.set(decl.id.name, resolved);
                  namespaces.set(decl.id.name, resolved);
                } else if (decl.id.type === 'ObjectPattern') {
                  for (const prop of (decl.id.properties || [])) {
                    if (prop.type === 'ObjectProperty' && prop.key && prop.key.type === 'Identifier' && prop.value && prop.value.type === 'Identifier') {
                      bindings.set(prop.value.name, resolved);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to parse import bindings for:', file.path, err);
  }
  
  return { bindings, namespaces };
}

// Function parser for call graphs
function extractCallGraph(
  files: ParsedFile[],
  astMap?: Map<string, any>,
  dependencyLinks?: DependencyLink[]
): { callNodes: CallNode[]; callLinks: CallLink[] } {
  const functions: { name: string; file: string; id: string; body?: any; isAst: boolean }[] = [];
  const contentMap = new Map<string, string>();
  const filePathsSet = new Set(files.map(f => f.path));
  
  // 1. Find function declarations
  for (const file of files) {
    contentMap.set(file.path, file.content);
    if (!['typescript', 'javascript', 'python', 'go', 'rust'].includes(file.language)) continue;
    
    if (['typescript', 'javascript'].includes(file.language)) {
      const ast = getOrParseAST(file, astMap);
      if (ast) {
        try {
          const seenNames = new Set<string>();
          walkAST(ast, (node) => {
            let name = '';
            let bodyNode: any = null;
            if (node.type === 'FunctionDeclaration' && node.id && node.id.name) {
              name = node.id.name;
              bodyNode = node.body;
            } else if (node.type === 'ClassMethod' && node.key && node.key.type === 'Identifier') {
              name = node.key.name;
              bodyNode = node.body;
            } else if (node.type === 'ObjectMethod' && node.key && node.key.type === 'Identifier') {
              name = node.key.name;
              bodyNode = node.body;
            } else if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier') {
              const init = node.init;
              if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
                name = node.id.name;
                bodyNode = init.body;
              }
            }
            
            if (name && !seenNames.has(name) && name.length > 2 && !name.startsWith('use')) {
              seenNames.add(name);
              functions.push({
                name,
                file: file.path,
                id: `${file.path}::${name}`,
                body: bodyNode || node,
                isAst: true
              });
            }
          });
        } catch (err) {
          console.error('Failed to parse functions for callgraph via AST:', file.path, err);
        }
      } else {
        // Regex fallback if AST fails
        const regex = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>|(\w+)\s*\([^)]*\)\s*\{)/g;
        let match;
        const seenNames = new Set<string>();
        while ((match = regex.exec(file.content)) !== null) {
          const name = match[1] || match[2] || match[3];
          if (name && !seenNames.has(name) && name.length > 2 && !name.startsWith('use')) {
            seenNames.add(name);
            functions.push({
              name,
              file: file.path,
              id: `${file.path}::${name}`,
              isAst: false
            });
          }
        }
      }
    } else {
      // Python, Go, Rust fallbacks
      let regex: RegExp;
      if (file.language === 'python') {
        regex = /def\s+(\w+)\s*\(/g;
      } else if (file.language === 'rust') {
        regex = /(?:pub\s+)?fn\s+(\w+)\s*\(/g;
      } else { // go
        regex = /func\s+(\w+)\s*\(/g;
      }
      
      let match;
      const seenNames = new Set<string>();
      while ((match = regex.exec(file.content)) !== null) {
        const name = match[1];
        if (name && !seenNames.has(name) && name.length > 2 && !name.startsWith('use')) {
          seenNames.add(name);
          functions.push({
            name,
            file: file.path,
            id: `${file.path}::${name}`,
            isAst: false
          });
        }
      }
    }
  }

  // 2. Count calls & create links
  const callNodesMap = new Map<string, CallNode>();
  const callLinks: CallLink[] = [];
  const addedLinks = new Set<string>();
  
  // Initialize nodes
  for (const fn of functions) {
    callNodesMap.set(fn.id, {
      id: fn.id,
      name: fn.name,
      file: fn.file,
      callCount: 0,
    });
  }

  // Build dependency sets for faster lookup
  const fileDeps = new Map<string, Set<string>>();
  if (dependencyLinks) {
    for (const link of dependencyLinks) {
      if (!fileDeps.has(link.source)) {
        fileDeps.set(link.source, new Set());
      }
      fileDeps.get(link.source)!.add(link.target);
    }
  }

  // Map of file path to its parsed import bindings
  const importBindingsMap = new Map<string, ReturnType<typeof buildImportBindings>>();
  for (const file of files) {
    if (['typescript', 'javascript'].includes(file.language)) {
      importBindingsMap.set(file.path, buildImportBindings(file, filePathsSet, astMap));
    }
  }

  // Scan file contents/ASTs for invocations of these functions
  for (const sourceFn of functions) {
    if (sourceFn.isAst && sourceFn.body) {
      try {
        const fileBindings = importBindingsMap.get(sourceFn.file);
        const bindings = fileBindings ? fileBindings.bindings : new Map<string, string>();
        const namespaces = fileBindings ? fileBindings.namespaces : new Map<string, string>();
        
        walkAST(sourceFn.body, (node) => {
          if (node.type === 'CallExpression') {
            const callee = node.callee;
            let callTargetName = '';
            let namespaceObjName = '';
            
            if (callee.type === 'Identifier') {
              callTargetName = callee.name;
            } else if (callee.type === 'MemberExpression' && callee.property && callee.property.type === 'Identifier') {
              callTargetName = callee.property.name;
              if (callee.object.type === 'Identifier') {
                namespaceObjName = callee.object.name;
              }
            }
            
            if (!callTargetName || callTargetName.length <= 2 || callTargetName.startsWith('use')) return;
            
            const resolvedTargets: typeof functions = [];
            
            // 1. Check if called on a namespace B.init() or require'd object B.init()
            if (namespaceObjName) {
              const targetFile = namespaces.get(namespaceObjName) || bindings.get(namespaceObjName);
              if (targetFile) {
                const matched = functions.find(f => f.file === targetFile && f.name === callTargetName);
                if (matched) resolvedTargets.push(matched);
              }
            }
            
            // 2. Check if the function is imported directly, e.g. import { init } from './b'; init();
            if (resolvedTargets.length === 0 && !namespaceObjName) {
              const targetFile = bindings.get(callTargetName);
              if (targetFile) {
                const matched = functions.find(f => f.file === targetFile && f.name === callTargetName);
                if (matched) resolvedTargets.push(matched);
              }
            }
            
            // 3. Check if it is defined locally in the same file, e.g. function localFunc() {}; localFunc();
            if (resolvedTargets.length === 0 && !namespaceObjName) {
              const matched = functions.find(f => f.file === sourceFn.file && f.name === callTargetName);
              if (matched) resolvedTargets.push(matched);
            }
            
            // 4. Fallback if it is not resolved locally or via imports:
            if (resolvedTargets.length === 0) {
              const candidates = functions.filter(f => f.name === callTargetName && f.id !== sourceFn.id);
              if (candidates.length === 1) {
                resolvedTargets.push(candidates[0]);
              } else if (candidates.length > 1) {
                const importedCandidates = candidates.filter(c => {
                  const deps = fileDeps.get(sourceFn.file);
                  return deps && deps.has(c.file);
                });
                
                if (importedCandidates.length === 1) {
                  resolvedTargets.push(importedCandidates[0]);
                } else if (importedCandidates.length > 1) {
                  resolvedTargets.push(...importedCandidates);
                } else {
                  resolvedTargets.push(...candidates);
                }
              }
            }
            
            // Create links
            resolvedTargets.forEach(targetFn => {
              if (sourceFn.id === targetFn.id) return;
              
              const linkKey = `${sourceFn.id}->${targetFn.id}`;
              if (addedLinks.has(linkKey)) return;
              addedLinks.add(linkKey);
              
              const isAmbiguous = resolvedTargets.length > 1;
              
              const node = callNodesMap.get(targetFn.id);
              if (node) {
                node.callCount++;
              }
              
              callLinks.push({
                source: sourceFn.id,
                target: targetFn.id,
                isAmbiguous
              });
            });
          }
        });
      } catch (err) {
        console.error('Failed walking source function body AST for calls:', sourceFn.id, err);
      }
    } else {
      // RegExp-based fallback for python, rust, go, and non-AST parsed JS/TS files
      const sourceFileContent = contentMap.get(sourceFn.file) || '';
      for (const targetFn of functions) {
        if (sourceFn.id === targetFn.id) continue;
        
        const callRegex = new RegExp(`\\b${targetFn.name}\\(`, 'g');
        if (callRegex.test(sourceFileContent)) {
          const linkKey = `${sourceFn.id}->${targetFn.id}`;
          if (addedLinks.has(linkKey)) continue;
          addedLinks.add(linkKey);
          
          const node = callNodesMap.get(targetFn.id);
          if (node) {
            node.callCount++;
          }
          callLinks.push({
            source: sourceFn.id,
            target: targetFn.id,
            isAmbiguous: false
          });
        }
      }
    }
  }

  return {
    callNodes: Array.from(callNodesMap.values()),
    callLinks,
  };
}

function parseComponentDetailsFromAST(funcNode: any): { props: string[]; state: string[]; hooks: string[] } {
  const props: string[] = [];
  const state: string[] = [];
  const hooks: string[] = [];
  
  if (funcNode.params && funcNode.params.length > 0) {
    const firstParam = funcNode.params[0];
    if (firstParam.type === 'ObjectPattern') {
      for (const prop of firstParam.properties) {
        if (prop.type === 'ObjectProperty' && prop.key && prop.key.type === 'Identifier') {
          props.push(prop.key.name);
        } else if (prop.type === 'RestElement' && prop.argument && prop.argument.type === 'Identifier') {
          props.push(prop.argument.name);
        }
      }
    } else if (firstParam.type === 'Identifier') {
      props.push(firstParam.name);
    }
  }

  if (funcNode.body) {
    walkAST(funcNode.body, (node) => {
      if (node.type === 'CallExpression') {
        const callee = node.callee;
        let hookName = '';
        if (callee.type === 'Identifier') {
          hookName = callee.name;
        } else if (callee.type === 'MemberExpression' && callee.object.name === 'React' && callee.property.type === 'Identifier') {
          hookName = callee.property.name;
        }
        
        if (hookName && hookName.startsWith('use') && hookName !== 'useState') {
          hooks.push(hookName);
        }
      } else if (node.type === 'VariableDeclarator') {
        const init = node.init;
        if (init && init.type === 'CallExpression') {
          const callee = init.callee;
          let hookName = '';
          if (callee.type === 'Identifier') {
            hookName = callee.name;
          } else if (callee.type === 'MemberExpression' && callee.object.name === 'React' && callee.property.type === 'Identifier') {
            hookName = callee.property.name;
          }
          if (hookName === 'useState') {
            const id = node.id;
            if (id && id.type === 'ArrayPattern') {
              const firstElem = id.elements[0];
              if (firstElem && firstElem.type === 'Identifier') {
                state.push(firstElem.name);
              }
            }
          }
        }
      }
    });
  }

  return {
    props: Array.from(new Set(props)),
    state: Array.from(new Set(state)),
    hooks: Array.from(new Set(hooks))
  };
}

function returnsJSX(funcNode: any): boolean {
  let hasJSX = false;
  if (!funcNode.body) return false;
  
  if (funcNode.body.type === 'JSXElement' || funcNode.body.type === 'JSXFragment') {
    return true;
  }
  
  walkAST(funcNode.body, (node) => {
    if (node.type === 'ReturnStatement') {
      const arg = node.argument;
      if (arg) {
        if (arg.type === 'JSXElement' || arg.type === 'JSXFragment') {
          hasJSX = true;
        } else if (arg.type === 'ParenthesizedExpression' && (arg.expression.type === 'JSXElement' || arg.expression.type === 'JSXFragment')) {
          hasJSX = true;
        }
      }
    }
  });
  
  return hasJSX;
}

function isPascalCase(str: string): boolean {
  return /^[A-Z][a-zA-Z0-9_]*$/.test(str);
}

function findChildrenRenderedInJSX(bodyNode: any): string[] {
  const children: string[] = [];
  walkAST(bodyNode, (node) => {
    if (node.type === 'JSXOpeningElement') {
      const nameNode = node.name;
      if (nameNode.type === 'JSXIdentifier') {
        const name = nameNode.name;
        if (isPascalCase(name)) {
          children.push(name);
        }
      } else if (nameNode.type === 'JSXMemberExpression' && nameNode.property && nameNode.property.type === 'JSXIdentifier') {
        const name = nameNode.property.name;
        if (isPascalCase(name)) {
          children.push(name);
        }
      }
    }
  });
  return Array.from(new Set(children));
}

// React component hierarchy & Class hierarchy parser
function extractClassHierarchy(
  files: ParsedFile[],
  astMap?: Map<string, any>
): { classNodes: ClassNode[]; classLinks: ClassLink[] } {
  const classNodes: ClassNode[] = [];
  const classLinks: ClassLink[] = [];
  const classMap = new Map<string, ClassNode>();
  const parentChildRenderMap = new Map<string, string[]>();
  
  // 1. Detect OOP classes and React Components
  for (const file of files) {
    if (['typescript', 'javascript'].includes(file.language)) {
      const ast = getOrParseAST(file, astMap);
      if (ast) {
        try {
          walkAST(ast, (node) => {
            // OOP class detection
            if ((node.type === 'ClassDeclaration' || node.type === 'ClassExpression') && node.id && node.id.name) {
              const name = node.id.name;
              const parent = node.superClass && node.superClass.type === 'Identifier' ? node.superClass.name : null;
              const id = `${file.path}::${name}`;
              
              const classNode: ClassNode = { id, name, file: file.path, type: 'class' };
              classNodes.push(classNode);
              classMap.set(name, classNode);
              
              if (parent) {
                const parentId = classMap.has(parent) ? classMap.get(parent)!.id : `external::${parent}`;
                classLinks.push({ source: id, target: parentId });
                
                if (parentId.startsWith('external::') && !classNodes.some(n => n.id === parentId)) {
                  classNodes.push({ id: parentId, name: parent, file: 'External Library', type: 'class' });
                }
              }
            }
            
            // React Functional component detection
            let compNode: any = null;
            let name = '';
            
            if (node.type === 'FunctionDeclaration' && node.id && node.id.name) {
              name = node.id.name;
              compNode = node;
            } else if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier') {
              const init = node.init;
              if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
                name = node.id.name;
                compNode = init;
              }
            }
            
            if (compNode && name && isPascalCase(name) && returnsJSX(compNode)) {
              const id = `${file.path}::${name}`;
              const { props, state, hooks } = parseComponentDetailsFromAST(compNode);
              const componentNode: ClassNode = { 
                id, 
                name, 
                file: file.path, 
                type: 'component',
                props,
                state,
                hooks
              };
              classNodes.push(componentNode);
              classMap.set(name, componentNode);
              
              const children = findChildrenRenderedInJSX(compNode.body);
              if (children.length > 0) {
                parentChildRenderMap.set(id, children);
              }
            }
          });
        } catch (err) {
          console.error('Failed to parse classes via AST:', file.path, err);
        }
      }
    } else {
      // Fallback for non-JS/TS files (Python classes etc.)
      const content = file.content;
      const classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?/g;
      let match;
      while ((match = classRegex.exec(content)) !== null) {
        const name = match[1];
        const parent = match[2];
        const id = `${file.path}::${name}`;
        
        const node: ClassNode = { id, name, file: file.path, type: 'class' };
        classNodes.push(node);
        classMap.set(name, node);
        
        if (parent) {
          const parentId = classMap.has(parent) ? classMap.get(parent)!.id : `external::${parent}`;
          classLinks.push({
            source: id,
            target: parentId,
          });
          
          if (parentId.startsWith('external::') && !classNodes.some(n => n.id === parentId)) {
            classNodes.push({ id: parentId, name: parent, file: 'External Library', type: 'class' });
          }
        }
      }
    }
  }

  // 2. React Parent-Child Links: If component A renders component B (e.g. `<B ... />`)
  parentChildRenderMap.forEach((children, parentId) => {
    children.forEach(childName => {
      const childNode = classNodes.find(n => n.name === childName && n.type === 'component');
      if (childNode) {
        classLinks.push({
          source: parentId,
          target: childNode.id,
        });
      }
    });
  });

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

function parseFunctionsInFile(file: ParsedFile, astMap?: Map<string, any>): ExtractedFunction[] {
  const content = file.content;
  if (!content) return [];
  const lines = content.split('\n');
  const functions: ExtractedFunction[] = [];
  const lowerLang = file.language.toLowerCase();

  if (['javascript', 'typescript'].includes(lowerLang)) {
    const ast = getOrParseAST(file, astMap);
    if (ast) {
      try {
        const seenSpans = new Set<string>();
        walkAST(ast, (node) => {
          let name = '';
          let loc = node.loc;
          
          if (node.type === 'FunctionDeclaration' && node.id && node.id.name) {
            name = node.id.name;
          } else if (node.type === 'FunctionExpression' && node.id && node.id.name) {
            name = node.id.name;
          } else if (node.type === 'ClassMethod' && node.key && node.key.type === 'Identifier') {
            name = node.key.name;
          } else if (node.type === 'ObjectMethod' && node.key && node.key.type === 'Identifier') {
            name = node.key.name;
          } else if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier') {
            const init = node.init;
            if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
              name = node.id.name;
              loc = init.loc || node.loc;
            }
          }
          
          if (name && loc) {
            const startLine = loc.start.line;
            const endLine = loc.end.line;
            const length = endLine - startLine + 1;
            const spanKey = `${startLine}-${endLine}-${name}`;
            if (!seenSpans.has(spanKey)) {
              seenSpans.add(spanKey);
              functions.push({ name, line: startLine, length });
            }
          }
        });
        return functions;
      } catch (err) {
        console.error('Failed to parse functions via AST:', file.path, err);
      }
    }
  }

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
  const astMap = new Map<string, any>();
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
    const { internal, external } = parseImports(file, filePaths, astMap);
    
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
  const { callNodes, callLinks } = extractCallGraph(files, astMap, links);
  
  // 5. Class / React Component Hierarchies
  const { classNodes, classLinks } = extractClassHierarchy(files, astMap);

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
    const funcs = parseFunctionsInFile(file, astMap);
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

export function mapFilesToRealCommits(
  files: ParsedFile[],
  apiCommits: { sha: string; message: string; author: string; date: string }[]
): SimulatedCommit[] {
  if (!apiCommits || apiCommits.length === 0) return [];

  // Sort apiCommits chronologically (oldest commit first)
  const sortedCommits = [...apiCommits].reverse();

  const commits: SimulatedCommit[] = sortedCommits.map(c => ({
    sha: c.sha,
    message: c.message,
    author: c.author,
    date: c.date,
    filesAdded: [],
    filesModified: [],
    filesDeleted: []
  }));

  // Match files to commits based on keywords in the commit message
  const addedFiles = new Set<string>();

  files.forEach(file => {
    const fileName = file.name.toLowerCase();
    const fileBase = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
    
    // Find if any commit message references this file name
    let matchedCommitIndex = -1;
    for (let i = 0; i < commits.length; i++) {
      const msg = commits[i].message.toLowerCase();
      if (msg.includes(fileName) || (fileBase.length > 3 && msg.includes(fileBase))) {
        matchedCommitIndex = i;
        break;
      }
    }

    if (matchedCommitIndex !== -1) {
      commits[matchedCommitIndex].filesAdded.push(file.path);
      addedFiles.add(file.path);
    }
  });

  // Distribute the remaining files across the commits chronologically
  const unmatchedFiles = files.filter(f => !addedFiles.has(f.path));
  
  unmatchedFiles.forEach((file, index) => {
    let targetCommitIndex = 0;
    if (commits.length > 1) {
      const pathLower = file.path.toLowerCase();
      if (pathLower.includes('config') || pathLower.includes('json') || pathLower.startsWith('.') || file.name === 'index.html') {
        targetCommitIndex = 0; // Configs in the first commit
      } else if (pathLower.includes('util') || pathLower.includes('helper')) {
        targetCommitIndex = Math.min(1, commits.length - 1);
      } else {
        // Distribute rest proportionally
        targetCommitIndex = Math.min(
          Math.floor((index / unmatchedFiles.length) * (commits.length - 1)) + 1,
          commits.length - 1
        );
      }
    }
    
    commits[targetCommitIndex].filesAdded.push(file.path);
    addedFiles.add(file.path);
  });

  // Ensure every commit has at least 1 changed file
  commits.forEach((commit, idx) => {
    if (commit.filesAdded.length === 0 && commit.filesModified.length === 0) {
      const filesAvailable: string[] = [];
      for (let j = 0; j <= idx; j++) {
        filesAvailable.push(...commits[j].filesAdded);
      }
      
      if (filesAvailable.length > 0) {
        const randomFile = filesAvailable[Math.floor(Math.random() * filesAvailable.length)];
        commit.filesModified.push(randomFile);
      } else if (files.length > 0) {
        commit.filesModified.push(files[0].path);
      }
    }
  });

  return commits;
}
