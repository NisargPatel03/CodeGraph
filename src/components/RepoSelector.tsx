import React, { useState, useRef } from 'react';
import { UploadCloud, Key, Sparkles, AlertCircle } from 'lucide-react';
import type { ParsedFile } from '../utils/repoParser';
import { fetchGitHubRepo, parseZipFile } from '../utils/repoParser';
import logoImg from '../assets/logo.png';

export const GET_DEMO_FILES = (): ParsedFile[] => [
  {
    path: 'src/index.tsx',
    name: 'index.tsx',
    size: 320,
    language: 'typescript',
    content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);`
  },
  {
    path: 'src/App.tsx',
    name: 'App.tsx',
    size: 1540,
    language: 'typescript',
    content: `import React, { useState } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import GraphView from './components/GraphView';
import { computeMetrics } from './utils/helper';

export default function App() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  
  const handleSelect = (file: string) => {
    setSelectedFile(file);
    const metrics = computeMetrics(file);
    console.log("File metrics computed:", metrics);
  };

  return (
    <div className="app-shell">
      <Header onSelect={handleSelect} />
      <div className="main-content">
        <Sidebar onSelect={handleSelect} />
        <GraphView active={selectedFile} />
      </div>
    </div>
  );
}`
  },
  {
    path: 'src/components/Header.tsx',
    name: 'Header.tsx',
    size: 980,
    language: 'typescript',
    content: `import React from 'react';
import Button from './Button';
import { formatName } from '../utils/helper';

interface HeaderProps {
  onSelect: (file: string) => void;
}

export default function Header({ onSelect }: HeaderProps) {
  return (
    <header className="navbar">
      <div className="logo">{formatName("CodeGraph-Demo")}</div>
      <Button onClick={() => onSelect('src/App.tsx')}>Inspect Root</Button>
    </header>
  );
}`
  },
  {
    path: 'src/components/Sidebar.tsx',
    name: 'Sidebar.tsx',
    size: 840,
    language: 'typescript',
    content: `import React from 'react';
import Button from './Button';

interface SidebarProps {
  onSelect: (file: string) => void;
}

export default function Sidebar({ onSelect }: SidebarProps) {
  const files = ['src/index.tsx', 'src/App.tsx', 'src/components/Header.tsx', 'src/components/Sidebar.tsx', 'src/components/GraphView.tsx', 'src/utils/helper.ts'];

  return (
    <aside className="sidebar">
      <h3>Files</h3>
      {files.map(f => (
        <Button key={f} onClick={() => onSelect(f)}>{f.split('/').pop()}</Button>
      ))}
    </aside>
  );
}`
  },
  {
    path: 'src/components/GraphView.tsx',
    name: 'GraphView.tsx',
    size: 1980,
    language: 'typescript',
    content: `import React from 'react';
import Button from './Button';
import { computeMetrics } from '../utils/helper';
// Importing App directly causes a circular dependency: App -> GraphView -> App
import App from '../App'; 

interface GraphViewProps {
  active: string | null;
}

export default function GraphView({ active }: GraphViewProps) {
  const runDiagnostics = () => {
    // Reference App mock method or props
    console.log("Diagnostics run for GraphView inside", App.name);
    if (active) {
      const val = computeMetrics(active);
      alert("Graph active value metric: " + val);
    }
  };

  return (
    <div className="graph-panel">
      <h2>Interactive Dependency Visualizer</h2>
      <p>Currently inspecting: {active || 'None'}</p>
      <Button onClick={runDiagnostics}>Compute Node Diagnostics</Button>
    </div>
  );
}`
  },
  {
    path: 'src/components/Button.tsx',
    name: 'Button.tsx',
    size: 450,
    language: 'typescript',
    content: `import React from 'react';

interface ButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
}

export default function Button({ onClick, children }: ButtonProps) {
  return (
    <button className="btn-glow" onClick={onClick}>
      {children}
    </button>
  );
}`
  },
  {
    path: 'src/utils/helper.ts',
    name: 'helper.ts',
    size: 720,
    language: 'typescript',
    content: `// Import from App to generate type reference
// This creates another circular dependency: App -> Header -> helper.ts -> App!
import App from '../App';

export function formatName(name: string): string {
  return name.toUpperCase() + " [AI]";
}

export function computeMetrics(filePath: string): number {
  return filePath.length * 12;
}

