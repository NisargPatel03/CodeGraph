import JSZip from 'jszip';

export interface ParsedFile {
  path: string;
  name: string;
  content: string;
  size: number;
  language: string;
}

// Map extensions to highlightable languages
export function getLanguageFromExtension(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mapping: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    cpp: 'cpp',
    cc: 'cpp',
    c: 'c',
    h: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    rb: 'ruby',
    php: 'php',
    html: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'bash',
    bat: 'batch',
    ps1: 'powershell',
    sql: 'sql',
  };
  return mapping[ext] || 'text';
}

// Check if a file should be ignored during parsing
export function isIgnored(path: string): boolean {
  const ignorePatterns = [
    /node_modules\//i,
    /\.git\//i,
    /dist\//i,
    /build\//i,
    /\.next\//i,
    /out\//i,
    /package-lock\.json$/i,
    /yarn\.lock$/i,
    /pnpm-lock\.yaml$/i,
    /\.DS_Store$/i,
    /\.png$/i,
    /\.jpg$/i,
    /\.jpeg$/i,
    /\.gif$/i,
    /\.ico$/i,
    /\.svg$/i,
    /\.webp$/i,
    /\.woff$/i,
    /\.woff2$/i,
    /\.ttf$/i,
    /\.eot$/i,
    /\.mp4$/i,
    /\.zip$/i,
    /\.tar\.gz$/i,
    /\.pdf$/i,
    /\.bin$/i,
    /gradle\//i,
    /\.class$/i,
  ];

  return ignorePatterns.some((pattern) => pattern.test(path));
}

// Strip the initial top-level folder that GitHub includes in zip downloads (e.g. repo-name-main/)
function normalizeZipPaths(files: { path: string; file: any }[]): { path: string; file: any }[] {
  if (files.length === 0) return files;
  
  // Find if all paths start with the same directory name
  const firstPath = files[0].path;
  const parts = firstPath.split('/');
  if (parts.length <= 1) return files;
  
  const potentialRoot = parts[0] + '/';
  const hasCommonRoot = files.every(f => f.path.startsWith(potentialRoot));
  
  if (hasCommonRoot) {
    return files.map(f => ({
      ...f,
      path: f.path.substring(potentialRoot.length)
    }));
  }
  
  return files;
}

export async function parseZipFile(file: File): Promise<ParsedFile[]> {
  const zip = new JSZip();
  const contents = await zip.loadAsync(file);
  const fileList: { path: string; file: JSZip.JSZipObject }[] = [];

  contents.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir && !isIgnored(relativePath)) {
      fileList.push({ path: relativePath, file: zipEntry });
    }
  });

  const normalizedList = normalizeZipPaths(fileList);
  const parsedFiles: ParsedFile[] = [];

  for (const item of normalizedList) {
    try {
      const text = await item.file.async('string');
      parsedFiles.push({
        path: item.path,
        name: item.path.split('/').pop() || '',
        content: text,
        size: text.length, // approximation in chars
        language: getLanguageFromExtension(item.path),
      });
    } catch (e) {
      console.warn(`Could not read file: ${item.path}`, e);
    }
  }

  return parsedFiles;
}

export async function fetchGitHubRepo(repoUrl: string, token?: string): Promise<{ files: ParsedFile[]; repoName: string }> {
  // Parse repoUrl: e.g. "https://github.com/facebook/react" or "facebook/react"
  let cleanUrl = repoUrl.trim().replace(/\/$/, '');
  if (cleanUrl.startsWith('git@github.com:')) {
    cleanUrl = cleanUrl.replace('git@github.com:', 'https://github.com/');
  }
  
  const match = cleanUrl.match(/(?:github\.com\/|^)([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error('Invalid GitHub repository URL or format. Use format "owner/repo" or "https://github.com/owner/repo"');
  }

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, '');
  const repoName = `${owner}/${repo}`;

  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  // 1. Fetch repo details to get default branch name
  const repoDetailsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!repoDetailsRes.ok) {
    if (repoDetailsRes.status === 404) {
      throw new Error('Repository not found. Ensure the URL is correct and the repository is public, or provide a GitHub Token.');
    }
    throw new Error(`Failed to fetch repo details: ${repoDetailsRes.statusText}`);
  }
  
  const repoDetails = await repoDetailsRes.json();
  const defaultBranch = repoDetails.default_branch || 'main';

  // 2. Fetch repo zip archive
  const zipUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${defaultBranch}`;
  const zipRes = await fetch(zipUrl, { headers });
  if (!zipRes.ok) {
    throw new Error(`Failed to fetch repository zip archive: ${zipRes.statusText}`);
  }

  const blob = await zipRes.blob();
  const zipFile = new File([blob], `${repo}.zip`, { type: 'application/zip' });
  const files = await parseZipFile(zipFile);

  return { files, repoName };
}
