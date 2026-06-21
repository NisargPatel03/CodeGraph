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
  FileWarning,
  Zap,
  ShieldAlert
} from 'lucide-react';
import type { ParsedFile } from '../utils/repoParser';
import type { CodebaseGraph } from '../utils/codeAnalyzer';
import { 
  generateOnboardingGuide, 
  generateArchitectureOverview, 
  refactorCodeSmell, 
  generateMermaidDiagram,
  suggestFolderRestructureStream,
  validateApiDbContractsStream,
  generateReadmeFile
} from '../utils/aiHelper';
import { parseDatabaseSchemas } from '../utils/schemaParser';
import { scanDependenciesForCves } from '../utils/cveScanner';
import { CodebaseFingerprint } from './CodebaseFingerprint';

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

      // Add explicit dimensions and dark background to ensure visibility and prevent distortion
      const width = svgEl.viewBox?.baseVal?.width || svgEl.clientWidth || 800;
      const height = svgEl.viewBox?.baseVal?.height || svgEl.clientHeight || 600;
      svgClone.setAttribute('width', String(width));
      svgClone.setAttribute('height', String(height));
      svgClone.style.backgroundColor = '#0a0a0f';
      svgClone.style.padding = '20px';
      svgClone.style.borderRadius = '8px';

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

      // Parse width and height safely from viewBox to prevent NaN/zero sizes
      let width = 800;
      let height = 600;
      const viewBoxAttr = svgEl.getAttribute('viewBox');
      if (viewBoxAttr) {
        const parts = viewBoxAttr.split(/\s+/);
        if (parts.length === 4) {
          width = Math.ceil(parseFloat(parts[2]) || 800);
          height = Math.ceil(parseFloat(parts[3]) || 600);
        }
      } else {
        width = svgEl.clientWidth || svgEl.getBoundingClientRect().width || 800;
        height = svgEl.clientHeight || svgEl.getBoundingClientRect().height || 600;
      }

      svgClone.setAttribute('width', String(width));
      svgClone.setAttribute('height', String(height));
      svgClone.style.backgroundColor = '#0a0a0f';

      const svgString = new XMLSerializer().serializeToString(svgClone);
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

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
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error('PNG canvas export failed:', err);
          URL.revokeObjectURL(url);
        }
      };
      image.onerror = (err) => {
        console.error('Image load failed for PNG export:', err);
        URL.revokeObjectURL(url);
      };
      image.src = url;
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
        maxTextSize: 100000,
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
  
  // Clean up LaTeX symbols like \to, \rightarrow, \Rightarrow, \implies wrapped in dollar signs
  let cleanedText = text
    .replace(/\\+\s*to\b/gi, '→')
    .replace(/\\+\s*rightarrow\b/gi, '→')
    .replace(/\\+\s*Rightarrow\b/gi, '⇒')
    .replace(/\\+\s*implies\b/gi, '⇒')
    .replace(/\\+\s*leftrightarrow\b/gi, '↔')
    .replace(/\\+\s*leftarrow\b/gi, '←')
    .replace(/\\+\s*dots\b/gi, '...')
    .replace(/\\+\s*cdot\b/gi, '·')
    .replace(/\\+\s*times\b/gi, '×');

  // Clean up math block dollar signs around arrows or LaTeX symbols
  cleanedText = cleanedText.replace(/\$([^\$]*?[\\→⇒↔←·×][^\$]*?)\$/g, '$1');

  // First, parse block-level elements like code blocks, which can contain newlines and pipe characters
  // We placeholder code blocks to avoid messing up their contents.
  const codeBlocks: string[] = [];
  let processedText = cleanedText.replace(/\`\`\`([a-zA-Z0-9]+)?\s*\n([\s\S]*?)\`\`\`/gm, (_match, lang, code) => {
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const displayLang = lang ? lang.toUpperCase() : 'CODE';
    const index = codeBlocks.length;
    codeBlocks.push(`
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span>${displayLang}</span>
          <button class="code-block-copy-btn" onclick="navigator.clipboard.writeText(this.closest('.code-block-wrapper').querySelector('pre').innerText); const el = this; el.innerText = 'Copied!'; setTimeout(() => el.innerText = 'Copy', 2000);">Copy</button>
        </div>
        <pre class="code-block-pre"><code>${escapedCode}</code></pre>
      </div>
    `);
    return `__CODE_BLOCK_PLACEHOLDER_${index}__`;
  });

  // Now, parse tables line-by-line
  const lines = processedText.split('\n');
  const resultLines: string[] = [];
  let inTable = false;
  let tableHeader: string[] = [];
  let tableRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isTableRow = line.startsWith('|') && line.endsWith('|');

    if (isTableRow) {
      // Split the row by pipe, ignore first and last empty elements from split
      const cells = line.split('|').map(c => c.trim()).slice(1, -1);
      
      // Check if it's a separator line like |:---|:---|
      const isSeparator = cells.every(c => /^[:\-\s\|]+$/.test(c) || c === '');

      if (isSeparator) {
        // Skip separator line
        continue;
      }

      if (!inTable) {
        // Start a new table, this first row is the header
        inTable = true;
        tableHeader = cells;
      } else {
        // Add to rows
        tableRows.push(cells);
      }
    } else {
      if (inTable) {
        // End the current table, render it as HTML
        const tableHtml = renderHtmlTable(tableHeader, tableRows);
        resultLines.push(tableHtml);
        inTable = false;
        tableHeader = [];
        tableRows = [];
      }
      resultLines.push(lines[i]);
    }
  }

  // If table was open at the end of the text
  if (inTable) {
    const tableHtml = renderHtmlTable(tableHeader, tableRows);
    resultLines.push(tableHtml);
  }

  processedText = resultLines.join('\n');

  // Helper to render HTML table
  function renderHtmlTable(headers: string[], rows: string[][]): string {
    const headerHtml = headers.map(h => `<th style="border: 1px solid var(--panel-border); padding: 8px 12px; background: rgba(255,255,255,0.05); text-align: left; font-weight: 600;">${h}</th>`).join('');
    const rowsHtml = rows.map(row => {
      const cellsHtml = row.map(cell => `<td style="border: 1px solid var(--panel-border); padding: 8px 12px;">${cell}</td>`).join('');
      return `<tr style="border-bottom: 1px solid var(--panel-border);">${cellsHtml}</tr>`;
    }).join('');

    return `
      <div style="overflow-x: auto; margin: 16px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; background: rgba(0,0,0,0.1); border: 1px solid var(--panel-border); border-radius: 6px;">
          <thead>
            <tr style="border-bottom: 2px solid var(--panel-border);">${headerHtml}</tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  // Parse database tables/models wrapped in backticks (e.g. `User`, `StudentStats`)
  processedText = processedText.replace(/\`([A-Z][a-zA-Z0-9_]+)\`/g, (match, tableName, offset, string) => {
    const before = string.slice(Math.max(0, offset - 8), offset);
    if (/https?:\/\//i.test(before) || before.endsWith('/') || before.endsWith('=') || before.endsWith('"') || before.endsWith("'")) {
      return match;
    }
    return `<button class="clickable-file-tag" onclick="if(window.locateFileNode)window.locateFileNode('${tableName}')" title="Locate ${tableName} Table on Canvas">📊 ${tableName}</button>`;
  });

  // Helper to check if a match is part of a URL, image link, or standard markdown link
  const isInsideUrlOrLink = (offset: number, matchLength: number, str: string) => {
    const before = str.slice(0, offset);
    const after = str.slice(offset + matchLength);

    // 1. Check if preceded by URL components in the current word
    const lastSpace = Math.max(before.lastIndexOf(' '), before.lastIndexOf('\n'), before.lastIndexOf('"'), before.lastIndexOf("'"));
    const wordBefore = lastSpace === -1 ? before : before.slice(lastSpace + 1);
    if (/https?:\/\/|www\.|shields\.io/i.test(wordBefore)) {
      return true;
    }

    // 2. Check if inside link/image parenthesis part: e.g. [...](http://shields.io/badge/Next.js-xxx)
    const lastOpenParen = before.lastIndexOf('(');
    const lastCloseBracket = before.lastIndexOf(']');
    if (lastOpenParen !== -1 && lastOpenParen > lastCloseBracket) {
      const textBetween = before.slice(lastCloseBracket + 1, lastOpenParen).trim();
      if (before[lastOpenParen - 1] === ']' || textBetween === '') {
        return true;
      }
    }

    // 3. Check if inside link/image square brackets part: e.g. ![Next.js](...)
    const nextCloseBracket = after.indexOf(']');
    const nextOpenBracket = after.indexOf('[');
    if (nextCloseBracket !== -1 && (nextOpenBracket === -1 || nextCloseBracket < nextOpenBracket)) {
      const afterBracket = after.slice(nextCloseBracket + 1).trim();
      if (afterBracket.startsWith('(')) {
        return true;
      }
    }

    return false;
  };

  // Parse file paths wrapped in backticks or raw file paths
  const fileRegex = /\`?((?:[a-zA-Z0-9_\-\/]*\/)?[a-zA-Z0-9_\-\/]+\.(?:tsx|ts|css|html|js|json|go|py|rs|md|yaml|yml|sh|sql))\`?/gi;
  processedText = processedText.replace(fileRegex, (match, filePath, offset, string) => {
    const before = string.slice(Math.max(0, offset - 8), offset);
    if (/https?:\/\//i.test(before) || before.endsWith('/') || before.endsWith('=') || before.endsWith('"') || before.endsWith("'") || before.endsWith('`')) {
      return match;
    }
    if (isInsideUrlOrLink(offset, match.length, string)) {
      return match;
    }
    const fileName = filePath.split('/').pop() || filePath;
    return `<button class="clickable-file-tag" onclick="if(window.locateFileNode)window.locateFileNode('${filePath}')" title="Locate ${fileName} on Canvas">📄 ${fileName}</button>`;
  });

  // Parse markdown images: ![alt](url) -> <img src="url" alt="alt" />
  processedText = processedText.replace(/!\[(.*?)\]\((.*?)\)/g, (_match, alt, url) => {
    return `<img src="${url}" alt="${alt}" style="max-width: 100%; height: auto; vertical-align: middle; margin: 2px; display: inline-block;" />`;
  });

  // Parse markdown links: [text](url) -> <a href="url" target="_blank">text</a>
  processedText = processedText.replace(/\[(.*?)\]\((.*?)\)/g, (_match, text, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--color-primary); text-decoration: underline; font-weight: 500;">${text}</a>`;
  });

  // Parse remaining block-level and inline markdown
  processedText = processedText
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

  // Restore code blocks
  codeBlocks.forEach((html, index) => {
    processedText = processedText.replace(`__CODE_BLOCK_PLACEHOLDER_${index}__`, html);
  });

  return processedText;
}