export function runGlobalCheck(appInstance: typeof App) {
  console.log("Global check run for app:", appInstance.name);
}
`
  },
  {
    path: 'src/index.css',
    name: 'index.css',
    size: 450,
    language: 'css',
    content: `body {
  margin: 0;
  background-color: #030712;
}
.btn-glow {
  padding: 8px 16px;
  background: linear-gradient(to right, #6366f1, #8b5cf6);
  border: none;
  color: white;
  border-radius: 4px;
}`
  }
];

const GithubIcon = ({ size = 18 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

interface RepoSelectorProps {
  onDataLoaded: (data: { files: ParsedFile[]; repoName: string }) => void;
}

export const RepoSelector: React.FC<RepoSelectorProps> = ({ onDataLoaded }) => {
  const [gitUrl, setGitUrl] = useState('');
  const [gitToken, setGitToken] = useState(() => localStorage.getItem('gh_token') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleGitFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gitUrl) return;
    setError(null);
    setLoading(true);
    try {
      const result = await fetchGitHubRepo(gitUrl, gitToken);
      onDataLoaded(result);
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching the GitHub repository.');
    } finally {
      setLoading(false);
    }
  };

  const handleZipFile = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setError('Please upload a valid ZIP file archive.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const files = await parseZipFile(file);
      if (files.length === 0) {
        throw new Error('No readable code files found in the ZIP archive.');
      }
      onDataLoaded({ files, repoName: file.name.replace('.zip', '') });
    } catch (err: any) {
      setError(err.message || 'Error parsing ZIP file.');
    } finally {
      setLoading(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const onDragLeave = () => {
    setIsDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleZipFile(e.dataTransfer.files[0]);
    }
  };

  const handleLoadDemo = () => {
    onDataLoaded({ files: GET_DEMO_FILES(), repoName: 'CodeGraph-Demo-Project' });
  };

  const handleSaveToken = (val: string) => {
    setGitToken(val);
    localStorage.setItem('gh_token', val);
  };

  return (
    <div className="selector-screen">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <img src={logoImg} alt="CodeGraph Logo" style={{ width: '80px', height: '80px', objectFit: 'contain', filter: 'drop-shadow(0 0 15px rgba(0, 242, 254, 0.4))' }} />
        <h1 className="selector-title">CodeGraph</h1>
        <p className="selector-subtitle">
          Instantly generate interactive dependency graphs, call flow maps, component trees, and AI guides for any codebase.
        </p>
      </div>

      <div className="glass-panel input-card">
        {/* GitHub Repository Form */}
        <form onSubmit={handleGitFetch} className="github-input-group">
          <input
            type="text"
            className="cyber-input"
            placeholder="Paste GitHub Repository URL (e.g. owner/repo or github.com/owner/repo)"
            value={gitUrl}
            onChange={(e) => setGitUrl(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="cyber-button" disabled={loading || !gitUrl.trim()}>
            <GithubIcon size={18} />
            {loading ? 'Analyzing...' : 'Visualize Repo'}
          </button>
        </form>

        {/* Drag and Drop Zone */}
        <div
          className={`dropzone ${isDragActive ? 'active' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files?.[0] && handleZipFile(e.target.files[0])}
            style={{ display: 'none' }}
            accept=".zip"
            disabled={loading}
          />
          <UploadCloud size={40} className="dropzone-icon" />
          <div>
            <p style={{ fontWeight: 500 }}>Drag and Drop your Repository .ZIP file here</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Supports JS, TS, Python, Go, Rust, Java, C++, and more.
            </p>
            <p style={{ fontSize: '0.7rem', color: 'var(--color-secondary)', marginTop: '6px', opacity: 0.85 }}>
              ⚡ Large archives (100+ files) will automatically run optimized static warm-up modes.
            </p>
          </div>
        </div>

        {/* Settings Integration */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
          {/* Load Demo Button */}
          <button type="button" className="cyber-button secondary" onClick={handleLoadDemo} disabled={loading}>
            <Sparkles size={16} style={{ color: 'var(--color-secondary)' }} />
            Load Sample Sandbox Project
          </button>

          {/* GitHub Auth Modal trigger */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Key size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              type="password"
              className="cyber-input"
              style={{ width: '200px', padding: '6px 10px', fontSize: '0.8rem' }}
              placeholder="Optional: GitHub Token"
              value={gitToken}
              onChange={(e) => handleSaveToken(e.target.value)}
            />
          </div>
        </div>


        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-alert)', background: 'rgba(244, 63, 94, 0.1)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(244, 63, 94, 0.2)', fontSize: '0.85rem', textAlign: 'left' }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};
