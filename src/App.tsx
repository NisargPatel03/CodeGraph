import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Search, Folder, File, ChevronRight, ChevronDown, CheckCircle } from 'lucide-react';
import type { ParsedFile } from './utils/repoParser';
import { analyzeCodebase } from './utils/codeAnalyzer';
import type { CodebaseGraph } from './utils/codeAnalyzer';
import { RepoSelector } from './components/RepoSelector';
import { GraphCanvas } from './components/GraphCanvas';
import { Inspector } from './components/Inspector';
import { Reports } from './components/Reports';
import logoImg from './assets/logo.png';

// Tree interface for File Explorer
interface FileTreeItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children: Record<string, FileTreeItem>;
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('app_theme');
    const validThemes = ['cyberpunk', 'midnight-green', 'solar-amber', 'arctic-light', 'rose-gold', 'synthwave'];
    if (saved && validThemes.includes(saved)) return saved;
    return 'cyberpunk';
  });
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_key') || '');
  const [repoData, setRepoData] = useState<{ files: ParsedFile[]; repoName: string } | null>(null);
  const [graphData, setGraphData] = useState<CodebaseGraph | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'dependency' | 'cluster' | 'call' | 'hierarchy'>('dependency');
  const [searchQuery, setSearchQuery] = useState('');
  const [isBottomExpanded, setIsBottomExpanded] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ 'root': true });

  // Sync theme to root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  const handleThemeClick = (e: React.MouseEvent, themeId: string) => {
    const clickX = e.clientX;
    const clickY = e.clientY;

    const ripple = document.createElement('div');
    ripple.className = 'theme-ripple-wave';
    ripple.style.left = `${clickX}px`;
    ripple.style.top = `${clickY}px`;

    let color = '#8b5cf6';
    if (themeId === 'midnight-green') color = '#10B981';
    else if (themeId === 'solar-amber') color = '#F59E0B';
    else if (themeId === 'arctic-light') color = '#6366F1';
    else if (themeId === 'rose-gold') color = '#EC4899';
    else if (themeId === 'synthwave') color = '#FF00FF';

    ripple.style.backgroundColor = color;
    document.body.appendChild(ripple);

    setTimeout(() => {
      ripple.remove();
    }, 600);

    setTheme(themeId);
  };

  // Save Gemini Key to local storage
  const handleSetApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('gemini_key', key);
  };

  // Run analysis when files are loaded
  useEffect(() => {
    if (repoData) {
      const result = analyzeCodebase(repoData.files);
      setGraphData(result);
      setSelectedNodeId(null);
    } else {
      setGraphData(null);
    }
  }, [repoData]);

  const handleDataLoaded = (data: { files: ParsedFile[]; repoName: string }) => {
    setRepoData(data);
  };

  const handleResetRepo = () => {
    setRepoData(null);
  };

  // Get active file object
  const activeFile = useMemo(() => {
    if (!selectedNodeId || !repoData) return null;
    return repoData.files.find((f) => f.path === selectedNodeId) || null;
  }, [selectedNodeId, repoData]);

  // Compute imports for the selected file
  const activeFileImports = useMemo(() => {
    if (!selectedNodeId || !graphData) return [];
    return graphData.links
      .filter((link) => link.source === selectedNodeId)
      .map((link) => link.target);
  }, [selectedNodeId, graphData]);

  // Build Hierarchical File Tree
  const fileTree = useMemo(() => {
    if (!repoData) return null;

    const root: FileTreeItem = { name: 'root', path: '', type: 'folder', children: {} };

    repoData.files.forEach((file) => {
      const parts = file.path.split('/');
      let current = root;

      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1;
        const currentPath = parts.slice(0, index + 1).join('/');

        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: currentPath,
            type: isLast ? 'file' : 'folder',
            children: {},
          };
        }
        current = current.children[part];
      });
    });

    return root;
  }, [repoData]);

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };



  // Recursive tree render function
  const renderTree = (item: FileTreeItem, depth = 0) => {
    const isExpanded = expandedFolders[item.path] ?? false;
    const isSelected = selectedNodeId === item.path;
    const hasCycle = graphData?.cycles.some((c) => c.includes(item.path)) ?? false;

    if (item.type === 'file') {
      // Check if matches search filter
      if (searchQuery && !item.path.toLowerCase().includes(searchQuery.toLowerCase())) {
        return null;
      }

      return (
        <div
          key={item.path}
          className={`file-node ${isSelected ? 'active' : ''} ${hasCycle ? 'cycle-member' : ''}`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          onClick={() => setSelectedNodeId(item.path)}
        >
          <File size={14} style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.name}
          </span>
          {hasCycle && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-alert)', marginLeft: 'auto' }} />}
        </div>
      );
    }

    // Sort folders first, then files
    const sortedKeys = Object.keys(item.children).sort((a, b) => {
      const typeA = item.children[a].type;
      const typeB = item.children[b].type;
      if (typeA === typeB) return a.localeCompare(b);
      return typeA === 'folder' ? -1 : 1;
    });

    const renderedChildren = sortedKeys
      .map((key) => renderTree(item.children[key], depth + 1))
      .filter(Boolean);

    // If search is active and this directory has no visible files, skip rendering
    if (searchQuery && renderedChildren.length === 0) {
      return null;
    }

    return (
      <div key={item.path || 'root-tree'}>
        {item.path && (
          <div
            className="file-node"
            style={{ paddingLeft: `${depth * 14 + 8}px`, fontWeight: 500, color: 'var(--text-primary)' }}
            onClick={() => toggleFolder(item.path)}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Folder size={14} style={{ color: 'var(--color-secondary)', opacity: 0.8 }} />
            <span>{item.name}</span>
          </div>
        )}
        {(isExpanded || !item.path || searchQuery) && (
          <div>{renderedChildren}</div>
        )}
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="glass-panel app-header">
        <div className="logo-container">
          <img src={logoImg} alt="CodeGraph Logo" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
          <h1 className="logo-text">CodeGraph</h1>
          <span className="logo-badge">Beta v1.0</span>
        </div>

        {repoData && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255, 255, 255, 0.02)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Repository:</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-secondary)' }}>{repoData.repoName}</span>
          </div>
        )}

        <div className="header-actions">
          {repoData && (
            <button className="cyber-button secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={handleResetRepo}>
              <ArrowLeft size={14} style={{ marginRight: '6px' }} />
              Reset Workspace
            </button>
          )}

          {/* Theme Selector Bubbles */}
          <div className="theme-selector-group">
            {[
              { id: 'cyberpunk', name: 'Cyber Neon' },
              { id: 'midnight-green', name: 'Midnight Green (Emerald)' },
              { id: 'solar-amber', name: 'Solar Amber (Yellow)' },
              { id: 'arctic-light', name: 'Arctic Light (Clean Mode)' },
              { id: 'rose-gold', name: 'Rose Gold (Bold Dark)' },
              { id: 'synthwave', name: 'Synthwave / Retro' },
            ].map((t) => (
              <div
                key={t.id}
                className={`theme-bubble ${theme === t.id ? 'active' : ''}`}
                data-theme-id={t.id}
                title={t.name}
                onClick={(e) => handleThemeClick(e, t.id)}
              />
            ))}
          </div>

          {/* Settings API Key Toggle indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid var(--panel-border)', paddingLeft: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: apiKey ? 'var(--color-accent)' : 'var(--text-muted)' }}>
              <CheckCircle size={14} style={{ color: apiKey ? 'var(--color-accent)' : 'var(--text-muted)' }} />
              {apiKey ? 'AI Key Verified' : 'AI Offline Mode'}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      {!repoData ? (
        <RepoSelector 
          onDataLoaded={handleDataLoaded} 
          apiKey={apiKey} 
          setApiKey={handleSetApiKey} 
        />
      ) : (
        graphData && (
          <main className={`workspace-layout ${isBottomExpanded ? 'expanded-bottom' : ''}`}>
            {/* Left Sidebar - File Explorer */}
            <aside className="glass-panel sidebar-left">
              <div className="sidebar-header">
                <div className="sidebar-title">
                  <span>Files Panel</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{repoData.files.length} items</span>
                </div>
                <div className="search-box">
                  <Search size={14} className="search-icon" />
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Filter file structure..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="file-tree-container">
                {fileTree && renderTree(fileTree)}
              </div>
            </aside>

            {/* Center Area - D3 Graph Visualizer */}
            <section className="glass-panel center-panel">
              <div className="tabs-header">
                <div className="tabs-group">
                  <button
                    className={`tab-btn ${viewMode === 'dependency' ? 'active' : ''}`}
                    onClick={() => setViewMode('dependency')}
                  >
                    Dependency Graph
                  </button>
                  <button
                    className={`tab-btn ${viewMode === 'cluster' ? 'active' : ''}`}
                    onClick={() => setViewMode('cluster')}
                  >
                    Module Clusters
                  </button>
                  <button
                    className={`tab-btn ${viewMode === 'call' ? 'active' : ''}`}
                    onClick={() => setViewMode('call')}
                  >
                    Call Graph
                  </button>
                  <button
                    className={`tab-btn ${viewMode === 'hierarchy' ? 'active' : ''}`}
                    onClick={() => setViewMode('hierarchy')}
                  >
                    Component Tree
                  </button>
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Hover paths are highlighted on active nodes
                </div>
              </div>

              {/* D3 Canvas Viewport */}
              <GraphCanvas
                graphData={graphData}
                selectedNode={selectedNodeId}
                setSelectedNode={setSelectedNodeId}
                viewMode={viewMode}
                searchQuery={searchQuery}
              />
            </section>

            {/* Right Sidebar - Inspector Panel */}
            <Inspector
              selectedFile={activeFile}
              allFiles={repoData.files}
              apiKey={apiKey}
              cycles={graphData.cycles}
              imports={activeFileImports}
            />

            {/* Bottom Panel - Onboarding Guides & Architecture Cycles */}
            <Reports
              files={repoData.files}
              cycles={graphData.cycles}
              apiKey={apiKey}
              isExpanded={isBottomExpanded}
              setIsExpanded={setIsBottomExpanded}
              onSelectFile={(filePath) => setSelectedNodeId(filePath)}
            />
          </main>
        )
      )}
    </div>
  );
}