const RiskQuadrantChart: React.FC<{
  nodes: any[];
  onSelectFile: (filePath: string) => void;
}> = ({ nodes, onSelectFile }) => {
  const [hoveredNode, setHoveredNode] = useState<any | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const points = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];
    
    const avgComp = nodes.reduce((sum, n) => sum + (n.complexity || 0), 0) / nodes.length;
    const avgChurn = nodes.reduce((sum, n) => sum + (n.churn || 0), 0) / nodes.length;

    return nodes.map(n => {
      const comp = n.complexity || 0;
      const ch = n.churn || 0;
      
      let quadrant: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'bottom-left';
      if (comp >= avgComp && ch >= avgChurn) quadrant = 'top-right';
      else if (comp < avgComp && ch >= avgChurn) quadrant = 'top-left';
      else if (comp >= avgComp && ch < avgChurn) quadrant = 'bottom-right';
      
      return {
        node: n,
        xVal: comp,
        yVal: ch,
        quadrant,
        riskScore: comp * ch
      };
    });
  }, [nodes]);

  if (!nodes || nodes.length === 0) return null;

  const maxComp = Math.max(...nodes.map(n => n.complexity || 0), 100);
  const maxChurn = Math.max(...nodes.map(n => n.churn || 0), 10);
  const avgComp = Math.round(nodes.reduce((sum, n) => sum + (n.complexity || 0), 0) / nodes.length);
  const avgChurn = Math.round(nodes.reduce((sum, n) => sum + (n.churn || 0), 0) / nodes.length);

  const hotspots = points
    .filter(p => p.quadrant === 'top-right')
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 5);

  const svgWidth = 850;
  const svgHeight = 350;
  const padding = { top: 30, right: 30, bottom: 45, left: 60 };

  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  const maxSqrtComp = Math.sqrt(maxComp);
  const avgSqrtComp = Math.sqrt(avgComp);

  const getSvgCoords = (comp: number, churn: number) => {
    const sqrtComp = Math.sqrt(comp);
    const x = padding.left + (sqrtComp / maxSqrtComp) * chartWidth;
    const y = padding.top + chartHeight - (churn / maxChurn) * chartHeight;
    return { x, y };
  };

  const xThreshold = padding.left + (avgSqrtComp / maxSqrtComp) * chartWidth;
  const yThreshold = padding.top + chartHeight - (avgChurn / maxChurn) * chartHeight;

  // Tooltip dynamic transform alignments to prevent edge clipping
  const xRatio = tooltipPos.x / svgWidth;
  const yRatio = tooltipPos.y / svgHeight;
  
  let transformX = '-50%';
  if (xRatio < 0.2) transformX = '10px';
  else if (xRatio > 0.8) transformX = 'calc(-100% - 10px)';

  let transformY = '-110%';
  if (yRatio < 0.15) transformY = '15px';

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ flex: '1 1 300px' }}>
          <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Activity size={15} style={{ color: 'var(--color-alert)' }} />
            Churn vs. Complexity: Risk Quadrants
          </h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            This quadrant plot identifies architectural hotspots. Files in the **Top-Right (High Churn + High Complexity)** quadrant represent high-maintenance code debt.
          </p>
        </div>
        
        {/* Horizontal Legend Row */}
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '0.72rem', background: 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--panel-border)', alignSelf: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef444480' }} /> <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>⚠️ Hotspots</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#a855f7', boxShadow: '0 0 6px #a855f780' }} /> <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>🔄 Frequent Churn</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f97316', boxShadow: '0 0 6px #f9731680' }} /> <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>📦 Complex Core</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b98180' }} /> <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>✅ Stable & Simple</span></div>
        </div>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Full-Width: Interactive SVG Scatter Plot */}
        <div style={{ position: 'relative', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', border: '1px solid var(--panel-border)', overflow: 'visible' }}>
          <svg 
            viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
            style={{ width: '100%', height: 'auto', display: 'block' }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const scaleX = svgWidth / rect.width;
              const scaleY = svgHeight / rect.height;
              setTooltipPos({
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
              });
            }}
            onMouseLeave={() => setHoveredNode(null)}
          >
            {/* Quadrant Overlays */}
            {/* Top-Left: Frequent Churn */}
            <rect
              x={padding.left}
              y={padding.top}
              width={xThreshold - padding.left}
              height={yThreshold - padding.top}
              fill="rgba(168, 85, 247, 0.015)"
            />
            {/* Top-Right: Hotspots */}
            <rect
              x={xThreshold}
              y={padding.top}
              width={chartWidth - (xThreshold - padding.left)}
              height={yThreshold - padding.top}
              fill="rgba(239, 68, 68, 0.03)"
            />
            {/* Bottom-Left: Stable & Simple */}
            <rect
              x={padding.left}
              y={yThreshold}
              width={xThreshold - padding.left}
              height={chartHeight - (yThreshold - padding.top)}
              fill="rgba(16, 185, 129, 0.015)"
            />
            {/* Bottom-Right: Complex Core */}
            <rect
              x={xThreshold}
              y={yThreshold}
              width={chartWidth - (xThreshold - padding.left)}
              height={chartHeight - (yThreshold - padding.top)}
              fill="rgba(249, 115, 22, 0.015)"
            />

            {/* Grid Line Axes */}
            <line
              x1={padding.left}
              y1={padding.top + chartHeight}
              x2={padding.left + chartWidth}
              y2={padding.top + chartHeight}
              stroke="var(--panel-border)"
              strokeWidth={1}
            />
            <line
              x1={padding.left}
              y1={padding.top}
              x2={padding.left}
              y2={padding.top + chartHeight}
              stroke="var(--panel-border)"
              strokeWidth={1}
            />

            {/* Threshold dashed lines */}
            <line
              x1={xThreshold}
              y1={padding.top}
              x2={xThreshold}
              y2={padding.top + chartHeight}
              stroke="rgba(255, 255, 255, 0.15)"
              strokeDasharray="4 4"
            />
            <line
              x1={padding.left}
              y1={yThreshold}
              x2={padding.left + chartWidth}
              y2={yThreshold}
              stroke="rgba(255, 255, 255, 0.15)"
              strokeDasharray="4 4"
            />

            {/* Quadrant Watermark Labels */}
            <text x={padding.left + 12} y={padding.top + 20} fill="#a855f7" fontSize="10" fontWeight="600" opacity="0.2">🔄 Frequent Churn</text>
            <text x={svgWidth - padding.right - 12} y={padding.top + 20} fill="#ef4444" fontSize="10" fontWeight="600" textAnchor="end" opacity="0.2">⚠️ Hotspots</text>
            <text x={padding.left + 12} y={svgHeight - padding.bottom - 12} fill="#10b981" fontSize="10" fontWeight="600" opacity="0.2">✅ Stable & Simple</text>
            <text x={svgWidth - padding.right - 12} y={svgHeight - padding.bottom - 12} fill="#f97316" fontSize="10" fontWeight="600" textAnchor="end" opacity="0.2">📦 Complex Core</text>

            {/* Axes Ticks and Labels */}
            {/* X-Axis: Complexity (LOC) */}
            <text x={padding.left + chartWidth / 2} y={svgHeight - 12} fill="var(--text-muted)" fontSize="9" textAnchor="middle" fontWeight="500">
              Complexity (Lines of Code) [Sqrt Scale]
            </text>
            {/* Y-Axis: Churn (Commits) */}
            <text 
              x={16} 
              y={padding.top + chartHeight / 2} 
              fill="var(--text-muted)" 
              fontSize="9" 
              textAnchor="middle" 
              fontWeight="500"
              transform={`rotate(-90, 16, ${padding.top + chartHeight / 2})`}
            >
              Churn (Commit Count)
            </text>

            {/* X Axis ticks */}
            <line x1={padding.left} y1={padding.top + chartHeight} x2={padding.left} y2={padding.top + chartHeight + 4} stroke="var(--panel-border)" />
            <text x={padding.left} y={padding.top + chartHeight + 14} fill="var(--text-muted)" fontSize="8" textAnchor="middle">0</text>

            <line x1={xThreshold} y1={padding.top + chartHeight} x2={xThreshold} y2={padding.top + chartHeight + 4} stroke="var(--panel-border)" />
            <text x={xThreshold} y={padding.top + chartHeight + 14} fill="var(--text-muted)" fontSize="8" textAnchor="middle">avg ({avgComp})</text>

            <line x1={padding.left + chartWidth} y1={padding.top + chartHeight} x2={padding.left + chartWidth} y2={padding.top + chartHeight + 4} stroke="var(--panel-border)" />
            <text x={padding.left + chartWidth} y={padding.top + chartHeight + 14} fill="var(--text-muted)" fontSize="8" textAnchor="middle">{maxComp}</text>

            {/* Y Axis ticks */}
            <line x1={padding.left - 4} y1={padding.top + chartHeight} x2={padding.left} y2={padding.top + chartHeight} stroke="var(--panel-border)" />
            <text x={padding.left - 8} y={padding.top + chartHeight + 3} fill="var(--text-muted)" fontSize="8" textAnchor="end">0</text>

            <line x1={padding.left - 4} y1={yThreshold} x2={padding.left} y2={yThreshold} stroke="var(--panel-border)" />
            <text x={padding.left - 8} y={yThreshold + 3} fill="var(--text-muted)" fontSize="8" textAnchor="end">avg ({avgChurn})</text>

            <line x1={padding.left - 4} y1={padding.top} x2={padding.left} y2={padding.top} stroke="var(--panel-border)" />
            <text x={padding.left - 8} y={padding.top + 3} fill="var(--text-muted)" fontSize="8" textAnchor="end">{maxChurn}</text>

            {/* Dots */}
            {points.map((p, idx) => {
              const coords = getSvgCoords(p.xVal, p.yVal);
              let color = '#10b981'; // green
              if (p.quadrant === 'top-right') color = '#ef4444'; // red
              else if (p.quadrant === 'top-left') color = '#a855f7'; // purple
              else if (p.quadrant === 'bottom-right') color = '#f97316'; // orange

              const isHovered = hoveredNode && hoveredNode.id === p.node.id;

              return (
                <circle
                  key={p.node.id || idx}
                  cx={coords.x}
                  cy={coords.y}
                  r={isHovered ? 8 : 5}
                  fill={color}
                  stroke="rgba(0,0,0,0.4)"
                  strokeWidth={isHovered ? 1.5 : 0.8}
                  style={{ cursor: 'pointer', transition: 'all 0.1s ease-out' }}
                  onMouseEnter={() => setHoveredNode(p.node)}
                  onClick={() => onSelectFile(p.node.id)}
                />
              );
            })}
          </svg>

          {/* Floating Glassmorphic Tooltip */}
          {hoveredNode && (
            <div 
              style={{
                position: 'absolute',
                left: `${(tooltipPos.x / svgWidth) * 100}%`,
                top: `${(tooltipPos.y / svgHeight) * 100}%`,
                transform: `translate(${transformX}, ${transformY})`,
                background: 'rgba(10, 10, 15, 0.95)',
                border: '1px solid var(--panel-border)',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '0.72rem',
                color: 'var(--text-primary)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 10,
                transition: 'transform 0.05s ease-out'
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--color-primary)', marginBottom: '3px' }}>
                {hoveredNode.name}
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>
                Path: <span style={{ color: 'var(--text-muted)' }}>{hoveredNode.id}</span>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <div>LOC: <strong style={{ color: 'var(--text-primary)' }}>{hoveredNode.complexity}</strong></div>
                <div>Churn: <strong style={{ color: 'var(--text-primary)' }}>{hoveredNode.churn} commits</strong></div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Panel: Top 5 Hotspots Panel laid out horizontally */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px dashed var(--panel-border)', paddingTop: '16px' }}>
          <h5 style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', margin: 0, letterSpacing: '0.05em' }}>
            Top Refactoring Hotspots (Debt)
          </h5>
          
          {hotspots.length === 0 ? (
            <div style={{ border: '1px dashed var(--panel-border)', borderRadius: '8px', padding: '16px', background: 'rgba(255,255,255,0.01)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                No files in the high-risk quadrant! Codebase is stable.
              </span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {hotspots.map((item, idx) => (
                <div
                  key={item.node.id}
                  onClick={() => onSelectFile(item.node.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '10px 14px',
                    background: 'rgba(239, 68, 68, 0.03)',
                    border: '1px solid rgba(239, 68, 68, 0.15)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.06)';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.03)';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.15)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      #{idx + 1} {item.node.name}
                    </span>
                    <span style={{ fontSize: '0.65rem', padding: '1px 6px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', borderRadius: '4px', fontWeight: 600 }}>
                      Risk: {item.riskScore}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {item.node.id}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    <span>Lines: <strong style={{ color: 'var(--text-primary)' }}>{item.node.complexity}</strong></span>
                    <span>Churn: <strong style={{ color: 'var(--text-primary)' }}>{item.node.churn} commits</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
};

interface AnalyticsDashboardProps {
  files: ParsedFile[];
  cycles: string[][];
  graphData: CodebaseGraph;
  apiKey: string;
  onSelectFile: (filePath: string) => void;
  onUpdateFileContent?: (filePath: string, newContent: string) => void;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  files,
  cycles,
  graphData,
  apiKey,
  onSelectFile,
  onUpdateFileContent,
}) => {
  const [subTab, setSubTab] = useState<'metrics' | 'architecture' | 'onboarding' | 'restructuring' | 'fingerprint' | 'readme' | 'security'>('metrics');
  
  // Onboarding Exporter states
  const [onboardingDoc, setOnboardingDoc] = useState('');
  const [loadingOnboarding, setLoadingOnboarding] = useState(false);

  // README Generator states
  const [readmeDoc, setReadmeDoc] = useState('');
  const [loadingReadme, setLoadingReadme] = useState(false);
  
  // Architecture states
  const [architectureDoc, setArchitectureDoc] = useState('');
  const [loadingArchitecture, setLoadingArchitecture] = useState(false);
  const [mermaidDiagram, setMermaidDiagram] = useState('');
  const [loadingMermaid, setLoadingMermaid] = useState(false);
  const [archView, setArchView] = useState<'text' | 'diagram'>('diagram');

  // Restructure & API-DB contract states
  const [restructureDoc, setRestructureDoc] = useState('');
  const [loadingRestructure, setLoadingRestructure] = useState(false);
  const [apiDbContractDoc, setApiDbContractDoc] = useState('');
  const [loadingApiDbContract, setLoadingApiDbContract] = useState(false);
  
  // Refactor Smell states
  const [refactorSmell, setRefactorSmell] = useState<any | null>(null);
  const [refactorResult, setRefactorResult] = useState<string | null>(null);
  const [refactoringLoading, setRefactoringLoading] = useState(false);
  const [autoApplyingSmellIds, setAutoApplyingSmellIds] = useState<Set<string>>(new Set());
  
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

  const handleAutoApplyRefactor = async (smell: any) => {
    if (!onUpdateFileContent) return;
    
    setAutoApplyingSmellIds(prev => {
      const next = new Set(prev);
      next.add(smell.id);
      return next;
    });
    
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
      
      const preMatch = suggestion.match(/\`\`\`(?:[a-zA-Z]+)?\n([\s\S]*?)\n\`\`\`/);
      const cleanCode = preMatch ? preMatch[1].trim() : suggestion;
      
      onUpdateFileContent(smell.file, cleanCode);
      showToast(`AI Refactor applied successfully for ${smell.file.split('/').pop()}!`);
    } catch (err: any) {
      showToast(`Refactoring failed: ${err.message || err}`);
    } finally {
      setAutoApplyingSmellIds(prev => {
        const next = new Set(prev);
        next.delete(smell.id);
        return next;
      });
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

  const handleGenerateReadme = async () => {
    setLoadingReadme(true);
    try {
      const pkgFile = files.find(f => f.path.toLowerCase().endsWith('package.json'));
      const packageJsonContent = pkgFile ? pkgFile.content : '';

      const dbReport = parseDatabaseSchemas(files);
      const dbSummary = dbReport.tables.length > 0 
        ? dbReport.tables.map(t => {
            const fieldsStr = t.fields.map(f => `${f.name} (${f.type})${f.isPrimaryKey ? ' [PK]' : ''}${f.isForeignKey ? ` [FK -> ${f.refTable}.${f.refField}]` : ''}`).join(', ');
            return `- **Table:** ${t.id} (${t.sourceFile})\n  Fields: ${fieldsStr}`;
          }).join('\n')
        : 'No DB tables detected.';

      const staticEndpoints = files
        .filter(f => f.path.toLowerCase().includes('route') || f.path.toLowerCase().includes('controller') || f.path.toLowerCase().includes('api'))
        .map(f => {
          const methods = [];
          if (f.content.includes('GET') || f.content.includes('get(')) methods.push('GET');
          if (f.content.includes('POST') || f.content.includes('post(')) methods.push('POST');
          if (f.content.includes('PUT') || f.content.includes('put(')) methods.push('PUT');
          if (f.content.includes('PATCH') || f.content.includes('patch(')) methods.push('PATCH');
          if (f.content.includes('DELETE') || f.content.includes('delete(')) methods.push('DELETE');
          
          if (methods.length === 0) methods.push('GET');
          
          return {
            path: `/${f.path.split('/').pop()?.replace(/\.(tsx|ts|js|py|go|rb|php)$/, '').toLowerCase() || ''}`,
            methods,
            file: f.path
          };
        });

      const apiSummary = staticEndpoints.length > 0
        ? staticEndpoints.map(e => `- **Endpoint:** [${e.methods.join(', ')}] ${e.path} (defined in ${e.file})`).join('\n')
        : 'No API endpoints detected.';

      const summary = files.map((f) => ({ path: f.path, language: f.language, size: f.size }));
      
      const doc = await generateReadmeFile(
        summary,
        packageJsonContent,
        apiSummary,
        dbSummary,
        apiKey
      );
      setReadmeDoc(doc);
    } catch (err: any) {
      console.error(err);
      showToast(`README generation failed: ${err.message || err}`);
    } finally {
      setLoadingReadme(false);
    }
  };

  const handleDownloadReadme = () => {
    if (!readmeDoc) return;
    const blob = new Blob([readmeDoc], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'README.md');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Downloaded README.md!');
  };

  const handleCopyReadme = () => {
    if (!readmeDoc) return;
    navigator.clipboard.writeText(readmeDoc);
    showToast('Copied README.md to Clipboard!');
  };

  const handleGenerateRestructure = async () => {
    setLoadingRestructure(true);
    setRestructureDoc('');
    try {
      const summary = files.map((f) => ({ path: f.path, size: f.size, language: f.language }));
      await suggestFolderRestructureStream(summary, apiKey, (cumulative) => {
        setRestructureDoc(cumulative);
      });
    } catch (err: any) {
      setRestructureDoc(`### ⚠️ Restructure Failed\nError: ${err.message || err}`);
    } finally {
      setLoadingRestructure(false);
    }
  };

  const handleGenerateApiDbContracts = async () => {
    setLoadingApiDbContract(true);
    setApiDbContractDoc('');
    try {
      // Extract pseudo API endpoints from routes/controllers in files
      const pseudoEndpoints = files
        .filter(f => f.path.toLowerCase().includes('route') || f.path.toLowerCase().includes('controller') || f.path.toLowerCase().includes('api'))
        .map(f => {
          // Find standard REST keywords in content
          const methods = [];
          if (f.content.includes('GET') || f.content.includes('get(')) methods.push('GET');
          if (f.content.includes('POST') || f.content.includes('post(')) methods.push('POST');
          if (f.content.includes('PUT') || f.content.includes('put(')) methods.push('PUT');
          if (f.content.includes('DELETE') || f.content.includes('delete(')) methods.push('DELETE');
          return {
            file: f.path.split('/').pop() || '',
            path: `/api/${f.path.replace(/\.[^/.]+$/, '').replace(/\\/g, '/')}`,
            methods: methods.length > 0 ? methods : ['GET']
          };
        });

      // Extract pseudo database schemas
      const dbTables = files
        .filter(f => f.path.toLowerCase().includes('schema') || f.path.toLowerCase().includes('model') || f.path.toLowerCase().includes('prisma'))
        .map(f => {
          // Parse lines looking for model declarations
          const matchModels = f.content.match(/(?:model|schema|table)\s+(\w+)/gi) || [];
          return {
            file: f.path.split('/').pop() || '',
            entities: matchModels.map(m => m.replace(/(model|schema|table)\s+/i, ''))
          };
        });

      await validateApiDbContractsStream(pseudoEndpoints, dbTables, apiKey, (cumulative) => {
        setApiDbContractDoc(cumulative);
      });
    } catch (err: any) {
      setApiDbContractDoc(`### ⚠️ Contract Validation Failed\nError: ${err.message || err}`);
    } finally {
      setLoadingApiDbContract(false);
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

  const vulnerabilities = useMemo(() => {
    return scanDependenciesForCves(files);
  }, [files]);

  const remediationScript = useMemo(() => {
    if (!vulnerabilities || vulnerabilities.length === 0) return '';
    
    const groups: Record<string, string[]> = {};
    vulnerabilities.forEach(v => {
      const eco = v.ecosystem || 'npm';
      if (!groups[eco]) groups[eco] = [];
      if (!groups[eco].includes(v.packageName)) {
        groups[eco].push(v.packageName);
      }
    });

    const lines: string[] = [];
    if (groups['npm'] && groups['npm'].length > 0) {
      const upgrades = groups['npm'].map(pkg => {
        const matches = vulnerabilities.filter(v => v.packageName === pkg && v.ecosystem === 'npm');
        const target = matches[0]?.patchedVersion || 'latest';
        return `${pkg}@${target}`;
      });
      lines.push(`# npm remediation:\nnpm install ${upgrades.join(' ')}`);
    }
    if (groups['pip'] && groups['pip'].length > 0) {
      const upgrades = groups['pip'].map(pkg => {
        const matches = vulnerabilities.filter(v => v.packageName === pkg && v.ecosystem === 'pip');
        const target = matches[0]?.patchedVersion || '';
        return `${pkg}>=${target}`;
      });
      lines.push(`# pip remediation:\npip install --upgrade ${upgrades.join(' ')}`);
    }
    if (groups['cargo'] && groups['cargo'].length > 0) {
      const commands = groups['cargo'].map(pkg => {
        const matches = vulnerabilities.filter(v => v.packageName === pkg && v.ecosystem === 'cargo');
        const target = matches[0]?.patchedVersion || '';
        return `cargo update -p ${pkg} --precise ${target}`;
      });
      lines.push(`# cargo remediation:\n${commands.join('\n')}`);
    }
    if (groups['go'] && groups['go'].length > 0) {
      const commands = groups['go'].map(pkg => {
        const matches = vulnerabilities.filter(v => v.packageName === pkg && v.ecosystem === 'go');
        const target = matches[0]?.patchedVersion || 'latest';
        return `go get ${pkg}@v${target}`;
      });
      lines.push(`# go remediation:\n${commands.join('\n')}`);
    }

    return lines.join('\n\n');
  }, [vulnerabilities]);

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

  const fingerprintMetrics = useMemo(() => {
    const localNodes = graphData.nodes.filter(n => !n.id.startsWith('npm::'));
    const totalFiles = localNodes.length || 1;
    const smellsCount = graphData.codeSmells?.length || 0;
    const cyclesCount = cycles?.length || 0;
    const vulnsCount = graphData.nodes.filter(n => n.isVulnerable).length;
    
    // Quality score: starts at 100, drops for smells, cycles, and vulns
    let qualityScore = 100;
    qualityScore -= (smellsCount / totalFiles) * 15;
    qualityScore -= (cyclesCount * 12);
    qualityScore -= (vulnsCount * 25);
    qualityScore = Math.max(5, Math.min(100, Math.round(qualityScore)));
    
    let grade = 'F';
    if (qualityScore >= 95) grade = 'A+';
    else if (qualityScore >= 90) grade = 'A';
    else if (qualityScore >= 80) grade = 'B';
    else if (qualityScore >= 70) grade = 'C';
    else if (qualityScore >= 60) grade = 'D';

    // Security Posture rating
    let securityRating = 'SECURE';
    let securityColor = '#10b981'; // Green
    if (vulnsCount > 2) {
      securityRating = 'CRITICAL';
      securityColor = '#ef4444'; // Red
    } else if (vulnsCount > 0) {
      securityRating = 'WARNING';
      securityColor = '#f59e0b'; // Amber
    }

    // Architecture Health rating: % of files not participating in cycles
    const filesInCycles = new Set<string>();
    (cycles || []).forEach(cycle => cycle.forEach(f => filesInCycles.add(f)));
    const cleanFilesCount = localNodes.filter(n => !filesInCycles.has(n.id)).length;
    const archHealth = Math.round((cleanFilesCount / totalFiles) * 100);

    // Language stats breakdown
    const langCounts: Record<string, number> = {};
    localNodes.forEach(n => {
      const lang = n.language || 'Other';
      langCounts[lang] = (langCounts[lang] || 0) + 1;
    });
    const languages = Object.entries(langCounts)
      .map(([lang, count]) => ({
        lang,
        count,
        percent: Math.round((count / totalFiles) * 100)
      }))
      .sort((a, b) => b.count - a.count);

    // Additional Calculations for Details
    const totalLoc = localNodes.reduce((acc, curr) => acc + (curr.complexity || 0), 0);
    const avgLoc = Math.round(totalLoc / totalFiles);

    let maxComplexFile = { name: 'None', complexity: 0 };
    localNodes.forEach(n => {
      const complexity = n.complexity || 0;
      if (complexity > maxComplexFile.complexity) {
        maxComplexFile = { name: n.name, complexity };
      }
    });

    let maxFolderDepth = 0;
    localNodes.forEach(n => {
      if (n.id) {
        const parts = n.id.split('/');
        const depth = Math.max(0, parts.length - 1);
        if (depth > maxFolderDepth) {
          maxFolderDepth = depth;
        }
      }
    });

    const uniqueCves = new Map<string, any>();
    graphData.nodes.forEach(n => {
      if (n.isVulnerable && n.vulnerabilities) {
        n.vulnerabilities.forEach((v: any) => {
          uniqueCves.set(v.cveId || `${n.name}-${v.description.slice(0, 10)}`, v);
        });
      }
    });

    const cveBreakdown = { critical: 0, high: 0, moderate: 0, low: 0 };
    uniqueCves.forEach(v => {
      const sev = (v.severity || 'low').toLowerCase();
      if (sev === 'critical') cveBreakdown.critical++;
      else if (sev === 'high') cveBreakdown.high++;
      else if (sev === 'moderate' || sev === 'medium') cveBreakdown.moderate++;
      else cveBreakdown.low++;
    });

    const timestamp = new Date().toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

    return {
      qualityScore,
      grade,
      securityRating,
      securityColor,
      archHealth,
      languages,
      vulnsCount,
      smellsCount,
      cyclesCount,
      avgLoc,
      totalLoc,
      maxComplexFile,
      maxFolderDepth,
      cveBreakdown,
      timestamp
    };
  }, [graphData.nodes, graphData.codeSmells, cycles]);

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

  const handleExportRestructurePDF = () => {
    if (!restructureDoc) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const formattedHtml = formatMarkdown(restructureDoc);
      const printHtml = formattedHtml
        .replace(/rgba\(239,\s*68,\s*68,\s*0\.08\)/g, '#fef2f2')
        .replace(/#f43f5e/g, '#ef4444')
        .replace(/#fda4af/g, '#991b1b')
        .replace(/rgba\(99,\s*102,\s*241,\s*0\.08\)/g, '#eff6ff')
        .replace(/#6366f1/g, '#3b82f6')
        .replace(/#c7d2fe/g, '#1e3a8a')
        .replace(/rgba\(16,\s*185,\s*129,\s*0\.08\)/g, '#ecfdf5')
        .replace(/#10b981/g, '#10b981')
        .replace(/#a7f3d0/g, '#065f46')
        .replace(/rgba\(255,\s*255,\s*255,\s*0\.03\)/g, '#f9fafb')
        .replace(/#9ca3af/g, '#6b7280')
        .replace(/var\(--text-secondary\)/g, '#374151')
        .replace(/#05070f/g, '#f3f4f6')
        .replace(/var\(--panel-border\)/g, '#e5e7eb');

      printWindow.document.write(`
        <html>
          <head>
            <title>Folder Restructure Blueprint - CodeGraph</title>
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
              h2 { border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; font-size: 1.8rem; }
              h3 { border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; font-size: 1.4rem; }
              h4 { font-size: 1.1rem; }
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
                white-space: pre-wrap;
              }
              li { margin-bottom: 4px; }
              blockquote {
                margin: 1em 0;
                padding-left: 1em;
                border-left: 4px solid #e5e7eb;
                color: #4b5563;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin: 16px 0;
              }
              th, td {
                border: 1px solid #e5e7eb;
                padding: 8px 12px;
                text-align: left;
              }
              th {
                background-color: #f9fafb;
                font-weight: 600;
              }
            </style>
          </head>
          <body>
            <h1>Folder Restructure Blueprint</h1>
            <div class="content">
              ${printHtml}
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

  const handleExportApiDbContractPDF = () => {
    if (!apiDbContractDoc) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const formattedHtml = formatMarkdown(apiDbContractDoc);
      const printHtml = formattedHtml
        .replace(/rgba\(239,\s*68,\s*68,\s*0\.08\)/g, '#fef2f2')
        .replace(/#f43f5e/g, '#ef4444')
        .replace(/#fda4af/g, '#991b1b')
        .replace(/rgba\(99,\s*102,\s*241,\s*0\.08\)/g, '#eff6ff')
        .replace(/#6366f1/g, '#3b82f6')
        .replace(/#c7d2fe/g, '#1e3a8a')
        .replace(/rgba\(16,\s*185,\s*129,\s*0\.08\)/g, '#ecfdf5')
        .replace(/#10b981/g, '#10b981')
        .replace(/#a7f3d0/g, '#065f46')
        .replace(/rgba\(255,\s*255,\s*255,\s*0\.03\)/g, '#f9fafb')
        .replace(/#9ca3af/g, '#6b7280')
        .replace(/var\(--text-secondary\)/g, '#374151')
        .replace(/#05070f/g, '#f3f4f6')
        .replace(/var\(--panel-border\)/g, '#e5e7eb');

      printWindow.document.write(`
        <html>
          <head>
            <title>API-Database Contract Audit Report - CodeGraph</title>
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
              h2 { border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; font-size: 1.8rem; }
              h3 { border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; font-size: 1.4rem; }
              h4 { font-size: 1.1rem; }
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
                white-space: pre-wrap;
              }
              li { margin-bottom: 4px; }
              blockquote {
                margin: 1em 0;
                padding-left: 1em;
                border-left: 4px solid #e5e7eb;
                color: #4b5563;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin: 16px 0;
              }
              th, td {
                border: 1px solid #e5e7eb;
                padding: 8px 12px;
                text-align: left;
              }
              th {
                background-color: #f9fafb;
                font-weight: 600;
              }
            </style>
          </head>
          <body>
            <h1>API-Database Contract Audit Report</h1>
            <div class="content">
              ${printHtml}
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

  const handleExportScorecard = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 675;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Draw Background
      ctx.fillStyle = '#08090f';
      ctx.fillRect(0, 0, 1200, 675);

      // Draw cyber Grid overlay
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.03)';
      ctx.lineWidth = 1;
      const gridSize = 45;
      for (let x = 0; x < 1200; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 675);
        ctx.stroke();
      }
      for (let y = 0; y < 675; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(1200, y);
        ctx.stroke();
      }

      // Draw sci-fi corners
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)';
      ctx.lineWidth = 2;
      const markLen = 20;
      const pads = 25;
      // Top-Left
      ctx.beginPath();
      ctx.moveTo(pads, pads + markLen); ctx.lineTo(pads, pads); ctx.lineTo(pads + markLen, pads);
      ctx.stroke();
      // Top-Right
      ctx.beginPath();
      ctx.moveTo(1200 - pads, pads + markLen); ctx.lineTo(1200 - pads, pads); ctx.lineTo(1200 - pads - markLen, pads);
      ctx.stroke();
      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(pads, 675 - pads - markLen); ctx.lineTo(pads, 675 - pads); ctx.lineTo(pads + markLen, 675 - pads);
      ctx.stroke();
      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(1200 - pads, 675 - pads - markLen); ctx.lineTo(1200 - pads, 675 - pads); ctx.lineTo(1200 - pads - markLen, 675 - pads);
      ctx.stroke();

      // 2. Title Section
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
      ctx.fillText('CODEBASE HEALTH FINGERPRINT', 50, 65);
      
      ctx.fillStyle = '#8b9bb4';
      ctx.font = '14px monospace';
      ctx.fillText(`TARGET WORKSPACE: ${files[0]?.path.split('/')[0] || 'CodeGraph project'}`, 50, 92);

      // Line separator under title
      const gradient = ctx.createLinearGradient(50, 0, 1150, 0);
      gradient.addColorStop(0, 'rgba(99, 102, 241, 0.5)');
      gradient.addColorStop(0.5, 'rgba(0, 242, 254, 0.5)');
      gradient.addColorStop(1, 'rgba(99, 102, 241, 0.05)');
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(50, 110);
      ctx.lineTo(1150, 110);
      ctx.stroke();

      // 3. Biometric Fingerprint rendering on Left side
      const cx = 350;
      const cy = 385;
      const maxRadius = 200;
      const innerRadius = 55;

      // concentric biometric grid rings
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 1;
      for (let r = innerRadius; r <= maxRadius; r += (maxRadius - innerRadius) / 4) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw file arcs
      const localNodes = graphData.nodes.filter(n => !n.id.startsWith('npm::'));
      const totalFilesCount = localNodes.length || 1;
      
      const getLangColor = (l: string): string => {
        switch (l?.toLowerCase()) {
          case 'typescript':
          case 'tsx': return '#6366f1';
          case 'javascript':
          case 'jsx': return '#3b82f6';
          case 'python': return '#10b981';
          case 'rust': return '#f97316';
          case 'go': return '#06b6d4';
          case 'css': return '#ec4899';
          case 'html': return '#eab308';
          default: return '#8b5cf6';
        }
      };

      const fileSlices = localNodes.map((node, index) => {
        const startAngle = (index / totalFilesCount) * Math.PI * 2 - Math.PI / 2;
        const endAngle = ((index + 1) / totalFilesCount) * Math.PI * 2 - Math.PI / 2;
        const loc = node.complexity || 0;
        const ridgesCount = Math.max(2, Math.min(8, Math.floor(Math.log2(loc + 10))));
        const smellsCount = (graphData.codeSmells || []).filter(s => s.file === node.id).length;
        return {
          id: node.id,
          startAngle,
          endAngle,
          ridgesCount,
          smellsCount,
          language: node.language || 'unknown',
          vulnerable: !!node.isVulnerable
        };
      });

      fileSlices.forEach(slice => {
        const color = getLangColor(slice.language);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        for (let i = 0; i < slice.ridgesCount; i++) {
          const ridgeRadius = innerRadius + i * ((maxRadius - innerRadius) / 8);
          ctx.beginPath();
          ctx.arc(cx, cy, ridgeRadius, slice.startAngle + 0.015, slice.endAngle - 0.015);
          ctx.stroke();
        }

        // Draw small smell ticks/dots
        if (slice.smellsCount > 0) {
          ctx.fillStyle = '#f97316'; // Orange
          const midAngle = (slice.startAngle + slice.endAngle) / 2;
          const markerRadius = innerRadius + (slice.ridgesCount - 1) * ((maxRadius - innerRadius) / 8) + 8;
          ctx.beginPath();
          ctx.arc(
            cx + Math.cos(midAngle) * markerRadius,
            cy + Math.sin(midAngle) * markerRadius,
            3,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }

        // Draw vulnerability red dots
        if (slice.vulnerable) {
          ctx.fillStyle = '#ef4444'; // Red
          const midAngle = (slice.startAngle + slice.endAngle) / 2;
          const markerRadius = maxRadius + 8;
          ctx.beginPath();
          ctx.arc(
            cx + Math.cos(midAngle) * markerRadius,
            cy + Math.sin(midAngle) * markerRadius,
            4,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      });

      // Draw cycle bezier connections in center
      if (cycles && cycles.length > 0) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
        ctx.lineWidth = 1;
        cycles.forEach(cycle => {
          if (cycle.length < 2) return;
          for (let i = 0; i < cycle.length; i++) {
            const sliceA = fileSlices.find(s => s.id === cycle[i]);
            const sliceB = fileSlices.find(s => s.id === cycle[(i + 1) % cycle.length]);
            if (sliceA && sliceB) {
              const angleA = (sliceA.startAngle + sliceA.endAngle) / 2;
              const angleB = (sliceB.startAngle + sliceB.endAngle) / 2;
              ctx.beginPath();
              ctx.moveTo(cx + Math.cos(angleA) * innerRadius, cy + Math.sin(angleA) * innerRadius);
              ctx.quadraticCurveTo(cx, cy, cx + Math.cos(angleB) * innerRadius, cy + Math.sin(angleB) * innerRadius);
              ctx.stroke();
            }
          }
        });
      }

      // Center dial
      ctx.fillStyle = '#0a0a0f';
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius - 4, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius - 4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#8b9bb4';
      ctx.font = '600 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FILES', cx, cy - 5);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(String(totalFilesCount), cx, cy + 9);

      // 4. Metrics Info Panels on Right side (using single card + grid layout)
      const drawPanel = (px: number, py: number, w: number, h: number, title: string, subtitle: string, mainText: string, accentColor: string) => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.01)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(px, py, w, h, 8); else ctx.rect(px, py, w, h);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(px, py, w, h, 8); else ctx.rect(px, py, w, h);
        ctx.stroke();

        // Decorative color left tab
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(px, py, 3, h, [8, 0, 0, 8]); else ctx.rect(px, py, 3, h);
        ctx.fill();

        // Titles
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '900 8.5px monospace';
        ctx.fillText(title.toUpperCase(), px + 12, py + 22);

        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        if (subtitle.length > 18) {
          ctx.font = '500 8.5px system-ui, sans-serif';
          const displaySub = subtitle.length > 22 ? '...' + subtitle.slice(-19) : subtitle;
          ctx.fillText(displaySub, px + 12, py + 42);
        } else {
          ctx.font = '500 10.5px system-ui, sans-serif';
          ctx.fillText(subtitle, px + 12, py + 42);
        }

        // Big visual metric indicator
        ctx.fillStyle = accentColor;
        if (mainText.length > 8) {
          ctx.font = 'bold 15px system-ui, sans-serif';
        } else {
          ctx.font = 'bold 22px system-ui, sans-serif';
        }
        ctx.fillText(mainText, px + 12, py + 78);
      };

      // Main Grade card
      const gx = 700, gy = 135, gw = 450, gh = 150;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.beginPath();
      ctx.roundRect(gx, gy, gw, gh, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(gx, gy, gw, gh, 10);
      ctx.stroke();

      // Big Grade badge in main card
      ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
      ctx.beginPath();
      ctx.arc(gx + 80, gy + 75, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gx + 80, gy + 75, 50, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#6366f1';
      ctx.font = 'bold 42px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(fingerprintMetrics.grade, gx + 80, gy + 90);

      // Main Card titles
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('CODEBASE QUALITY GRADE', gx + 155, gy + 55);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(`Overall Health Score: ${fingerprintMetrics.qualityScore} / 100`, gx + 155, gy + 82);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('Based on complexity, code smells, and structures.', gx + 155, gy + 105);

      // Sub Cards (3 Columns x 2 Rows)
      // Row 1
      drawPanel(700, 305, 140, 105, 'Maintainability', 'Quality Index', `${fingerprintMetrics.qualityScore}%`, '#8b5cf6');
      drawPanel(855, 305, 140, 105, 'Security Rating', `${fingerprintMetrics.vulnsCount} Vulnerabilities`, fingerprintMetrics.securityRating, fingerprintMetrics.securityColor);
      drawPanel(1010, 305, 140, 105, 'Avg File Size', 'Lines of Code', `${fingerprintMetrics.avgLoc} LOC`, '#3b82f6');

      // Row 2
      drawPanel(700, 425, 140, 105, 'Architect Health', 'Files without loops', `${fingerprintMetrics.archHealth}%`, '#10b981');
      drawPanel(855, 425, 140, 105, 'Code Smells', 'Refactor warnings', String(fingerprintMetrics.smellsCount), '#f59e0b');
      const largestFileName = fingerprintMetrics.maxComplexFile.name.split('/').pop() || 'None';
      drawPanel(1010, 425, 140, 105, 'Largest File', largestFileName, `${fingerprintMetrics.maxComplexFile.complexity} lines`, '#ec4899');

      // 5. Language Breakdown Bar
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '900 9px monospace';
      ctx.fillText('PRIMARY LANGUAGES PROFILE', 700, 560);

      const barX = 700;
      const barY = 572;
      const barW = 450;
      const barH = 12;
      
      let currentBarX = barX;
      // Draw stacked bar
      fingerprintMetrics.languages.slice(0, 4).forEach((lang, idx) => {
        const segW = (lang.percent / 100) * barW;
        ctx.fillStyle = getLangColor(lang.lang);
        ctx.beginPath();
        // Rounded corners for boundaries
        const isFirst = idx === 0;
        const isLast = idx === Math.min(3, fingerprintMetrics.languages.length - 1);
        const tl = isFirst ? 4 : 0;
        const tr = isLast ? 4 : 0;
        const br = isLast ? 4 : 0;
        const bl = isFirst ? 4 : 0;
        if (ctx.roundRect) {
          ctx.roundRect(currentBarX, barY, segW, barH, [tl, tr, br, bl]);
        } else {
          ctx.rect(currentBarX, barY, segW, barH);
        }
        ctx.fill();
        currentBarX += segW;
      });

      // Language legends
      let legendX = 700;
      fingerprintMetrics.languages.slice(0, 4).forEach(lang => {
        ctx.fillStyle = getLangColor(lang.lang);
        ctx.beginPath();
        ctx.arc(legendX + 4, 606, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '500 11px system-ui, sans-serif';
        ctx.fillText(`${lang.lang} (${lang.percent}%)`, legendX + 13, 610);
        legendX += Math.max(90, ctx.measureText(`${lang.lang} (${lang.percent}%)`).width + 25);
      });

      // Draw Visual Legend Key in bottom-left corner
      const lx = 50;
      const ly = 545;
      
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '900 8.5px monospace';
      ctx.fillText('FINGERPRINT KEY', lx, ly);

      const drawLegendItem = (index: number, color: string, text: string, isLine: boolean) => {
        const itemY = ly + 15 + index * 14;
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        
        ctx.beginPath();
        if (isLine) {
          ctx.moveTo(lx, itemY - 3);
          ctx.lineTo(lx + 12, itemY - 3);
          ctx.stroke();
        } else {
          ctx.arc(lx + 6, itemY - 3, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '500 9px system-ui, sans-serif';
        ctx.fillText(text, lx + 20, itemY);
      };

      drawLegendItem(0, '#6366f1', 'Concentric Ridges: Complexity (LOC)', true);
      drawLegendItem(1, 'rgba(239, 68, 68, 0.6)', 'Inner Arcs: Dependency Loops', true);
      drawLegendItem(2, 'rgba(249, 115, 22, 0.8)', 'Orange Nodes: Code Smells', false);
      drawLegendItem(3, '#ef4444', 'Red Orbs: Security CVEs', false);

      // 6. Watermark Footer
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('CODEGRAPH VISUALIZER • HEALTH FINGERPRINT CERTIFICATE', 50, 642);

      // Render metadata footnote at bottom-right
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.font = '500 10px monospace';
      ctx.fillText(`Max Nesting Depth: ${fingerprintMetrics.maxFolderDepth}  |  Scanned: ${fingerprintMetrics.timestamp}`, 1150, 642);

      // Download
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `codegraph-scorecard-${files[0]?.path.split('/')[0] || 'project'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('Score Card downloaded successfully!');
    } catch (e) {
      console.error('Score card download failed:', e);
      showToast('Failed to export scorecard.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', padding: '24px', gap: '24px', background: 'transparent' }}>
      {/* Sub tabs header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
          <button 
            className={`tab-btn ${subTab === 'restructuring' ? 'active' : ''}`}
            onClick={() => setSubTab('restructuring')}
            style={{ fontSize: '0.85rem', padding: '8px 16px', borderRadius: '6px' }}
          >
            <Folder size={15} style={{ marginRight: '6px' }} />
            Restructure & Contracts
          </button>
          <button 
            className={`tab-btn ${subTab === 'fingerprint' ? 'active' : ''}`}
            onClick={() => setSubTab('fingerprint')}
            style={{ fontSize: '0.85rem', padding: '8px 16px', borderRadius: '6px' }}
          >
            <Sparkles size={15} style={{ marginRight: '6px' }} />
            Codebase Fingerprint Card
          </button>
          <button 
            className={`tab-btn ${subTab === 'readme' ? 'active' : ''}`}
            onClick={() => setSubTab('readme')}
            style={{ fontSize: '0.85rem', padding: '8px 16px', borderRadius: '6px' }}
          >
            <FileText size={15} style={{ marginRight: '6px' }} />
            README.md Generator
          </button>
          <button 
            className={`tab-btn ${subTab === 'security' ? 'active' : ''}`}
            onClick={() => setSubTab('security')}
            style={{ fontSize: '0.85rem', padding: '8px 16px', borderRadius: '6px' }}
          >
            <ShieldAlert size={15} style={{ marginRight: '6px' }} />
            Security & Remediation
          </button>
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

          <RiskQuadrantChart 
            nodes={graphData.nodes} 
            onSelectFile={onSelectFile} 
          />

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
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', outline: 'none', cursor: 'pointer' }}
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
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--panel-border)', color: 'var(--text-primary)', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', outline: 'none', cursor: 'pointer' }}
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
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button
                              className="cyber-button"
                              onClick={() => handleRefactor(smell)}
                              style={{ 
                                padding: '4px 8px', 
                                fontSize: '0.7rem', 
                                background: 'rgba(139, 92, 246, 0.1)', 
                                borderColor: 'rgba(139, 92, 246, 0.2)',
                                color: 'var(--color-primary)',
                                fontWeight: 600
                              }}
                            >
                              <Sparkles size={11} style={{ marginRight: '4px' }} />
                              Refactor
                            </button>
                            {onUpdateFileContent && (
                              <button
                                className="cyber-button"
                                disabled={autoApplyingSmellIds.has(smell.id)}
                                onClick={() => handleAutoApplyRefactor(smell)}
                                style={{ 
                                  padding: '4px 8px', 
                                  fontSize: '0.7rem', 
                                  background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.2), rgba(139, 92, 246, 0.2))', 
                                  borderColor: 'var(--color-secondary)',
                                  color: 'var(--text-primary)',
                                  fontWeight: 600,
                                  boxShadow: '0 0 10px rgba(0, 242, 254, 0.1)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  cursor: autoApplyingSmellIds.has(smell.id) ? 'not-allowed' : 'pointer',
                                  opacity: autoApplyingSmellIds.has(smell.id) ? 0.7 : 1
                                }}
                              >
                                {autoApplyingSmellIds.has(smell.id) ? (
                                  <>
                                    <RefreshCw size={11} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                                    Applying...
                                  </>
                                ) : (
                                  <>
                                    <Zap size={11} style={{ color: 'var(--color-secondary)' }} />
                                    Auto-Apply
                                  </>
                                )}
                              </button>
                            )}
                          </div>
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
      
      {/* SUB-TAB 4: RESTRUCTURE & CONTRACTS */}
      {subTab === 'restructuring' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '24px' }}>
            
            {/* Folder Restructure Card */}
            <div className="glass-panel" style={{ minWidth: 0, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--panel-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: 'var(--color-primary)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📂 Folder Restructure Simulator
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Gemini will audit the directory layout, highlight folder-level coupling, and simulate a clean, optimized structure (such as splitting overloaded utility folders).
              </p>
              
              {loadingRestructure && !restructureDoc ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '12px' }}>
                  <div className="search-spinner" style={{ width: '28px', height: '28px' }} />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Simulating cleanest architecture blueprint...</span>
                </div>
              ) : restructureDoc ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="custom-scrollbar" style={{ flex: 1, maxHeight: '400px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div className="markdown-body" dangerouslySetInnerHTML={{ __html: formatMarkdown(restructureDoc) + (loadingRestructure ? ' <span class="typing-cursor"></span>' : '') }} />
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                       className="cyber-button secondary" 
                      onClick={() => setRestructureDoc('')}
                      style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                    >
                      Clear
                    </button>
                    <button 
                      className="cyber-button secondary" 
                      onClick={handleExportRestructurePDF}
                      style={{ padding: '8px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                      title="Export blueprint as PDF"
                    >
                      📄 PDF
                    </button>
                    <button 
                      className="cyber-button" 
                      onClick={handleGenerateRestructure}
                      disabled={loadingRestructure}
                      style={{ padding: '8px 16px', fontSize: '0.8rem', flex: 1 }}
                    >
                      {loadingRestructure ? 'Regenerating...' : 'Regenerate'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', border: '1px dashed var(--panel-border)', borderRadius: '8px', background: 'rgba(0,0,0,0.1)', gap: '12px' }}>
                  <span style={{ fontSize: '1.5rem' }}>🏗️</span>
                  <button 
                    className="cyber-button" 
                    onClick={handleGenerateRestructure}
                    disabled={loadingRestructure}
                    style={{ padding: '8px 20px', fontSize: '0.8rem' }}
                  >
                    {loadingRestructure ? 'Analyzing Structure...' : '⚡ Generate Restructure Blueprint'}
                  </button>
                </div>
              )}
            </div>

            {/* API-to-Database Contract Validation Card */}
            <div className="glass-panel" style={{ minWidth: 0, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--panel-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: 'var(--color-secondary)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🗃️ API-Database Contract Auditor
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Audits data flow contract drift between your API routes (Express, Next.js routes) and database schemas (Prisma, SQL, schemas) to point out missing attributes or invalid type casts.
              </p>

              {loadingApiDbContract && !apiDbContractDoc ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '12px' }}>
                  <div className="search-spinner" style={{ width: '28px', height: '28px' }} />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Auditing database & API endpoints mapping...</span>
                </div>
              ) : apiDbContractDoc ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="custom-scrollbar" style={{ flex: 1, maxHeight: '400px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div className="markdown-body" dangerouslySetInnerHTML={{ __html: formatMarkdown(apiDbContractDoc) + (loadingApiDbContract ? ' <span class="typing-cursor"></span>' : '') }} />
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      className="cyber-button secondary" 
                      onClick={() => setApiDbContractDoc('')}
                      style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                    >
                      Clear
                    </button>
                    <button 
                      className="cyber-button secondary" 
                      onClick={handleExportApiDbContractPDF}
                      style={{ padding: '8px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                      title="Export audit report as PDF"
                    >
                      📄 PDF
                    </button>
                    <button 
                      className="cyber-button" 
                      onClick={handleGenerateApiDbContracts}
                      disabled={loadingApiDbContract}
                      style={{ padding: '8px 16px', fontSize: '0.8rem', flex: 1, background: 'var(--color-secondary)', borderColor: 'var(--color-secondary)' }}
                    >
                      {loadingApiDbContract ? 'Re-Auditing...' : 'Re-Run Audit'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', border: '1px dashed var(--panel-border)', borderRadius: '8px', background: 'rgba(0,0,0,0.1)', gap: '12px' }}>
                  <span style={{ fontSize: '1.5rem' }}>🛡️</span>
                  <button 
                    className="cyber-button" 
                    onClick={handleGenerateApiDbContracts}
                    disabled={loadingApiDbContract}
                    style={{ padding: '8px 20px', fontSize: '0.8rem', background: 'var(--color-secondary)', borderColor: 'var(--color-secondary)' }}
                  >
                    {loadingApiDbContract ? 'Auditing Drift...' : '🔍 Audit API-Database Contracts'}
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* SUB-TAB 5: CODEBASE FINGERPRINT SCORE CARD */}
      {subTab === 'fingerprint' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', alignItems: 'start' }}>
            
            {/* Left Column: Visual Canvas Fingerprint */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', minHeight: '480px' }}>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Activity size={15} style={{ color: 'var(--color-primary)' }} />
                  Visual Health Fingerprint
                </h4>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Interactive radar sweep</span>
              </div>
              <div style={{ width: '100%', height: '380px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <CodebaseFingerprint graphData={graphData} />
              </div>
            </div>

            {/* Right Column: Scorecard Details */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '480px' }}>
              
              {/* Header card with overall grade */}
              <div style={{ display: 'flex', gap: '20px', background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '8px', border: '1px solid var(--panel-border)', alignItems: 'center' }}>
                <div style={{ 
                  width: '76px', 
                  height: '76px', 
                  borderRadius: '50%', 
                  background: 'rgba(99, 102, 241, 0.1)', 
                  border: '2px solid rgba(99, 102, 241, 0.4)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  boxShadow: '0 0 15px rgba(99, 102, 241, 0.2)'
                }}>
                  <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-primary)' }}>
                    {fingerprintMetrics.grade}
                  </span>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                    Codebase Health Card
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Overall rating based on quality metrics, security posture, and loop complexities.
                  </p>
                </div>
              </div>

              {/* Grid of details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                
                {/* Score */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Quality Index</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {fingerprintMetrics.qualityScore}%
                  </span>
                </div>

                {/* Security */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Security Posture</span>
                  <span style={{ fontSize: '1.15rem', fontWeight: 700, color: fingerprintMetrics.securityColor, display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <ShieldAlert size={14} />
                    {fingerprintMetrics.securityRating}
                  </span>
                </div>

                {/* Architecture */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Architecture Stability</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>
                    {fingerprintMetrics.archHealth}% clean
                  </span>
                </div>

                {/* Code Smells */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Structural Smells</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b' }}>
                    {fingerprintMetrics.smellsCount} alerts
                  </span>
                </div>

                {/* Average LOC */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg File Size</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {fingerprintMetrics.avgLoc} LOC
                  </span>
                </div>

                {/* Largest File */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--panel-border)', borderRadius: '6px', minWidth: 0 }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Largest Module</span>
                  <span 
                    style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    title={`${fingerprintMetrics.maxComplexFile.name} (${fingerprintMetrics.maxComplexFile.complexity} lines)`}
                  >
                    {fingerprintMetrics.maxComplexFile.name.split('/').pop() || fingerprintMetrics.maxComplexFile.name} <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)' }}>({fingerprintMetrics.maxComplexFile.complexity} lines)</span>
                  </span>
                </div>

              </div>

              {/* CVE Breakdown */}
              {fingerprintMetrics.vulnsCount > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(239, 68, 68, 0.03)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Vulnerability Severity Breakdown
                  </span>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Critical:</span>
                      <strong style={{ color: '#ef4444' }}>{fingerprintMetrics.cveBreakdown.critical}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f97316' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>High:</span>
                      <strong style={{ color: '#f97316' }}>{fingerprintMetrics.cveBreakdown.high}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Medium:</span>
                      <strong style={{ color: '#f59e0b' }}>{fingerprintMetrics.cveBreakdown.moderate}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Low:</span>
                      <strong style={{ color: '#3b82f6' }}>{fingerprintMetrics.cveBreakdown.low}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Primary languages profile */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Primary Languages Profile
                </span>
                
                {/* Stacked bar */}
                <div style={{ display: 'flex', width: '100%', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                  {fingerprintMetrics.languages.slice(0, 4).map((lang) => (
                    <div 
                      key={lang.lang}
                      style={{
                        width: `${lang.percent}%`,
                        height: '100%',
                        backgroundColor: 
                          lang.lang.toLowerCase() === 'typescript' || lang.lang.toLowerCase() === 'tsx' ? '#6366f1' :
                          lang.lang.toLowerCase() === 'javascript' || lang.lang.toLowerCase() === 'jsx' ? '#3b82f6' :
                          lang.lang.toLowerCase() === 'python' ? '#10b981' :
                          lang.lang.toLowerCase() === 'rust' ? '#f97316' :
                          lang.lang.toLowerCase() === 'go' ? '#06b6d4' :
                          lang.lang.toLowerCase() === 'css' ? '#ec4899' :
                          lang.lang.toLowerCase() === 'html' ? '#eab308' : '#8b5cf6'
                      }}
                      title={`${lang.lang}: ${lang.percent}%`}
                    />
                  ))}
                </div>

                {/* Legends */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {fingerprintMetrics.languages.slice(0, 4).map(lang => (
                    <div key={lang.lang} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.68rem' }}>
                      <span style={{ 
                        width: '6px', 
                        height: '6px', 
                        borderRadius: '50%', 
                        backgroundColor: 
                          lang.lang.toLowerCase() === 'typescript' || lang.lang.toLowerCase() === 'tsx' ? '#6366f1' :
                          lang.lang.toLowerCase() === 'javascript' || lang.lang.toLowerCase() === 'jsx' ? '#3b82f6' :
                          lang.lang.toLowerCase() === 'python' ? '#10b981' :
                          lang.lang.toLowerCase() === 'rust' ? '#f97316' :
                          lang.lang.toLowerCase() === 'go' ? '#06b6d4' :
                          lang.lang.toLowerCase() === 'css' ? '#ec4899' :
                          lang.lang.toLowerCase() === 'html' ? '#eab308' : '#8b5cf6'
                      }} />
                      <span style={{ color: 'var(--text-secondary)' }}>{lang.lang}</span>
                      <span style={{ color: 'var(--text-muted)' }}>({lang.percent}%)</span>
                    </div>
                  ))}
                </div>

              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto', paddingTop: '16px', borderTop: '1px dashed var(--panel-border)' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    className="cyber-button"
                    onClick={handleExportScorecard}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, padding: '10px 18px', fontSize: '0.8rem' }}
                  >
                    <Download size={14} />
                    Export Score Card (PNG)
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', padding: '0 4px' }}>
                  <span>Max Folder Nesting: <strong>{fingerprintMetrics.maxFolderDepth}</strong></span>
                  <span>Scanned: <strong>{fingerprintMetrics.timestamp}</strong></span>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* SUB-TAB 6: README AUTO-GENERATOR */}
      {subTab === 'readme' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {readmeDoc ? (
            <>
              {/* Exporters menu */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={handleDownloadReadme}
                    className="cyber-button secondary" 
                    style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                  >
                    <Download size={13} style={{ marginRight: '5px' }} />
                    Download README.md
                  </button>
                  <button 
                    onClick={handleCopyReadme}
                    className="cyber-button secondary" 
                    style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                  >
                    <Copy size={13} style={{ marginRight: '5px' }} />
                    Copy to Clipboard
                  </button>
                </div>
                
                <button
                  className="cyber-button"
                  style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                  onClick={handleGenerateReadme}
                  disabled={loadingReadme}
                >
                  <RefreshCw size={12} style={{ marginRight: '6px', animation: loadingReadme ? 'spin 1s linear infinite' : 'none' }} />
                  Regenerate README
                </button>
              </div>

              {/* README display */}
              <div className="glass-panel markdown-body" style={{ padding: '24px', maxHeight: '550px', overflowY: 'auto' }}>
                {loadingReadme ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '40px' }}>
                    <RefreshCw size={24} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--color-primary)' }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Generating README.md...</span>
                  </div>
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: formatMarkdown(readmeDoc) }} />
                )}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '60px 20px', textAlign: 'center' }}>
              <FileText size={48} style={{ color: 'var(--color-primary)', opacity: 0.5 }} />
              <div>
                <h4 style={{ fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>No README.md Generated</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '6px', maxWidth: '450px', lineHeight: 1.6 }}>
                  Generate an AI-driven, comprehensive README.md detailing the project description, feature set, tech stack, installation guides, API endpoints, and database models.
                </p>
              </div>
              <button
                className="cyber-button"
                onClick={handleGenerateReadme}
                style={{ padding: '10px 20px' }}
                disabled={loadingReadme}
              >
                {loadingReadme ? (
                  <>
                    <RefreshCw size={14} style={{ marginRight: '6px', animation: 'spin 1s linear infinite' }} />
                    Generating README...
                  </>
                ) : (
                  'Generate README.md'
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 7: SECURITY CVE AUDIT & REMEDIATION */}
      {subTab === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* KPI Dashboard */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Vulnerabilities</span>
              <strong style={{ fontSize: '1.6rem', color: vulnerabilities.length > 0 ? '#ef4444' : 'var(--text-primary)' }}>{vulnerabilities.length}</strong>
            </div>
            <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Critical Severity</span>
              <strong style={{ fontSize: '1.6rem', color: fingerprintMetrics.cveBreakdown.critical > 0 ? '#ef4444' : 'var(--text-primary)' }}>{fingerprintMetrics.cveBreakdown.critical}</strong>
            </div>
            <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>High Severity</span>
              <strong style={{ fontSize: '1.6rem', color: fingerprintMetrics.cveBreakdown.high > 0 ? '#f97316' : 'var(--text-primary)' }}>{fingerprintMetrics.cveBreakdown.high}</strong>
            </div>
            <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Moderate Severity</span>
              <strong style={{ fontSize: '1.6rem', color: fingerprintMetrics.cveBreakdown.moderate > 0 ? '#f59e0b' : 'var(--text-primary)' }}>{fingerprintMetrics.cveBreakdown.moderate}</strong>
            </div>
          </div>

          {/* Remediation Script Section */}
          {vulnerabilities.length > 0 ? (
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Zap size={14} style={{ color: 'var(--color-secondary)' }} />
                    Global Remediation Script
                  </h4>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                    Run the following commands in your shell to upgrade all vulnerable dependencies to safe patched versions.
                  </p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(remediationScript);
                    showToast('Remediation script copied!');
                  }}
                  className="cyber-button secondary"
                  style={{ fontSize: '0.72rem', padding: '6px 12px' }}
                >
                  <Copy size={12} style={{ marginRight: '5px' }} />
                  Copy Script
                </button>
              </div>
              <pre style={{
                background: 'rgba(0,0,0,0.3)',
                padding: '12px 16px',
                borderRadius: '6px',
                border: '1px solid var(--panel-border)',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: 'var(--color-secondary)',
                overflowX: 'auto',
                margin: 0
              }}>
                {remediationScript}
              </pre>
            </div>
          ) : (
            <div className="glass-panel" style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' }}>
              <CheckCircle size={40} style={{ color: '#10b981' }} />
              <div>
                <h4 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 600 }}>Dependencies Fully Secure</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '400px' }}>
                  No known security advisories or vulnerabilities were detected in your configuration files.
                </p>
              </div>
            </div>
          )}

          {/* List of Vulnerabilities */}
          {vulnerabilities.length > 0 && (
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase', margin: 0 }}>
                Vulnerability Advisory Ledger
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {vulnerabilities.map((vuln, idx) => {
                  let badgeColor = '#ef4444';
                  if (vuln.severity === 'high') badgeColor = '#f97316';
                  else if (vuln.severity === 'moderate') badgeColor = '#f59e0b';
                  else if (vuln.severity === 'low') badgeColor = '#3b82f6';

                  return (
                    <div
                      key={`${vuln.cveId}-${idx}`}
                      style={{
                        padding: '16px',
                        background: 'rgba(255,255,255,0.01)',
                        border: '1px solid var(--panel-border)',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            padding: '3px 8px',
                            background: `${badgeColor}20`,
                            color: badgeColor,
                            borderRadius: '4px',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            border: `1px solid ${badgeColor}40`
                          }}>
                            {vuln.severity}
                          </span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {vuln.packageName}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            ({vuln.currentVersion} &rarr; {vuln.patchedVersion})
                          </span>
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                          {vuln.cveId}
                        </span>
                      </div>

                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                        {vuln.description}
                      </p>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderTop: '1px dashed var(--panel-border)', paddingTop: '10px' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          Declared in: <span
                            onClick={() => onSelectFile(vuln.declaredInFile)}
                            style={{ color: 'var(--color-secondary)', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            {vuln.declaredInFile}
                          </span>
                        </div>
                        <code style={{
                          fontSize: '0.7rem',
                          background: 'rgba(0,0,0,0.2)',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--panel-border)'
                        }}>
                          {vuln.upgradeCommand}
                        </code>
                      </div>
                    </div>
                  );
                })}
              </div>
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
              {refactorResult && !refactoringLoading && onUpdateFileContent && (
                <button
                  className="cyber-button"
                  onClick={() => {
                    const preMatch = refactorResult.match(/\`\`\`(?:[a-zA-Z]+)?\n([\s\S]*?)\n\`\`\`/);
                    const cleanCode = preMatch ? preMatch[1].trim() : refactorResult;
                    onUpdateFileContent(refactorSmell.file, cleanCode);
                    showToast('Refactoring applied successfully!');
                    setRefactorSmell(null);
                  }}
                  style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}
                >
                  <Sparkles size={12} />
                  Apply Refactor
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
