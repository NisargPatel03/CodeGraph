import React, { useState, useMemo } from 'react';
import { 
  BookOpen, 
  Milestone, 
  AlertTriangle, 
  CheckCircle, 
  ChevronDown, 
  ChevronUp, 
  TrendingUp, 
  Layers, 
  Folder, 
  Copy, 
  Printer, 
  Download, 
  Sparkles, 
  Gauge
} from 'lucide-react';
import type { ParsedFile } from '../utils/repoParser';
import type { CodebaseGraph } from '../utils/codeAnalyzer';
import { generateOnboardingGuide, generateArchitectureOverview } from '../utils/aiHelper';

interface ReportsProps {
  files: ParsedFile[];
  cycles: string[][];
  graphData: CodebaseGraph | null;
  apiKey: string;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  onSelectFile: (filePath: string) => void;
}

export const Reports: React.FC<ReportsProps> = ({
  files,
  cycles,
  graphData,
  apiKey,
  isExpanded,
  setIsExpanded,
  onSelectFile,
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'smells' | 'cycles' | 'onboarding' | 'architecture'>('dashboard');
  const [onboardingDoc, setOnboardingDoc] = useState('');
  const [loadingOnboarding, setLoadingOnboarding] = useState(false);
  const [architectureDoc, setArchitectureDoc] = useState('');
  const [loadingArchitecture, setLoadingArchitecture] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const handleGenerateOnboarding = async () => {
    setLoadingOnboarding(true);
    try {
      const summary = files.map((f) => ({ path: f.path, language: f.language, size: f.size }));
      const doc = await generateOnboardingGuide(summary, apiKey);
      setOnboardingDoc(doc);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingOnboarding(false);
    }
  };

  const handleGenerateArchitecture = async () => {
    setLoadingArchitecture(true);
    try {
      const summary = files.map((f) => ({ path: f.path, language: f.language, size: f.size }));
      const doc = await generateArchitectureOverview(summary, apiKey);
      setArchitectureDoc(doc);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingArchitecture(false);
    }
  };

  // 1. Dashboard Metrics Calculations
  const dashboardData = useMemo(() => {
    if (!graphData) return null;

    // Group complexity by folder
    const folderComplexity: Record<string, number> = {};
    graphData.nodes.forEach(node => {
      const folder = node.folder || 'root';
      const complexity = node.complexity || 0;
      folderComplexity[folder] = (folderComplexity[folder] || 0) + complexity;
    });

    const folderStats = Object.entries(folderComplexity)
      .map(([folder, complexity]) => ({ folder, complexity }))
      .sort((a, b) => b.complexity - a.complexity);

    // Calculate most imported files (in-degree ranking)
    const inDegree: Record<string, number> = {};
    graphData.nodes.forEach(n => { inDegree[n.id] = 0; });
    graphData.links.forEach(l => {
      const targetId = typeof l.target === 'object' ? (l.target as any).id : l.target;
      if (inDegree[targetId] !== undefined) {
        inDegree[targetId]++;
      }
    });

    const mostImported = Object.entries(inDegree)
      .map(([file, count]) => ({ file, count }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Most changed files based on churn score
    const mostChanged = [...graphData.nodes]
      .filter(n => !n.isNpm)
      .map(n => ({ file: n.id, churn: n.churn || 0 }))
      .sort((a, b) => b.churn - a.churn)
      .slice(0, 5);

    return {
      folderStats,
      mostImported,
      mostChanged
    };
  }, [graphData]);

  // Export Guide functions
  const handleExportMarkdown = () => {
    if (!onboardingDoc) return;
    const blob = new Blob([onboardingDoc], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'developer_onboarding_guide.md');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Downloaded Markdown file!');
  };

  const handleExportPDF = () => {
    if (!onboardingDoc) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Developer Onboarding Guide - CodeGraph</title>
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                line-height: 1.6;
                color: #1f2937;
                padding: 40px;
                max-width: 800px;
                margin: 0 auto;
              }
              h1, h2, h3, h4, h5, h6 {
                color: #111827;
                font-weight: 700;
                margin-top: 1.5em;
                margin-bottom: 0.5em;
              }
              h1 { border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; font-size: 2.25rem; }
              h2 { border-bottom: 1px solid #f3f4f6; padding-bottom: 6px; font-size: 1.5rem; }
              code {
                font-family: monospace;
                background: #f3f4f6;
                padding: 2px 4px;
                border-radius: 4px;
                font-size: 0.9em;
              }
              pre {
                background: #f3f4f6;
                padding: 16px;
                border-radius: 8px;
                overflow-x: auto;
              }
              li { margin-bottom: 4px; }
            </style>
          </head>
          <body>
            <h1>Developer Onboarding Guide</h1>
            <div class="content">
              ${onboardingDoc
                .replace(/\n/g, '<br/>')
                .replace(/### (.*?)(?:<br\/>|$)/g, '<h3>$1</h3>')
                .replace(/#### (.*?)(?:<br\/>|$)/g, '<h4>$1</h4>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\`(.*?)\`/g, '<code>$1</code>')}
            </div>
            <script>
              window.onload = function() {
                window.print();
                window.close();
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
      showToast('Opened Print PDF dialog!');
    }
  };

  const handleExportNotion = () => {
    if (!onboardingDoc) return;
    navigator.clipboard.writeText(onboardingDoc);
    showToast('Copied Notion-compatible Markdown to Clipboard!');
  };

  if (!isExpanded) {
    const totalSmells = graphData?.codeSmells?.length || 0;
    return (
      <div className="glass-panel bottom-panel-header" style={{ cursor: 'pointer' }} onClick={() => setIsExpanded(true)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Gauge size={16} style={{ color: 'var(--color-secondary)' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>CodeBase Health Reports ({totalSmells} Warnings / {cycles.length} Cycles)</span>
        </div>
        <ChevronUp size={16} />
      </div>
    );
  }

  return (
    <div className="glass-panel bottom-panel">
      {/* Tab Selectors */}
      <div className="bottom-panel-header">
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', overflowX: 'auto', paddingRight: '12px' }}>
          <button
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Gauge size={14} />
            Health Dashboard
          </button>
          <button
            className={`tab-btn ${activeTab === 'smells' ? 'active' : ''}`}
            onClick={() => setActiveTab('smells')}
          >
            <AlertTriangle size={14} style={{ color: (graphData?.codeSmells?.length || 0) > 0 ? 'var(--color-alert)' : 'var(--text-muted)' }} />
            Code Smells ({graphData?.codeSmells?.length || 0})
          </button>
          <button
            className={`tab-btn ${activeTab === 'cycles' ? 'active' : ''}`}
            onClick={() => setActiveTab('cycles')}
          >
            <Milestone size={14} style={{ color: cycles.length > 0 ? '#f43f5e' : 'var(--text-muted)' }} />
            Circular Cycles ({cycles.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'onboarding' ? 'active' : ''}`}
            onClick={() => setActiveTab('onboarding')}
          >
            <BookOpen size={14} />
            Onboarding Exporter
          </button>
          <button
            className={`tab-btn ${activeTab === 'architecture' ? 'active' : ''}`}
            onClick={() => setActiveTab('architecture')}
          >
            <Milestone size={14} />
            Architecture Overview
          </button>
        </div>
        <button className="control-btn" onClick={() => setIsExpanded(false)} style={{ width: '28px', height: '28px', flexShrink: 0 }}>
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Tab Panels */}
      <div className="bottom-panel-content">
        
        {/* TAB 1: HEALTH DASHBOARD */}
        {activeTab === 'dashboard' && graphData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* KPI Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div className="glass-panel" style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Files</span>
                <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-secondary)', textShadow: '0 0 10px rgba(0, 242, 254, 0.2)' }}>
                  {graphData.stats?.totalFiles || files.length}
                </span>
              </div>
              <div className="glass-panel" style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Functions</span>
                <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-primary)', textShadow: '0 0 10px rgba(139, 92, 246, 0.2)' }}>
                  {graphData.stats?.totalFunctions || 0}
                </span>
              </div>
              <div className="glass-panel" style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lines of Code</span>
                <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-warning)', textShadow: '0 0 10px rgba(245, 158, 11, 0.2)' }}>
                  {graphData.stats?.totalLoc?.toLocaleString() || 0}
                </span>
              </div>
              <div className="glass-panel" style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Complexity Score</span>
                <span style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ef4444', textShadow: '0 0 10px rgba(239, 68, 68, 0.2)' }}>
                  {Math.round((graphData.stats?.totalLoc || 0) / 100 * 1.8)}
                </span>
              </div>
            </div>

            {/* Dashboard Lists & Charts */}
            {dashboardData && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                
                {/* Module Complexity Bar Chart */}
                <div className="glass-panel" style={{ padding: '14px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <h4 style={{ fontSize: '0.8rem', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Folder size={14} style={{ color: 'var(--color-warning)' }} />
                    Complexity Score Per Module
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {dashboardData.folderStats.slice(0, 5).map(item => {
                      const maxComp = dashboardData.folderStats[0]?.complexity || 1;
                      const pct = (item.complexity / maxComp) * 100;
                      return (
                        <div key={item.folder}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '80%' }}>{item.folder}</span>
                            <span style={{ fontFamily: 'var(--font-mono)' }}>{item.complexity} loc</span>
                          </div>
                          <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))', borderRadius: '3px' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Most Imported / Popular Files */}
                <div className="glass-panel" style={{ padding: '14px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <h4 style={{ fontSize: '0.8rem', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <TrendingUp size={14} style={{ color: 'var(--color-primary)' }} />
                    Most Imported Files (Ranked)
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                    {dashboardData.mostImported.length === 0 ? (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No dependencies mapped yet.</span>
                    ) : (
                      dashboardData.mostImported.map((item, idx) => (
                        <div 
                          key={item.file} 
                          onClick={() => onSelectFile(item.file)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', padding: '6px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.02)', cursor: 'pointer' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                            <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>#{idx + 1}</span>
                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{item.file.split('/').pop()}</span>
                          </div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{item.count} imports</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Dead Code Detection */}
                <div className="glass-panel" style={{ padding: '14px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <h4 style={{ fontSize: '0.8rem', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={14} style={{ color: '#6b7280' }} />
                    Unused / Dead Code (0 Imports)
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                    {!graphData.deadFiles || graphData.deadFiles.length === 0 ? (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '6px' }}>No dead code files detected. Brilliant!</span>
                    ) : (
                      graphData.deadFiles.map(file => (
                        <div 
                          key={file}
                          onClick={() => onSelectFile(file)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', padding: '6px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.02)', cursor: 'pointer' }}
                        >
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }} title={file}>{file.split('/').pop()}</span>
                          <span className="badge-critical" style={{ fontSize: '0.6rem', padding: '2px 5px', borderRadius: '3px', background: 'rgba(107,114,128,0.15)', color: '#9ca3af' }}>Unused</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Duplicate Function Names */}
                <div className="glass-panel" style={{ padding: '14px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <h4 style={{ fontSize: '0.8rem', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Layers size={14} style={{ color: 'var(--color-secondary)' }} />
                    Duplicate Functions
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                    {!graphData.duplicateFunctions || graphData.duplicateFunctions.length === 0 ? (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '6px' }}>No duplicate functions found.</span>
                    ) : (
                      graphData.duplicateFunctions.slice(0, 10).map((group, idx) => (
                        <div key={idx} style={{ padding: '6px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.02)' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{group.name}()</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                            {group.locations.map((loc, lIdx) => (
                              <span 
                                key={lIdx} 
                                onClick={() => onSelectFile(loc.file)}
                                style={{ fontSize: '0.6rem', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', padding: '1px 4px', borderRadius: '3px', border: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
                              >
                                {loc.file.split('/').pop()}:L{loc.line}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Most Churned / Changed Files */}
                <div className="glass-panel" style={{ padding: '14px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <h4 style={{ fontSize: '0.8rem', color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Milestone size={14} style={{ color: 'var(--color-secondary)' }} />
                    Highly Active Files (Churn)
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                    {dashboardData.mostChanged.map((item) => (
                      <div 
                        key={item.file}
                        onClick={() => onSelectFile(item.file)}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', padding: '6px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.02)', cursor: 'pointer' }}
                      >
                        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{item.file.split('/').pop()}</span>
                        <span style={{ color: 'var(--color-secondary)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>{item.churn} commits</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* TAB 2: CODE SMELLS */}
        {activeTab === 'smells' && graphData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Static analysis checks flagged the following maintainability concerns. Click any warning to open its location.
            </p>
            {!graphData.codeSmells || graphData.codeSmells.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--color-accent)', padding: '12px', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <CheckCircle size={24} />
                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Codebase is looking pristine!</h4>
                  <p style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '2px' }}>No code smells detected. Excellent code organization.</p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto' }}>
                {graphData.codeSmells.map((smell) => {
                  let badgeColor = '#3b82f6';
                  let badgeBg = 'rgba(59, 130, 246, 0.1)';
                  if (smell.severity === 'critical') {
                    badgeColor = '#f43f5e';
                    badgeBg = 'rgba(244, 63, 94, 0.1)';
                  } else if (smell.severity === 'major') {
                    badgeColor = '#fb923c';
                    badgeBg = 'rgba(251, 146, 60, 0.1)';
                  }

                  return (
                    <div 
                      key={smell.id}
                      onClick={() => onSelectFile(smell.file)}
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.01)', 
                        border: '1px solid rgba(255, 255, 255, 0.03)', 
                        borderRadius: '6px', 
                        padding: '10px 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'start',
                        gap: '12px',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.01)'}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{smell.message}</span>
                          <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                            {smell.file.split('/').pop()}{smell.line ? `:L${smell.line}` : ''}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>{smell.details}</span>
                      </div>
                      
                      <span style={{ 
                        fontSize: '0.6rem', 
                        fontWeight: 700, 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.05em', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        color: badgeColor, 
                        background: badgeBg, 
                        border: `1px solid ${badgeColor}30`,
                        flexShrink: 0
                      }}>
                        {smell.severity}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CIRCULAR DEPENDENCIES */}
        {activeTab === 'cycles' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {cycles.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--color-accent)', padding: '12px', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <CheckCircle size={24} style={{ flexShrink: 0 }} />
                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Clean Architecture!</h4>
                  <p style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '2px' }}>No circular imports detected. Your codebase modularity is looking great.</p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  We found the following circular reference loops. Circular imports make code harder to refactor and test.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                  {cycles.map((cycle, idx) => (
                    <div key={idx} style={{ background: 'rgba(244, 63, 94, 0.02)', border: '1px solid rgba(244, 63, 94, 0.1)', borderRadius: '6px', padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#f43f5e', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                        <AlertTriangle size={14} />
                        <span>Loop #{idx + 1}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                        {cycle.map((node, nodeIdx) => (
                          <React.Fragment key={nodeIdx}>
                            <span
                              style={{ cursor: 'pointer', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}
                              onClick={() => onSelectFile(node)}
                            >
                              {node.split('/').pop()}
                            </span>
                            {nodeIdx < cycle.length - 1 && <span style={{ color: '#f43f5e', fontWeight: 'bold' }}>&rarr;</span>}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ONBOARDING EXPORTER */}
        {activeTab === 'onboarding' && (
          <div>
            {onboardingDoc ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Export Bar */}
                <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={14} style={{ color: 'var(--color-primary)' }} />
                    Guide Generated. Exporters:
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="cyber-button" onClick={handleExportMarkdown} style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Download size={12} />
                      Markdown
                    </button>
                    <button className="cyber-button" onClick={handleExportPDF} style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Printer size={12} />
                      PDF
                    </button>
                    <button className="cyber-button" onClick={handleExportNotion} style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Copy size={12} />
                      Copy to Notion
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="markdown-body" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)', maxHeight: '300px', overflowY: 'auto' }}>
                  <div dangerouslySetInnerHTML={{
                    __html: onboardingDoc
                      .replace(/^### (.*$)/gim, '<h5 style="color:#fff; font-weight:600; margin:16px 0 8px 0;">$1</h5>')
                      .replace(/^#### (.*$)/gim, '<h6 style="color:var(--text-primary); font-weight:600; margin:12px 0 6px 0;">$1</h6>')
                      .replace(/^\s*\-\s*(.*$)/gim, '<li style="margin-left:14px; list-style-type:circle; margin-bottom:4px;">$1</li>')
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\`(.*?)\`/g, '<code style="font-family:var(--font-mono); background:rgba(0,0,0,0.3); padding:2px 4px; border-radius:3px;">$1</code>')
                  }} />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px', textAlign: 'center' }}>
                <BookOpen size={32} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                <div>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>No Onboarding Guide Generated</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '400px' }}>
                    Generate a comprehensive Markdown onboarding document describing Project Purpose, Architecture, Reading Order, and Key Files, with single-click export options.
                  </p>
                </div>
                <button className="cyber-button" onClick={handleGenerateOnboarding} disabled={loadingOnboarding} style={{ fontSize: '0.85rem', padding: '8px 16px', marginTop: '4px' }}>
                  {loadingOnboarding ? 'Analyzing Codebase...' : 'Generate Onboarding Guide'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: ARCHITECTURE OVERVIEW */}
        {activeTab === 'architecture' && (
          <div>
            {architectureDoc ? (
              <div className="markdown-body" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)', maxHeight: '300px', overflowY: 'auto' }}>
                <div dangerouslySetInnerHTML={{
                  __html: architectureDoc
                    .replace(/^### (.*$)/gim, '<h5 style="color:#fff; font-weight:600; margin:16px 0 8px 0;">$1</h5>')
                    .replace(/^#### (.*$)/gim, '<h6 style="color:var(--text-primary); font-weight:600; margin:12px 0 6px 0;">$1</h6>')
                    .replace(/^\s*\-\s*(.*$)/gim, '<li style="margin-left:14px; list-style-type:circle; margin-bottom:4px;">$1</li>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\`(.*?)\`/g, '<code style="font-family:var(--font-mono); background:rgba(0,0,0,0.3); padding:2px 4px; border-radius:3px;">$1</code>')
                }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px', textAlign: 'center' }}>
                <Milestone size={32} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                <div>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>No Architecture Report Generated</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '400px' }}>
                    Let AI audit your repository framework structures, layering boundaries, and dependencies.
                  </p>
                </div>
                <button className="cyber-button" onClick={handleGenerateArchitecture} disabled={loadingArchitecture} style={{ fontSize: '0.85rem', padding: '8px 16px', marginTop: '4px' }}>
                  {loadingArchitecture ? 'Analyzing Architecture...' : 'Generate Architecture Overview'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast Notification overlay */}
      {toastMessage && (
        <div style={{ 
          position: 'fixed', 
          bottom: '20px', 
          right: '20px', 
          padding: '10px 18px', 
          background: 'rgba(16, 185, 129, 0.95)', 
          border: '1px solid rgba(16, 185, 129, 0.4)',
          color: '#fff', 
          fontSize: '0.8rem', 
          borderRadius: '6px', 
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 9999,
          fontWeight: 600,
          animation: 'fade-in 0.3s ease'
        }}>
          {toastMessage}
        </div>
      )}
    </div>
  );
};
