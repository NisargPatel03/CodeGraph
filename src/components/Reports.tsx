import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import mermaid from 'mermaid';
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
  Gauge,
  X,
  GitBranch,
  RefreshCw
} from 'lucide-react';
import type { ParsedFile } from '../utils/repoParser';
import type { CodebaseGraph } from '../utils/codeAnalyzer';
import { generateOnboardingGuide, generateArchitectureOverview, refactorCodeSmell, generateMermaidDiagram } from '../utils/aiHelper';
import { AiIcon } from './AiIcon';

// ── Mermaid renderer component ──────────────────────────────────────────────
let mermaidInitialized = false;

const MermaidDiagram: React.FC<{ chart: string }> = ({ chart }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);  const downloadSvg = () => {
    try {
      if (!ref.current) return;
      const svgEl = ref.current.querySelector('svg');
      if (!svgEl) return;

      const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
      if (!svgClone.getAttribute('xmlns')) {
        svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }
      if (!svgClone.getAttribute('xmlns:xlink')) {
        svgClone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      }

      const svgString = new XMLSerializer().serializeToString(svgClone);
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'codebase-architecture.svg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download SVG failed:', e);
    }
  };

  const downloadPng = () => {
    try {
      if (!ref.current) return;
      const svgEl = ref.current.querySelector('svg');
      if (!svgEl) return;

      const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
      if (!svgClone.getAttribute('xmlns')) {
        svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }
      if (!svgClone.getAttribute('xmlns:xlink')) {
        svgClone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      }

      const width = Math.ceil(svgClone.viewBox?.baseVal?.width || svgEl.clientWidth || 800);
      const height = Math.ceil(svgClone.viewBox?.baseVal?.height || svgEl.clientHeight || 600);

      const svgString = new XMLSerializer().serializeToString(svgClone);
      const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);

      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const scale = 2;
          canvas.width = width * scale;
          canvas.height = height * scale;

          const context = canvas.getContext('2d');
          if (context) {
            context.fillStyle = '#0a0a0f';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.scale(scale, scale);
            context.drawImage(image, 0, 0, width, height);

            const pngUrl = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = pngUrl;
            a.download = 'codebase-architecture.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        } catch (err) {
          console.error('PNG canvas export failed:', err);
        }
      };
      image.onerror = (err) => {
        console.error('Image load failed for PNG export:', err);
      };
      image.src = svgDataUrl;
    } catch (e) {
      console.error('Download PNG failed:', e);
    }
  };
  useEffect(() => {
    if (!ref.current || !chart) return;

    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          primaryColor: '#1e1b4b',
          primaryTextColor: '#e2e8f0',
          primaryBorderColor: '#4f46e5',
          lineColor: '#6366f1',
          secondaryColor: '#0f172a',
          tertiaryColor: '#1e293b',
          background: '#0a0a0f',
          mainBkg: '#0f172a',
          nodeBorder: '#4f46e5',
          clusterBkg: '#1e1b4b',
          titleColor: '#c4b5fd',
          edgeLabelBackground: '#1e293b',
          fontFamily: 'Inter, system-ui, sans-serif',
        },
        securityLevel: 'loose',
        flowchart: { curve: 'basis', htmlLabels: true, useMaxWidth: true },
      });
      mermaidInitialized = true;
    }

    const id = `mermaid-${Date.now()}`;
    ref.current.innerHTML = '';
    setRenderError(null);

    mermaid.render(id, chart)
      .then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg;
      })
      .catch((err) => {
        console.error('Mermaid render error:', err);
        setRenderError(err?.message || 'Failed to render diagram');
      });
  }, [chart]);

  if (renderError) {
    return (
      <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.78rem' }}>
        ⚠️ Diagram render error: {renderError}
      </div>
    );
  }

  return (
    <div style={{ width: '100%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', width: '100%', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '8px' }}>
        <button
          className="cyber-button secondary"
          style={{ fontSize: '0.68rem', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
          onClick={downloadSvg}
          title="Download as SVG (Scalable Vector Graphics)"
        >
          <Download size={11} />
          Export SVG
        </button>
        <button
          className="cyber-button secondary"
          style={{ fontSize: '0.68rem', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
          onClick={downloadPng}
          title="Download as PNG (High-resolution raster image)"
        >
          <Download size={11} />
          Export PNG
        </button>
      </div>
      <div ref={ref} style={{ width: '100%', textAlign: 'center', overflowX: 'auto' }} />
    </div>
  );
};

function formatMarkdown(text: string): string {
  if (!text) return '';
  return text
    // 1. Code blocks (triple backticks)
    .replace(/\`\`\`([a-zA-Z0-9]+)?\s*\n([\s\S]*?)\`\`\`/gm, (_match, lang, code) => {
      // Escape HTML entities to prevent rendering tags inside code block
      const escapedCode = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      const displayLang = lang ? lang.toUpperCase() : 'CODE';
      
      return `
        <div class="code-block-wrapper">
          <div class="code-block-header">
            <span>${displayLang}</span>
            <button class="code-block-copy-btn" onclick="navigator.clipboard.writeText(this.closest('.code-block-wrapper').querySelector('pre').innerText); const el = this; el.innerText = 'Copied!'; setTimeout(() => el.innerText = 'Copy', 2000);">Copy</button>
          </div>
          <pre class="code-block-pre"><code>${escapedCode}</code></pre>
        </div>
      `;
    })
    // 2. Headings
    .replace(/^# (.*$)/gim, '<h2 style="color:var(--text-primary); font-weight:700; margin:22px 0 10px 0; border-bottom: 1px solid var(--panel-border); padding-bottom: 6px;">$1</h2>')
    .replace(/^## (.*$)/gim, '<h3 style="color:var(--text-primary); font-weight:600; margin:18px 0 8px 0; border-bottom: 1px solid var(--panel-border); padding-bottom: 4px;">$1</h3>')
    .replace(/^### (.*$)/gim, '<h4 style="color:var(--text-primary); font-weight:600; margin:16px 0 6px 0;">$1</h4>')
    .replace(/^#### (.*$)/gim, '<h5 style="color:var(--text-primary); font-weight:600; margin:12px 0 4px 0;">$1</h5>')
    .replace(/^##### (.*$)/gim, '<h6 style="color:var(--text-primary); font-weight:600; margin:10px 0 4px 0;">$1</h6>')
    // 3. Lists
    .replace(/^\s*[\-\*\+]\s+(.*$)/gim, '<li style="margin-left:14px; list-style-type:circle; margin-bottom:4px;">$1</li>')
    // 4. Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // 5. Inline Code
    .replace(/\`(.*?)\`/g, '<code>$1</code>');
}

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
  const [mermaidDiagram, setMermaidDiagram] = useState('');
  const [loadingMermaid, setLoadingMermaid] = useState(false);
  const [archView, setArchView] = useState<'text' | 'diagram'>('diagram');
  const [toastMessage, setToastMessage] = useState('');
  const [refactorSmell, setRefactorSmell] = useState<any | null>(null);
  const [refactorResult, setRefactorResult] = useState<string | null>(null);
  const [refactoringLoading, setRefactoringLoading] = useState(false);

  const handleRefactor = async (smell: any) => {
    setRefactorSmell(smell);
    setRefactoringLoading(true);
    setRefactorResult(null);
    try {
      const fileObj = files.find(f => f.path === smell.file);
      const fileContent = fileObj?.content || '';
      const suggestion = await refactorCodeSmell(
        smell.file,
        fileContent,
        smell.message,
        smell.details,
        apiKey
      );
      setRefactorResult(suggestion);
    } catch (err: any) {
      setRefactorResult(`### ⚠️ Refactoring Failed\nError: ${err.message || err}`);
    } finally {
      setRefactoringLoading(false);
    }
  };

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
    const summary = files.map((f) => ({ path: f.path, language: f.language, size: f.size }));
    const rawLinks = (graphData?.links || []).map(l => ({
      source: typeof l.source === 'object' ? (l.source as any).id : String(l.source),
      target: typeof l.target === 'object' ? (l.target as any).id : String(l.target),
    }));

    // Generate both text report and Mermaid diagram in parallel
    setLoadingArchitecture(true);
    setLoadingMermaid(true);
    setArchView('diagram');
    try {
      const [doc, diagram] = await Promise.all([
        generateArchitectureOverview(summary, apiKey),
        generateMermaidDiagram(summary, rawLinks, apiKey),
      ]);
      setArchitectureDoc(doc);
      setMermaidDiagram(diagram);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingArchitecture(false);
      setLoadingMermaid(false);
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
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRefactor(smell);
                          }}
                          className="cyber-button"
                          style={{
                            padding: '3px 8px',
                            fontSize: '0.65rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'rgba(139, 92, 246, 0.15)',
                            borderColor: 'rgba(139, 92, 246, 0.3)',
                          }}
                        >
                          <AiIcon size={12} />
                          AI Refactor
                        </button>

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
                        }}>
                          {smell.severity}
                        </span>
                      </div>
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
                <div className="markdown-body" style={{ color: 'var(--text-primary)', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)', maxHeight: '300px', overflowY: 'auto' }}>
                  <div dangerouslySetInnerHTML={{
                    __html: formatMarkdown(onboardingDoc)
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(architectureDoc || mermaidDiagram) ? (
              <>
                {/* View Toggle + Regenerate */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className={`tab-btn ${archView === 'diagram' ? 'active' : ''}`}
                      style={{ fontSize: '0.75rem', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                      onClick={() => setArchView('diagram')}
                    >
                      <GitBranch size={12} />
                      UML Diagram
                    </button>
                    <button
                      className={`tab-btn ${archView === 'text' ? 'active' : ''}`}
                      style={{ fontSize: '0.75rem', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                      onClick={() => setArchView('text')}
                    >
                      <Layers size={12} />
                      Text Report
                    </button>
                  </div>
                  <button
                    className="cyber-button secondary"
                    style={{ fontSize: '0.72rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
                    onClick={handleGenerateArchitecture}
                    disabled={loadingArchitecture || loadingMermaid}
                  >
                    <RefreshCw size={11} style={{ animation: (loadingArchitecture || loadingMermaid) ? 'spin 1s linear infinite' : 'none' }} />
                    {(loadingArchitecture || loadingMermaid) ? 'Regenerating...' : 'Regenerate'}
                  </button>
                </div>

                {/* Diagram Panel */}
                {archView === 'diagram' && (
                  <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--panel-border)', borderRadius: '10px', padding: '20px', minHeight: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {loadingMermaid ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <div className="bounce-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)', animation: 'bounce 1.4s infinite ease-in-out both' }} />
                          <div className="bounce-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }} />
                          <div className="bounce-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gemini is drawing your architecture diagram...</span>
                      </div>
                    ) : mermaidDiagram ? (
                      <MermaidDiagram chart={mermaidDiagram} />
                    ) : null}
                  </div>
                )}

                {/* Text Report Panel */}
                {archView === 'text' && (
                  <div className="markdown-body" style={{ color: 'var(--text-primary)', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)', maxHeight: '300px', overflowY: 'auto' }}>
                    {loadingArchitecture ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '30px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <div className="bounce-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)', animation: 'bounce 1.4s infinite ease-in-out both' }} />
                          <div className="bounce-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }} />
                          <div className="bounce-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gemini is writing the report...</span>
                      </div>
                    ) : (
                      <div dangerouslySetInnerHTML={{ __html: formatMarkdown(architectureDoc) }} />
                    )}
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '24px', textAlign: 'center' }}>
                <GitBranch size={36} style={{ color: 'var(--color-primary)', opacity: 0.6 }} />
                <div>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>No Architecture Diagram Yet</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '6px', maxWidth: '420px', lineHeight: 1.5 }}>
                    Generate a live <strong style={{ color: 'var(--color-primary)' }}>Mermaid UML diagram</strong> and a full text architecture report — both powered by Gemini AI.
                  </p>
                </div>
                <button
                  className="cyber-button"
                  onClick={handleGenerateArchitecture}
                  disabled={loadingArchitecture}
                  style={{ fontSize: '0.85rem', padding: '10px 20px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <GitBranch size={15} />
                  {loadingArchitecture ? 'Analyzing & Drawing...' : 'Generate UML + Architecture Report'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Refactor Suggestion Modal Overlay */}
      {refactorSmell && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(10px)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setRefactorSmell(null)}
        >
          <div
            className="glass-panel"
            style={{
              width: '800px',
              maxWidth: '95%',
              maxHeight: '85vh',
              background: 'var(--panel-bg)',
              border: '1px solid var(--panel-border)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--panel-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.01)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} style={{ color: 'var(--color-primary)' }} />
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                    AI Code Smell Refactoring
                  </h3>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    Refactoring suggestion for: <code style={{ color: 'var(--color-secondary)' }}>{refactorSmell.file.split('/').pop()}</code>
                  </span>
                </div>
              </div>
              <button
                onClick={() => setRefactorSmell(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Smell Card Overview */}
            <div
              style={{
                padding: '12px 20px',
                background: 'rgba(244, 63, 94, 0.03)',
                borderBottom: '1px solid var(--panel-border)',
                fontSize: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div>
                <strong style={{ color: 'var(--color-alert)' }}>Smell: </strong>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{refactorSmell.message}</span>
              </div>
              <div style={{ opacity: 0.8 }}>
                {refactorSmell.details}
              </div>
            </div>

            {/* Content Body */}
            <div
              style={{
                flex: 1,
                padding: '20px',
                overflowY: 'auto',
                fontSize: '0.85rem',
                lineHeight: '1.5',
                color: 'var(--text-secondary)',
                background: 'rgba(0,0,0,0.15)',
              }}
            >
              {refactoringLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <div className="bounce-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)', animation: 'bounce 1.4s infinite ease-in-out both' }} />
                    <div className="bounce-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }} />
                    <div className="bounce-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gemini is refactoring your code...</span>
                </div>
              ) : (
                refactorResult && (
                  <div className="markdown-body">
                    <div dangerouslySetInnerHTML={{
                      __html: formatMarkdown(refactorResult)
                    }} />
                  </div>
                )
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--panel-border)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                background: 'rgba(255,255,255,0.01)',
              }}
            >
              {refactorResult && !refactoringLoading && (
                <button
                  className="cyber-button"
                  onClick={() => {
                    const preMatch = refactorResult.match(/\`\`\`(?:[a-zA-Z]+)?\n([\s\S]*?)\n\`\`\`/);
                    const codeToCopy = preMatch ? preMatch[1] : refactorResult;
                    navigator.clipboard.writeText(codeToCopy);
                    showToast('Refactored code copied to clipboard!');
                  }}
                  style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Copy size={12} />
                  Copy Code block
                </button>
              )}
              <button
                className="cyber-button secondary"
                onClick={() => setRefactorSmell(null)}
                style={{ padding: '6px 12px', fontSize: '0.75rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Toast Notification overlay */}
      {toastMessage && createPortal(
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
        </div>,
        document.body
      )}
    </div>
  );
};
