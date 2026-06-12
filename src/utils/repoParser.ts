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

async function fetchViaTreesApi(owner: string, repo: string, defaultBranch: string, headers: HeadersInit): Promise<ParsedFile[]> {
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`;
  const treeRes = await fetch(treeUrl, { headers });
  if (!treeRes.ok) {
    let errMsg = treeRes.statusText || `Status ${treeRes.status}`;
    try {
      const errorJson = await treeRes.json();
      if (errorJson && errorJson.message) {
        errMsg = errorJson.message;
      }
    } catch (_) {}
    throw new Error(`Failed to fetch repository tree: ${errMsg}`);
  }
  
  const treeData = await treeRes.json();
  if (!treeData.tree || !Array.isArray(treeData.tree)) {
    throw new Error('Invalid repository tree structure returned from GitHub.');
  }

  // Filter out directories, ignored files, and limit total files to prevent API spam (e.g. max 150 files)
  const fileEntries = treeData.tree.filter((item: any) => {
    return item.type === 'blob' && !isIgnored(item.path);
  });

  if (fileEntries.length > 150) {
    throw new Error(`Repository is too large (${fileEntries.length} files) for client-side API fetching. Please download it as a ZIP and drag-and-drop it instead.`);
  }

  const parsedFiles: ParsedFile[] = [];
  const batchSize = 10;
  
  for (let i = 0; i < fileEntries.length; i += batchSize) {
    const batch = fileEntries.slice(i, i + batchSize);
    await Promise.all(batch.map(async (item: any) => {
      try {
        const blobRes = await fetch(item.url, { headers });
        if (blobRes.ok) {
          const blobData = await blobRes.json();
          const base64Content = blobData.content.replace(/\s/g, '');
          const binaryString = atob(base64Content);
          const bytes = new Uint8Array(binaryString.length);
          for (let j = 0; j < binaryString.length; j++) {
            bytes[j] = binaryString.charCodeAt(j);
          }
          const text = new TextDecoder('utf-8').decode(bytes);

          parsedFiles.push({
            path: item.path,
            name: item.path.split('/').pop() || '',
            content: text,
            size: item.size || text.length,
            language: getLanguageFromExtension(item.path),
          });
        }
      } catch (err) {
        console.warn(`Failed to fetch file content for ${item.path}:`, err);
      }
    }));
  }

  return parsedFiles;
}

export async function fetchGitHubRepo(repoUrl: string, token?: string): Promise<{ 
  files: ParsedFile[]; 
  repoName: string;
  commits?: GitHubCommitInfo[];
}> {
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
    let errMsg = repoDetailsRes.statusText || `Status ${repoDetailsRes.status}`;
    try {
      const errorJson = await repoDetailsRes.json();
      if (errorJson && errorJson.message) {
        errMsg = errorJson.message;
      }
    } catch (_) {}

    if (repoDetailsRes.status === 404) {
      throw new Error('Repository not found. Ensure the URL is correct and the repository is public, or provide a GitHub Token.');
    }
    if (repoDetailsRes.status === 403 && errMsg.toLowerCase().includes('rate limit')) {
      throw new Error('GitHub API rate limit exceeded. Please provide a GitHub Personal Access Token (PAT) in the token field, or upload the repository as a ZIP archive instead.');
    }
    throw new Error(`Failed to fetch repo details: ${errMsg}`);
  }
  
  const repoDetails = await repoDetailsRes.json();
  const defaultBranch = repoDetails.default_branch || 'main';

  // 2. Try fetching via zipball direct or proxy
  let files: ParsedFile[] = [];
  const zipUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${defaultBranch}`;
  
  try {
    // Attempt direct fetch first
    const zipRes = await fetch(zipUrl, { headers });
    if (!zipRes.ok) {
      throw new Error(`Direct zip fetch failed with status ${zipRes.status}`);
    }
    const blob = await zipRes.blob();
    const zipFile = new File([blob], `${repo}.zip`, { type: 'application/zip' });
    files = await parseZipFile(zipFile);
  } catch (directError) {
    console.warn('Direct zip fetch failed, attempting fallback methods...', directError);
    
    // Fallback 1: If it's a public repository (no token), try using a CORS proxy
    if (!token) {
      try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(zipUrl)}`;
        const proxyRes = await fetch(proxyUrl);
        if (proxyRes.ok) {
          const blob = await proxyRes.blob();
          const zipFile = new File([blob], `${repo}.zip`, { type: 'application/zip' });
          files = await parseZipFile(zipFile);
        } else {
          throw new Error('CORS proxy returned non-OK status');
        }
      } catch (proxyError) {
        console.warn('CORS proxy fetch failed, falling back to Trees API...', proxyError);
        // Fallback 2: Fallback to recursive Trees API
        files = await fetchViaTreesApi(owner, repo, defaultBranch, headers);
      }
    } else {
      // Fallback 2: For private repos or token requests, fall back directly to Trees API to avoid leaking token to proxy
      files = await fetchViaTreesApi(owner, repo, defaultBranch, headers);
    }
  }

  if (files.length === 0) {
    throw new Error('No readable code files found in the repository.');
  }

  // 3. Fetch real commit logs from GitHub
  let commits: GitHubCommitInfo[] = [];
  try {
    const commitsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=100`, { headers });
    if (commitsRes.ok) {
      const commitsData = await commitsRes.json();
      if (Array.isArray(commitsData)) {
        commits = commitsData.map((item: any) => ({
          sha: item.sha ? item.sha.substring(0, 7) : 'unknown',
          message: item.commit?.message || 'No commit message',
          author: item.commit?.author?.name || item.author?.login || 'Anonymous',
          date: item.commit?.author?.date ? item.commit.author.date.split('T')[0] : 'unknown',
        }));
      }
    }
  } catch (err) {
    console.warn('Failed to fetch commit history from GitHub:', err);
  }

  return { files, repoName, commits };
}

export interface GitHubCommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
}
