import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import mermaid from 'mermaid';
import { 
  BookOpen, 
  AlertTriangle, 
  CheckCircle, 
  ChevronRight,
  TrendingUp, 
  Folder, 
  Copy, 
  Printer, 
  Download, 
  Sparkles, 
  X,
  GitBranch,
  RefreshCw,
  FileText,
  Activity,
  FileWarning
} from 'lucide-react';
import type { ParsedFile } from '../utils/repoParser';
import type { CodebaseGraph } from '../utils/codeAnalyzer';
import { generateOnboardingGuide, generateArchitectureOverview, refactorCodeSmell, generateMermaidDiagram } from '../utils/aiHelper';

// ── Mermaid renderer component ──────────────────────────────────────────────
let mermaidInitialized = false;

const MermaidDiagram: React.FC<{ chart: string }> = ({ chart }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const downloadSvg = () => {
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

interface AnalyticsDashboardProps {
  files: ParsedFile[];
  cycles: string[][];
  graphData: CodebaseGraph;
  apiKey: string;
  onSelectFile: (filePath: string) => void;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  files,
  cycles,
  graphData,
  apiKey,
  onSelectFile,
}) => {
  const [subTab, setSubTab] = useState<'metrics' | 'architecture' | 'onboarding'>('metrics');
  
  // Onboarding Exporter states
  const [onboardingDoc, setOnboardingDoc] = useState('');
  const [loadingOnboarding, setLoadingOnboarding] = useState(false);
  
  // Architecture states
  const [architectureDoc, setArchitectureDoc] = useState('');
  const [loadingArchitecture, setLoadingArchitecture] = useState(false);
  const [mermaidDiagram, setMermaidDiagram] = useState('');
  const [loadingMermaid, setLoadingMermaid] = useState(false);
  const [archView, setArchView] = useState<'text' | 'diagram'>('diagram');
  
  // Refactor Smell states
  const [refactorSmell, setRefactorSmell] = useState<any | null>(null);
  const [refactorResult, setRefactorResult] = useState<string | null>(null);
  const [refactoringLoading, setRefactoringLoading] = useState(false);
  
  // Table sort/filter states
  const [smellTypeFilter, setSmellTypeFilter] = useState<string>('all');
  const [smellSortKey, setSmellSortKey] = useState<'severity' | 'file' | 'type'>('severity');
  
  // Toast notifications
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

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

  // Calculations
  const dashboardData = useMemo(() => {
    // Complexity per folder
    const folderComplexity: Record<string, number> = {};
    graphData.nodes.forEach(node => {
      const folder = node.folder || 'root';
      const complexity = node.complexity || 0;
      folderComplexity[folder] = (folderComplexity[folder] || 0) + complexity;
    });

    const folderStats = Object.entries(folderComplexity)
      .map(([folder, complexity]) => ({ folder, complexity }))
      .sort((a, b) => b.complexity - a.complexity);

    // Most imported
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
      .slice(0, 10);

    // Code smell breakdown
    const smellCounts: Record<string, number> = {
      file_length: 0,
      func_length: 0,
      nested_import: 0,
      unused_export: 0,
      circular_dep: 0,
    };
    (graphData.codeSmells || []).forEach(smell => {
      if (smellCounts[smell.type] !== undefined) {
        smellCounts[smell.type]++;
      }
    });

    return {
      folderStats,
      mostImported,
      smellCounts,
    };
  }, [graphData]);

  // Sort & Filtered Code Smells
  const processedSmells = useMemo(() => {
    let list = [...(graphData.codeSmells || [])];

    // Filter
    if (smellTypeFilter !== 'all') {
      list = list.filter(s => s.type === smellTypeFilter);
    }

    // Sort
    list.sort((a, b) => {
      if (smellSortKey === 'severity') {
        const severityMap = { critical: 3, major: 2, minor: 1 };
        return severityMap[b.severity] - severityMap[a.severity];
      }
      if (smellSortKey === 'file') {
        return a.file.localeCompare(b.file);
      }
      if (smellSortKey === 'type') {
        return a.type.localeCompare(b.type);
      }
      return 0;
    });

    return list;
  }, [graphData.codeSmells, smellTypeFilter, smellSortKey]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', padding: '24px', gap: '24px', background: 'rgba(5, 8, 20, 0.4)' }}>
      {/* Sub tabs header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className={`tab-btn ${subTab === 'metrics' ? 'active' : ''}`}
            onClick={() => setSubTab('metrics')}
            style={{ fontSize: '0.85rem', padding: '8px 16px', borderRadius: '6px' }}
          >
            <Activity size={15} style={{ marginRight: '6px' }} />
            Codebase Health Metrics
          </button>
          <button 
            className={`tab-btn ${subTab === 'architecture' ? 'active' : ''}`}
            onClick={() => setSubTab('architecture')}
            style={{ fontSize: '0.85rem', padding: '8px 16px', borderRadius: '6px' }}
          >
            <GitBranch size={15} style={{ marginRight: '6px' }} />
            UML & Architecture
          </button>
          <button 
            className={`tab-btn ${subTab === 'onboarding' ? 'active' : ''}`}
            onClick={() => setSubTab('onboarding')}
            style={{ fontSize: '0.85rem', padding: '8px 16px', borderRadius: '6px' }}
          >
            <BookOpen size={15} style={{ marginRight: '6px' }} />
            Onboarding Exporter
          </button>
        </div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Powered by Gemini Intelligence
        </div>
      </div>

      {/* SUB-TAB 1: HEALTH METRICS */}
      {subTab === 'metrics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Row 1: KPI Banner (6 columns CSS grid) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
            {/* Total Files */}
            <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '3px solid var(--color-secondary)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Files</span>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', textShadow: '0 0 10px rgba(0, 242, 254, 0.15)' }}>
                {graphData.stats?.totalFiles || files.length}
              </span>
            </div>
            
            {/* Total Functions */}
            <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '3px solid var(--color-primary)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Functions</span>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', textShadow: '0 0 10px rgba(139, 92, 246, 0.15)' }}>
                {graphData.stats?.totalFunctions || 0}
              </span>
            </div>

            {/* Lines of Code */}
            <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '3px solid var(--color-warning)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lines of Code</span>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', textShadow: '0 0 10px rgba(245, 158, 11, 0.15)' }}>
                {(graphData.stats?.totalLoc || 0).toLocaleString()}
              </span>
            </div>

            {/* Code Smells */}
            <div className="glass-panel" style={{ 
              padding: '16px', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '8px', 
              borderLeft: '3px solid var(--color-alert)',
              animation: (graphData.codeSmells?.length || 0) > 0 ? 'pulse-teal 3s infinite ease-in-out' : 'none'
            }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Code Smells</span>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: (graphData.codeSmells?.length || 0) > 0 ? 'var(--color-alert)' : 'var(--color-accent)' }}>
                {graphData.codeSmells?.length || 0}
              </span>
            </div>

            {/* Circular Cycles */}
            <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '3px solid #ef4444' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Circular Cycles</span>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: cycles.length > 0 ? '#ef4444' : 'var(--color-accent)' }}>
                {cycles.length}
              </span>
            </div>

            {/* Dead Files */}
            <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '3px solid #6b7280' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dead Files</span>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: (graphData.deadFiles?.length || 0) > 0 ? '#9ca3af' : 'var(--color-accent)' }}>
                {graphData.deadFiles?.length || 0}
              </span>
            </div>
          </div>

          {/* Row 2: Three columns */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            
            {/* Column 1: Complexity Heatmap Bar Chart */}
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <Folder size={15} style={{ color: 'var(--color-warning)' }} />
                Complexity Score per Module
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {dashboardData.folderStats.slice(0, 6).map(item => {
                  const maxComp = dashboardData.folderStats[0]?.complexity || 1;
                  const pct = (item.complexity / maxComp) * 100;
                  // Colour code complexity
                  let color = 'var(--color-accent)';
                  if (item.complexity > 1000) color = 'var(--color-alert)';
                  else if (item.complexity > 400) color = 'var(--color-warning)';
                  
                  return (
                    <div key={item.folder}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '75%', fontWeight: 500 }}>{item.folder}</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{item.complexity} lines</span>
                      </div>
                      <div style={{ height: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', boxShadow: `0 0 8px ${color}40` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Column 2: Most Imported Files Leaderboard */}
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <TrendingUp size={15} style={{ color: 'var(--color-primary)' }} />
                Most Imported Files (Ranked)
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                {dashboardData.mostImported.length === 0 ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No dependencies found.</span>
                ) : (
                  dashboardData.mostImported.map((item, idx) => (
                    <div 
                      key={item.file} 
                      onClick={() => onSelectFile(item.file)}
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        fontSize: '0.8rem', 
                        padding: '8px 12px', 
                        borderRadius: '6px', 
                        background: 'rgba(255,255,255,0.01)', 
                        border: '1px solid rgba(255,255,255,0.03)', 
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.01)'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>#{idx + 1}</span>
                        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{item.file.split('/').pop()}</span>
                      </div>
                      <span className="badge-critical" style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: 'var(--color-secondary)' }}>
                        {item.count} imports
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Column 3: Code Smell Breakdown */}
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <AlertTriangle size={15} style={{ color: 'var(--color-alert)' }} />
                Code Smell Breakdown
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {[
                  { key: 'file_length', label: 'File Length Warnings', color: 'var(--color-alert)' },
                  { key: 'func_length', label: 'Function Length Warnings', color: 'var(--color-warning)' },
                  { key: 'nested_import', label: 'Deeply Nested Imports', color: 'var(--color-primary)' },
                  { key: 'unused_export', label: 'Unused Export Warnings', color: '#6b7280' },
                  { key: 'circular_dep', label: 'Circular Import Cycles', color: '#ef4444' },
                ].map(smellType => {
                  const count = dashboardData.smellCounts[smellType.key] || 0;
                  const total = graphData.codeSmells?.length || 1;
                  const pct = Math.max((count / total) * 100, 2); // default minimal width to show bar
                  return (
                    <div key={smellType.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <span>{smellType.label}</span>
                        <span style={{ fontWeight: 600, color: count > 0 ? smellType.color : 'var(--text-muted)' }}>{count}</span>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(255,255,255,0.03)', borderRadius: '3px', overflow: 'hidden' }}>
                        {count > 0 && (
                          <div style={{ width: `${pct}%`, height: '100%', background: smellType.color, borderRadius: '3px' }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Row 3: Full-width Code Smells Table */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <FileWarning size={15} style={{ color: 'var(--color-alert)' }} />
                Code Smells & Maintainability Issues
              </h4>
              
              {/* Filter / Sort UI */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select 
                  value={smellTypeFilter} 
                  onChange={(e) => setSmellTypeFilter(e.target.value)}
                  style={{ background: 'rgba(10,15,30,0.8)', border: '1px solid var(--panel-border)', color: 'var(--text-secondary)', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px' }}
                >
                  <option value="all">All Types</option>
                  <option value="file_length">File Length</option>
                  <option value="func_length">Function Length</option>
                  <option value="nested_import">Nested Import</option>
                  <option value="unused_export">Unused Export</option>
                  <option value="circular_dep">Circular Dependency</option>
                </select>
                
                <select 
                  value={smellSortKey} 
                  onChange={(e) => setSmellSortKey(e.target.value as any)}
                  style={{ background: 'rgba(10,15,30,0.8)', border: '1px solid var(--panel-border)', color: 'var(--text-secondary)', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px' }}
                >
                  <option value="severity">Sort by Severity</option>
                  <option value="file">Sort by File Name</option>
                  <option value="type">Sort by Issue Type</option>
                </select>
              </div>
            </div>

            {processedSmells.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--color-accent)', padding: '16px', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                <CheckCircle size={20} />
                <span style={{ fontSize: '0.8rem' }}>No code smells matching criteria! Keep it up.</span>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px 12px' }}>File</th>
                      <th style={{ padding: '8px 12px' }}>Issue Type</th>
                      <th style={{ padding: '8px 12px' }}>Details</th>
                      <th style={{ padding: '8px 12px' }}>Severity</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processedSmells.map(smell => (
                      <tr 
                        key={smell.id} 
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', cursor: 'pointer', transition: 'background 0.2s' }}
                        onClick={() => onSelectFile(smell.file)}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 500 }}>
                          {smell.file.split('/').pop()}
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginLeft: '6px' }}>{smell.line ? `Line ${smell.line}` : ''}</span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                          {smell.type.replace('_', ' ')}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {smell.details || smell.message}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ 
                            fontSize: '0.65rem', 
                            fontWeight: 700, 
                            textTransform: 'uppercase', 
                            padding: '2px 6px', 
                            borderRadius: '4px',
                            background: smell.severity === 'critical' ? 'rgba(244,63,94,0.1)' : smell.severity === 'major' ? 'rgba(251,146,60,0.1)' : 'rgba(59,130,246,0.1)',
                            color: smell.severity === 'critical' ? 'var(--color-alert)' : smell.severity === 'major' ? 'var(--color-warning)' : 'var(--color-secondary)'
                          }}>
                            {smell.severity}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            className="cyber-button"
                            onClick={() => handleRefactor(smell)}
                            style={{ padding: '4px 8px', fontSize: '0.7rem', background: 'rgba(139, 92, 246, 0.1)', borderColor: 'rgba(139, 92, 246, 0.2)' }}
                          >
                            <Sparkles size={11} style={{ marginRight: '4px' }} />
                            Refactor
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Row 4: Full-width Circular Cycles Visualiser */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <RefreshCw size={15} style={{ color: '#ef4444' }} />
              Circular Dependencies & Dependency Cycles
            </h4>
            
            {cycles.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--color-accent)', padding: '16px', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                <CheckCircle size={20} />
                <span style={{ fontSize: '0.8rem' }}>No circular reference loops detected! Modularity is healthy.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                  The loops below indicate file import recursion. Select any node in a chain to inspect details.
                </p>
                {cycles.map((cycle, idx) => (
                  <div 
                    key={idx} 
                    style={{ 
                      background: 'rgba(244, 63, 94, 0.03)', 
                      border: '1px solid rgba(244, 63, 94, 0.1)', 
                      borderRadius: '8px', 
                      padding: '12px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-alert)' }}>
                      <AlertTriangle size={13} />
                      Cycle #{idx + 1} ({cycle.length} steps)
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      {cycle.map((file, stepIdx) => (
                        <React.Fragment key={`${file}-${stepIdx}`}>
                          {stepIdx > 0 && <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
                          <span 
                            onClick={() => onSelectFile(file)}
                            style={{ 
                              fontSize: '0.72rem', 
                              background: 'rgba(255,255,255,0.03)', 
                              color: 'var(--text-secondary)', 
                              padding: '3px 8px', 
                              borderRadius: '4px', 
                              border: '1px solid rgba(255,255,255,0.04)',
                              cursor: 'pointer',
                              fontWeight: 500
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-alert)'}
                            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'}
                          >
                            {file.split('/').pop()}
                          </span>
                        </React.Fragment>
                      ))}
                      <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                      <span 
                        style={{ 
                          fontSize: '0.72rem', 
                          background: 'rgba(244,63,94,0.1)', 
                          color: 'var(--color-alert)', 
                          padding: '3px 8px', 
                          borderRadius: '4px',
                          fontWeight: 500
                        }}
                      >
                        {cycle[0].split('/').pop()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* SUB-TAB 2: UML & ARCHITECTURE */}
      {subTab === 'architecture' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {(architectureDoc || mermaidDiagram) ? (
            <>
              {/* Toggles */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className={`tab-btn ${archView === 'diagram' ? 'active' : ''}`}
                    style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                    onClick={() => setArchView('diagram')}
                  >
                    <GitBranch size={13} style={{ marginRight: '5px' }} />
                    UML Graph TD
                  </button>
                  <button
                    className={`tab-btn ${archView === 'text' ? 'active' : ''}`}
                    style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                    onClick={() => setArchView('text')}
                  >
                    <FileText size={13} style={{ marginRight: '5px' }} />
                    Architectural Guide
                  </button>
                </div>
                <button
                  className="cyber-button secondary"
                  style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                  onClick={handleGenerateArchitecture}
                  disabled={loadingArchitecture || loadingMermaid}
                >
                  <RefreshCw size={12} style={{ marginRight: '6px', animation: (loadingArchitecture || loadingMermaid) ? 'spin 1s linear infinite' : 'none' }} />
                  Regenerate
                </button>
              </div>

              {/* View Output */}
              {archView === 'diagram' && (
                <div className="glass-panel" style={{ padding: '24px', background: 'rgba(0,0,0,0.3)', minHeight: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
                  {loadingMermaid ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <RefreshCw size={24} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--color-primary)' }} />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Rendering UML Diagram...</span>
                    </div>
                  ) : (
                    <MermaidDiagram chart={mermaidDiagram} />
                  )}
                </div>
              )}

              {archView === 'text' && (
                <div className="glass-panel markdown-body" style={{ padding: '24px', maxHeight: '550px', overflowY: 'auto' }}>
                  {loadingArchitecture ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '40px' }}>
                      <RefreshCw size={24} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--color-primary)' }} />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Writing Report...</span>
                    </div>
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: formatMarkdown(architectureDoc) }} />
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '60px 20px', textAlign: 'center' }}>
              <GitBranch size={48} style={{ color: 'var(--color-primary)', opacity: 0.5 }} />
              <div>
                <h4 style={{ fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>No UML Architecture Generated</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '6px', maxWidth: '450px', lineHeight: 1.6 }}>
                  Generate an interactive Mermaid.js UML structural layout showing file dependencies and layer subgraphs.
                </p>
              </div>
              <button
                className="cyber-button"
                onClick={handleGenerateArchitecture}
                style={{ padding: '10px 20px' }}
              >
                Generate UML & Architecture
              </button>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: ONBOARDING EXPORTER */}
      {subTab === 'onboarding' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {onboardingDoc ? (
            <>
              {/* Exporters menu */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={handleExportMarkdown}
                    className="cyber-button secondary" 
                    style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                  >
                    <Download size={13} style={{ marginRight: '5px' }} />
                    Download MD
                  </button>
                  <button 
                    onClick={handleExportPDF}
                    className="cyber-button secondary" 
                    style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                  >
                    <Printer size={13} style={{ marginRight: '5px' }} />
                    Print PDF
                  </button>
                  <button 
                    onClick={handleExportNotion}
                    className="cyber-button secondary" 
                    style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                  >
                    <Copy size={13} style={{ marginRight: '5px' }} />
                    Copy to Notion
                  </button>
                </div>
                
                <button
                  className="cyber-button"
                  style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                  onClick={handleGenerateOnboarding}
                  disabled={loadingOnboarding}
                >
                  <RefreshCw size={12} style={{ marginRight: '6px', animation: loadingOnboarding ? 'spin 1s linear infinite' : 'none' }} />
                  Regenerate Guide
                </button>
              </div>

              {/* Guide display */}
              <div className="glass-panel markdown-body" style={{ padding: '24px', maxHeight: '550px', overflowY: 'auto' }}>
                {loadingOnboarding ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '40px' }}>
                    <RefreshCw size={24} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--color-primary)' }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Drafting Onboarding Guide...</span>
                  </div>
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: formatMarkdown(onboardingDoc) }} />
                )}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '60px 20px', textAlign: 'center' }}>
              <BookOpen size={48} style={{ color: 'var(--color-primary)', opacity: 0.5 }} />
              <div>
                <h4 style={{ fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>No Developer Onboarding Guide Generated</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '6px', maxWidth: '450px', lineHeight: 1.6 }}>
                  Generate an AI onboarding document outlining folder structures, entry points, library choices, and patterns.
                </p>
              </div>
              <button
                className="cyber-button"
                onClick={handleGenerateOnboarding}
                style={{ padding: '10px 20px' }}
              >
                Generate Onboarding Guide
              </button>
            </div>
          )}
        </div>
      )}

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
                  <RefreshCw size={24} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--color-primary)' }} />
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
