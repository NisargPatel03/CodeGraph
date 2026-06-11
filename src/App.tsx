import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Search, Folder, File, ChevronRight, ChevronDown, CheckCircle, Sparkles } from 'lucide-react';
import type { ParsedFile } from './utils/repoParser';
import { analyzeCodebase } from './utils/codeAnalyzer';
import type { CodebaseGraph } from './utils/codeAnalyzer';
import { RepoSelector } from './components/RepoSelector';
import { GraphCanvas } from './components/GraphCanvas';
import { Inspector } from './components/Inspector';
import { AiChatDrawer } from './components/AiChatDrawer';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { KpiRibbon } from './components/KpiRibbon';
import logoImg from './assets/logo.png';
import { semanticSearchCodebase } from './utils/aiHelper';
import type { SemanticSearchResult } from './utils/aiHelper';

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
  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [repoData, setRepoData] = useState<{ files: ParsedFile[]; repoName: string } | null>(null);
  const [graphData, setGraphData] = useState<CodebaseGraph | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'dependency' | 'cluster' | 'call' | 'hierarchy' | 'analytics'>('dependency');
  const [searchQuery, setSearchQuery] = useState('');
  const [diffData, setDiffData] = useState<any | null>(null);
  const [semanticSearchResults, setSemanticSearchResults] = useState<SemanticSearchResult[] | null>(null);
  const [isSearchingSemantically, setIsSearchingSemantically] = useState(false);
  const [semanticSearchError, setSemanticSearchError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ 'root': true });
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [activeTraceNodeId, setActiveTraceNodeId] = useState<string | null>(null);
  const [depthFilter, setDepthFilter] = useState<number>(-1); // -1 means All/no limit
  const [isEvolutionMode, setIsEvolutionMode] = useState(false);
  const [currentEvolutionStep, setCurrentEvolutionStep] = useState(0);


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



  // Run analysis when files are loaded
  useEffect(() => {
    if (repoData) {
      const result = analyzeCodebase(repoData.files);
      setGraphData(result);
      setSelectedNodeId(null);
      setDiffData(null);
      setIsEvolutionMode(false);
      setCurrentEvolutionStep(0);
    } else {
      setGraphData(null);
      setDiffData(null);
      setIsEvolutionMode(false);
      setCurrentEvolutionStep(0);
    }
  }, [repoData]);

  const handleDataLoaded = (data: { files: ParsedFile[]; repoName: string }) => {
    setRepoData(data);
    setSemanticSearchResults(null);
    setSemanticSearchError(null);
    setDiffData(null);
    setIsEvolutionMode(false);
    setCurrentEvolutionStep(0);
  };

  const handleResetRepo = () => {
    setRepoData(null);
    setSemanticSearchResults(null);
    setSemanticSearchError(null);
    setSearchQuery('');
    setDiffData(null);
    setIsEvolutionMode(false);
    setCurrentEvolutionStep(0);
  };

  const handleSemanticSearch = async () => {
    if (!searchQuery.trim() || !repoData) return;
    setIsSearchingSemantically(true);
    setSemanticSearchError(null);
    try {
      const summary = repoData.files.map(f => ({
        path: f.path,
        language: f.language,
        size: f.size
      }));
      const results = await semanticSearchCodebase(searchQuery, summary, apiKey);
      setSemanticSearchResults(results);
    } catch (err: any) {
      console.error(err);
      setSemanticSearchError(err?.message || 'Failed to complete semantic search.');
    } finally {
      setIsSearchingSemantically(false);
    }
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
            style={{ paddingLeft: `${depth * 14 + 8}px`, fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flex: 1, overflow: 'hidden' }} onClick={() => toggleFolder(item.path)}>
              {isExpanded ? <ChevronDown size={14} style={{ flexShrink: 0 }} /> : <ChevronRight size={14} style={{ flexShrink: 0 }} />}
              <Folder size={14} style={{ color: 'var(--color-secondary)', opacity: 0.8, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
            </div>
            {(viewMode === 'dependency' || viewMode === 'cluster') && (
              <button
                className="tree-graph-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setCollapsedFolders(prev => {
                    const next = new Set(prev);
                    if (next.has(item.path)) next.delete(item.path);
                    else next.add(item.path);
                    return next;
                  });
                }}
                title={collapsedFolders.has(item.path) ? "Expand in Graph" : "Collapse in Graph"}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: collapsedFolders.has(item.path) ? 'var(--color-warning)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  fontSize: '0.65rem',
                  flexShrink: 0,
                  transition: 'color 0.2s ease'
                }}
              >
                {collapsedFolders.has(item.path) ? '📁 collapsed' : '📂 collapse'}
              </button>
            )}
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
        />
      ) : (
        graphData && (
          <main className="workspace-layout">
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
                    placeholder="Filter tree or ask AI..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSemanticSearch();
                      }
                    }}
                  />
                  <button
                    className="search-ai-btn"
                    title="Semantic AI Search (Enter)"
                    onClick={handleSemanticSearch}
                    disabled={!searchQuery.trim() || isSearchingSemantically}
                  >
                    {isSearchingSemantically ? (
                      <div className="search-spinner" />
                    ) : (
                      <Sparkles size={13} />
                    )}
                  </button>
                </div>
              </div>
              <div className="file-tree-container">
                {isSearchingSemantically ? (
                  <div className="semantic-loading" style={{ padding: '24px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div className="search-spinner" style={{ width: '20px', height: '20px' }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>Gemini is indexing & mapping files...</span>
                  </div>
                ) : semanticSearchError ? (
                  <div className="semantic-results-container">
                    <div className="semantic-results-header">
                      <span>⚠️ AI Search Error</span>
                      <button 
                        className="semantic-clear-btn" 
                        onClick={() => {
                          setSemanticSearchResults(null);
                          setSemanticSearchError(null);
                          setSearchQuery('');
                        }}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="semantic-error" style={{ margin: '10px 0', padding: '10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px', fontSize: '0.75rem', color: '#fca5a5' }}>
                      {semanticSearchError}
                    </div>
                  </div>
                ) : semanticSearchResults ? (
                  <div className="semantic-results-container">
                    <div className="semantic-results-header">
                      <span>✨ AI Matches ({semanticSearchResults.length})</span>
                      <button 
                        className="semantic-clear-btn" 
                        onClick={() => {
                          setSemanticSearchResults(null);
                          setSemanticSearchError(null);
                          setSearchQuery('');
                        }}
                      >
                        Clear
                      </button>
                    </div>
                    {semanticSearchResults.length === 0 ? (
                      <div className="semantic-empty" style={{ padding: '20px 10px', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>
                        No matches found. Try describing functions or components.
                      </div>
                    ) : (
                      <div className="semantic-results-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px' }}>
                        {semanticSearchResults.map((result) => (
                          <div 
                            key={result.filePath}
                            className={`semantic-result-item ${selectedNodeId === result.filePath ? 'active' : ''}`}
                            onClick={() => setSelectedNodeId(result.filePath)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div className="semantic-result-title-row">
                              <span className="semantic-result-name">{result.filePath.split('/').pop()}</span>
                              <span className="relevance-badge">{result.relevanceScore}% Match</span>
                            </div>
                            <div className="semantic-result-path">{result.filePath}</div>
                            <div className="match-reason">{result.reason}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  fileTree && renderTree(fileTree)
                )}
              </div>
            </aside>

            {/* Center Area - D3 Graph Visualizer or Analytics Dashboard */}
            <section className="glass-panel center-panel" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="tabs-header" style={{ flexShrink: 0 }}>
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
                  <button
                    className={`tab-btn ${viewMode === 'analytics' ? 'active' : ''}`}
                    onClick={() => setViewMode('analytics')}
                  >
                    📊 Analytics
                  </button>
                </div>

                <div className="tabs-right-controls">
                  {viewMode !== 'analytics' && (
                    <button
                      className={`evolution-toggle-btn ${isEvolutionMode ? 'active' : ''}`}
                      onClick={() => {
                        setIsEvolutionMode(!isEvolutionMode);
                        setCurrentEvolutionStep(0);
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.75rem',
                        height: '26px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: isEvolutionMode ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                        border: isEvolutionMode ? '1px solid #a855f7' : '1px solid var(--panel-border)',
                        borderRadius: '4px',
                        color: isEvolutionMode ? '#c084fc' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        transition: 'all 0.2s ease',
                        boxShadow: isEvolutionMode ? '0 0 8px rgba(168, 85, 247, 0.3)' : 'none',
                        flexShrink: 0,
                      }}
                      title="Replay historical codebase changes step-by-step"
                    >
                      <span>⏱️ Git Replay</span>
                      {isEvolutionMode && <span className="evolution-pulse-indicator" style={{ margin: 0 }}></span>}
                    </button>
                  )}

                </div>
              </div>

              {/* Sticky KPI Ribbon */}
              <KpiRibbon
                graphData={graphData}
                onOpenAnalytics={() => setViewMode('analytics')}
                onSelectFile={(filePath) => setSelectedNodeId(filePath)}
              />

              {/* D3 Canvas Viewport or Analytics Dashboard Content */}
              {viewMode === 'analytics' ? (
                <AnalyticsDashboard
                  files={repoData.files}
                  cycles={graphData.cycles}
                  graphData={graphData}
                  apiKey={apiKey}
                  onSelectFile={(filePath) => setSelectedNodeId(filePath)}
                />
              ) : (
                <GraphCanvas
                  graphData={graphData}
                  selectedNode={selectedNodeId}
                  setSelectedNode={setSelectedNodeId}
                  viewMode={viewMode}
                  searchQuery={searchQuery}
                  collapsedFolders={collapsedFolders}
                  setCollapsedFolders={setCollapsedFolders}
                  activeTraceNodeId={activeTraceNodeId}
                  setActiveTraceNodeId={setActiveTraceNodeId}
                  depthFilter={depthFilter}
                  setDepthFilter={setDepthFilter}
                  diffData={diffData}
                  setDiffData={setDiffData}
                  repoName={repoData.repoName}
                  files={repoData.files}
                  isEvolutionMode={isEvolutionMode}
                  setIsEvolutionMode={setIsEvolutionMode}
                  currentEvolutionStep={currentEvolutionStep}
                  setCurrentEvolutionStep={setCurrentEvolutionStep}
                />
              )}
            </section>

            {/* Right Sidebar - Inspector Panel */}
            <Inspector
              selectedFile={activeFile}
              allFiles={repoData.files}
              apiKey={apiKey}
              cycles={graphData.cycles}
              imports={activeFileImports}
              selectedNodeId={selectedNodeId}
              setSelectedNodeId={setSelectedNodeId}
              setCollapsedFolders={setCollapsedFolders}
              activeTraceNodeId={activeTraceNodeId}
              setActiveTraceNodeId={setActiveTraceNodeId}
              callNodes={graphData.callNodes || []}
              callLinks={graphData.callLinks || []}
              diffData={diffData}
            />
          </main>
        )
      )}

      {/* Floating AI Chat Toggle Bubble */}
      {repoData && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="glass-panel"
          title="Ask AI Assistant"
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            background: 'var(--panel-bg)',
            border: '1px solid var(--panel-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 999,
            boxShadow: '0 8px 32px 0 rgba(99, 102, 241, 0.4)',
            color: 'var(--text-primary)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1) rotate(10deg)';
            e.currentTarget.style.borderColor = 'var(--color-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
            e.currentTarget.style.borderColor = 'var(--panel-border)';
          }}
        >
          <Sparkles size={22} style={{ color: 'var(--color-primary)' }} />
        </button>
      )}

      {/* AI Chat Drawer component */}
      {repoData && (
        <AiChatDrawer
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          selectedFile={activeFile}
          allFiles={repoData.files}
          apiKey={apiKey}
        />
      )}
    </div>
  );
}
