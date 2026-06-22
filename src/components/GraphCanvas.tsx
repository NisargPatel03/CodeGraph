import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import { ZoomIn, ZoomOut, RotateCcw, ChevronUp, ChevronDown, Maximize2, Minimize2, Database, Sparkles, Download, Filter, SlidersHorizontal, Box, Globe } from 'lucide-react';
import type { CodebaseGraph } from '../utils/codeAnalyzer';
import { generateGitHistory, mapFilesToRealCommits } from '../utils/codeAnalyzer';
import { EvolutionPlayer } from './EvolutionPlayer';
import { parseDatabaseSchemas, GET_DEMO_SCHEMA } from '../utils/schemaParser';
import { auditDatabaseSchema, extractEndpointsFromCodebase } from '../utils/aiHelper';
import mermaid from 'mermaid';
import { audioSonifier } from '../utils/audioSonifier';

interface GraphCanvasProps {
  graphData: CodebaseGraph;
  selectedNode: string | null;
  setSelectedNode: (id: string | null) => void;
  viewMode: 'dependency' | 'cluster' | 'call' | 'hierarchy' | 'analytics' | 'dbSchema';
  searchQuery: string;
  collapsedFolders: Set<string>;
  setCollapsedFolders: React.Dispatch<React.SetStateAction<Set<string>>>;
  activeTraceNodeId: string | null;
  setActiveTraceNodeId: (id: string | null) => void;
  depthFilter: number;
  setDepthFilter: (depth: number) => void;
  diffData: any | null;
  setDiffData: (data: any | null) => void;
  repoName: string;
  files: any[];
  isEvolutionMode: boolean;
  setIsEvolutionMode: (val: boolean) => void;
  currentEvolutionStep: number;
  setCurrentEvolutionStep: (step: number) => void;
  commits?: import('../utils/repoParser').GitHubCommitInfo[];
  linterViolations?: import('../utils/aiHelper').LinterViolation | null;
  auditReport?: import('../utils/aiHelper').AuditReport | null;
  apiKey: string;
  dbAuditTrigger?: number;
  onExplainFolder?: (folderPath: string) => void;
  onRefineCallGraph?: () => void;
  isRefiningCallGraph?: boolean;
  collabPeers?: Map<string, any>;
  onLocalCursorMove?: (x: number | null, y: number | null) => void;
}

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
      a.download = 'call-trace-sequence.svg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download SVG failed:', e);
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

    const id = `mermaid-trace-${Date.now()}`;
    ref.current.innerHTML = '';
    setRenderError(null);

    mermaid.render(id, chart)
      .then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg;
      })
      .catch((err) => {
        console.error('Mermaid render error:', err);
        setRenderError(err?.message || 'Failed to render sequence diagram');
      });
  }, [chart]);

  return (
    <div style={{ width: '100%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', width: '100%', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '8px' }}>
        <button
          className="cyber-button secondary"
          style={{ fontSize: '0.68rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
          onClick={downloadSvg}
        >
          Download SVG
        </button>
      </div>
      {renderError ? (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.78rem', width: '100%' }}>
          ⚠️ Diagram render error: {renderError}
        </div>
      ) : (
        <div ref={ref} className="mermaid-container" style={{ width: '100%', background: '#0a0a0f', padding: '16px', borderRadius: '8px', overflow: 'auto', display: 'flex', justifyContent: 'center' }} />
      )}
    </div>
  );
};

function generateSequenceDiagram(activeTraceNodeId: string, steps: { source: string; target: string }[]): string {
  let mermaidCode = 'sequenceDiagram\n  autonumber\n';

  const getAlias = (id: string) => {
    return id.replace(/[^a-zA-Z0-9]/g, '_');
  };

  const getLabel = (id: string) => {
    const parts = id.split('::');
    const func = parts.pop() || '';
    const file = parts.join('::').split(/[/\\]/).pop() || '';
    return `${file}::${func}()`;
  };

  const participantIds = new Set<string>();
  participantIds.add(activeTraceNodeId);
  steps.forEach(s => {
    participantIds.add(s.source);
    participantIds.add(s.target);
  });

  participantIds.forEach(id => {
    const alias = getAlias(id);
    const label = getLabel(id);
    mermaidCode += `  participant ${alias} as ${JSON.stringify(label)}\n`;
  });

  mermaidCode += '\n';

  if (steps.length === 0) {
    mermaidCode += `  Note over ${getAlias(activeTraceNodeId)}: Trace initiated (no outgoing calls detected)\n`;
  } else {
    steps.forEach(s => {
      const srcAlias = getAlias(s.source);
      const tgtAlias = getAlias(s.target);
      const tgtFunc = s.target.split('::').pop() || '';
      mermaidCode += `  ${srcAlias}->>+${tgtAlias}: ${tgtFunc}()\n`;
      mermaidCode += `  deactivate ${tgtAlias}\n`;
    });
  }

  return mermaidCode;
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  graphData,
  selectedNode,
  setSelectedNode,
  viewMode,
  searchQuery,
  collapsedFolders,
  setCollapsedFolders,
  activeTraceNodeId,
  setActiveTraceNodeId,
  depthFilter,
  setDepthFilter,
  diffData,
  setDiffData,
  repoName,
  files,
  isEvolutionMode,
  setIsEvolutionMode,
  currentEvolutionStep,
  setCurrentEvolutionStep,
  commits,
  linterViolations,
  auditReport,
  apiKey,
  dbAuditTrigger,
  onExplainFolder,
  onRefineCallGraph,
  isRefiningCallGraph,
  collabPeers,
  onLocalCursorMove,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const weatherCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [weatherEnabled, setWeatherEnabled] = useState<boolean>(true);
  const boundsRef = useRef({ minX: -100, maxX: 100, minY: -100, maxY: 100 });
  const zoomBehaviorRef = useRef<any>(null);
  const drawMinimapRef = useRef<(() => void) | null>(null);
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const [isReplaying, setIsReplaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1500); // Default to 2x speed (1500ms)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredCluster, setHoveredCluster] = useState<{
    folder: string;
    fileCount: number;
    connectionsCount: number;
  } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Component Tree States
  const [treeLayoutStyle, setTreeLayoutStyle] = useState<'top-down' | 'radial'>('top-down');
  const [hoveredComponentDetails, setHoveredComponentDetails] = useState<any | null>(null);

  // DB Schema States
  const [useDemoDbSchema, setUseDemoDbSchema] = useState(false);
  const [showApiDbMapping, setShowApiDbMapping] = useState(false);
  const [selectedDbTableId, setSelectedDbTableId] = useState<string | null>(null);
  const [hoveredDbTableId, setHoveredDbTableId] = useState<string | null>(null);
  const [dbQueryString, setDbQueryString] = useState('');

  // DB Auditor States
  const [isAuditingDb, setIsAuditingDb] = useState(false);
  const [dbAuditReport, setDbAuditReport] = useState<string | null>(null);
  const [showDbAuditModal, setShowDbAuditModal] = useState(false);
  const [dbAuditError, setDbAuditError] = useState<string | null>(null);

  // Advanced features states
  const [showNpmPackages, setShowNpmPackages] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  // Dynamic filter states
  const [filterLanguage, setFilterLanguage] = useState<string>('all');
  const [filterMinLoc, setFilterMinLoc] = useState<number>(0);
  const [filterFolderPath, setFilterFolderPath] = useState<string>('');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState<boolean>(false);

  // 3D Canvas states & refs
  const [is3DMode, setIs3DMode] = useState<boolean>(false);
  const [autoRotate3D, setAutoRotate3D] = useState<boolean>(true);
  const canvas3DRef = useRef<HTMLCanvasElement | null>(null);
  const rotation3DRef = useRef<{ x: number; y: number }>({ x: -0.5, y: 0.5 });
  const activeNodesRef = useRef<any[]>([]);
  const activeLinksRef = useRef<any[]>([]);
  const [zoomScale3D, setZoomScale3D] = useState<number>(0.85);
  const [hoveredNode3D, setHoveredNode3D] = useState<string | null>(null);

  useEffect(() => {
    if (!isExportDropdownOpen) return;
    const handleCloseDropdown = () => {
      setIsExportDropdownOpen(false);
    };
    window.addEventListener('click', handleCloseDropdown);
    return () => {
      window.removeEventListener('click', handleCloseDropdown);
    };
  }, [isExportDropdownOpen]);

  const [heatmapMode, setHeatmapMode] = useState<'none' | 'churn' | 'complexity'>('none');
  const [pathSource, setPathSource] = useState<string | null>(null);
  const [pathTarget, setPathTarget] = useState<string | null>(null);
  const [isToolboxCollapsed, setIsToolboxCollapsed] = useState(false);
  const [isMinimapExpanded, setIsMinimapExpanded] = useState(false);
  const [currentTraceStep, setCurrentTraceStep] = useState(0);
  const [showUmlModal, setShowUmlModal] = useState(false);
  const [umlActiveTab, setUmlActiveTab] = useState<'preview' | 'syntax'>('preview');

  const getCanvasStyles = () => {
    let cssText = '';
    try {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (!rules) continue;
          for (const rule of Array.from(rules)) {
            if (rule.type === CSSRule.STYLE_RULE) {
              const selector = (rule as CSSStyleRule).selectorText;
              if (selector && (
                selector.includes('node') ||
                selector.includes('link') ||
                selector.includes('hull') ||
                selector.includes('warning') ||
                selector.includes('risk') ||
                selector.includes('marker') ||
                selector.includes('pipeline') ||
                selector.includes('component-mini-card')
              )) {
                cssText += rule.cssText + '\n';
              }
            } else if (rule.type === CSSRule.KEYFRAMES_RULE) {
              const name = (rule as CSSKeyframesRule).name;
              if (name && (
                name.includes('flow') ||
                name.includes('dash') ||
                name.includes('pulse')
              )) {
                cssText += rule.cssText + '\n';
              }
            }
          }
        } catch (e) {
          // Ignore CORS stylesheet errors
        }
      }
    } catch (e) {
      console.error('Error reading stylesheets:', e);
    }
    return cssText;
  };

  const generateMermaid = (): string => {
    const svgEl = svgRef.current;
    if (!svgEl) return '';

    const activeNodes: any[] = d3.select(svgEl).selectAll('.node-element').data();
    const activeLinks: any[] = d3.select(svgEl).selectAll('.link-element').data();

    if (activeNodes.length === 0) return '%% No active nodes in visualization';

    // Map to store safe IDs to prevent invalid Mermaid characters (like slash, dots, dashes, spaces)
    const idMap = new Map<string, string>();
    activeNodes.forEach((n, idx) => {
      idMap.set(n.id, `n_${idx}`);
    });

    let code = '';
    
    if (viewMode === 'dbSchema') {
      code += 'flowchart LR\n'; // Left-to-right looks better for DB schemas
      // Render tables
      activeNodes.forEach((n) => {
        const safeId = idMap.get(n.id);
        let label = `"${n.id}`;
        if (n.fields && Array.isArray(n.fields)) {
          n.fields.forEach((f: any) => {
            let prefix = '  ';
            if (f.isPrimaryKey) prefix = '🔑 ';
            else if (f.isForeignKey) prefix = '🔗 ';
            label += `<br/>${prefix}${f.name} : ${f.type}`;
          });
        }
        label += '"';
        code += `  ${safeId}[${label}]\n`;
      });

      // Render relationships
      activeLinks.forEach((l) => {
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        const sourceSafe = idMap.get(sId);
        const targetSafe = idMap.get(tId);
        if (sourceSafe && targetSafe) {
          const relationshipLabel = l.sourceField && l.targetField ? `|"${l.sourceField} ➔ ${l.targetField}"| ` : '';
          code += `  ${sourceSafe} -->${relationshipLabel}${targetSafe}\n`;
        }
      });

    } else if (viewMode === 'call') {
      code += 'flowchart TD\n';
      // Render functions
      activeNodes.forEach((n) => {
        const safeId = idMap.get(n.id);
        const funcName = n.name || n.id.split('::')[1] || n.id;
        const fileName = n.file || n.id.split('::')[0] || '';
        code += `  ${safeId}["⚡ ${funcName}<br/><small style='opacity:0.6'>${fileName}</small>"]\n`;
      });

      // Render links
      activeLinks.forEach((l) => {
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        const sourceSafe = idMap.get(sId);
        const targetSafe = idMap.get(tId);
        if (sourceSafe && targetSafe) {
          code += `  ${sourceSafe} --> ${targetSafe}\n`;
        }
      });

    } else if (viewMode === 'hierarchy') {
      code += 'flowchart TD\n';
      // Render classes/components
      activeNodes.forEach((n) => {
        const safeId = idMap.get(n.id);
        const name = n.name || n.id.split('::')[1] || n.id;
        const typeLabel = n.type === 'component' ? '⚛️' : '📦';
        code += `  ${safeId}["${typeLabel} ${name}"]\n`;
      });

      // Render links
      activeLinks.forEach((l) => {
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        const sourceSafe = idMap.get(sId);
        const targetSafe = idMap.get(tId);
        if (sourceSafe && targetSafe) {
          code += `  ${sourceSafe} --> ${targetSafe}\n`;
        }
      });

    } else {
      // dependency or cluster mode
      code += 'flowchart TD\n';

      // Group files by folder
      const folderGroups = new Map<string, any[]>();
      const rootNodes: any[] = [];

      activeNodes.forEach((n) => {
        if (n.isFolder) {
          rootNodes.push(n); // Collapsed folder node at root
        } else if (n.folder) {
          if (!folderGroups.has(n.folder)) {
            folderGroups.set(n.folder, []);
          }
          folderGroups.get(n.folder)!.push(n);
        } else {
          rootNodes.push(n); // Root file
        }
      });

      // Render folder subgraphs
      let subgraphIdx = 0;
      folderGroups.forEach((nodesInFolder, folderPath) => {
        const cleanFolderName = folderPath.replace(/['"`]/g, '');
        const subgraphId = `sub_${subgraphIdx++}`;
        code += `  subgraph ${subgraphId} ["📁 ${cleanFolderName}"]\n`;
        nodesInFolder.forEach((n) => {
          const safeId = idMap.get(n.id);
          const emoji = n.language === 'typescript' || n.language === 'javascript' ? '⚛️' : '📄';
          code += `    ${safeId}["${emoji} ${n.name}"]\n`;
        });
        code += '  end\n\n';
      });

      // Render root nodes
      rootNodes.forEach((n) => {
        const safeId = idMap.get(n.id);
        const emoji = n.isFolder ? '📁' : '📄';
        code += `  ${safeId}["${emoji} ${n.name}"]\n`;
      });

      // Render links
      activeLinks.forEach((l) => {
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        const sourceSafe = idMap.get(sId);
        const targetSafe = idMap.get(tId);
        if (sourceSafe && targetSafe) {
          code += `  ${sourceSafe} --> ${targetSafe}\n`;
        }
      });
    }

    return code;
  };

  const copyMermaidCode = () => {
    try {
      const code = generateMermaid();
      navigator.clipboard.writeText(code);
      showExportToast('Copied Mermaid.js code to clipboard!');
    } catch (err) {
      console.error('Failed to copy Mermaid code:', err);
      showExportToast('Failed to copy Mermaid code.');
    }
  };

  const inlineDbSchemaStyles = (svgClone: SVGSVGElement, svgOriginal: SVGSVGElement) => {
    const originalElements = Array.from(svgOriginal.querySelectorAll('*'));
    const cloneElements = Array.from(svgClone.querySelectorAll('*'));

    const count = Math.min(originalElements.length, cloneElements.length);
    for (let i = 0; i < count; i++) {
      const orig = originalElements[i] as HTMLElement;
      const clone = cloneElements[i] as HTMLElement;
      const computed = window.getComputedStyle(orig);

      if (orig.namespaceURI === 'http://www.w3.org/1999/xhtml') {
        const stylesToInline = [
          'background',
          'background-color',
          'border',
          'border-top',
          'border-right',
          'border-bottom',
          'border-left',
          'border-color',
          'border-style',
          'border-width',
          'border-radius',
          'box-shadow',
          'color',
          'display',
          'flex',
          'flex-direction',
          'align-items',
          'justify-content',
          'padding',
          'padding-top',
          'padding-right',
          'padding-bottom',
          'padding-left',
          'margin',
          'font-size',
          'font-weight',
          'font-family',
          'text-overflow',
          'white-space',
          'overflow',
          'overflow-y',
          'gap',
          'flex-grow',
          'flex-shrink',
          'width',
          'height'
        ];
        
        let inlineStyleString = '';
        stylesToInline.forEach(prop => {
          const val = computed.getPropertyValue(prop);
          if (val) {
            inlineStyleString += `${prop}: ${val}; `;
          }
        });
        clone.setAttribute('style', inlineStyleString);
      } else {
        const stylesToInline = [
          'stroke',
          'stroke-width',
          'stroke-opacity',
          'stroke-dasharray',
          'fill',
          'fill-opacity',
          'opacity',
          'marker-end',
          'marker-start'
        ];
        let inlineStyleString = '';
        stylesToInline.forEach(prop => {
          const val = computed.getPropertyValue(prop);
          if (val && val !== 'none' && val !== 'normal') {
            inlineStyleString += `${prop}: ${val}; `;
          }
        });
        if (inlineStyleString) {
          clone.setAttribute('style', inlineStyleString);
        }
      }
    }
  };

  const exportGraph = (format: 'svg' | 'png') => {
    try {
      const svgEl = svgRef.current;
      if (!svgEl) return;

      const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
      if (!svgClone.getAttribute('xmlns')) {
        svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }
      if (!svgClone.getAttribute('xmlns:xlink')) {
        svgClone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      }

      if (viewMode === 'dbSchema') {
        inlineDbSchemaStyles(svgClone, svgEl);
      }

      // Add CSS variables for the current theme
      const computedStyle = getComputedStyle(document.body);
      const variables = [
        '--bg-main',
        '--bg-glow',
        '--bg-grid',
        '--panel-bg',
        '--panel-border',
        '--panel-border-glow',
        '--color-primary',
        '--color-primary-glow',
        '--color-secondary',
        '--color-secondary-glow',
        '--link-stroke',
        '--text-primary',
        '--text-secondary',
        '--text-muted',
        '--input-bg',
        '--tabs-header-bg',
        '--scrollbar-thumb'
      ];
      let cssVariables = ':root {\n';
      variables.forEach(v => {
        const val = computedStyle.getPropertyValue(v).trim();
        if (val) {
          cssVariables += `  ${v}: ${val};\n`;
        }
      });
      cssVariables += '}\n';

      // Inject style block
      const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      const extraStyles = `
/* Hide scrollbars in exported SVG foreignObjects */
::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
* {
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
/* Explicit font fallbacks for exported SVG foreignObjects */
body, div, span, label, p {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
}
code, pre, .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
}
`;
      styleEl.textContent = cssVariables + '\n' + getCanvasStyles() + '\n' + extraStyles;
      svgClone.insertBefore(styleEl, svgClone.firstChild);

      // Set dimensions by calculating bounding box to fit all content without clipping
      const mainGroupEl = svgEl.querySelector('.main-container') as SVGGraphicsElement;
      let hasBBoxSet = false;
      let width = svgEl.clientWidth || 800;
      let height = svgEl.clientHeight || 600;

      if (mainGroupEl) {
        try {
          const bbox = mainGroupEl.getBBox();
          if (bbox.width > 0 && bbox.height > 0) {
            const padding = 60; // 60px padding for safety
            const exportWidth = bbox.width + padding * 2;
            const exportHeight = bbox.height + padding * 2;

            width = exportWidth;
            height = exportHeight;

            svgClone.setAttribute('width', String(exportWidth));
            svgClone.setAttribute('height', String(exportHeight));
            svgClone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${exportWidth} ${exportHeight}`);

            const cloneMainGroup = svgClone.querySelector('.main-container');
            if (cloneMainGroup) {
              cloneMainGroup.removeAttribute('transform');
            }
            hasBBoxSet = true;
          }
        } catch (e) {
          console.error('Failed to get BBox for export:', e);
        }
      }

      if (!hasBBoxSet) {
        svgClone.setAttribute('width', String(width));
        svgClone.setAttribute('height', String(height));
        if (!svgClone.getAttribute('viewBox')) {
          svgClone.setAttribute('viewBox', `0 0 ${width} ${height}`);
        }
      }

      // Insert solid background behind everything, ensuring it spans the full viewBox
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const viewBoxStr = svgClone.getAttribute('viewBox');
      if (viewBoxStr) {
        const parts = viewBoxStr.split(/\s+/).map(Number);
        if (parts.length === 4 && !parts.some(isNaN)) {
          bgRect.setAttribute('x', String(parts[0]));
          bgRect.setAttribute('y', String(parts[1]));
          bgRect.setAttribute('width', String(parts[2]));
          bgRect.setAttribute('height', String(parts[3]));
        } else {
          bgRect.setAttribute('width', '100%');
          bgRect.setAttribute('height', '100%');
        }
      } else {
        bgRect.setAttribute('width', '100%');
        bgRect.setAttribute('height', '100%');
      }
      bgRect.setAttribute('fill', computedStyle.getPropertyValue('--bg-main').trim() || '#060913');
      if (svgClone.firstChild) {
        svgClone.insertBefore(bgRect, svgClone.firstChild.nextSibling);
      } else {
        svgClone.appendChild(bgRect);
      }

      const svgString = new XMLSerializer().serializeToString(svgClone);

      if (format === 'svg') {
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `codegraph-export-${viewMode}-${Date.now()}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showExportToast('Exported SVG successfully!');
      } else {
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const scale = 2; // For higher DPI/clarity
            canvas.width = width * scale;
            canvas.height = height * scale;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.scale(scale, scale);
              ctx.drawImage(img, 0, 0, width, height);
              const pngUrl = canvas.toDataURL('image/png');
              const a = document.createElement('a');
              a.href = pngUrl;
              a.download = `codegraph-export-${viewMode}-${Date.now()}.png`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              showExportToast('Exported PNG successfully!');
            }
            URL.revokeObjectURL(url);
          } catch (e) {
            console.error('PNG canvas export failed:', e);
            URL.revokeObjectURL(url);
            showExportToast('PNG Export failed. Standalone SVG is recommended.');
          }
        };
        img.onerror = (err) => {
          console.error('Image load failed for PNG export:', err);
          URL.revokeObjectURL(url);
          showExportToast('PNG Export failed due to load error.');
        };
        img.src = url;
      }
    } catch (err) {
      console.error('Export failed:', err);
      showExportToast('Export failed.');
    }
  };

  const showExportToast = (message: string) => {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = 'var(--color-primary, #8b5cf6)';
    toast.style.color = '#fff';
    toast.style.padding = '8px 16px';
    toast.style.borderRadius = '6px';
    toast.style.fontSize = '0.75rem';
    toast.style.fontWeight = 'bold';
    toast.style.zIndex = '9999999';
    toast.style.boxShadow = '0 0 15px rgba(139, 92, 246, 0.4)';
    toast.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => document.body.removeChild(toast), 2500);
  };

  const dbSchema = useMemo(() => {
    if (viewMode !== 'dbSchema') return { tables: [], relationships: [] };
    if (useDemoDbSchema) {
      return GET_DEMO_SCHEMA();
    }
    return parseDatabaseSchemas(files);
  }, [files, viewMode, useDemoDbSchema]);

  const queryTokens = useMemo(() => {
    if (!dbQueryString.trim()) return [];
    const words = dbQueryString.match(/[a-zA-Z0-9_-]+/g) || [];
    const lowerWords = words.map(w => w.toLowerCase());
    return dbSchema.tables
      .filter(t => lowerWords.includes(t.id.toLowerCase()))
      .map(t => t.id);
  }, [dbQueryString, dbSchema.tables]);

  const apiEndpoints = useMemo(() => {
    if (useDemoDbSchema) {
      return [
        { method: 'GET', path: '/api/users', filePath: 'routes/users.js', description: 'List all users.', line: 10 },
        { method: 'POST', path: '/api/users', filePath: 'routes/users.js', description: 'Create user.', line: 25 },
        { method: 'GET', path: '/api/users/:id', filePath: 'routes/users.js', description: 'Get user details.', line: 40 },
        { method: 'POST', path: '/api/orders', filePath: 'routes/orders.js', description: 'Place a new order.', line: 15 },
        { method: 'GET', path: '/api/orders/:id', filePath: 'routes/orders.js', description: 'Get order details with items.', line: 35 },
        { method: 'GET', path: '/api/products', filePath: 'routes/products.js', description: 'Query products list.', line: 8 },
        { method: 'POST', path: '/api/products', filePath: 'routes/products.js', description: 'Add a new product.', line: 20 },
        { method: 'DELETE', path: '/api/products/:id', filePath: 'routes/products.js', description: 'Remove a product.', line: 45 }
      ];
    }
    return extractEndpointsFromCodebase(files);
  }, [files, useDemoDbSchema]);

  const apiDbConnections = useMemo(() => {
    if (useDemoDbSchema) {
      return [
        { endpointPath: '/api/users', method: 'GET', tableId: 'User', type: 'read' as const },
        { endpointPath: '/api/users', method: 'POST', tableId: 'User', type: 'write' as const, isMismatch: true, mismatchReason: "Field 'phoneNumber' sent in POST payload is not defined in User table schema." },
        { endpointPath: '/api/users/:id', method: 'GET', tableId: 'User', type: 'read' as const },
        { endpointPath: '/api/orders', method: 'POST', tableId: 'Order', type: 'write' as const },
        { endpointPath: '/api/orders', method: 'POST', tableId: 'OrderItem', type: 'write' as const },
        { endpointPath: '/api/orders/:id', method: 'GET', tableId: 'Order', type: 'read' as const },
        { endpointPath: '/api/orders/:id', method: 'GET', tableId: 'OrderItem', type: 'read' as const },
        { endpointPath: '/api/orders/:id', method: 'GET', tableId: 'Product', type: 'read' as const },
        { endpointPath: '/api/products', method: 'GET', tableId: 'Product', type: 'read' as const },
        { endpointPath: '/api/products', method: 'GET', tableId: 'Category', type: 'read' as const },
        { endpointPath: '/api/products', method: 'POST', tableId: 'Product', type: 'write' as const },
        { endpointPath: '/api/products/:id', method: 'DELETE', tableId: 'Product', type: 'write' as const }
      ];
    }

    const connections: { endpointPath: string; method: string; tableId: string; type: 'read' | 'write'; isMismatch?: boolean; mismatchReason?: string }[] = [];
    apiEndpoints.forEach(ep => {
      const file = files.find(f => f.path === ep.filePath);
      const content = file ? file.content : '';
      
      dbSchema.tables.forEach(table => {
        const tableName = table.id;
        const singularName = tableName.toLowerCase();
        const pluralName = singularName.endsWith('s') ? singularName : singularName + 's';
        
        const hasRef = 
          content.toLowerCase().includes(`db.${singularName}`) ||
          content.toLowerCase().includes(`db.${pluralName}`) ||
          content.toLowerCase().includes(`prisma.${singularName}`) ||
          content.toLowerCase().includes(`prisma.${pluralName}`) ||
          content.toLowerCase().includes(`from ${singularName}`) ||
          content.toLowerCase().includes(`from ${pluralName}`) ||
          content.toLowerCase().includes(`into ${singularName}`) ||
          content.toLowerCase().includes(`into ${pluralName}`) ||
          content.toLowerCase().includes(`update ${singularName}`) ||
          content.toLowerCase().includes(`update ${pluralName}`) ||
          content.includes(tableName);
          
        if (hasRef) {
          const type = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(ep.method) ? 'write' : 'read';
          
          let isMismatch = false;
          let mismatchReason = '';
          const fieldAccesses = content.match(/(?:body|payload|json|data)\.(\w+)/gi) || [];
          const accessedFields = fieldAccesses.map((fa: string) => fa.split('.').pop() || '');
          
          for (const af of accessedFields) {
            const isBoilerplate = ['map', 'filter', 'length', 'id', 'status', 'name'].includes(af.toLowerCase());
            if (!isBoilerplate && table.fields.length > 0) {
              const existsInTable = table.fields.some(f => f.name.toLowerCase() === af.toLowerCase());
              if (!existsInTable) {
                isMismatch = true;
                mismatchReason = `Field '${af}' referenced in payload is missing from Table schema.`;
                break;
              }
            }
          }
          
          connections.push({
            endpointPath: ep.path,
            method: ep.method,
            tableId: tableName,
            type,
            isMismatch,
            mismatchReason
          });
        }
      });
    });
    
    return connections;
  }, [apiEndpoints, dbSchema, files, useDemoDbSchema]);

  const orphanedTableIds = useMemo(() => {
    if (!showApiDbMapping) return new Set<string>();
    const referenced = new Set(apiDbConnections.map(c => c.tableId));
    const orphaned = new Set<string>();
    dbSchema.tables.forEach(t => {
      if (!referenced.has(t.id)) {
        orphaned.add(t.id);
      }
    });
    return orphaned;
  }, [showApiDbMapping, apiDbConnections, dbSchema.tables]);

  const tableMismatches = useMemo(() => {
    const mismatchesMap = new Map<string, string[]>();
    apiDbConnections.forEach(c => {
      if (c.isMismatch && c.mismatchReason) {
        if (!mismatchesMap.has(c.tableId)) {
          mismatchesMap.set(c.tableId, []);
        }
        mismatchesMap.get(c.tableId)!.push(c.mismatchReason);
      }
    });
    return mismatchesMap;
  }, [apiDbConnections]);

  const formatMarkdown = (text: string): string => {
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

    // Parse remaining block-level and inline markdown
    processedText = processedText
      // 2. Headings
      .replace(/^# (.*$)/gim, '<h2 style="color:var(--text-primary); font-weight:700; margin:22px 0 10px 0; border-bottom: 1px solid var(--panel-border); padding-bottom: 6px;">$1</h2>')
      .replace(/^## (.*$)/gim, '<h3 style="color:var(--text-primary); font-weight:600; margin:18px 0 8px 0; border-bottom: 1px solid var(--panel-border); padding-bottom: 4px;">$1</h3>')
      .replace(/^### (.*$)/gim, '<h4 style="color:var(--text-primary); font-weight:600; margin:16px 0 6px 0;">$1</h4>')
      .replace(/^#### (.*$)/gim, '<h5 style="color:var(--text-primary); font-weight:600; margin:12px 0 4px 0;">$1</h5>')
      // 3. Lists
      .replace(/^\s*[\-\*\+]\s+(.*$)/gim, '<li style="margin-left:14px; list-style-type:circle; margin-bottom:4px;">$1</li>')
      // 4. Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // 5. Code tags
      .replace(/\`(.*?)\`/g, '<code>$1</code>')
      // 6. GitHub Style Alerts
      .replace(/>\s*\[!WARNING\]\s*\n([\s\S]*?)(?=\n>|\n\n|$)/gim, `
        <div style="padding:12px 16px; margin: 12px 0; background:rgba(239,68,68,0.08); border-left:4px solid #f43f5e; border-radius:4px; color:#fda4af; font-size:0.8rem;">
          <div style="font-weight:600; margin-bottom:4px; display:flex; align-items:center; gap:6px;">⚠️ WARNING</div>
          $1
        </div>
      `)
      .replace(/>\s*\[!IMPORTANT\]\s*\n([\s\S]*?)(?=\n>|\n\n|$)/gim, `
        <div style="padding:12px 16px; margin: 12px 0; background:rgba(99,102,241,0.08); border-left:4px solid #6366f1; border-radius:4px; color:#c7d2fe; font-size:0.8rem;">
          <div style="font-weight:600; margin-bottom:4px; display:flex; align-items:center; gap:6px;">🚨 IMPORTANT</div>
          $1
        </div>
      `)
      .replace(/>\s*\[!TIP\]\s*\n([\s\S]*?)(?=\n>|\n\n|$)/gim, `
        <div style="padding:12px 16px; margin: 12px 0; background:rgba(16,185,129,0.08); border-left:4px solid #10b981; border-radius:4px; color:#a7f3d0; font-size:0.8rem;">
          <div style="font-weight:600; margin-bottom:4px; display:flex; align-items:center; gap:6px;">💡 TIP</div>
          $1
        </div>
      `)
      .replace(/>\s*\[!NOTE\]\s*\n([\s\S]*?)(?=\n>|\n\n|$)/gim, `
        <div style="padding:12px 16px; margin: 12px 0; background:rgba(255,255,255,0.03); border-left:4px solid #9ca3af; border-radius:4px; color:var(--text-secondary); font-size:0.8rem;">
          <div style="font-weight:600; margin-bottom:4px; display:flex; align-items:center; gap:6px;">📝 NOTE</div>
          $1
        </div>
      `)
      // Strip remaining blockquotes markers
      .replace(/^\s*>\s*/gm, '');

    // Parse file paths and convert them to interactive buttons (before restoring code blocks)
    const fileRegex = /\b(?:src|components|utils|pages)\/[a-zA-Z0-9_\-\/]+\.(?:tsx|ts|css|html|js|json)\b/gi;
    processedText = processedText.replace(fileRegex, (filePath) => {
      const fileName = filePath.split('/').pop() || filePath;
      return `<button class="clickable-file-tag" onclick="if(window.locateFileNode)window.locateFileNode('${filePath}')" title="Locate ${fileName} on Canvas">📄 ${fileName}</button>`;
    });

    // Restore code blocks
    codeBlocks.forEach((html, index) => {
      processedText = processedText.replace(`__CODE_BLOCK_PLACEHOLDER_${index}__`, html);
    });

    return processedText;
  };

  const handleRunDbAudit = async () => {
    setIsAuditingDb(true);
    setDbAuditError(null);
    try {
      const report = await auditDatabaseSchema(dbSchema, apiKey);
      setDbAuditReport(report);
      setShowDbAuditModal(true);
    } catch (err: any) {
      setDbAuditError(err.message || String(err));
      setShowDbAuditModal(true);
    } finally {
      setIsAuditingDb(false);
    }
  };

  const handleExportDbAuditPDF = () => {
    if (!dbAuditReport) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const formattedHtml = formatMarkdown(dbAuditReport);
      
      // Convert dark mode styles to printable high-contrast light mode styles
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
            <title>AI Database Schema Audit Report - CodeGraph</title>
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
            </style>
          </head>
          <body>
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

      // Show toast
      const toast = document.createElement('div');
      toast.style.position = 'fixed';
      toast.style.bottom = '20px';
      toast.style.left = '50%';
      toast.style.transform = 'translateX(-50%)';
      toast.style.background = 'var(--color-secondary)';
      toast.style.color = '#fff';
      toast.style.padding = '8px 16px';
      toast.style.borderRadius = '4px';
      toast.style.fontSize = '0.75rem';
      toast.style.zIndex = '9999999';
      toast.innerText = 'Opened Print PDF dialog!';
      document.body.appendChild(toast);
      setTimeout(() => document.body.removeChild(toast), 2000);
    }
  };

  useEffect(() => {
    if (dbAuditTrigger && dbAuditTrigger > 0) {
      handleRunDbAudit();
    }
  }, [dbAuditTrigger]);

  // PR/Branch comparison states
  const [baseBranch, setBaseBranch] = useState('main');
  const [headBranch, setHeadBranch] = useState('feature-branch');
  const [isComparing, setIsComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const handleCompareGithub = async () => {
    if (!repoName || repoName.includes('.zip') || !repoName.includes('/')) {
      setCompareError('Branch comparison is only supported for GitHub repositories.');
      return;
    }
    setCompareError(null);
    setIsComparing(true);
    try {
      const token = localStorage.getItem('gh_token') || '';
      const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3+json'
      };
      if (token) {
        headers['Authorization'] = `token ${token}`;
      }
      const res = await fetch(`https://api.github.com/repos/${repoName}/compare/${baseBranch}...${headBranch}`, { headers });
      if (!res.ok) {
        throw new Error(`GitHub API returned status ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      if (!data.files || !Array.isArray(data.files)) {
        throw new Error('Comparison response did not contain file list.');
      }
      const filesMap: Record<string, any> = {};
      data.files.forEach((f: any) => {
        const mappedStatus = f.status === 'removed' ? 'deleted' : f.status;
        filesMap[f.filename] = {
          status: mappedStatus,
          additions: f.additions || 0,
          deletions: f.deletions || 0,
          patch: f.patch || ''
        };
      });
      setDiffData({
        base: baseBranch,
        head: headBranch,
        files: filesMap
      });
    } catch (err: any) {
      setCompareError(err.message || 'Failed to compare branches.');
    } finally {
      setIsComparing(false);
    }
  };

  const handleSimulateCompare = () => {
    setCompareError(null);
    const nodesList = graphData.nodes.filter(n => !n.isNpm);
    if (nodesList.length === 0) {
      setCompareError('No valid files in this repository to perform simulated comparison.');
      return;
    }
    
    // Pick 1 or 2 files to modify
    const file1 = nodesList[0].id;
    const file2 = nodesList.length > 1 ? nodesList[Math.min(1, nodesList.length - 1)].id : null;
    
    // Get parent path and extensions for simulated added & deleted nodes
    const parentFolder = file1.substring(0, file1.lastIndexOf('/')) || 'src';
    const ext = file1.split('.').pop() || 'tsx';
    
    const addedFile = `${parentFolder}/AuthService.${ext}`;
    const deletedFile = `${parentFolder}/legacyHelper.${ext}`;
    
    const simulatedFiles: Record<string, any> = {
      [file1]: {
        status: 'modified',
        additions: 12,
        deletions: 4,
        patch: `@@ -8,8 +8,12 @@\n-  const oldConfig = fetchOldSettings();\n-  console.log("Loading deprecations...", oldConfig);\n+  const newConfig = fetchSecureSettings();\n+  console.log("Secure settings loaded successfully.");\n+  validateSettings(newConfig);`
      },
      [addedFile]: {
        status: 'added',
        additions: 42,
        deletions: 0,
        patch: `+ // Authenticated service router\n+ export function validateToken(token: string) {\n+   if (!token) throw new Error("Missing credentials");\n+   return jwt.verify(token, process.env.JWT_SECRET);\n+ }`
      },
      [deletedFile]: {
        status: 'deleted',
        additions: 0,
        deletions: 24,
        patch: `- // Deprecated utilities\n- export function runLegacySync() {\n-   console.warn("Legacy sync has been disabled");\n- }`
      }
    };
    
    if (file2) {
      simulatedFiles[file2] = {
        status: 'modified',
        additions: 8,
        deletions: 2,
        patch: `@@ -42,5 +42,11 @@\n-  return data.map(item => item.id);\n+  if (!data) return [];\n+  const validItems = data.filter(item => item && item.active);\n+  return validItems.map(item => item.id);`
      };
    }
    
    setDiffData({
      base: 'main',
      head: 'feature/auth-upgrade',
      files: simulatedFiles
    });
  };

  const traceSteps = useMemo(() => {
    if (!activeTraceNodeId || viewMode !== 'call') return [];
    
    const steps: { source: string; target: string }[] = [];
    const visited = new Set<string>([activeTraceNodeId]);
    const queue: string[] = [activeTraceNodeId];
    let depth = 0;
    
    while (queue.length > 0 && depth < 3) {
      const nextLevel: string[] = [];
      for (const curr of queue) {
        const outgoing = graphData.callLinks.filter(l => {
          const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
          return s === curr;
        });
        
        for (const link of outgoing) {
          const sId = typeof link.source === 'object' ? (link.source as any).id : link.source;
          const tId = typeof link.target === 'object' ? (link.target as any).id : link.target;
          
          if (!visited.has(tId)) {
            visited.add(tId);
            nextLevel.push(tId);
            steps.push({ source: sId, target: tId });
          }
        }
      }
      queue.push(...nextLevel);
      queue.splice(0, queue.length - nextLevel.length);
      depth++;
    }
    
    return steps;
  }, [activeTraceNodeId, graphData.callLinks, viewMode]);

  const umlChartCode = useMemo(() => {
    if (!activeTraceNodeId) return '';
    return generateSequenceDiagram(activeTraceNodeId, traceSteps);
  }, [activeTraceNodeId, traceSteps]);

  useEffect(() => {
    if (traceSteps.length === 0) {
      setCurrentTraceStep(0);
      return;
    }
    setCurrentTraceStep(0);
    const interval = setInterval(() => {
      setCurrentTraceStep(prev => (prev + 1) % traceSteps.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [traceSteps]);

  // Call trace simulation sonification
  const prevTraceNodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeTraceNodeId && !prevTraceNodeRef.current) {
      audioSonifier.playSimulationStart();
    } else if (!activeTraceNodeId && prevTraceNodeRef.current) {
      audioSonifier.playSimulationStop();
    }
    prevTraceNodeRef.current = activeTraceNodeId;
  }, [activeTraceNodeId]);

  useEffect(() => {
    if (activeTraceNodeId && traceSteps.length > 0) {
      const activeStep = traceSteps[currentTraceStep];
      if (activeStep) {
        audioSonifier.playTraceStep(
          currentTraceStep,
          traceSteps.length,
          activeStep.source,
          activeStep.target
        );
      }
    }
  }, [currentTraceStep, activeTraceNodeId, traceSteps]);

  const handleMinimapClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = minimapCanvasRef.current;
    if (!canvas || !svgRef.current || !containerRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    const { minX, maxX, minY, maxY } = boundsRef.current;
    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;

    if (boundsWidth <= 0 || boundsHeight <= 0) return;

    const targetNodeX = minX + (clickX / canvasWidth) * boundsWidth;
    const targetNodeY = minY + (clickY / canvasHeight) * boundsHeight;

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 500;

    if (zoomBehaviorRef.current) {
      const transform = d3.zoomTransform(svgRef.current);
      const targetTransform = d3.zoomIdentity
        .translate(width / 2 - targetNodeX * transform.k, height / 2 - targetNodeY * transform.k)
        .scale(transform.k);

      d3.select(svgRef.current)
        .transition()
        .duration(450)
        .ease(d3.easeCubicOut)
        .call(zoomBehaviorRef.current.transform, targetTransform);
    }
  };

  // Pre-calculate node in-degree counts for importance-based sizing
  const inDegreeMap = useMemo(() => {
    const map = new Map<string, number>();
    
    graphData.nodes.forEach(n => map.set(n.id, 0));
    if (graphData.npmNodes) {
      graphData.npmNodes.forEach(n => map.set(n.id, 0));
    }
    if (graphData.callNodes) {
      graphData.callNodes.forEach(n => map.set(n.id, 0));
    }
    if (graphData.classNodes) {
      graphData.classNodes.forEach(n => map.set(n.id, 0));
    }
    
    const links = [
      ...graphData.links,
      ...(graphData.npmLinks || []),
      ...(graphData.callLinks || []),
      ...(graphData.classLinks || [])
    ];
    
    links.forEach(l => {
      const targetId = typeof l.target === 'object' ? (l.target as any).id : l.target;
      if (map.has(targetId)) {
        map.set(targetId, map.get(targetId)! + 1);
      }
    });
    
    return map;
  }, [graphData]);

  // Pre-calculate cyclic dependency links for quick lookup
  const cyclicLinks = useMemo(() => {
    const set = new Set<string>();
    if (graphData.cycles) {
      graphData.cycles.forEach((cycle) => {
        for (let i = 0; i < cycle.length - 1; i++) {
          set.add(`${cycle[i]}->${cycle[i + 1]}`);
        }
      });
    }
    return set;
  }, [graphData.cycles]);

  // Compute hierarchical levels for Component Tree (viewMode === 'hierarchy')
  const hierarchicalLevels = useMemo(() => {
    if (viewMode !== 'hierarchy') return new Map<string, number>();

    const nodes = graphData.classNodes;
    const links = graphData.classLinks;

    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    nodes.forEach((n) => {
      adj.set(n.id, []);
      inDegree.set(n.id, 0);
    });

    links.forEach((l) => {
      const source = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const target = typeof l.target === 'object' ? (l.target as any).id : l.target;

      if (adj.has(source)) {
        adj.get(source)!.push(target);
      }
      if (inDegree.has(target)) {
        inDegree.set(target, inDegree.get(target)! + 1);
      }
    });

    const levels = new Map<string, number>();
    const queue: string[] = [];

    // Roots are nodes with 0 in-degree
    nodes.forEach((n) => {
      if ((inDegree.get(n.id) || 0) === 0) {
        queue.push(n.id);
        levels.set(n.id, 0);
      }
    });

    if (queue.length === 0 && nodes.length > 0) {
      queue.push(nodes[0].id);
      levels.set(nodes[0].id, 0);
    }

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currLevel = levels.get(curr) || 0;

      const neighbors = adj.get(curr) || [];
      neighbors.forEach((neighbor) => {
        if (!levels.has(neighbor)) {
          levels.set(neighbor, currLevel + 1);
          queue.push(neighbor);
        }
      });
    }

    return levels;
  }, [graphData.classNodes, graphData.classLinks, viewMode]);

  // Colors for languages / types
  const isFunctionUnused = (d: any) => {
    if (viewMode !== 'call') return false;
    const name = d.name || '';
    const isEntry = name.startsWith('use') || name.startsWith('App') || name.startsWith('Main') || name === 'main' || name === 'index' || /^[A-Z]/.test(name);
    return d.callCount === 0 && !isEntry;
  };

  const applyLevelOfDetail = (k: number) => {
    if (!svgRef.current) return;
    const svgElement = d3.select(svgRef.current);
    svgElement.selectAll('.node-element').each(function(d: any) {
      if (!d) return;
      const node = d3.select(this);
      const label = node.select('.node-label');
      
      let shouldShowLabel = true;
      if (viewMode === 'call') {
        if (k < 0.6) {
          shouldShowLabel = d.id === selectedNode || d.id === hoveredNode || d.callCount >= 4;
        } else if (k < 1.1) {
          shouldShowLabel = !isFunctionUnused(d) || d.id === selectedNode || d.id === hoveredNode;
        }
      } else {
        if (k < 0.6) {
          shouldShowLabel = d.isFolder || d.id === selectedNode || d.id === hoveredNode || (d.size && d.size > 20000);
        }
      }
      label.style('display', shouldShowLabel ? 'block' : 'none');
    });
  };

  const getColorForNode = (d: any) => {
    if (viewMode === 'call') {
      if (isFunctionUnused(d)) return '#6b7280'; // Unused: Gray
      if (d.callCount >= 8) return '#ef4444'; // Hot (Red)
      if (d.callCount >= 4) return '#f97316'; // Warm (Orange)
      if (d.callCount >= 2) return '#eab308'; // Lukewarm (Yellow)
      return '#3b82f6'; // Cold (Blue)
    }
    
    if (viewMode === 'hierarchy') {
      const depth = d.treeDepth || 0;
      const depthColors = [
        '#6366f1', // Indigo (Root)
        '#00f2fe', // Cyan (Level 1)
        '#10b981', // Emerald (Level 2)
        '#f59e0b', // Amber (Level 3)
        '#ec4899', // Pink (Level 4)
        '#a855f7', // Purple (Level 5+)
      ];
      return depthColors[depth % depthColors.length];
    }

    // Folders
    if (d.isFolder) {
      return 'var(--color-warning)';
    }

    // NPM packages
    if (d.isNpm || d.language === 'npm') {
      return 'var(--color-primary-glow)';
    }

    const lang = d.language?.toLowerCase() || '';
    switch (lang) {
      case 'typescript': return 'var(--color-primary)';
      case 'javascript': return 'var(--color-secondary)';
      case 'python': return 'var(--color-primary-glow)';
      case 'go': return 'var(--color-secondary-glow)';
      case 'rust': return 'var(--color-alert)';
      case 'css': return 'var(--text-secondary)';
      case 'html': return 'var(--color-warning)';
      case 'json': return 'var(--text-muted)';
      default: return 'var(--color-primary)';
    }
  };

  const shortestPath = useMemo(() => {
    if (!pathSource || !pathTarget || viewMode !== 'dependency') return null;
    
    const activeNodes = showNpmPackages ? [...graphData.nodes, ...(graphData.npmNodes || [])] : graphData.nodes;
    const activeLinks = showNpmPackages ? [...graphData.links, ...(graphData.npmLinks || [])] : graphData.links;
    
    const adj = new Map<string, string[]>();
    activeNodes.forEach(n => adj.set(n.id, []));
    activeLinks.forEach(l => {
      const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
      if (adj.has(s)) adj.get(s)!.push(t);
    });
    
    const queue: string[][] = [[pathSource]];
    const visited = new Set<string>([pathSource]);
    
    while (queue.length > 0) {
      const path = queue.shift()!;
      const lastNode = path[path.length - 1];
      
      if (lastNode === pathTarget) return path;
      
      const neighbors = adj.get(lastNode) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
    }
    return null;
  }, [pathSource, pathTarget, graphData, viewMode, showNpmPackages]);

  // Generate Git History (real or simulated) from files
  const gitHistory = useMemo(() => {
    if (commits && commits.length > 0) {
      return mapFilesToRealCommits(files || [], commits);
    }
    return generateGitHistory(files || []);
  }, [files, commits]);

  // Compute files active at the current evolution step
  const activeEvolutionFiles = useMemo(() => {
    if (!isEvolutionMode || gitHistory.length === 0) return null;
    const active = new Set<string>();
    const step = Math.min(Math.max(0, currentEvolutionStep), gitHistory.length - 1);
    for (let i = 0; i <= step; i++) {
      const commit = gitHistory[i];
      if (commit.filesAdded) commit.filesAdded.forEach(f => active.add(f));
      if (commit.filesDeleted) commit.filesDeleted.forEach(f => active.delete(f));
    }
    return active;
  }, [isEvolutionMode, gitHistory, currentEvolutionStep]);

  // Automatic Replay Player Interval Runner
  useEffect(() => {
    if (!isEvolutionMode || !isReplaying || gitHistory.length === 0) return;

    const interval = setInterval(() => {
      const next = currentEvolutionStep + 1;
      if (next >= gitHistory.length) {
        setIsReplaying(false);
      } else {
        setCurrentEvolutionStep(next);
      }
    }, replaySpeed);

    return () => clearInterval(interval);
  }, [isEvolutionMode, isReplaying, gitHistory, replaySpeed, currentEvolutionStep, setCurrentEvolutionStep]);

  const getHeatmapColor = (d: any) => {
    if (d.isNpm) return 'var(--color-primary-glow)';
    
    const colorScale = d3.scaleLinear<string>()
      .domain([0, 0.5, 1])
      .range(['#3b82f6', '#f59e0b', '#ef4444']);
      
    if (heatmapMode === 'churn') {
      const churn = d.churn || 1;
      const ratio = Math.min(Math.max((churn - 5) / 50, 0), 1);
      return colorScale(ratio);
    } else if (heatmapMode === 'complexity') {
      const complexity = d.complexity || 1;
      const ratio = Math.min(Math.max(Math.log10(complexity) / 3, 0), 1);
      return colorScale(ratio);
    }
    return getColorForNode(d);
  };

  const allFolders = useMemo(() => {
    const folders = new Set<string>();
    graphData.nodes.forEach(n => {
      if (n.folder) folders.add(n.folder);
    });
    return Array.from(folders).sort();
  }, [graphData.nodes]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svgElement = d3.select(svgRef.current);
    svgElement.selectAll('*').remove();

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 500;

    let nodes: any[] = [];
    let links: any[] = [];

    if (viewMode === 'dependency' || viewMode === 'cluster') {
      let activeNodes: any[] = [];
      let activeLinks: any[] = [];

      if (showNpmPackages && viewMode === 'dependency') {
        activeNodes = [
          ...graphData.nodes.map((n) => {
            const cached = nodePositionsRef.current.get(n.id);
            return {
              ...n,
              x: cached ? cached.x : undefined,
              y: cached ? cached.y : undefined
            };
          }),
          ...(graphData.npmNodes || []).map((n) => {
            const cached = nodePositionsRef.current.get(n.id);
            return {
              ...n,
              x: cached ? cached.x : undefined,
              y: cached ? cached.y : undefined
            };
          })
        ];
        activeLinks = [...graphData.links.map((l) => ({ ...l })), ...(graphData.npmLinks || []).map((l) => ({ ...l }))];
      } else {
        activeNodes = graphData.nodes.map((n) => {
          const cached = nodePositionsRef.current.get(n.id);
          return {
            ...n,
            x: cached ? cached.x : undefined,
            y: cached ? cached.y : undefined
          };
        });
        activeLinks = graphData.links.map((l) => ({ ...l }));
      }

      if (isEvolutionMode && activeEvolutionFiles) {
        activeNodes = activeNodes.filter(n => n.isNpm || activeEvolutionFiles.has(n.id));
        activeLinks = activeLinks.filter(l => {
          const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
          const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
          const sActive = activeEvolutionFiles.has(s) || activeNodes.some(n => n.id === s && n.isNpm);
          const tActive = activeEvolutionFiles.has(t) || activeNodes.some(n => n.id === t && n.isNpm);
          return sActive && tActive;
        });
      }

      if (diffData) {
        Object.entries(diffData.files).forEach(([filePath, fileInfo]: [string, any]) => {
          if (fileInfo.status === 'deleted') {
            if (!activeNodes.some(n => n.id === filePath)) {
              activeNodes.push({
                id: filePath,
                name: filePath.split('/').pop() || '',
                path: filePath,
                isFolder: false,
                size: 0,
                language: 'text',
                incoming: [],
                outgoing: [],
                folder: filePath.substring(0, filePath.lastIndexOf('/')) || '',
                isDeleted: true,
                status: 'deleted'
              });
            }
          }
        });
      }

      // Apply Dynamic Filters
      if (filterLanguage !== 'all') {
        activeNodes = activeNodes.filter(n => n.isFolder || n.isNpm || (n.language && n.language.toLowerCase() === filterLanguage.toLowerCase()));
      }
      if (filterMinLoc > 0) {
        activeNodes = activeNodes.filter(n => {
          if (n.isFolder || n.isNpm) return true;
          const loc = n.complexity !== undefined ? n.complexity : (n.size ? Math.ceil(n.size / 40) : 0);
          return loc >= filterMinLoc;
        });
      }
      if (filterFolderPath.trim() !== '') {
        const cleanPath = filterFolderPath.trim().toLowerCase().replace(/\\/g, '/');
        activeNodes = activeNodes.filter(n => 
          n.isNpm || 
          n.id.toLowerCase().replace(/\\/g, '/').includes(cleanPath) || 
          (n.folder && n.folder.toLowerCase().replace(/\\/g, '/').includes(cleanPath))
        );
      }

      // Cleanup dangling links
      const activeNodeIds = new Set(activeNodes.map(n => n.id));
      activeLinks = activeLinks.filter(l => {
        const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
        const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
        return activeNodeIds.has(s) && activeNodeIds.has(t);
      });

      const getCollapsedAncestor = (nodeFolder: string): string | null => {
        if (!nodeFolder) return null;
        const sortedCollapsed = Array.from(collapsedFolders).sort((a, b) => a.length - b.length);
        for (const folder of sortedCollapsed) {
          if (nodeFolder === folder || nodeFolder.startsWith(folder + '/')) {
            return folder;
          }
        }
        return null;
      };

      const folderCoupling = new Map<string, number>();
      activeLinks.forEach(link => {
        const sId = typeof link.source === 'object' ? link.source.id : link.source;
        const tId = typeof link.target === 'object' ? link.target.id : link.target;
        const sNode = activeNodes.find(n => n.id === sId);
        const tNode = activeNodes.find(n => n.id === tId);
        if (sNode && tNode && sNode.folder && tNode.folder && sNode.folder !== tNode.folder) {
          const key = `${sNode.folder}->${tNode.folder}`;
          folderCoupling.set(key, (folderCoupling.get(key) || 0) + 1);
        }
      });

      const collapsedFolderNodes = new Map<string, any>();
      activeNodes.forEach(node => {
        const ancestor = getCollapsedAncestor(node.folder);
        if (ancestor) {
          if (!collapsedFolderNodes.has(ancestor)) {
            collapsedFolderNodes.set(ancestor, {
              id: `folder:${ancestor}`,
              name: ancestor.split('/').pop() || ancestor,
              folder: ancestor,
              isFolder: true,
              size: 0,
              language: 'folder',
              churn: 0,
              complexity: 0,
              fileCount: 0,
              x: 0,
              y: 0,
              sumX: 0,
              sumY: 0
            });
          }
          const fNode = collapsedFolderNodes.get(ancestor)!;
          fNode.size += node.size || 0;
          fNode.churn = Math.max(fNode.churn, node.churn || 0);
          fNode.complexity += node.complexity || 0;
          fNode.fileCount += 1;
          if (node.x !== undefined) {
            fNode.sumX += node.x;
            fNode.sumY += node.y;
            fNode.x = fNode.sumX / fNode.fileCount;
            fNode.y = fNode.sumY / fNode.fileCount;
          }
        }
      });

      const visibleFileNodes = activeNodes.filter(n => !getCollapsedAncestor(n.folder));
      const visibleFolderNodes = Array.from(collapsedFolderNodes.values());
      visibleFolderNodes.forEach(fNode => {
        delete fNode.sumX;
        delete fNode.sumY;
      });
      nodes = [...visibleFileNodes, ...visibleFolderNodes];

      const aggregatedLinks = new Map<string, any>();
      activeLinks.forEach(link => {
        const sId = typeof link.source === 'object' ? link.source.id : link.source;
        const tId = typeof link.target === 'object' ? link.target.id : link.target;

        const sNode = activeNodes.find(n => n.id === sId);
        const tNode = activeNodes.find(n => n.id === tId);
        if (!sNode || !tNode) return;

        const sAncestor = getCollapsedAncestor(sNode.folder);
        const tAncestor = getCollapsedAncestor(tNode.folder);

        const finalSourceId = sAncestor ? `folder:${sAncestor}` : sId;
        const finalTargetId = tAncestor ? `folder:${tAncestor}` : tId;

        if (finalSourceId === finalTargetId) return;

        const key = `${finalSourceId}->${finalTargetId}`;
        if (!aggregatedLinks.has(key)) {
          aggregatedLinks.set(key, {
            source: finalSourceId,
            target: finalTargetId,
            weight: 0,
            isAggregated: !!(sAncestor || tAncestor),
            isCrossFolder: false,
            coupling: 1
          });
        }
        aggregatedLinks.get(key)!.weight += 1;
      });

      aggregatedLinks.forEach(link => {
        if (!link.isAggregated) {
          const sNode = nodes.find(n => n.id === link.source);
          const tNode = nodes.find(n => n.id === link.target);
          if (sNode && tNode && sNode.folder && tNode.folder && sNode.folder !== tNode.folder) {
            link.isCrossFolder = true;
            link.coupling = folderCoupling.get(`${sNode.folder}->${tNode.folder}`) || 1;
          }
        }
      });

      links = Array.from(aggregatedLinks.values());
    } else if (viewMode === 'call') {
      let activeNodes = graphData.callNodes.map((n) => {
        const cached = nodePositionsRef.current.get(n.id);
        return {
          ...n,
          x: cached ? cached.x : undefined,
          y: cached ? cached.y : undefined
        };
      });
      let activeLinks = graphData.callLinks.map((l) => ({ ...l }));

      if (filterFolderPath.trim() !== '') {
        const cleanPath = filterFolderPath.trim().toLowerCase();
        activeNodes = activeNodes.filter(n => n.file && n.file.toLowerCase().includes(cleanPath));
        
        // Clean links
        const activeNodeIds = new Set(activeNodes.map(n => n.id));
        activeLinks = activeLinks.filter(l => {
          const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
          const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
          return activeNodeIds.has(s) && activeNodeIds.has(t);
        });
      }

      if (isEvolutionMode && activeEvolutionFiles) {
        activeNodes = activeNodes.filter(n => activeEvolutionFiles.has(n.file));
        activeLinks = activeLinks.filter(l => {
          const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
          const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
          const sActive = activeNodes.some(n => n.id === s);
          const tActive = activeNodes.some(n => n.id === t);
          return sActive && tActive;
        });
      }

      // If a depth filter is active and a node is selected, prune the graph
      if (depthFilter !== -1 && selectedNode) {
        const startNode = activeNodes.find(n => n.id === selectedNode);
        if (startNode) {
          const visited = new Set<string>([selectedNode]);
          const distance = new Map<string, number>([[selectedNode, 0]]);
          const queue: string[] = [selectedNode];

          // Build adjacency list for both directions (caller and callee)
          const adj = new Map<string, string[]>();
          activeNodes.forEach(n => adj.set(n.id, []));
          activeLinks.forEach(l => {
            const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
            const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
            if (adj.has(s)) adj.get(s)!.push(t);
            if (adj.has(t)) adj.get(t)!.push(s); // bidirectional search for context
          });

          while (queue.length > 0) {
            const curr = queue.shift()!;
            const dist = distance.get(curr) || 0;
            if (dist < depthFilter) {
              const neighbors = adj.get(curr) || [];
              for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                  visited.add(neighbor);
                  distance.set(neighbor, dist + 1);
                  queue.push(neighbor);
                }
              }
            }
          }

          // Filter nodes and links
          activeNodes = activeNodes.filter(n => visited.has(n.id));
          activeLinks = activeLinks.filter(l => {
            const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
            const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
            return visited.has(s) && visited.has(t);
          });
        }
      }

      nodes = activeNodes;
      links = activeLinks;
    } else if (viewMode === 'hierarchy') {
      let activeNodes = graphData.classNodes.map((n) => {
        const cached = nodePositionsRef.current.get(n.id);
        return {
          ...n,
          x: cached ? cached.x : undefined,
          y: cached ? cached.y : undefined
        };
      });
      let activeLinks = graphData.classLinks.map((l) => ({ ...l }));

      if (filterFolderPath.trim() !== '') {
        const cleanPath = filterFolderPath.trim().toLowerCase();
        activeNodes = activeNodes.filter(n => n.file && n.file.toLowerCase().includes(cleanPath));
        
        // Clean links
        const activeNodeIds = new Set(activeNodes.map(n => n.id));
        activeLinks = activeLinks.filter(l => {
          const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
          const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
          return activeNodeIds.has(s) && activeNodeIds.has(t);
        });
      }

      if (isEvolutionMode && activeEvolutionFiles) {
        activeNodes = activeNodes.filter(n => activeEvolutionFiles.has(n.id) || activeEvolutionFiles.has(n.file || ''));
        activeLinks = activeLinks.filter(l => {
          const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
          const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
          return activeNodes.some(n => n.id === s) && activeNodes.some(n => n.id === t);
        });
      }
      nodes = activeNodes;
      links = activeLinks;
    } else if (viewMode === 'dbSchema') {
      let activeNodes = dbSchema.tables.map((table) => {
        const cached = nodePositionsRef.current.get(table.id);
        const cardHeight = 60 + table.fields.length * 24;
        return {
          id: table.id,
          name: table.id,
          sourceFile: table.sourceFile,
          fields: table.fields,
          width: 260,
          height: cardHeight,
          x: cached ? cached.x : undefined,
          y: cached ? cached.y : undefined
        };
      });

      let activeLinks = dbSchema.relationships.map((rel) => ({
        id: rel.id,
        source: rel.source,
        target: rel.target,
        sourceField: rel.sourceField,
        targetField: rel.targetField
      }));

      if (filterFolderPath.trim() !== '') {
        const cleanPath = filterFolderPath.trim().toLowerCase();
        activeNodes = activeNodes.filter(n => n.id.toLowerCase().includes(cleanPath));
        
        const activeNodeIds = new Set(activeNodes.map(n => n.id));
        activeLinks = activeLinks.filter(l => {
          const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
          const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
          return activeNodeIds.has(s) && activeNodeIds.has(t);
        });
      }

      if (showApiDbMapping) {
        apiEndpoints.forEach((ep) => {
          const apiNodeId = `api:${ep.method}:${ep.path}`;
          const cached = nodePositionsRef.current.get(apiNodeId);
          activeNodes.push({
            id: apiNodeId,
            name: `${ep.method} ${ep.path}`,
            nodeType: 'api',
            method: ep.method,
            path: ep.path,
            description: ep.description || '',
            width: 200,
            height: 40,
            x: cached ? cached.x : undefined,
            y: cached ? cached.y : undefined
          } as any);
        });

        apiDbConnections.forEach((conn) => {
          const apiNodeId = `api:${conn.method}:${conn.endpointPath}`;
          const srcExists = activeNodes.some(n => n.id === apiNodeId);
          const tgtExists = activeNodes.some(n => n.id === conn.tableId);
          
          if (srcExists && tgtExists) {
            activeLinks.push({
              id: `link:${apiNodeId}->${conn.tableId}`,
              source: apiNodeId,
              target: conn.tableId,
              isApiConnection: true,
              connectionType: conn.type,
              isMismatch: conn.isMismatch,
              mismatchReason: conn.mismatchReason
            } as any);
          }
        });
      }

      nodes = activeNodes;
      links = activeLinks;
    }

    activeNodesRef.current = nodes;
    activeLinksRef.current = links;

    if (nodes.length === 0) {
      if (viewMode === 'dbSchema') {
        return;
      }
      const g = svgElement.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--text-muted)')
        .attr('font-size', '14px')
        .text('No matching elements found in this view mode.');
      return;
    }    const drawMinimap = () => {
      const canvas = minimapCanvasRef.current;
      if (!canvas || !svgRef.current) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Radar sweeps
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(canvasWidth / 2, canvasHeight / 2, 20, 0, 2 * Math.PI);
      ctx.arc(canvasWidth / 2, canvasHeight / 2, 40, 0, 2 * Math.PI);
      ctx.stroke();

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      nodes.forEach((n: any) => {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      });

      if (minX === Infinity) { minX = -100; maxX = 100; minY = -100; maxY = 100; }
      
      const padding = 50;
      minX -= padding;
      maxX += padding;
      minY -= padding;
      maxY += padding;

      const boundsWidth = maxX - minX;
      const boundsHeight = maxY - minY;

      boundsRef.current = { minX, maxX, minY, maxY };

      const toCanvasX = (x: number) => ((x - minX) / boundsWidth) * canvasWidth;
      const toCanvasY = (y: number) => ((y - minY) / boundsHeight) * canvasHeight;

      // 1. Grid Density Mapping
      const gridCols = 8;
      const gridRows = 8;
      const grid = Array(gridRows).fill(0).map(() => Array(gridCols).fill(0));
      
      nodes.forEach((n: any) => {
        if (typeof n.x === 'number' && typeof n.y === 'number') {
          const cx = toCanvasX(n.x);
          const cy = toCanvasY(n.y);
          const col = Math.max(0, Math.min(gridCols - 1, Math.floor((cx / canvasWidth) * gridCols)));
          const row = Math.max(0, Math.min(gridRows - 1, Math.floor((cy / canvasHeight) * gridRows)));
          grid[row][col]++;
        }
      });

      let maxDensity = 1;
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          if (grid[r][c] > maxDensity) maxDensity = grid[r][c];
        }
      }

      // 2. Draw Density Heat Gradients
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          const count = grid[r][c];
          if (count > 0) {
            const centerX = ((c + 0.5) / gridCols) * canvasWidth;
            const centerY = ((r + 0.5) / gridRows) * canvasHeight;
            const intensity = count / maxDensity;
            const radius = Math.min(canvasWidth / gridCols, canvasHeight / gridRows) * 1.5;

            const gradient = ctx.createRadialGradient(centerX, centerY, 2, centerX, centerY, radius);
            gradient.addColorStop(0, `rgba(0, 242, 254, ${0.22 * intensity})`);
            gradient.addColorStop(0.5, `rgba(99, 102, 241, ${0.1 * intensity})`);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }

      // 3. Draw Nodes
      nodes.forEach((n: any) => {
        const cx = toCanvasX(n.x);
        const cy = toCanvasY(n.y);
        const isActive = selectedNode === n.id || hoveredNode === n.id;
        ctx.fillStyle = isActive ? 'var(--color-secondary)' : 'var(--color-primary)';
        ctx.beginPath();
        ctx.arc(cx, cy, isActive ? 2.5 : 1.5, 0, 2 * Math.PI);
        ctx.fill();
      });

      const transform = d3.zoomTransform(svgRef.current);
      const vpLeft = (0 - transform.x) / transform.k;
      const vpTop = (0 - transform.y) / transform.k;
      const vpRight = (width - transform.x) / transform.k;
      const vpBottom = (height - transform.y) / transform.k;

      const rx = toCanvasX(vpLeft);
      const ry = toCanvasY(vpTop);
      const rw = toCanvasX(vpRight) - rx;
      const rh = toCanvasY(vpBottom) - ry;

      ctx.strokeStyle = 'var(--color-secondary)';
      ctx.lineWidth = 1.2;
      ctx.fillStyle = 'rgba(0, 242, 254, 0.05)';
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.fill();
      ctx.stroke();
    };

    drawMinimapRef.current = drawMinimap;

    const mainGroup = svgElement.append('g').attr('class', 'main-container');

    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => {
        mainGroup.attr('transform', event.transform);
        applyLevelOfDetail(event.transform.k);
        drawMinimap();
      });

    zoomBehaviorRef.current = zoomBehavior;

    svgElement.call(zoomBehavior).on('dblclick.zoom', null);
    svgElement.call(zoomBehavior.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8));
    applyLevelOfDetail(0.8);

    svgElement.on('mousemove', (event) => {
      if (onLocalCursorMove && mainGroup.node()) {
        const [mx, my] = d3.pointer(event, mainGroup.node());
        if (!isNaN(mx) && !isNaN(my)) {
          onLocalCursorMove(mx, my);
        }
      }
    });

    svgElement.on('mouseleave', () => {
      if (onLocalCursorMove) {
        onLocalCursorMove(null, null);
      }
    });

    const simulation = d3.forceSimulation<any>(nodes)
      .force('link', d3.forceLink<any, any>(links).id((d) => d.id).distance(() => {
        if (viewMode === 'dbSchema') return showApiDbMapping ? 320 : 240;
        if (viewMode === 'cluster') return 65;
        if (viewMode === 'hierarchy') return 70;
        return 100;
      }))
      .force('charge', d3.forceManyBody().strength(() => {
        if (viewMode === 'dbSchema') return showApiDbMapping ? -400 : -300;
        if (viewMode === 'cluster') return -120;
        if (viewMode === 'hierarchy') return -160;
        return -220;
      }))
      .force('collision', d3.forceCollide<any>().radius((d) => {
        if (viewMode === 'dbSchema') return Math.max(d.width || 260, d.height || 150) / 2 + 40;
        if (d.isFolder) return 24;
        if (viewMode === 'call') return 12 + Math.min(d.callCount * 1.5, 20);
        if (viewMode === 'dependency') {
          const inDeg = inDegreeMap.get(d.id) || 0;
          return 12 + Math.min(inDeg * 2.0, 24);
        }
        const baseRad = viewMode === 'hierarchy' ? 14 : 15;
        return baseRad + Math.sqrt(d.size || 0) * 0.05 + 5;
      }).strength(nodes.length > 300 ? 0.45 : 0.7))
      .force('center', d3.forceCenter(0, 0));

    if (viewMode === 'dbSchema') {
      if (showApiDbMapping) {
        simulation.force('x', d3.forceX().x((d: any) => {
          return d.nodeType === 'api' ? -350 : 250;
        }).strength(1.2));
        simulation.force('y', d3.forceY().y(0).strength(0.1));
      } else {
        simulation.force('x', d3.forceX().x(0).strength(0.1));
        simulation.force('y', d3.forceY().y(0).strength(0.1));
      }
    }

    if (viewMode === 'hierarchy') {
      // Build parent-child tree hierarchy
      const childrenMap = new Map<string, string[]>();
      nodes.forEach(n => childrenMap.set(n.id, []));
      links.forEach(l => {
        const parent = typeof l.source === 'object' ? l.source.id : l.source;
        const child = typeof l.target === 'object' ? l.target.id : l.target;
        if (childrenMap.has(parent)) {
          childrenMap.get(parent)!.push(child);
        }
      });

      // Find nodes that have no parents (roots)
      const childSet = new Set<string>();
      links.forEach(l => {
        const child = typeof l.target === 'object' ? l.target.id : l.target;
        childSet.add(child);
      });
      const roots = nodes.filter(n => !childSet.has(n.id));

      // Build tree hierarchy
      interface HierarchicalNode {
        id: string;
        name: string;
        data: any;
        children?: HierarchicalNode[];
      }

      const buildHierarchy = (nodeId: string, visited = new Set<string>()): HierarchicalNode => {
        visited.add(nodeId);
        const nodeData = nodes.find(n => n.id === nodeId);
        const childrenIds = childrenMap.get(nodeId) || [];
        const children: HierarchicalNode[] = [];
        childrenIds.forEach(cId => {
          if (!visited.has(cId)) {
            children.push(buildHierarchy(cId, visited));
          }
        });
        return {
          id: nodeId,
          name: nodeData?.name || nodeId,
          data: nodeData,
          children: children.length > 0 ? children : undefined
        };
      };

      let rootHierarchy: HierarchicalNode;
      if (roots.length === 1) {
        rootHierarchy = buildHierarchy(roots[0].id);
      } else if (roots.length > 1) {
        rootHierarchy = {
          id: 'virtual-root',
          name: 'Virtual Root',
          data: { id: 'virtual-root', name: 'Virtual Root', type: 'component', isVirtual: true },
          children: roots.map(r => buildHierarchy(r.id))
        };
      } else if (nodes.length > 0) {
        rootHierarchy = buildHierarchy(nodes[0].id);
      } else {
        rootHierarchy = { id: 'empty', name: 'Empty', data: null };
      }

      const rootNode = d3.hierarchy<HierarchicalNode>(rootHierarchy);
      const treeLayout = d3.tree<HierarchicalNode>();

      if (treeLayoutStyle === 'radial') {
        treeLayout.size([2 * Math.PI, 240]); 
        treeLayout(rootNode);

        rootNode.descendants().forEach(d => {
          const angle = d.x;
          const radius = d.y;
          if (angle !== undefined && radius !== undefined) {
            const targetNode = nodes.find(n => n.id === d.data.id);
            if (targetNode) {
              targetNode.x = radius * Math.cos(angle - Math.PI / 2);
              targetNode.y = radius * Math.sin(angle - Math.PI / 2);
              targetNode.treeDepth = d.depth;
              targetNode.fx = targetNode.x;
              targetNode.fy = targetNode.y;
            }
          }
        });
      } else {
        treeLayout.nodeSize([160, 150]);
        treeLayout(rootNode);

        rootNode.descendants().forEach(d => {
          if (d.x !== undefined && d.y !== undefined) {
            const targetNode = nodes.find(n => n.id === d.data.id);
            if (targetNode) {
              const yOffset = rootHierarchy.id === 'virtual-root' ? -150 : 0;
              targetNode.x = d.x;
              targetNode.y = d.y + yOffset - 150;
              targetNode.treeDepth = d.depth;
              targetNode.fx = targetNode.x;
              targetNode.fy = targetNode.y;
            }
          }
        });
      }

      // Ensure any virtual-root node coordinates are handled if referenced by links
      const virtualNode = nodes.find(n => n.id === 'virtual-root');
      if (virtualNode) {
        virtualNode.x = 0;
        virtualNode.y = -150;
        virtualNode.treeDepth = 0;
        virtualNode.fx = 0;
        virtualNode.fy = -150;
      }
    }

    if (viewMode === 'cluster') {
      const folderGroups = Array.from(new Set(nodes.map((n) => n.folder)));
      const clusterCenters = new Map<string, { x: number; y: number }>();
      folderGroups.forEach((folder, idx) => {
        const angle = (idx / folderGroups.length) * 2 * Math.PI;
        const radius = Math.min(width, height) * 0.35;
        clusterCenters.set(folder, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
      });
      simulation.force('folderGrouping', (alpha) => {
        nodes.forEach((node) => {
          const center = clusterCenters.get(node.folder);
          if (center) {
            node.vx += (center.x - node.x) * 0.08 * alpha;
            node.vy += (center.y - node.y) * 0.08 * alpha;
          }
        });
      });
    }

    if (viewMode === 'call') {
      const fileGroups = Array.from(new Set(nodes.map((n) => n.file)));
      const fileCenters = new Map<string, { x: number; y: number }>();
      fileGroups.forEach((file, idx) => {
        const angle = (idx / fileGroups.length) * 2 * Math.PI;
        const radius = Math.min(width, height) * 0.35;
        fileCenters.set(file, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
      });
      simulation.force('fileGrouping', (alpha) => {
        nodes.forEach((node) => {
          const center = fileCenters.get(node.file);
          if (center) {
            node.vx += (center.x - node.x) * 0.06 * alpha;
            node.vy += (center.y - node.y) * 0.06 * alpha;
          }
        });
      });
    }

    svgElement.append('defs').selectAll('marker')
      .data([
        { id: 'arrow-normal', color: 'rgba(255, 255, 255, 0.15)' },
        { id: 'arrow-highlight', color: 'var(--color-primary)' },
        { id: 'arrow-highlight-incoming', color: 'var(--color-secondary)' },
        { id: 'arrow-cycle', color: 'var(--color-alert)' },
        { id: 'arrow-violating', color: '#f97316' },
        { id: 'db-arrow', color: 'rgba(99, 102, 241, 0.6)' },
        { id: 'db-arrow-highlight', color: 'var(--color-secondary)' },
        { id: 'db-arrow-query', color: '#10b981' },
        { id: 'db-arrow-read', color: 'rgba(16, 185, 129, 0.8)' },
        { id: 'db-arrow-write', color: 'rgba(59, 130, 246, 0.8)' },
        { id: 'db-arrow-mismatch', color: '#ef4444' }
      ])
      .enter().append('marker')
      .attr('id', (d) => d.id)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', (d) => {
        if (d.id.startsWith('db-arrow')) return 4;
        return viewMode === 'call' ? 16 : (viewMode === 'hierarchy' ? 18 : 22);
      })
      .attr('refY', 0)
      .attr('markerWidth', 5.5)
      .attr('markerHeight', 5.5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', (d) => d.color);

    const hullGroup = mainGroup.append('g').attr('class', 'hulls-container');
    const hullColors = ['#8b5cf6', '#00f2fe', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#14b8a6', '#f43f5e', '#a855f7', '#6366f1'];
    const hullNodesGroup = new Map<string, any[]>();
    nodes.forEach((n) => {
      const key = viewMode === 'cluster' ? n.folder : (viewMode === 'call' ? n.file : null);
      if (!key) return;
      if (!hullNodesGroup.has(key)) hullNodesGroup.set(key, []);
      hullNodesGroup.get(key)!.push(n);
    });

    const hullDataList = Array.from(hullNodesGroup.entries())
      .filter(([key, members]) => members.length > 0 && !collapsedFolders.has(key));

    const hullWatermarks = hullGroup.selectAll('.hull-watermark')
      .data(hullDataList)
      .enter()
      .append('text')
      .attr('class', 'hull-watermark')
      .text(([key]) => key.split('/').pop() || key)
      .style('display', viewMode === 'cluster' ? 'block' : 'none');

    const handleHullMouseEnter = (_: any, [folderPath, members]: any) => {
      if (viewMode !== 'cluster') return;
      const memberIds = new Set(members.map((m: any) => m.id));
      let connectionsCount = 0;
      graphData.links.forEach((l: any) => {
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        const sIn = memberIds.has(sId);
        const tIn = memberIds.has(tId);
        if ((sIn && !tIn) || (!sIn && tIn)) {
          connectionsCount++;
        }
      });
      setHoveredCluster({
        folder: folderPath,
        fileCount: members.length,
        connectionsCount,
      });
    };

    const handleHullMouseLeave = () => {
      setHoveredCluster(null);
    };

    const handleHullClick = (event: any, [folderPath]: any) => {
      event.stopPropagation();
      setCollapsedFolders((prev) => {
        const next = new Set(prev);
        if (next.has(folderPath)) {
          next.delete(folderPath);
        } else {
          next.add(folderPath);
        }
        return next;
      });
    };

    const hulls = hullGroup.selectAll('.hull-boundary')
      .data(hullDataList)
      .enter()
      .append('path')
      .attr('class', 'hull-boundary')
      .attr('fill', (_, i) => hullColors[i % hullColors.length])
      .attr('stroke', (_, i) => hullColors[i % hullColors.length])
      .attr('stroke-opacity', 0.25)
      .style('opacity', (viewMode === 'cluster' || viewMode === 'call') ? 1.0 : 0)
      .on('click', handleHullClick)
      .on('mouseenter', handleHullMouseEnter)
      .on('mouseleave', handleHullMouseLeave);

    const hullLabels = hullGroup.selectAll('.hull-label')
      .data(hullDataList)
      .enter()
      .append('text')
      .attr('class', 'hull-label')
      .text(([key]) => key.split('/').pop() || key)
      .style('opacity', (viewMode === 'cluster' || viewMode === 'call') ? 0.6 : 0)
      .on('click', handleHullClick)
      .on('mouseenter', handleHullMouseEnter)
      .on('mouseleave', handleHullMouseLeave);

    const updateHulls = () => {
      hulls.each(function ([_, members]: any) {
        const points: [number, number][] = [];
        members.forEach((node: any) => {
          const r = viewMode === 'call' ? 18 : 28;
          for (let a = 0; a < 2 * Math.PI; a += Math.PI / 4) {
            points.push([node.x + r * Math.cos(a), node.y + r * Math.sin(a)]);
          }
        });
        const hull = d3.polygonHull(points);
        if (!hull) { d3.select(this).attr('d', null); return; }
        const lineGenerator = d3.line().curve(d3.curveCatmullRomClosed);
        d3.select(this).attr('d', lineGenerator(hull));
      });
      hullLabels
        .attr('x', ([_, members]: any) => d3.mean(members, (m: any) => m.x) || 0)
        .attr('y', ([_, members]: any) => {
          const minY = d3.min(members, (m: any) => m.y) as any;
          const yVal = minY !== undefined ? minY : 0;
          const pad = viewMode === 'call' ? 22 : 36;
          return yVal - pad;
        });
      hullWatermarks
        .attr('x', ([_, members]: any) => d3.mean(members, (m: any) => m.x) || 0)
        .attr('y', ([_, members]: any) => d3.mean(members, (m: any) => m.y) || 0);
    };

    const pipeline = mainGroup.append('g').selectAll('.pipeline-element')
      .data(links.filter((l: any) => l.isAggregated || l.isCrossFolder))
      .enter()
      .append('line')
      .attr('class', 'pipeline-element')
      .attr('stroke', 'var(--color-secondary-glow)')
      .attr('stroke-opacity', 0.18)
      .attr('stroke-width', (d: any) => d.isAggregated ? 5 + Math.min(d.weight * 2.5, 18) : 5 + Math.min(d.coupling * 2.0, 14))
      .style('filter', 'drop-shadow(0 0 5px var(--color-secondary))');

    const link = mainGroup.append('g').attr('class', 'links-container').selectAll('.link-element')
      .data(links)
      .enter()
      .append(viewMode === 'dbSchema' ? 'path' : 'line')
      .attr('class', (d: any) => {
        if (viewMode === 'dbSchema') return 'link-element db-relationship-link';
        let cls = 'link-element';
        if (viewMode === 'dependency') cls += ' flowing';
        if (viewMode === 'hierarchy') cls += ' props-flow';
        
        const sId = typeof d.source === 'object' ? d.source.id : d.source;
        const tId = typeof d.target === 'object' ? d.target.id : d.target;
        const isViolating = linterViolations?.violatingLinks.some((vl: any) => {
          const vlSource = typeof vl.source === 'object' ? vl.source.id : vl.source;
          const vlTarget = typeof vl.target === 'object' ? vl.target.id : vl.target;
          return vlSource === sId && vlTarget === tId;
        });
        if (isViolating) cls += ' linter-violating-link';
        return cls;
      })
      .attr('fill', 'none')
      .attr('stroke', () => {
        if (viewMode === 'dbSchema') return 'rgba(99, 102, 241, 0.4)';
        return 'var(--link-stroke)';
      })
      .attr('stroke-width', (d: any) => {
        if (viewMode === 'dbSchema') return 1.5;
        if (viewMode === 'dependency' && d.weight !== undefined) {
          return 1.0 + Math.min(d.weight * 0.5, 6.0);
        }
        return d.isAggregated ? 1.5 + Math.min(d.weight * 0.4, 4) : 1.5;
      })
      .attr('marker-end', (d: any) => {
        if (viewMode === 'dbSchema') return 'url(#db-arrow)';
        const sId = typeof d.source === 'object' ? d.source.id : d.source;
        const tId = typeof d.target === 'object' ? d.target.id : d.target;
        const isViolating = linterViolations?.violatingLinks.some((vl: any) => {
          const vlSource = typeof vl.source === 'object' ? vl.source.id : vl.source;
          const vlTarget = typeof vl.target === 'object' ? vl.target.id : vl.target;
          return vlSource === sId && vlTarget === tId;
        });
        return isViolating ? 'url(#arrow-violating)' : 'url(#arrow-normal)';
      });

    const node = mainGroup.append('g').attr('class', 'nodes-container').selectAll('.node-element').data(nodes).enter().append('g')
      .attr('class', (d: any) => {
        let cls = 'node-element';
        if (viewMode === 'dbSchema') {
          cls += ' db-table-node';
          if (d.nodeType === 'api') {
            cls += ' api-endpoint-node';
          }
        }
        const isViolating = linterViolations?.violatingNodes.includes(d.id);
        if (isViolating) cls += ' linter-violating-node';
        const isAtRisk = auditReport?.risks.some(r => r.filePath === d.id);
        if (isAtRisk) cls += ' risk-violating-node';
        return cls;
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        if (viewMode === 'dbSchema') {
          if (d.nodeType === 'api') {
            setSelectedDbTableId(null);
            setSelectedNode(d.id);
            return;
          }
          setSelectedDbTableId(d.id);
          if (d.sourceFile) {
            setSelectedNode(d.sourceFile);
          } else {
            setSelectedNode(d.id);
          }
          return;
        }
        setSelectedNode(d.id);
        if (d.isFolder) {
          setCollapsedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(d.folder)) {
              next.delete(d.folder);
            } else {
              next.add(d.folder);
            }
            return next;
          });
        }
      })
      .on('dblclick', (event, d) => {
        if (d.isFolder) {
          event.stopPropagation();
          setCollapsedFolders((prev) => {
            const next = new Set(prev);
            next.delete(d.folder);
            return next;
          });
        } else {
          event.stopPropagation();
          svgElement.transition().duration(750).call(
            zoomBehavior.transform,
            d3.zoomIdentity.translate(width / 2 - d.x * 1.6, height / 2 - d.y * 1.6).scale(1.6)
          );
        }
      })
      .on('mouseenter', (_, d) => {
        if (viewMode === 'dbSchema') {
          setHoveredDbTableId(d.id);
          return;
        }
        if (hoveredNode !== d.id) {
          const isCyclic = graphData.cycles.some(cycle => cycle.includes(d.id));
          audioSonifier.playNodeHover({ ...d, isCyclic });
        }
        setHoveredNode(d.id);
        if (viewMode === 'cluster' && d.folder) {
          const folderMembers = nodes.filter((n: any) => n.folder === d.folder);
          const memberIds = new Set(folderMembers.map((m: any) => m.id));
          let connectionsCount = 0;
          links.forEach((l: any) => {
            const sId = typeof l.source === 'object' ? l.source.id : l.source;
            const tId = typeof l.target === 'object' ? l.target.id : l.target;
            const sIn = memberIds.has(sId);
            const tIn = memberIds.has(tId);
            if ((sIn && !tIn) || (!sIn && tIn)) {
              connectionsCount++;
            }
          });
          setHoveredCluster({
            folder: d.folder,
            fileCount: folderMembers.length,
            connectionsCount,
          });
        }
        if (viewMode === 'hierarchy') {
          setHoveredComponentDetails(d);
        }
      })
      .on('mouseleave', () => {
        setHoveredDbTableId(null);
        setHoveredNode(null);
        setHoveredCluster(null);
        setHoveredComponentDetails(null);
      })
      .call(d3.drag<any, any>().on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

    node.each(function (d: any) {
      const element = d3.select(this);
      
      if (viewMode === 'dbSchema') {
        const card = element.append('foreignObject')
          .attr('width', d.width)
          .attr('height', d.height)
          .attr('x', -d.width / 2)
          .attr('y', -d.height / 2);

        if (d.nodeType === 'api') {
          const methodColors: Record<string, { border: string; bg: string; text: string }> = {
            GET: { border: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', text: '#10b981' },
            POST: { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6' },
            PUT: { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b' },
            PATCH: { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)', text: '#8b5cf6' },
            DELETE: { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', text: '#ef4444' }
          };
          const colors = methodColors[d.method] || { border: '#6366f1', bg: 'rgba(99, 102, 241, 0.1)', text: '#6366f1' };

          const pillDiv = card.append('xhtml:div')
            .style('width', '100%')
            .style('height', '100%')
            .style('border', `1px solid ${colors.border}`)
            .style('border-radius', '24px')
            .style('background', 'var(--panel-bg)')
            .style('backdrop-filter', 'blur(6px)')
            .style('box-shadow', '0 2px 10px rgba(0, 0, 0, 0.15)')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('padding', '0 12px')
            .style('gap', '8px')
            .style('pointer-events', 'auto')
            .style('user-select', 'none');

          pillDiv.append('span')
            .style('background', colors.bg)
            .style('color', colors.text)
            .style('font-size', '0.62rem')
            .style('font-weight', '800')
            .style('padding', '2px 6px')
            .style('border-radius', '4px')
            .style('font-family', 'var(--font-mono)')
            .text(d.method);

          pillDiv.append('span')
            .style('font-weight', '600')
            .style('color', 'var(--text-primary)')
            .style('font-size', '0.7rem')
            .style('overflow', 'hidden')
            .style('text-overflow', 'ellipsis')
            .style('white-space', 'nowrap')
            .style('font-family', 'var(--font-mono)')
            .style('flex-grow', '1')
            .text(d.path);

          pillDiv.on('mouseenter', () => {
            pillDiv.style('box-shadow', `0 0 15px ${colors.border}44`);
          }).on('mouseleave', () => {
            pillDiv.style('box-shadow', '0 2px 10px rgba(0, 0, 0, 0.15)');
          });

          return; // Skip table fields drawing
        }

        const isOrphaned = orphanedTableIds.has(d.id);
        const cardDiv = card.append('xhtml:div')
          .style('width', '100%')
          .style('height', '100%')
          .style('border', isOrphaned ? '1px dashed var(--color-alert)' : '1px solid var(--panel-border)')
          .style('border-radius', '8px')
          .style('background', 'var(--panel-bg)')
          .style('backdrop-filter', 'blur(6px)')
          .style('box-shadow', '0 4px 15px rgba(0,0,0,0.15)')
          .style('display', 'flex')
          .style('flex-direction', 'column')
          .style('overflow', 'hidden')
          .style('pointer-events', 'auto')
          .style('user-select', 'none');

        // Table Header
        cardDiv.append('div')
          .style('background', isOrphaned ? 'rgba(239, 68, 68, 0.12)' : 'rgba(99, 102, 241, 0.1)')
          .style('border-bottom', '1px solid var(--panel-border)')
          .style('padding', '8px 12px')
          .style('display', 'flex')
          .style('align-items', 'center')
          .style('justify-content', 'space-between')
          .style('flex-shrink', '0')
          .html(() => `
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: ${isOrphaned ? 'var(--color-alert)' : 'var(--color-primary)'}; font-size: 0.85rem;">🗃️</span>
              <span style="font-weight: 700; color: var(--text-primary); font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${d.id}</span>
            </div>
            ${isOrphaned ? `<span style="background: rgba(239, 68, 68, 0.2); color: var(--color-alert); font-size: 0.58rem; padding: 2px 5px; border-radius: 4px; font-weight: 600; font-family: var(--font-sans);">⚠️ Orphaned</span>` : ''}
          `);

        // Fields Container
        const body = cardDiv.append('div')
          .style('flex', '1')
          .style('overflow-y', 'auto')
          .style('display', 'flex')
          .style('flex-direction', 'column');

        // Fields rows
        d.fields.forEach((f: any) => {
          const keyIcon = f.isPrimaryKey ? '🔑' : f.isForeignKey ? '🔗' : '&nbsp;&nbsp;';
          const keyColor = f.isPrimaryKey ? 'var(--color-secondary)' : f.isForeignKey ? '#a855f7' : 'var(--text-primary)';
          const isKey = f.isPrimaryKey || f.isForeignKey;
          
          body.append('div')
            .style('display', 'flex')
            .style('justify-content', 'space-between')
            .style('align-items', 'center')
            .style('padding', '4px 8px')
            .style('font-size', '0.72rem')
            .style('border-bottom', '1px solid var(--panel-border)')
            .style('gap', '8px')
            .html(() => {
              const displayType = f.type.includes('ObjectId') ? 'ObjectId' : f.type.replace(/^(mongoose\.)?(Schema\.)?Types\./i, '');
              return `
                <div style="display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex-shrink: 0;">
                  <span style="font-size: 0.7rem; opacity: 0.8;">${keyIcon}</span>
                  <span style="color: ${keyColor}; font-weight: ${isKey ? '600' : 'normal'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${f.name}</span>
                </div>
                <span style="color: var(--text-muted); font-family: var(--font-mono); font-size: 0.65rem; word-break: break-all; text-align: right; flex-grow: 1; padding-left: 4px;">${displayType}</span>
              `;
            });
        });

        // Schema Drift warning footer
        const mismatches = tableMismatches.get(d.id);
        if (mismatches && mismatches.length > 0) {
          cardDiv.append('div')
            .style('background', 'rgba(249, 115, 22, 0.15)')
            .style('border-top', '1px solid rgba(249, 115, 22, 0.3)')
            .style('padding', '6px 10px')
            .style('font-size', '0.62rem')
            .style('color', '#f97316')
            .style('font-weight', '500')
            .html(() => `⚠️ Schema Drift: ${mismatches[0]}`);
        }

        // Hover styling updates
        cardDiv
          .on('mouseenter', () => {
            cardDiv.style('border-color', isOrphaned ? 'var(--color-alert)' : 'var(--color-secondary)');
            cardDiv.style('box-shadow', isOrphaned ? '0 0 15px rgba(239, 68, 68, 0.25)' : '0 0 15px rgba(0, 242, 254, 0.2)');
          })
          .on('mouseleave', () => {
            const isSelected = selectedDbTableId === d.id;
            cardDiv.style('border-color', isSelected ? 'var(--color-primary)' : (isOrphaned ? 'var(--color-alert)' : 'var(--panel-border)'));
            cardDiv.style('box-shadow', isSelected ? '0 0 10px rgba(99, 102, 241, 0.2)' : '0 4px 15px rgba(0,0,0,0.15)');
          });

        return; // Don't run standard circle/folder drawing code
      }
      
      const baseRadius = viewMode === 'call' 
        ? 8 + Math.min(d.callCount * 1.5, 20)
        : (viewMode === 'dependency' 
            ? 8 + Math.min((inDegreeMap.get(d.id) || 0) * 2.0, 24)
            : (viewMode === 'hierarchy' ? 9 : 8) + Math.min(Math.sqrt(d.size || 0) * 0.04, 30));

      const isViolating = linterViolations?.violatingNodes.includes(d.id);
      if (isViolating && !d.isFolder && !d.isNpm) {
        element.append('circle')
          .attr('class', 'warning-halo')
          .style('--base-r', `${baseRadius}px`);
      }

      const isAtRisk = auditReport?.risks.some(r => r.filePath === d.id);
      if (isAtRisk && !d.isFolder && !d.isNpm) {
        element.append('circle')
          .attr('class', 'risk-halo')
          .style('--base-r', `${baseRadius}px`);

        const badgeG = element.append('g')
          .attr('class', 'risk-badge')
          .attr('transform', `translate(${baseRadius * 0.75}, -${baseRadius * 0.75})`);
        
        badgeG.append('circle')
          .attr('r', 6)
          .attr('fill', '#ef4444')
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 1.0);
          
        badgeG.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', '2.5px')
          .style('fill', '#ffffff')
          .style('font-size', '8px')
          .style('font-weight', '900')
          .style('font-family', 'var(--font-sans)')
          .text('!');
      }

      if (d.isFolder) {
        element.append('path')
          .attr('d', 'M-12,-8 H-4 L-1,-5 H12 V8 H-12 Z')
          .attr('class', 'folder-node')
          .attr('transform', 'scale(1.2)');
      } else if (d.isNpm) {
        element.append('polygon')
          .attr('points', '0,-12 10.4,-6 10.4,6 0,12 -10.4,6 -10.4,-6')
          .attr('fill', d.isVulnerable ? 'rgba(239, 68, 68, 0.15)' : 'var(--color-primary-glow)')
          .attr('stroke', d.isVulnerable ? '#ef4444' : 'var(--color-primary)')
          .attr('stroke-width', 1.5)
          .attr('class', `npm-node ${d.isVulnerable ? 'vulnerable-pulsate' : ''}`);

        if (d.isVulnerable) {
          const badgeG = element.append('g')
            .attr('class', 'vulnerable-shield-badge')
            .attr('transform', 'translate(10, -10)');

          badgeG.append('path')
            .attr('d', 'M -5,-7 L 5,-7 L 5,-2 C 5,2 0,6 0,6 C 0,6 -5,2 -5,-2 Z')
            .attr('fill', '#ef4444')
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 0.8);
        }
      } else {
        const circle = element.append('circle')
          .attr('r', (d: any) => {
            if (viewMode === 'call') return 8 + Math.min(d.callCount * 1.5, 20);
            if (viewMode === 'dependency') {
              const inDeg = inDegreeMap.get(d.id) || 0;
              return 8 + Math.min(inDeg * 2.0, 24);
            }
            const baseSize = viewMode === 'hierarchy' ? 9 : 8;
            return baseSize + Math.min(Math.sqrt(d.size || 0) * 0.04, 30);
          })
          .attr('fill', getColorForNode)
          .attr('stroke', 'rgba(0,0,0,0.5)')
          .attr('stroke-width', 1.5);

        if (viewMode === 'call' && isFunctionUnused(d)) {
          circle.attr('class', 'call-node-unused');
        }
      }

      if (viewMode === 'hierarchy' && selectedNode === d.id && d.type === 'component') {
        const card = element.append('foreignObject')
          .attr('class', 'component-mini-card')
          .attr('width', 220)
          .attr('height', 140)
          .attr('x', 15)
          .attr('y', -70);

        const cardDiv = card.append('xhtml:div')
          .style('width', '210px')
          .style('height', '130px')
          .style('background', 'var(--panel-bg)')
          .style('backdrop-filter', 'blur(8px)')
          .style('border', '1px solid var(--color-primary)')
          .style('box-shadow', '0 4px 15px rgba(0,0,0,0.3)')
          .style('border-radius', '6px')
          .style('padding', '6px 10px')
          .style('font-family', 'var(--font-sans)')
          .style('color', 'var(--text-secondary)')
          .style('overflow-y', 'auto')
          .style('pointer-events', 'all')
          .on('click', (event: any) => event.stopPropagation())
          .on('dblclick', (event: any) => event.stopPropagation())
          .on('mousedown', (event: any) => event.stopPropagation());

        cardDiv.append('div')
          .style('font-weight', '700')
          .style('color', 'var(--color-primary)')
          .style('font-size', '0.75rem')
          .style('border-bottom', '1px solid rgba(255,255,255,0.1)')
          .style('padding-bottom', '2px')
          .style('margin-bottom', '4px')
          .text(`⚛️ ${d.name}`);

        // Props Section
        const propsContainer = cardDiv.append('div').style('margin-bottom', '6px');
        propsContainer.append('span')
          .style('font-size', '0.6rem')
          .style('color', 'var(--text-muted)')
          .style('text-transform', 'uppercase')
          .style('display', 'block')
          .text('Props');
        
        if (d.props && d.props.length > 0) {
          const list = propsContainer.append('div')
            .style('display', 'flex')
            .style('flex-wrap', 'wrap')
            .style('gap', '3px')
            .style('margin-top', '2px');
          d.props.forEach((p: string) => {
            list.append('span')
              .style('font-size', '0.55rem')
              .style('background', 'var(--color-primary-glow)')
              .style('color', 'var(--text-primary)')
              .style('padding', '1px 4px')
              .style('border-radius', '3px')
              .text(p);
          });
        } else {
          propsContainer.append('div')
            .style('font-size', '0.6rem')
            .style('color', 'var(--text-muted)')
            .style('font-style', 'italic')
            .text('None');
        }

        // State & Hooks Section
        const hooksContainer = cardDiv.append('div');
        hooksContainer.append('span')
          .style('font-size', '0.6rem')
          .style('color', 'var(--text-muted)')
          .style('text-transform', 'uppercase')
          .style('display', 'block')
          .text('State & Hooks');
        
        const hasStateOrHooks = (d.state && d.state.length > 0) || (d.hooks && d.hooks.length > 0);
        if (hasStateOrHooks) {
          const list = hooksContainer.append('div')
            .style('display', 'flex')
            .style('flex-wrap', 'wrap')
            .style('gap', '3px')
            .style('margin-top', '2px');

          if (d.state) {
            d.state.forEach((s: string) => {
              list.append('span')
                .style('font-size', '0.55rem')
                .style('background', 'rgba(16, 185, 129, 0.1)')
                .style('color', '#10b981')
                .style('padding', '1px 4px')
                .style('border-radius', '3px')
                .text(`state: ${s}`);
            });
          }
          if (d.hooks) {
            d.hooks.forEach((h: string) => {
              list.append('span')
                .style('font-size', '0.55rem')
                .style('background', 'rgba(245, 158, 11, 0.1)')
                .style('color', '#f59e0b')
                .style('padding', '1px 4px')
                .style('border-radius', '3px')
                .text(h);
            });
          }
        } else {
          hooksContainer.append('div')
            .style('font-size', '0.6rem')
            .style('color', 'var(--text-muted)')
            .style('font-style', 'italic')
            .text('None');
        }
      }
    });

    if (viewMode !== 'dbSchema') {
      node.append('text').attr('class', 'node-label').attr('dx', 14).attr('dy', 4).text((d) => d.name);
    }

    const handleTickUpdate = () => {
      nodes.forEach(n => {
        if (n.id && n.x !== undefined && n.y !== undefined) {
          nodePositionsRef.current.set(n.id, { x: n.x, y: n.y });
        }
      });
      activeNodesRef.current = [...nodes];
      activeLinksRef.current = [...links];
      if (viewMode === 'dbSchema') {
        link.attr('d', (d: any) => {
          const source = d.source;
          const target = d.target;
          if (!source || !target || source.x === undefined || target.x === undefined) return '';

          const dx = target.x - source.x;
          const dy = target.y - source.y;
          if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return '';

          const scaleSrc = Math.min((source.width / 2) / Math.abs(dx), (source.height / 2) / Math.abs(dy));
          const srcX = source.x + dx * scaleSrc;
          const srcY = source.y + dy * scaleSrc;

          const scaleTgt = Math.min((target.width / 2) / Math.abs(dx), (target.height / 2) / Math.abs(dy));
          const arrowBackoff = 8 / Math.sqrt(dx*dx + dy*dy);
          const tgtX = target.x - dx * (scaleTgt + arrowBackoff);
          const tgtY = target.y - dy * (scaleTgt + arrowBackoff);

          const midX = (srcX + tgtX) / 2;
          return `M${srcX},${srcY} Q${midX},${(srcY + tgtY)/2 - 10} ${tgtX},${tgtY}`;
        });
      } else {
        link.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y).attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
      }
      if (pipeline) {
        pipeline.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y).attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
      }
      node.attr('transform', (d) => `translate(${d.x}, ${d.y})`);
      if (viewMode === 'cluster' || viewMode === 'call') updateHulls();
      drawMinimap();
    };

    // Warm up the simulation synchronously to avoid browser tab freezing
    // during the initial chaotic settling phase on larger graphs, or to fully
    // stabilize the layout immediately for diagram exporting in DB Schema.
    const nodeCount = nodes.length;
    if (nodeCount > 100 || viewMode === 'dbSchema') {
      simulation.stop();
      const warmupTicks = viewMode === 'dbSchema' ? 250 : Math.min(180, Math.max(100, Math.floor(nodeCount / 3.5)));
      for (let i = 0; i < warmupTicks; ++i) {
        simulation.tick();
      }
      // Apply the pre-calculated positions immediately
      handleTickUpdate();
    }

    simulation.on('tick', handleTickUpdate);

    (window as any).graphZoom = {
      zoomIn: () => svgElement.transition().duration(300).call(zoomBehavior.scaleBy, 1.3),
      zoomOut: () => svgElement.transition().duration(300).call(zoomBehavior.scaleBy, 0.7),
      reset: () => svgElement.transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8)),
    };

    drawMinimap();

    return () => {
      simulation.stop();
    };
  }, [graphData, viewMode, hierarchicalLevels, showNpmPackages, collapsedFolders, depthFilter, selectedNode, treeLayoutStyle, isEvolutionMode, currentEvolutionStep, activeEvolutionFiles, linterViolations, useDemoDbSchema, dbSchema, filterLanguage, filterMinLoc, filterFolderPath, showApiDbMapping]);

  // --- Collaboration Presence and Cursor Rendering Hook ---
  useEffect(() => {
    if (!svgRef.current) return;
    const svgElement = d3.select(svgRef.current);
    const mainGroup = svgElement.select('.main-container');
    if (mainGroup.empty()) return;

    // Render / Update Cursors
    let cursorsContainer: any = mainGroup.select('.cursors-container');
    if (cursorsContainer.empty()) {
      cursorsContainer = mainGroup.append('g').attr('class', 'cursors-container');
    }

    const peersArray = Array.from(collabPeers?.values() || []).filter(p => p.cursor);

    const cursorSelection = cursorsContainer.selectAll('.presence-cursor')
      .data(peersArray, (d: any) => d.clientId);

    cursorSelection.exit().remove();

    const cursorEnter = cursorSelection.enter()
      .append('g')
      .attr('class', 'presence-cursor');

    // Laser cursor arrow
    cursorEnter.append('path')
      .attr('d', 'M0,0 L0,16 L4,12 L8,20 L11,19 L7,11 L14,11 Z')
      .attr('fill', (d: any) => d.color)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.2)
      .style('filter', 'drop-shadow(0 0 6px rgba(0,0,0,0.5))');

    // Laser trail glowing dot
    cursorEnter.append('circle')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', 4)
      .attr('fill', (d: any) => d.color)
      .style('opacity', 0.6)
      .style('filter', (d: any) => `blur(1px) drop-shadow(0 0 3px ${d.color})`);

    const labelGroup = cursorEnter.append('g')
      .attr('transform', 'translate(12, 18)');

    labelGroup.append('rect')
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', (d: any) => d.color)
      .attr('stroke', 'rgba(255,255,255,0.15)')
      .attr('stroke-width', 0.5)
      .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))');

    labelGroup.append('text')
      .attr('fill', '#ffffff')
      .attr('font-size', '9px')
      .attr('font-weight', '600')
      .attr('font-family', 'var(--font-sans)')
      .style('pointer-events', 'none')
      .text((d: any) => d.username);

    // Auto-adjust rect size
    labelGroup.each(function(this: any) {
      const g = d3.select(this);
      const textNode = g.select('text').node() as SVGTextElement;
      if (textNode) {
        const bbox = textNode.getBBox();
        g.select('rect')
          .attr('x', bbox.x - 5)
          .attr('y', bbox.y - 2)
          .attr('width', bbox.width + 10)
          .attr('height', bbox.height + 4);
      }
    });

    const cursorMerge = cursorSelection.merge(cursorEnter as any);
    cursorMerge
      .transition()
      .duration(45)
      .ease(d3.easeLinear)
      .attr('transform', (d: any) => `translate(${d.cursor?.x || 0}, ${d.cursor?.y || 0})`);

  }, [collabPeers]);

  // --- Collaboration Selection Halo Rendering Hook ---
  useEffect(() => {
    if (!svgRef.current) return;
    const svgElement = d3.select(svgRef.current);
    
    // Clear old halos
    svgElement.selectAll('.collab-halo').remove();

    if (!collabPeers) return;

    collabPeers.forEach((peer) => {
      if (!peer.selectedNodeId) return;

      const nodeG = svgElement.selectAll('.node-element')
        .filter((d: any) => d && d.id === peer.selectedNodeId);

      if (nodeG.empty()) return;

      const halo = nodeG.append('g')
        .attr('class', 'collab-halo')
        .style('pointer-events', 'none');

      if (viewMode === 'dbSchema') {
        // Table Card Halo
        halo.append('rect')
          .attr('x', (d: any) => -d.width / 2 - 4)
          .attr('y', (d: any) => -d.height / 2 - 4)
          .attr('width', (d: any) => d.width + 8)
          .attr('height', (d: any) => d.height + 8)
          .attr('rx', 8)
          .attr('ry', 8)
          .attr('fill', 'none')
          .attr('stroke', peer.color)
          .attr('stroke-width', 2.5)
          .style('filter', `drop-shadow(0 0 8px ${peer.color})`)
          .style('animation', 'cardGlow 1.8s infinite alternate ease-in-out');

        const badge = halo.append('g')
          .attr('transform', (d: any) => `translate(${d.width / 2 - 80}, ${-d.height / 2 - 10})`);

        badge.append('rect')
          .attr('rx', 3)
          .attr('ry', 3)
          .attr('width', 80)
          .attr('height', 14)
          .attr('fill', peer.color);

        badge.append('text')
          .attr('x', 40)
          .attr('y', 10)
          .attr('text-anchor', 'middle')
          .attr('fill', '#ffffff')
          .attr('font-size', '8px')
          .attr('font-weight', 'bold')
          .text(peer.username.split('-')[0]);
      } else {
        // Standard Circle Node Halo
        halo.append('circle')
          .attr('r', (d: any) => {
            let baseRadius = 10;
            if (d.isFolder) baseRadius = 24;
            else if (viewMode === 'call') baseRadius = 12 + Math.min(d.callCount * 1.5, 20);
            else if (viewMode === 'dependency') {
              const inDeg = (d.id && d3.select(svgRef.current).selectAll('.link-element').filter((l: any) => (typeof l.target === 'object' ? l.target.id : l.target) === d.id).size()) || 0;
              baseRadius = 12 + Math.min(inDeg * 2.0, 24);
            }
            return baseRadius + 10;
          })
          .attr('fill', 'none')
          .attr('stroke', peer.color)
          .attr('stroke-width', 2.5)
          .style('opacity', 0.8)
          .style('animation', 'nodePulse 1.8s infinite ease-in-out');

        halo.append('circle')
          .attr('r', (d: any) => {
            let baseRadius = 10;
            if (d.isFolder) baseRadius = 24;
            else if (viewMode === 'call') baseRadius = 12 + Math.min(d.callCount * 1.5, 20);
            return baseRadius + 6;
          })
          .attr('fill', 'none')
          .attr('stroke', peer.color)
          .attr('stroke-width', 1.5)
          .style('opacity', 0.9);

        const badge = halo.append('g')
          .attr('transform', (d: any) => {
            let yOffset = -22;
            if (d.isFolder) yOffset = -36;
            return `translate(0, ${yOffset})`;
          });

        badge.append('rect')
          .attr('rx', 3)
          .attr('ry', 3)
          .attr('x', -35)
          .attr('y', -8)
          .attr('width', 70)
          .attr('height', 14)
          .attr('fill', peer.color);

        badge.append('text')
          .attr('text-anchor', 'middle')
          .attr('fill', '#ffffff')
          .attr('font-size', '8px')
          .attr('font-weight', 'bold')
          .attr('y', 2)
          .text(`${peer.username.split('-')[0]}`);
      }
    });
  }, [collabPeers, viewMode]);

  useEffect(() => {
    if (!svgRef.current) return;
    if (viewMode === 'dbSchema' && !showApiDbMapping) return;
    const activeId = hoveredNode || selectedNode;
    const query = searchQuery ? searchQuery.toLowerCase().trim() : '';
    const svgElement = d3.select(svgRef.current);
    const nodesG = svgElement.selectAll('.node-element');
    const linksLine = svgElement.selectAll('.link-element');
    const hullsBoundary = svgElement.selectAll('.hull-boundary');
    const hullWatermarks = svgElement.selectAll('.hull-watermark');

    const getLinkId = (l: any) => ({
      sId: typeof l.source === 'object' ? l.source.id : l.source,
      tId: typeof l.target === 'object' ? l.target.id : l.target
    });

    // Reset styles to default state before applying overlays
    nodesG.style('opacity', 1.0);
    nodesG.each(function (d: any) {
      const el = d3.select(this);
      const circle = el.select('circle');
      const polygon = el.select('polygon');
      const folderPath = el.select('path.folder-node');
      const text = el.select('text');

      const currentCommit = isEvolutionMode && gitHistory ? gitHistory[currentEvolutionStep] : null;
      const isNewlyAdded = currentCommit && currentCommit.filesAdded && currentCommit.filesAdded.includes(d.id);
      const isNewlyModified = currentCommit && currentCommit.filesModified && currentCommit.filesModified.includes(d.id);

      const isViolating = linterViolations?.violatingNodes.includes(d.id);

      if (!circle.empty()) {
        if (isViolating) {
          circle.style('stroke', '#f97316')
                .style('stroke-width', '2.5px')
                .style('stroke-dasharray', null)
                .style('fill', getHeatmapColor(d))
                .style('filter', 'drop-shadow(0 0 10px #f97316)')
                .attr('class', null);
        } else {
          circle.style('stroke', isNewlyAdded ? '#a855f7' : (isNewlyModified ? '#fb923c' : 'var(--node-stroke)'))
                .style('stroke-width', isNewlyAdded ? '3.5px' : (isNewlyModified ? '2.5px' : '1.5px'))
                .style('stroke-dasharray', null)
                .style('fill', getHeatmapColor(d))
                .style('filter', isNewlyAdded ? 'drop-shadow(0 0 10px #a855f7)' : (isNewlyModified ? 'drop-shadow(0 0 6px #fb923c)' : ''))
                .attr('class', isNewlyAdded ? 'evolution-node-birth' : (isNewlyModified ? 'evolution-node-modified' : null));
        }
      }
      if (!polygon.empty()) {
        polygon.style('stroke', isNewlyAdded ? '#a855f7' : (isNewlyModified ? '#fb923c' : 'var(--node-stroke)'))
               .style('stroke-width', isNewlyAdded ? '3.5px' : (isNewlyModified ? '2.5px' : '1.5px'))
               .style('stroke-dasharray', null)
               .style('fill', getHeatmapColor(d))
               .style('filter', isNewlyAdded ? 'drop-shadow(0 0 10px #a855f7)' : (isNewlyModified ? 'drop-shadow(0 0 6px #fb923c)' : ''))
               .attr('class', isNewlyAdded ? 'evolution-node-birth' : (isNewlyModified ? 'evolution-node-modified' : null));
      }
      if (!folderPath.empty()) {
        folderPath.style('stroke', 'var(--node-stroke)')
                  .style('stroke-width', '1.5px')
                  .style('stroke-dasharray', null)
                  .style('fill', heatmapMode !== 'none' ? getHeatmapColor(d) : 'var(--color-warning)')
                  .style('filter', null);
      }
      if (!text.empty()) {
        text.style('fill', isNewlyAdded ? '#c084fc' : (isNewlyModified ? '#fdba74' : 'var(--text-secondary)'))
            .style('font-weight', (isNewlyAdded || isNewlyModified) ? '700' : '500')
            .style('text-decoration', null)
            .style('opacity', null);
      }

      const isSelected = selectedNode && d.id === selectedNode;
      if (!circle.empty()) circle.classed('pulse-glow-ring', !!isSelected);
      if (!polygon.empty()) polygon.classed('pulse-glow-ring', !!isSelected);
      if (!folderPath.empty()) folderPath.classed('pulse-glow-ring', !!isSelected);
    });

    nodesG.classed('hotspot', (d: any) => heatmapMode === 'churn' && d.churn && d.churn >= 45);

    const pipelines = svgElement.selectAll('.pipeline-element');
    let particleInterval: any = null;

    if (diffData) {
      nodesG.each(function (d: any) {
        const diffInfo = diffData.files[d.id];
        const container = d3.select(this);
        const circle = container.select('circle');
        const folderPath = container.select('path.folder-node');
        const folderPolygon = container.select('polygon');
        const text = container.select('text');

        if (diffInfo) {
          const statusColor = diffInfo.status === 'added' ? '#10b981' : 
                              diffInfo.status === 'modified' ? '#fb923c' : '#f43f5e';
          const strokeWidth = diffInfo.status === 'deleted' ? '2.5px' : '3px';
          const dashArray = diffInfo.status === 'deleted' ? '3,3' : null;
          const fillVal = diffInfo.status === 'deleted' ? 'rgba(244, 63, 94, 0.12)' : null;

          if (!circle.empty()) {
            circle.style('stroke', statusColor)
                  .style('stroke-width', strokeWidth)
                  .style('stroke-dasharray', dashArray as any)
                  .style('filter', `drop-shadow(0 0 10px ${statusColor})`);
            if (fillVal) circle.style('fill', fillVal);
          }
          if (!folderPath.empty()) {
            folderPath.style('stroke', statusColor)
                      .style('stroke-width', strokeWidth)
                      .style('stroke-dasharray', dashArray as any)
                      .style('filter', `drop-shadow(0 0 10px ${statusColor})`);
            if (fillVal) folderPath.style('fill', fillVal);
          }
          if (!folderPolygon.empty()) {
            folderPolygon.style('stroke', statusColor)
                         .style('stroke-width', strokeWidth)
                         .style('stroke-dasharray', dashArray as any)
                         .style('filter', `drop-shadow(0 0 10px ${statusColor})`);
            if (fillVal) folderPolygon.style('fill', fillVal);
          }

          text.style('fill', statusColor)
              .style('font-weight', '700')
              .style('opacity', diffInfo.status === 'deleted' ? 0.7 : 1.0);
          if (diffInfo.status === 'deleted') {
            text.style('text-decoration', 'line-through');
          }
        } else {
          container.style('opacity', 0.12);
        }
      });

      linksLine.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        const sChanged = !!diffData.files[sId];
        const tChanged = !!diffData.files[tId];
        const line = d3.select(this);
        line.style('stroke-opacity', (sChanged || tChanged) ? 0.7 : 0.01)
            .style('stroke', (sChanged || tChanged) ? 'var(--color-primary)' : 'var(--link-stroke)');
      });

      pipelines.style('stroke-opacity', 0.01);
      hullsBoundary.style('fill-opacity', 0.01).style('stroke-opacity', 0.15);
      hullWatermarks.style('opacity', 0.05);

    } else if (activeTraceNodeId && traceSteps.length > 0 && viewMode === 'call') {
      const activeStep = traceSteps[currentTraceStep];
      const traceNodeIds = new Set<string>([activeTraceNodeId]);
      traceSteps.forEach(s => {
        traceNodeIds.add(s.source);
        traceNodeIds.add(s.target);
      });

      nodesG.style('opacity', (d: any) => traceNodeIds.has(d.id) ? 1.0 : 0.15);
      
      nodesG.each(function (d: any) {
        const circle = d3.select(this).select('circle');
        const isActiveTarget = activeStep && d.id === activeStep.target;
        
        if (isActiveTarget) {
          circle.attr('class', 'trace-node-active');
        } else {
          circle.attr('class', isFunctionUnused(d) ? 'call-node-unused' : '');
        }
      });

      nodesG.select('text')
        .style('fill', (d: any) => d.id === activeTraceNodeId ? 'var(--text-primary)' : 'var(--text-secondary)')
        .style('font-weight', (d: any) => d.id === activeTraceNodeId ? '700' : '500');

      linksLine.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        const line = d3.select(this);
        const isActiveLink = activeStep && sId === activeStep.source && tId === activeStep.target;
        
        if (isActiveLink) {
          line.attr('class', 'link-element trace-link-active').style('stroke-opacity', 1.0);
        } else {
          const isPartOfTrace = traceSteps.some(s => s.source === sId && s.target === tId);
          line.attr('class', 'link-element')
            .style('stroke-opacity', isPartOfTrace ? 0.35 : 0.03)
            .style('stroke', 'var(--link-stroke)')
            .attr('marker-end', 'url(#arrow-normal)');
        }
      });

      pipelines.style('stroke-opacity', 0.01);
      hullsBoundary.style('fill-opacity', 0.01).style('stroke-opacity', 0.1);
      hullWatermarks.style('opacity', 0.01);

      // --- Bioluminescent Particle Spawning Code ---
      const mainGroup = svgElement.select('.main-container');
      let particlesGroup = mainGroup.select('.particles-group') as any;
      if (particlesGroup.empty()) {
        particlesGroup = mainGroup.insert('g', '.nodes-container').attr('class', 'particles-group') as any;
      }

      particleInterval = setInterval(() => {
        linksLine.each(function (l: any) {
          const { sId, tId } = getLinkId(l);
          const stepIndex = traceSteps.findIndex(s => s.source === sId && s.target === tId);
          if (stepIndex === -1) return;

          const isActiveStep = stepIndex === currentTraceStep;
          const sourceX = l.source?.x;
          const sourceY = l.source?.y;
          const targetX = l.target?.x;
          const targetY = l.target?.y;

          if (sourceX === undefined || sourceY === undefined || targetX === undefined || targetY === undefined) return;

          // Muted steps spawn particles less frequently to avoid screen clutter
          if (!isActiveStep && Math.random() > 0.35) return;

          const particle = particlesGroup.append('circle')
            .attr('class', isActiveStep ? 'flow-particle active-particle' : 'flow-particle')
            .attr('r', isActiveStep ? 4.5 : 3.0)
            .attr('cx', sourceX)
            .attr('cy', sourceY)
            .attr('fill', isActiveStep ? 'var(--color-accent)' : 'var(--color-primary)')
            .style('opacity', isActiveStep ? 1.0 : 0.6)
            .style('pointer-events', 'none')
            .style('filter', isActiveStep 
              ? 'drop-shadow(0 0 5px var(--color-accent))' 
              : 'drop-shadow(0 0 3px var(--color-primary))'
            );

          particle.transition()
            .duration(1200)
            .ease(d3.easeLinear)
            .attr('cx', targetX)
            .attr('cy', targetY)
            .remove();
        });
      }, 300);

    } else if (shortestPath) {
      const pathSet = new Set(shortestPath);
      nodesG.style('opacity', (d: any) => pathSet.has(d.id) ? 1.0 : 0.08);
      nodesG.select('text').style('fill', (d: any) => pathSet.has(d.id) ? 'var(--text-primary)' : 'var(--text-secondary)').style('font-weight', (d: any) => pathSet.has(d.id) ? '700' : '500');
      linksLine.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        const sIdx = shortestPath.indexOf(sId);
        const inPath = sIdx !== -1 && shortestPath[sIdx + 1] === tId;
        const line = d3.select(this);
        if (inPath) {
          line.attr('class', 'link-element shortest-path').style('stroke-opacity', 1.0);
        } else {
          line.attr('class', 'link-element').style('stroke-opacity', 0.02).style('stroke', 'var(--link-stroke)');
        }
      });
      pipelines.style('stroke-opacity', 0.01);
      hullsBoundary.style('fill-opacity', 0.01).style('stroke-opacity', 0.1);
      hullWatermarks.style('opacity', 0.01);
    } else if (activeId) {
      const neighbors = new Set<string>([activeId]);
      const activeRenderedLinks: any[] = [];
      linksLine.each(function (l: any) {
        if (l) activeRenderedLinks.push(l);
      });
      activeRenderedLinks.forEach((link: any) => {
        const { sId, tId } = getLinkId(link);
        if (sId === activeId) neighbors.add(tId);
        if (tId === activeId) neighbors.add(sId);
      });
      nodesG.style('opacity', (d: any) => neighbors.has(d.id) ? 1.0 : 0.15);
      nodesG.select('text').style('fill', (d: any) => d.id === activeId ? 'var(--text-primary)' : 'var(--text-secondary)').style('font-weight', (d: any) => d.id === activeId ? '700' : '500');
      linksLine.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        const line = d3.select(this);
        
        if (viewMode === 'dbSchema') {
          const isRelated = sId === activeId || tId === activeId;
          if (l.isApiConnection) {
            let marker = 'url(#db-arrow)';
            let stroke = 'rgba(99, 102, 241, 0.05)';
            let opacity = isRelated ? 1.0 : 0.05;
            
            if (isRelated) {
              if (l.isMismatch) {
                marker = 'url(#db-arrow-mismatch)';
                stroke = '#ef4444';
              } else if (l.connectionType === 'write') {
                marker = 'url(#db-arrow-write)';
                stroke = 'rgba(59, 130, 246, 0.9)';
              } else {
                marker = 'url(#db-arrow-read)';
                stroke = 'rgba(16, 185, 129, 0.9)';
              }
            } else if (l.isMismatch) {
              stroke = 'rgba(239, 68, 68, 0.15)';
              marker = 'url(#db-arrow-mismatch)';
              opacity = 0.15;
            }
            
            line.style('stroke', stroke)
              .style('stroke-opacity', opacity)
              .attr('stroke-dasharray', l.isMismatch ? '4,4' : null)
              .attr('marker-end', marker);
          } else {
            const stroke = isRelated ? 'var(--color-secondary)' : 'rgba(99, 102, 241, 0.05)';
            const opacity = isRelated ? 0.95 : 0.05;
            const marker = isRelated ? 'url(#db-arrow-highlight)' : 'url(#db-arrow)';
            
            line.style('stroke', stroke)
              .style('stroke-opacity', opacity)
              .attr('stroke-dasharray', null)
              .attr('marker-end', marker);
          }
          return;
        }

        const isAmbiguous = viewMode === 'call' && l.isAmbiguous;
        const isCyclic = viewMode === 'dependency' && cyclicLinks.has(`${sId}->${tId}`);
        const isFlowing = viewMode === 'dependency';
        let cls = 'link-element';
        if (isFlowing) cls += ' flowing';
        
        if (sId === activeId) {
          line.attr('class', cls + ' flow-out')
            .style('stroke-opacity', 0.95)
            .style('stroke', isAmbiguous ? '#fb923c' : (null as any))
            .attr('stroke-dasharray', isAmbiguous ? '4,4' : null)
            .attr('marker-end', isAmbiguous ? 'url(#arrow-violating)' : 'url(#arrow-highlight)');
        } else if (tId === activeId) {
          line.attr('class', cls + ' flow-in')
            .style('stroke-opacity', 0.95)
            .style('stroke', isAmbiguous ? '#fb923c' : (null as any))
            .attr('stroke-dasharray', isAmbiguous ? '4,4' : null)
            .attr('marker-end', isAmbiguous ? 'url(#arrow-violating)' : 'url(#arrow-highlight-incoming)');
        } else {
          const isViolating = linterViolations?.violatingLinks.some((vl: any) => {
            const vlSource = typeof vl.source === 'object' ? vl.source.id : vl.source;
            const vlTarget = typeof vl.target === 'object' ? vl.target.id : vl.target;
            return vlSource === sId && vlTarget === tId;
          });
          if (isViolating) {
            line.attr('class', cls + ' linter-violating-link')
                .style('stroke-opacity', 0.45)
                .style('stroke', '#f97316')
                .attr('marker-end', 'url(#arrow-violating)');
          } else {
            line.attr('class', isCyclic ? 'link-element flow-cycle' : (isFlowing ? cls : 'link-element'))
              .style('stroke-opacity', isCyclic ? 0.25 : 0.03)
              .style('stroke', isCyclic ? 'var(--color-alert)' : 'var(--link-stroke)')
              .attr('marker-end', isCyclic ? 'url(#arrow-cycle)' : 'url(#arrow-normal)');
          }
        }
      });
      pipelines.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        const line = d3.select(this);
        if (sId === activeId || tId === activeId) {
          line.style('stroke-opacity', 0.8);
        } else {
          line.style('stroke-opacity', 0.01);
        }
      });
      hullsBoundary.style('fill-opacity', 0.01).style('stroke-opacity', 0.1);
      
      let activeFolder: string | null = null;
      nodesG.each((d: any) => {
        if (d.id === activeId) {
          activeFolder = d.folder;
        }
      });
      hullWatermarks.style('opacity', (d: any) => {
        if (activeFolder && d[0] === activeFolder) {
          return 1.0;
        }
        return 0.05;
      });
    } else if (query) {
      const matches = new Set<string>();
      nodesG.each((d: any) => {
        // If node is NPM/External, only check query
        if (d.isNpm || d.language === 'npm') {
          if (query && d.name.toLowerCase().includes(query)) {
            matches.add(d.id);
          }
          return;
        }

        // Search Query
        let isMatch = false;
        const idLower = (d.id || '').toLowerCase();
        const nameLower = (d.name || '').toLowerCase();
        if (idLower.includes(query) || nameLower.includes(query)) {
          isMatch = true;
        }
        if (!isMatch && graphData.callNodes) {
          isMatch = graphData.callNodes.some(fn => fn.file === d.id && fn.name.toLowerCase().includes(query));
        }
        if (!isMatch && graphData.classNodes) {
          isMatch = graphData.classNodes.some(cn => {
            if (cn.file !== d.id) return false;
            if (cn.name.toLowerCase().includes(query)) return true;
            if (cn.props && cn.props.some(p => p.toLowerCase().includes(query))) return true;
            if (cn.state && cn.state.some(s => s.toLowerCase().includes(query))) return true;
            if (cn.hooks && cn.hooks.some(h => h.toLowerCase().includes(query))) return true;
            return false;
          });
        }
        
        if (isMatch) {
          matches.add(d.id);
        }
      });

      nodesG.style('opacity', (d: any) => matches.has(d.id) ? 1.0 : 0.15);
      nodesG.select('text').style('fill', (d: any) => matches.has(d.id) ? 'var(--text-primary)' : 'var(--text-secondary)').style('font-weight', (d: any) => matches.has(d.id) ? '600' : '500');
      linksLine.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        const isCyclic = viewMode === 'dependency' && cyclicLinks.has(`${sId}->${tId}`);
        const isMatch = matches.has(sId) || matches.has(tId);
        const isFlowing = viewMode === 'dependency';
        const cls = isFlowing ? 'link-element flowing' : 'link-element';
        
        d3.select(this)
          .attr('class', isCyclic ? 'link-element flow-cycle' : cls)
          .style('stroke-opacity', isMatch ? 0.7 : 0.03)
          .style('stroke', isCyclic ? 'var(--color-alert)' : 'var(--link-stroke)')
          .attr('marker-end', isCyclic ? 'url(#arrow-cycle)' : 'url(#arrow-normal)');
      });
      pipelines.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        const isMatch = matches.has(sId) || matches.has(tId);
        d3.select(this).style('stroke-opacity', isMatch ? 0.6 : 0.01);
      });
      hullsBoundary.style('fill-opacity', 0.01).style('stroke-opacity', 0.1);
      hullWatermarks.style('opacity', 0.05);
    } else {
      nodesG.style('opacity', 1.0);
      nodesG.select('text').style('fill', 'var(--text-secondary)').style('font-weight', '500');
      linksLine.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        
        if (viewMode === 'dbSchema') {
          if (l.isApiConnection) {
            let stroke = 'rgba(99, 102, 241, 0.25)';
            let marker = 'url(#db-arrow)';
            let dash = null;
            if (l.isMismatch) {
              stroke = 'rgba(239, 68, 68, 0.45)';
              marker = 'url(#db-arrow-mismatch)';
              dash = '4,4';
            } else if (l.connectionType === 'write') {
              stroke = 'rgba(59, 130, 246, 0.3)';
              marker = 'url(#db-arrow-write)';
            } else {
              stroke = 'rgba(16, 185, 129, 0.3)';
              marker = 'url(#db-arrow-read)';
            }
            d3.select(this)
              .style('stroke', stroke)
              .style('stroke-opacity', 0.5)
              .attr('stroke-dasharray', dash)
              .attr('marker-end', marker);
          } else {
            d3.select(this)
              .style('stroke', 'rgba(99, 102, 241, 0.4)')
              .style('stroke-opacity', 0.5)
              .attr('stroke-dasharray', null)
              .attr('marker-end', 'url(#db-arrow)');
          }
          return;
        }

        const isAmbiguous = viewMode === 'call' && l.isAmbiguous;
        const isCyclic = viewMode === 'dependency' && cyclicLinks.has(`${sId}->${tId}`);
        const isFlowing = viewMode === 'dependency';
        let cls = isFlowing ? 'link-element flowing' : 'link-element';
        if (isAmbiguous) cls += ' link-ambiguous';
        
        const isViolating = linterViolations?.violatingLinks.some((vl: any) => {
          const vlSource = typeof vl.source === 'object' ? vl.source.id : vl.source;
          const vlTarget = typeof vl.target === 'object' ? vl.target.id : vl.target;
          return vlSource === sId && vlTarget === tId;
        });
        if (isViolating) cls += ' linter-violating-link';

        d3.select(this)
          .attr('class', isViolating ? cls : (isCyclic ? 'link-element flow-cycle' : cls))
          .style('stroke-opacity', isViolating ? 0.95 : (isCyclic ? 0.6 : (isAmbiguous ? 0.8 : (isFlowing ? 0.75 : 0.2))))
          .style('stroke', isViolating ? '#f97316' : (isCyclic ? 'var(--color-alert)' : (isAmbiguous ? '#fb923c' : 'var(--link-stroke)')))
          .attr('stroke-dasharray', isAmbiguous ? '4,4' : null)
          .attr('marker-end', isViolating ? 'url(#arrow-violating)' : (isCyclic ? 'url(#arrow-cycle)' : 'url(#arrow-normal)'));
      });
      pipelines.each(function () {
        const line = d3.select(this);
        line.style('stroke-opacity', (d: any) => d.isAggregated ? 0.18 : 0.12);
      });
      hullsBoundary.style('fill-opacity', 0.04).style('stroke-opacity', 0.4);
      hullWatermarks.style('opacity', 1.0);
    }

    const transform = d3.zoomTransform(svgRef.current);
    applyLevelOfDetail(transform.k);

    if (drawMinimapRef.current) {
      drawMinimapRef.current();
    }

    return () => {
      if (particleInterval) {
        clearInterval(particleInterval);
      }
      svgElement.selectAll('.flow-particle').remove();
    };
  }, [hoveredNode, selectedNode, graphData, viewMode, searchQuery, cyclicLinks, heatmapMode, shortestPath, activeTraceNodeId, currentTraceStep, traceSteps, isMinimapExpanded, diffData, isEvolutionMode, currentEvolutionStep, gitHistory, linterViolations, auditReport, filterLanguage, filterMinLoc, filterFolderPath, showApiDbMapping]);

  // Fast hover and selection highlighting for DB Schema
  useEffect(() => {
    if (viewMode !== 'dbSchema' || !svgRef.current) return;
    const svgElement = d3.select(svgRef.current);
    
    // Update links styles
    svgElement.selectAll('.db-relationship-link')
      .attr('stroke', (d: any) => {
        if (queryTokens.length > 0) {
          const sId = d.source.id || d.source;
          const tId = d.target.id || d.target;
          const hasSource = queryTokens.includes(sId);
          const hasTarget = queryTokens.includes(tId);
          if (hasSource && hasTarget) return '#10b981';
          if (hasSource || hasTarget) return 'rgba(16, 185, 129, 0.5)';
          return 'rgba(99, 102, 241, 0.15)';
        }
        const isHovered = hoveredDbTableId === d.source.id || hoveredDbTableId === d.target.id;
        const isSelected = selectedDbTableId === d.source.id || selectedDbTableId === d.target.id;
        return isSelected || isHovered ? 'var(--color-secondary)' : 'rgba(99, 102, 241, 0.4)';
      })
      .attr('stroke-width', (d: any) => {
        if (queryTokens.length > 0) {
          const sId = d.source.id || d.source;
          const tId = d.target.id || d.target;
          const hasSource = queryTokens.includes(sId);
          const hasTarget = queryTokens.includes(tId);
          if (hasSource && hasTarget) return 4;
          if (hasSource || hasTarget) return 2;
          return 1;
        }
        const isHovered = hoveredDbTableId === d.source.id || hoveredDbTableId === d.target.id;
        const isSelected = selectedDbTableId === d.source.id || selectedDbTableId === d.target.id;
        return isSelected || isHovered ? 3 : 1.5;
      })
      .attr('marker-end', (d: any) => {
        if (queryTokens.length > 0) {
          const sId = d.source.id || d.source;
          const tId = d.target.id || d.target;
          if (queryTokens.includes(sId) || queryTokens.includes(tId)) return 'url(#db-arrow-query)';
          return 'url(#db-arrow)';
        }
        const isHovered = hoveredDbTableId === d.source.id || hoveredDbTableId === d.target.id;
        const isSelected = selectedDbTableId === d.source.id || selectedDbTableId === d.target.id;
        return isSelected || isHovered ? 'url(#db-arrow-highlight)' : 'url(#db-arrow)';
      })
      .style('opacity', (d: any) => {
        if (queryTokens.length > 0) {
          const sId = d.source.id || d.source;
          const tId = d.target.id || d.target;
          const hasSource = queryTokens.includes(sId);
          const hasTarget = queryTokens.includes(tId);
          if (hasSource && hasTarget) return 1.0;
          if (hasSource || hasTarget) return 0.6;
          return 0.1;
        }
        if (!hoveredDbTableId) return 1.0;
        const isRelated = d.source.id === hoveredDbTableId || d.target.id === hoveredDbTableId;
        return isRelated ? 1.0 : 0.2;
      });

    // Update nodes opacity & borders
    svgElement.selectAll('.db-table-node').each(function (d: any) {
      const el = d3.select(this);
      const isHoveredSelf = hoveredDbTableId === d.id;
      
      let opacity = 1.0;
      if (queryTokens.length > 0) {
        opacity = queryTokens.includes(d.id) ? 1.0 : 0.15;
      } else if (hoveredDbTableId) {
        if (isHoveredSelf) {
          opacity = 1.0;
        } else {
          // Check if related
          const isRelated = dbSchema.relationships.some(r => 
            (r.source === d.id && r.target === hoveredDbTableId) || 
            (r.source === hoveredDbTableId && r.target === d.id)
          );
          opacity = isRelated ? 1.0 : 0.35;
        }
      }
      
      el.style('opacity', opacity);
      
      const cardDiv = el.select('foreignObject').select('div');
      if (!cardDiv.empty()) {
        const isSelectedSelf = selectedDbTableId === d.id;
        if (queryTokens.length > 0 && queryTokens.includes(d.id)) {
          cardDiv.style('border-color', '#10b981');
          cardDiv.style('box-shadow', '0 0 18px rgba(16, 185, 129, 0.45)');
        } else {
          cardDiv.style('border-color', isSelectedSelf || isHoveredSelf ? 'var(--color-secondary)' : 'var(--panel-border)');
          cardDiv.style('box-shadow', isSelectedSelf || isHoveredSelf ? '0 0 15px rgba(0, 242, 254, 0.25)' : '0 4px 15px rgba(0,0,0,0.15)');
        }
      }
    });
  }, [viewMode, hoveredDbTableId, selectedDbTableId, dbSchema.relationships, queryTokens]);

  // Sync selectedDbTableId with selectedNode when in dbSchema mode
  useEffect(() => {
    if (viewMode === 'dbSchema' && selectedNode) {
      const isTable = dbSchema.tables.some(t => t.id === selectedNode);
      if (isTable) {
        setSelectedDbTableId(selectedNode);
      }
    }
  }, [selectedNode, viewMode, dbSchema.tables]);

  // Smoothly pan & zoom to the selected node or selected DB table when it changes
  useEffect(() => {
    const targetId = viewMode === 'dbSchema' ? selectedDbTableId : selectedNode;
    if (!targetId || !svgRef.current || !zoomBehaviorRef.current || !containerRef.current) return;
    
    // Look up node coordinates from nodePositionsRef
    const pos = nodePositionsRef.current.get(targetId);
    if (!pos) return;
    
    const svgElement = d3.select(svgRef.current);
    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 600;
    
    svgElement.transition()
      .duration(850)
      .ease(d3.easeCubicOut)
      .call(
        zoomBehaviorRef.current.transform,
        d3.zoomIdentity
          .translate(width / 2 - pos.x * 1.3, height / 2 - pos.y * 1.3)
          .scale(1.3)
      );
  }, [selectedNode, selectedDbTableId, viewMode]);

  // Helper to get deterministic Z offset for 3D layout
  const hashStringToFloat = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return (Math.abs(hash) % 240) - 120;
  };

  // 3D Canvas Rendering Hook
  useEffect(() => {
    if (!is3DMode || !canvas3DRef.current) return;
    const canvas = canvas3DRef.current;
    let animationFrameId: number;
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    
    // Set canvas sizes
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth || 800;
        canvas.height = parent.clientHeight || 500;
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Mouse drag handlers to rotate
    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (isDragging) {
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;

        rotation3DRef.current = {
          x: rotation3DRef.current.x + deltaY * 0.008,
          y: rotation3DRef.current.y + deltaX * 0.008
        };

        previousMousePosition = { x: e.clientX, y: e.clientY };
      } else {
        // Hover detection: find closest node in projected 2D space
        const nodes3D = (canvas as any).__projectedNodes || [];
        let closestNode: any = null;
        let minDistance = 25; // max hover distance in pixels

        nodes3D.forEach((n: any) => {
          const dx = mouseX - n.projX;
          const dy = mouseY - n.projY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDistance && dist < (n.projRadius + 12)) {
            closestNode = n;
            minDistance = dist;
          }
        });

        if (closestNode) {
          if (hoveredNode3D !== closestNode.id) {
            const isCyclic = graphData.cycles.some(cycle => cycle.includes(closestNode.id));
            audioSonifier.playNodeHover({ ...closestNode, isCyclic });
          }
          setHoveredNode3D(closestNode.id);
        } else {
          setHoveredNode3D(null);
        }
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    const handleMouseLeave = () => {
      isDragging = false;
      setHoveredNode3D(null);
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      setZoomScale3D(prev => Math.min(Math.max(prev * zoomFactor, 0.15), 4.0));
    };

    const handleClick = (e: MouseEvent) => {
      e.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const nodes3D = (canvas as any).__projectedNodes || [];
      let closestNode: any = null;
      let minDistance = 25;

      nodes3D.forEach((n: any) => {
        const dx = mouseX - n.projX;
        const dy = mouseY - n.projY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDistance && dist < (n.projRadius + 12)) {
          closestNode = n;
          minDistance = dist;
        }
      });

      if (closestNode) {
        setSelectedNode(closestNode.id);
      } else {
        setSelectedNode(null);
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('click', handleClick);

    // Particle state tracking
    const particles: { linkId: string; progress: number; speed: number }[] = [];

    // Main render loop
    const render = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      // Clear with dark space backdrop
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, width, height);

      // Draw faint background spatial grid circles/stars to enhance 3D effect
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.03)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.4, 0, 2 * Math.PI);
      ctx.stroke();

      // Retrieve nodes and links
      const rawNodes = activeNodesRef.current || [];
      const rawLinks = activeLinksRef.current || [];

      // Handle auto rotation
      if (autoRotate3D && !isDragging) {
        rotation3DRef.current.y += 0.003; // spin slowly
      }

      const rotX = rotation3DRef.current.x;
      const rotY = rotation3DRef.current.y;

      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);

      const fov = 700;

      // Project Nodes
      const projectedNodes = rawNodes.map((n: any) => {
        // Ensure z coordinate exists
        if (n.z === undefined) {
          n.z = hashStringToFloat(n.id);
        }

        // Standard center offsets (subtract center of gravity)
        const ox = n.x !== undefined ? n.x : 0;
        const oy = n.y !== undefined ? n.y : 0;
        const oz = n.z;

        // Apply 3D Rotation
        // Rotate around X axis
        let x1 = ox;
        let y1 = oy * cosX - oz * sinX;
        let z1 = oy * sinX + oz * cosX;

        // Rotate around Y axis
        let rx = x1 * cosY + z1 * sinY;
        let ry = y1;
        let rz = -x1 * sinY + z1 * cosY;

        // Apply Zoom scale
        rx *= zoomScale3D;
        ry *= zoomScale3D;
        rz *= zoomScale3D;

        // Perspective projection mapping
        const scaleFactor = fov / (fov + rz);
        const projX = rx * scaleFactor + width / 2;
        const projY = ry * scaleFactor + height / 2;

        // Node base radius
        let baseRadius = 8;
        if (n.isFolder) baseRadius = 16;
        else if (n.isNpm) baseRadius = 6;
        else if (viewMode === 'dbSchema') baseRadius = 24; // Schema card
        else {
          const complexity = n.complexity || 10;
          baseRadius = 6 + Math.log10(complexity) * 4;
        }

        const projRadius = Math.max(2, baseRadius * scaleFactor);

        return {
          ...n,
          ox, oy, oz,
          rx, ry, rz,
          projX, projY, projRadius,
          scaleFactor
        };
      });

      // Cache projected nodes on canvas element for click and hover detection
      (canvas as any).__projectedNodes = projectedNodes;

      // Map node ID to projected node for quick link lookup
      const nodeMap = new Map<string, any>();
      projectedNodes.forEach(pn => nodeMap.set(pn.id, pn));

      // Draw Links
      rawLinks.forEach((link: any) => {
        const sId = typeof link.source === 'object' ? link.source.id : link.source;
        const tId = typeof link.target === 'object' ? link.target.id : link.target;

        const sNode = nodeMap.get(sId);
        const tNode = nodeMap.get(tId);

        if (!sNode || !tNode) return;

        // Average depth of source and target for link visibility sorting
        const avgDepth = (sNode.rz + tNode.rz) / 2;
        const opacity = Math.min(0.8, Math.max(0.04, (fov - avgDepth) / (fov * 1.5)));

        // Select color based on status or cycles
        let strokeColor = 'rgba(99, 102, 241, ' + opacity + ')';
        if (link.isAggregated) {
          strokeColor = 'rgba(236, 72, 153, ' + opacity + ')';
        } else if (link.isAmbiguous) {
          strokeColor = 'rgba(245, 158, 11, ' + (opacity * 1.5) + ')';
        }

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.max(0.5, (link.isAggregated ? 3 : (link.isAmbiguous ? 1.5 : 1)) * ((sNode.scaleFactor + tNode.scaleFactor) / 2));
        
        if (link.isAmbiguous) {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }
        
        ctx.beginPath();
        ctx.moveTo(sNode.projX, sNode.projY);
        ctx.lineTo(tNode.projX, tNode.projY);
        ctx.stroke();
        
        if (link.isAmbiguous) {
          ctx.setLineDash([]);
        }
      });

      // Spawn new particles occasionally
      if (rawLinks.length > 0 && Math.random() < 0.15 && particles.length < 80) {
        const randomLink = rawLinks[Math.floor(Math.random() * rawLinks.length)];
        const linkId = `${typeof randomLink.source === 'object' ? randomLink.source.id : randomLink.source}->${typeof randomLink.target === 'object' ? randomLink.target.id : randomLink.target}`;
        particles.push({
          linkId,
          progress: 0,
          speed: 0.008 + Math.random() * 0.012
        });
      }

      // Render active particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.progress += p.speed;

        if (p.progress >= 1) {
          particles.splice(i, 1);
          continue;
        }

        const [sId, tId] = p.linkId.split('->');
        const sNode = nodeMap.get(sId);
        const tNode = nodeMap.get(tId);

        if (sNode && tNode) {
          // Linear interpolation in 2D space
          const px = sNode.projX + (tNode.projX - sNode.projX) * p.progress;
          const py = sNode.projY + (tNode.projY - sNode.projY) * p.progress;
          const pScale = sNode.scaleFactor + (tNode.scaleFactor - sNode.scaleFactor) * p.progress;

          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(px, py, Math.max(1.5, 3 * pScale), 0, 2 * Math.PI);
          ctx.fill();

          // Particle outer glow
          ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
          ctx.beginPath();
          ctx.arc(px, py, Math.max(3, 6 * pScale), 0, 2 * Math.PI);
          ctx.fill();
        }
      }

      // Sort Nodes by Depth (z-order sorting) to ensure correct layering
      const sortedNodes = [...projectedNodes].sort((a, b) => b.rz - a.rz);

      sortedNodes.forEach((n: any) => {
        const isHovered = n.id === hoveredNode3D;
        const isSelected = n.id === selectedNode;

        // Draw node body (Shiny Sphere using Radial Gradient)
        const rad = n.projRadius;
        
        let colorTheme = {
          core: '#6366f1',
          glow: 'rgba(99, 102, 241, 0.4)',
          highlight: '#ffffff'
        };

        if (n.isNpm && n.isVulnerable) {
          colorTheme = { core: '#ef4444', glow: 'rgba(239, 68, 68, 0.3)', highlight: '#ffffff' };
        } else if (n.isFolder) {
          colorTheme = { core: '#f59e0b', glow: 'rgba(245, 158, 11, 0.3)', highlight: '#fef3c7' };
        } else if (n.isNpm) {
          colorTheme = { core: '#ec4899', glow: 'rgba(236, 72, 153, 0.3)', highlight: '#fbcfe8' };
        } else if (isSelected) {
          colorTheme = { core: '#10b981', glow: 'rgba(16, 185, 129, 0.6)', highlight: '#ffffff' };
        } else if (isHovered) {
          colorTheme = { core: '#3b82f6', glow: 'rgba(59, 130, 246, 0.6)', highlight: '#ffffff' };
        }

        // Draw outer depth/glow
        ctx.fillStyle = colorTheme.glow;
        ctx.beginPath();
        ctx.arc(n.projX, n.projY, rad * (isHovered || isSelected ? 1.6 : 1.2), 0, 2 * Math.PI);
        ctx.fill();

        if (n.isNpm && n.isVulnerable) {
          const pulseFactor = 1.3 + 0.4 * Math.sin(Date.now() * 0.005);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
          ctx.beginPath();
          ctx.arc(n.projX, n.projY, rad * pulseFactor, 0, 2 * Math.PI);
          ctx.fill();
        }

        // Node sphere base
        const grad = ctx.createRadialGradient(
          n.projX - rad * 0.2, n.projY - rad * 0.2, rad * 0.1,
          n.projX, n.projY, rad
        );
        grad.addColorStop(0, colorTheme.highlight);
        grad.addColorStop(0.2, colorTheme.core);
        grad.addColorStop(1, '#050510');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(n.projX, n.projY, rad, 0, 2 * Math.PI);
        ctx.fill();

        // Node borders
        ctx.strokeStyle = isSelected ? '#10b981' : (isHovered ? '#60a5fa' : 'rgba(255,255,255,0.08)');
        ctx.lineWidth = isSelected || isHovered ? 2 : 0.5;
        ctx.stroke();

        if (n.isNpm && n.isVulnerable) {
          const bx = n.projX + rad * 0.8;
          const by = n.projY - rad * 0.8;
          ctx.fillStyle = '#ef4444';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(bx - 4, by - 5);
          ctx.lineTo(bx + 4, by - 5);
          ctx.lineTo(bx + 4, by - 1);
          ctx.quadraticCurveTo(bx + 4, by + 2, bx, by + 5);
          ctx.quadraticCurveTo(bx - 4, by + 2, bx - 4, by - 1);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // Render Labels
        const showLabel = isHovered || isSelected || projectedNodes.length < 45 || (n.isFolder && n.scaleFactor > 0.8);
        if (showLabel) {
          ctx.fillStyle = isSelected ? '#10b981' : (isHovered ? '#ffffff' : 'var(--text-secondary)');
          const fontSize = Math.max(8, Math.min(13, Math.round(10 * n.scaleFactor)));
          ctx.font = `${isSelected || isHovered ? 'bold' : 'normal'} ${fontSize}px sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(n.name, n.projX + rad + 6, n.projY);
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('click', handleClick);
    };
  }, [is3DMode, autoRotate3D, zoomScale3D, viewMode, selectedNode, hoveredNode3D]);

  // Weather particles state
  useEffect(() => {
    if (!weatherEnabled || !weatherCanvasRef.current) {
      audioSonifier.stopAmbientWeather();
      return;
    }

    const canvas = weatherCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const resizeWeatherCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth || 800;
        canvas.height = parent.clientHeight || 500;
      }
    };
    resizeWeatherCanvas();
    window.addEventListener('resize', resizeWeatherCanvas);

    // Weather particles initialization
    interface Spark { x: number; y: number; vx: number; vy: number; alpha: number; size: number; color: string; }
    interface RainDrop { x: number; y: number; vy: number; length: number; speed: number; }
    interface Splash { x: number; y: number; r: number; maxR: number; alpha: number; }
    interface SmokeParticle { x: number; y: number; vx: number; vy: number; size: number; alpha: number; life: number; maxLife: number; }
    interface LightningBolt { path: { x: number; y: number }[]; maxAlpha: number; alpha: number; width: number; }

    const sparks: Spark[] = [];
    const rain: RainDrop[] = [];
    const splashes: Splash[] = [];
    const smoke: SmokeParticle[] = [];
    let lightning: LightningBolt | null = null;
    let flashAlpha = 0;

    // Helper to generate a fractal lightning bolt path
    const getFractalPath = (x1: number, y1: number, x2: number, y2: number, displace: number): { x: number; y: number }[] => {
      if (displace < 4) {
        return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
      }
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const px = -dy / len;
      const py = dx / len;
      const offset = (Math.random() - 0.5) * displace;
      const mx = midX + px * offset;
      const my = midY + py * offset;

      const path1 = getFractalPath(x1, y1, mx, my, displace * 0.48);
      const path2 = getFractalPath(mx, my, x2, y2, displace * 0.48);
      return [...path1, ...path2.slice(1)];
    };

    // Calculate metrics
    const cycleCount = graphData?.cycles?.length || 0;
    const allNodes = [...(graphData?.nodes || []), ...(showNpmPackages ? (graphData?.npmNodes || []) : [])];
    const vulnerableNodes = allNodes.filter(n => n.isVulnerable);
    const cveCount = vulnerableNodes.length;

    const avgComp = (graphData?.nodes || []).reduce((acc, n) => acc + (n.complexity || 0), 0) / ((graphData?.nodes || []).length || 1);
    const avgChurn = (graphData?.nodes || []).reduce((acc, n) => acc + (n.churn || 0), 0) / ((graphData?.nodes || []).length || 1);
    const hotspotNodes = (graphData?.nodes || []).filter(n => (n.complexity || 0) >= avgComp && (n.churn || 0) >= avgChurn);
    const hotspotCount = hotspotNodes.length;

    // Update ambient sound based on counts
    audioSonifier.updateAmbientWeather(cveCount, cycleCount, hotspotCount);

    let lastTime = Date.now();

    const loop = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const now = Date.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // 1. Get Node coordinates in screen space
      let screenNodes: { id: string; x: number; y: number; radius: number; isVulnerable?: boolean; isHotspot?: boolean }[] = [];
      if (is3DMode && canvas3DRef.current) {
        const projected = (canvas3DRef.current as any).__projectedNodes || [];
        screenNodes = projected.map((n: any) => ({
          id: n.id,
          x: n.projX,
          y: n.projY,
          radius: n.projRadius || 12,
          isVulnerable: n.isVulnerable,
          isHotspot: hotspotNodes.some(hn => hn.id === n.id)
        }));
      } else if (svgRef.current) {
        const transform = d3.zoomTransform(svgRef.current);
        screenNodes = allNodes.map((n: any) => {
          const pos = nodePositionsRef.current.get(n.id) || { x: n.x || 0, y: n.y || 0 };
          let r = 12;
          if (n.isFolder) r = 24;
          else if (viewMode === 'call') r = 12 + Math.min((n.callCount || 0) * 1.5, 20);
          return {
            id: n.id,
            x: pos.x * transform.k + transform.x,
            y: pos.y * transform.k + transform.y,
            radius: r,
            isVulnerable: n.isVulnerable,
            isHotspot: hotspotNodes.some(hn => hn.id === n.id)
          };
        });
      }

      // Filter screen nodes inside visible bounds of screen to optimize search
      const visibleNodes = screenNodes.filter(sn => sn.x >= -50 && sn.x <= w + 50 && sn.y >= -50 && sn.y <= h + 50);

      // --- CLEAR SKY MODE (Neon Drifting Sparks) ---
      const totalDisturbance = cveCount + cycleCount + hotspotCount;
      const maxSparks = totalDisturbance === 0 ? 60 : 15;
      if (sparks.length < maxSparks && Math.random() < 0.2) {
        sparks.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 12,
          vy: -Math.random() * 8 - 4, // drift upwards
          alpha: Math.random() * 0.4 + 0.1,
          size: Math.random() * 1.8 + 0.6,
          color: Math.random() > 0.5 ? 'rgba(99, 102, 241, ' : 'rgba(236, 72, 153, '
        });
      }

      ctx.save();
      sparks.forEach((s, idx) => {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.alpha -= 0.05 * dt;
        if (s.alpha <= 0 || s.x < 0 || s.x > w || s.y < 0) {
          sparks.splice(idx, 1);
          return;
        }
        ctx.fillStyle = s.color + s.alpha + ')';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      // --- DIGITAL ACID RAIN MODE ---
      if (cycleCount > 0) {
        const targetRainCount = Math.min(150, 20 + cycleCount * 12);
        if (rain.length < targetRainCount) {
          rain.push({
            x: Math.random() * w,
            y: -20,
            vy: Math.random() * 300 + 400,
            length: Math.random() * 15 + 8,
            speed: Math.random() * 0.05 + 0.03
          });
        }
      }

      ctx.save();
      // Draw Rain
      rain.forEach((r, idx) => {
        r.y += r.vy * dt;
        // Check collision with nodes
        let hitNode = false;
        for (let i = 0; i < visibleNodes.length; i++) {
          const node = visibleNodes[i];
          const dx = r.x - node.x;
          const dy = r.y - node.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < node.radius + 3) {
            hitNode = true;
            splashes.push({
              x: node.x,
              y: node.y,
              r: 1,
              maxR: node.radius + 8,
              alpha: 0.8
            });
            break;
          }
        }

        // Hit bottom of the screen
        if (!hitNode && r.y >= h - 10) {
          hitNode = true;
          splashes.push({
            x: r.x,
            y: h - Math.random() * 5,
            r: 1,
            maxR: Math.random() * 6 + 4,
            alpha: 0.6
          });
        }

        if (hitNode || r.y > h) {
          rain.splice(idx, 1);
          return;
        }

        ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x, r.y + r.length);
        ctx.stroke();
      });

      // Draw Splashes
      splashes.forEach((sp, idx) => {
        sp.r += (sp.maxR - sp.r) * 12 * dt;
        sp.alpha -= 3 * dt;
        if (sp.alpha <= 0 || sp.r >= sp.maxR) {
          splashes.splice(idx, 1);
          return;
        }
        ctx.strokeStyle = `rgba(168, 85, 247, ${sp.alpha})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y, sp.r, sp.r * 0.4, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();

      // --- HOTSPOT MAGMA / SMOKE MODE ---
      const activeHotspots = visibleNodes.filter(n => n.isHotspot);
      ctx.save();
      activeHotspots.forEach(node => {
        const pulse = 1.2 + 0.25 * Math.sin(now * 0.004);
        const grad = ctx.createRadialGradient(
          node.x, node.y, node.radius * 0.4,
          node.x, node.y, node.radius * pulse
        );
        grad.addColorStop(0, 'rgba(239, 68, 68, 0.2)');
        grad.addColorStop(0.5, 'rgba(249, 115, 22, 0.08)');
        grad.addColorStop(1, 'rgba(249, 115, 22, 0)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * pulse, 0, Math.PI * 2);
        ctx.fill();

        if (Math.random() < 0.08) {
          smoke.push({
            x: node.x + (Math.random() - 0.5) * 6,
            y: node.y - node.radius + 5,
            vx: (Math.random() - 0.5) * 15,
            vy: Math.random() * 20 + 20,
            size: Math.random() * 4 + 2,
            alpha: Math.random() * 0.4 + 0.3,
            life: 0,
            maxLife: Math.random() * 1.5 + 0.8
          });
        }
      });

      smoke.forEach((sm, idx) => {
        sm.life += dt;
        if (sm.life >= sm.maxLife) {
          smoke.splice(idx, 1);
          return;
        }
        sm.x += sm.vx * dt;
        sm.y -= sm.vy * dt;
        sm.size += 2 * dt;
        const ageRatio = sm.life / sm.maxLife;
        const currentAlpha = sm.alpha * (1 - ageRatio);

        const smokeColor = ageRatio < 0.3 
          ? `rgba(249, 115, 22, ${currentAlpha})`
          : `rgba(128, 128, 128, ${currentAlpha * 0.6})`;

        ctx.fillStyle = smokeColor;
        ctx.beginPath();
        ctx.arc(sm.x, sm.y, sm.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      // --- LIGHTNING STRIKE MODE ---
      const vulnerableScreenNodes = visibleNodes.filter(n => n.isVulnerable);
      if (vulnerableScreenNodes.length > 0 && Math.random() < 0.0035 * cveCount && !lightning) {
        const target = vulnerableScreenNodes[Math.floor(Math.random() * vulnerableScreenNodes.length)];
        const startX = Math.random() * w;
        const path = getFractalPath(startX, 0, target.x, target.y, w * 0.2);
        
        lightning = {
          path,
          maxAlpha: 1.0,
          alpha: 1.0,
          width: Math.random() * 3 + 2
        };

        audioSonifier.playLightningStrike();
        flashAlpha = Math.random() * 0.45 + 0.15;
      }

      if (lightning) {
        ctx.save();
        lightning.alpha -= 4 * dt;
        if (lightning.alpha <= 0) {
          lightning = null;
        } else {
          ctx.strokeStyle = `rgba(59, 130, 246, ${lightning.alpha * 0.45})`;
          ctx.lineWidth = lightning.width * 2.5;
          ctx.shadowColor = '#3b82f6';
          ctx.shadowBlur = 18;
          ctx.beginPath();
          lightning.path.forEach((pt, pIdx) => {
            if (pIdx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.stroke();

          ctx.strokeStyle = `rgba(255, 255, 255, ${lightning.alpha})`;
          ctx.lineWidth = lightning.width * 0.8;
          ctx.shadowBlur = 0;
          ctx.beginPath();
          lightning.path.forEach((pt, pIdx) => {
            if (pIdx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.stroke();
        }
        ctx.restore();
      }

      if (flashAlpha > 0) {
        flashAlpha -= 3.5 * dt;
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, flashAlpha)})`;
        ctx.fillRect(0, 0, w, h);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resizeWeatherCanvas);
      audioSonifier.stopAmbientWeather();
    };
  }, [weatherEnabled, viewMode, graphData, is3DMode, showNpmPackages]);

  return (
    <div 
      ref={containerRef} 
      className="graph-viewport" 
      onClick={() => setSelectedNode(null)}
      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
    >
      {/* Floating Control Toolbox */}
      <div className="graph-control-toolbox" onClick={(e) => e.stopPropagation()}>
        <div className="toolbox-header" onClick={() => setIsToolboxCollapsed(!isToolboxCollapsed)}>
          <span className="toolbox-title">⚙️ Graph Control Center</span>
          <button className="collapse-toggle-btn" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}>
            {isToolboxCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>

        {!isToolboxCollapsed && (
          <>
            {/* Shortest Path Finder */}
            {viewMode === 'dependency' && (
              <div className="toolbox-section">
                <div className="section-header">📍 Shortest Path Finder</div>
                <div className="flex-row">
                  <div className="select-container">
                    <label>Source:</label>
                    <select value={pathSource || ''} onChange={(e) => setPathSource(e.target.value || null)}>
                      <option value="">-- Select Source --</option>
                      {graphData.nodes.map(n => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                      {showNpmPackages && (graphData.npmNodes || []).map(n => (
                        <option key={n.id} value={n.id}>{`[npm] ${n.name}`}</option>
                      ))}
                    </select>
                  </div>
                  <button 
                    className="cyber-button text-btn" 
                    onClick={() => selectedNode && setPathSource(selectedNode)}
                    disabled={!selectedNode}
                    title="Set as Source"
                  >
                    Set
                  </button>
                </div>

                <div className="flex-row mt-2">
                  <div className="select-container">
                    <label>Target:</label>
                    <select value={pathTarget || ''} onChange={(e) => setPathTarget(e.target.value || null)}>
                      <option value="">-- Select Target --</option>
                      {graphData.nodes.map(n => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                      {showNpmPackages && (graphData.npmNodes || []).map(n => (
                        <option key={n.id} value={n.id}>{`[npm] ${n.name}`}</option>
                      ))}
                    </select>
                  </div>
                  <button 
                    className="cyber-button text-btn" 
                    onClick={() => selectedNode && setPathTarget(selectedNode)}
                    disabled={!selectedNode}
                    title="Set as Target"
                  >
                    Set
                  </button>
                </div>
                {pathSource && pathTarget && (
                  <div className="flex-row mt-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="path-status-text">
                      {shortestPath ? `${shortestPath.length - 1} hops` : 'No path found'}
                    </span>
                    <button className="cyber-button text-btn alert" onClick={() => { setPathSource(null); setPathTarget(null); }}>
                      Clear Path
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* NPM Package Toggle */}
            {viewMode === 'dependency' && (
              <div className="toolbox-section">
                <div className="toggle-row">
                  <span>📦 External Packages</span>
                  <label className="switch">
                    <input type="checkbox" checked={showNpmPackages} onChange={(e) => setShowNpmPackages(e.target.checked)} />
                    <span className="slider round"></span>
                  </label>
                </div>
              </div>
            )}

            {/* Heatmaps Mode */}
            {viewMode === 'dependency' && (
              <div className="toolbox-section">
                <div className="section-header">⏱️ Heatmap Overlay</div>
                <div className="heatmap-btn-group">
                  <button className={`heatmap-tab ${heatmapMode === 'none' ? 'active' : ''}`} onClick={() => setHeatmapMode('none')}>
                    None
                  </button>
                  <button className={`heatmap-tab ${heatmapMode === 'churn' ? 'active' : ''}`} onClick={() => setHeatmapMode('churn')}>
                    Churn
                  </button>
                  <button className={`heatmap-tab ${heatmapMode === 'complexity' ? 'active' : ''}`} onClick={() => setHeatmapMode('complexity')}>
                    LOC
                  </button>
                </div>
              </div>
            )}

            {/* Call Graph Controls */}
            {viewMode === 'call' && (
              <div className="toolbox-section">
                <div className="section-header">📞 Call Graph Analytics</div>
                
                {/* Clean with Gemini Button */}
                <button
                  className="cyber-button primary"
                  onClick={onRefineCallGraph}
                  disabled={isRefiningCallGraph}
                  style={{
                    width: '100%',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontSize: '0.75rem',
                    padding: '8px 12px',
                    cursor: 'pointer'
                  }}
                >
                  <Sparkles size={13} style={{ color: '#fbbf24' }} />
                  {isRefiningCallGraph ? 'Cleaning Call Graph...' : 'Clean Call Graph with Gemini'}
                </button>
                
                {/* Depth Filter */}
                <div className="select-container" style={{ marginBottom: '8px' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Call Depth Filter:</span>
                    <span style={{ color: 'var(--color-secondary)', fontWeight: 600 }}>
                      {depthFilter === -1 ? 'All Hops' : `${depthFilter} Hop${depthFilter > 1 ? 's' : ''}`}
                    </span>
                  </label>
                  <input
                    type="range"
                    min="-1"
                    max="3"
                    step="1"
                    value={depthFilter}
                    disabled={!selectedNode}
                    onChange={(e) => setDepthFilter(Number(e.target.value))}
                    style={{
                      width: '100%',
                      accentColor: 'var(--color-secondary)',
                      marginTop: '4px',
                      cursor: selectedNode ? 'pointer' : 'not-allowed',
                      opacity: selectedNode ? 1 : 0.5
                    }}
                  />
                  {!selectedNode && (
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Select a node to enable depth filter
                    </span>
                  )}
                </div>

                {/* Call Stack Trace Status */}
                <div style={{
                  padding: '8px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--panel-border)',
                  borderRadius: '4px',
                  fontSize: '0.7rem'
                }}>
                  <div style={{ fontWeight: 600, color: 'var(--color-secondary)', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                    <span className="live-dot" style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: activeTraceNodeId ? '#10b981' : 'var(--text-muted)',
                      boxShadow: activeTraceNodeId ? '0 0 8px #10b981' : 'none',
                    }}></span>
                    Call Trace Simulator
                  </div>
                  
                  {activeTraceNodeId ? (
                    <div>
                      <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', marginBottom: '6px' }}>
                        Tracing: <code style={{ color: 'var(--text-primary)' }}>{activeTraceNodeId.split('::').pop()}()</code>
                      </div>
                      {traceSteps.length > 0 ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Step {currentTraceStep + 1} of {traceSteps.length}</span>
                          <button 
                            className="cyber-button text-btn" 
                            style={{ padding: '2px 8px', fontSize: '0.65rem' }}
                            onClick={() => setActiveTraceNodeId(null)}
                          >
                            Stop
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-muted)' }}>No outgoing calls found</span>
                          <button 
                            className="cyber-button text-btn" 
                            style={{ padding: '2px 8px', fontSize: '0.65rem' }}
                            onClick={() => setActiveTraceNodeId(null)}
                          >
                            Stop
                          </button>
                        </div>
                      )}

                      <button 
                        className="cyber-button" 
                        style={{ 
                          width: '100%', 
                          marginTop: '8px', 
                          padding: '6px 10px', 
                          fontSize: '0.72rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          background: 'rgba(99, 102, 241, 0.15)',
                          borderColor: 'rgba(99, 102, 241, 0.3)',
                          color: 'var(--color-primary)',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                        onClick={() => setShowUmlModal(true)}
                      >
                        <span>📊</span> Export Sequence Diagram
                      </button>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', lineHeight: '1.2' }}>
                      Select a node and click <strong>Trace Execution</strong> to animate path.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DB Schema Controls */}
            {viewMode === 'dbSchema' && (
              <div className="toolbox-section">
                <div className="section-header">🗃️ DB Schema Visualizer</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                  <div className="toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Use Mock Demo Schema</span>
                    <label className="switch">
                      <input 
                        type="checkbox" 
                        checked={useDemoDbSchema} 
                        onChange={(e) => {
                          setUseDemoDbSchema(e.target.checked);
                          setSelectedDbTableId(null);
                        }} 
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>
                    Toggle between real workspace database schemas and a complex e-commerce mock dataset.
                  </div>
                  
                  <div className="toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                    <span>Map REST API Endpoints</span>
                    <label className="switch">
                      <input 
                        type="checkbox" 
                        checked={showApiDbMapping} 
                        onChange={(e) => {
                          setShowApiDbMapping(e.target.checked);
                          setSelectedDbTableId(null);
                        }} 
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>
                    Overlay API endpoints. Shows read/write connections, schema drift, and orphaned tables.
                  </div>
                  <button
                    className="cyber-button primary"
                    onClick={handleRunDbAudit}
                    disabled={isAuditingDb}
                    style={{
                      width: '100%',
                      marginTop: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      fontSize: '0.75rem',
                      padding: '8px 12px',
                      cursor: 'pointer'
                    }}
                  >
                    <Sparkles size={13} style={{ color: '#fbbf24' }} />
                    {isAuditingDb ? 'Auditing Schema...' : 'Audit Database Design'}
                  </button>

                  <button
                    className="cyber-button secondary"
                    onClick={() => exportGraph('svg')}
                    style={{
                      width: '100%',
                      marginTop: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      fontSize: '0.75rem',
                      padding: '8px 12px',
                      cursor: 'pointer'
                    }}
                  >
                    <Download size={13} />
                    Export ER Diagram (SVG)
                  </button>

                  <div className="toolbox-divider" style={{ borderTop: '1px solid var(--panel-border)', margin: '8px 0' }}></div>
                  
                  {/* Query Sandbox */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-primary)' }}>💬 SQL / NoSQL Query Sandbox</span>
                      {dbQueryString && (
                        <button 
                          onClick={() => setDbQueryString('')} 
                          style={{ 
                            background: 'transparent', 
                            border: 'none', 
                            color: 'var(--color-alert)', 
                            fontSize: '0.65rem', 
                            cursor: 'pointer', 
                            padding: 0 
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <textarea
                      placeholder="e.g. SELECT * FROM User JOIN RetakeRequest"
                      value={dbQueryString}
                      onChange={(e) => setDbQueryString(e.target.value)}
                      style={{
                        width: '100%',
                        height: '52px',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--panel-border)',
                        borderRadius: '4px',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.65rem',
                        padding: '6px',
                        resize: 'none',
                        outline: 'none',
                        boxShadow: dbQueryString ? '0 0 10px rgba(16, 185, 129, 0.15)' : 'none',
                        transition: 'border-color 0.2s, box-shadow 0.2s'
                      }}
                    />
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                      Type SQL joins or table names. Matching schema cards will light up green in real-time.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Component Tree Controls */}
            {viewMode === 'hierarchy' && (
              <div className="toolbox-section">
                <div className="section-header">🌳 Component Tree Layout</div>
                <div className="toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6.5px' }}>
                  <span>Radial Layout</span>
                  <label className="switch">
                    <input 
                      type="checkbox" 
                      checked={treeLayoutStyle === 'radial'} 
                      onChange={(e) => setTreeLayoutStyle(e.target.checked ? 'radial' : 'top-down')} 
                    />
                    <span className="slider round"></span>
                  </label>
                </div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '4.5px', lineHeight: '1.2' }}>
                  Toggle between a top-down hierarchical tree and a radial concentric circular layout.
                </div>
              </div>
            )}

            {/* Module Clusters (Folders) */}
            {(viewMode === 'dependency' || viewMode === 'cluster') && (
              <div className="toolbox-section">
                <div className="section-header">📁 Module Clusters</div>
                <div className="folder-list-container" style={{ maxHeight: '110px', overflowY: 'auto', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px', paddingRight: '4px' }}>
                  {allFolders.length === 0 ? (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>No folder structures found</span>
                  ) : (
                    allFolders.map(folder => {
                      const isCollapsed = collapsedFolders.has(folder);
                      return (
                        <div key={folder} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '6px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem', cursor: 'pointer', color: 'var(--text-secondary)', userSelect: 'none', overflow: 'hidden', flex: 1 }}>
                            <input
                              type="checkbox"
                              checked={isCollapsed}
                              onChange={() => {
                                setCollapsedFolders(prev => {
                                  const next = new Set(prev);
                                  if (next.has(folder)) next.delete(folder);
                                  else next.add(folder);
                                  return next;
                                });
                              }}
                              style={{ cursor: 'pointer', accentColor: 'var(--color-warning)' }}
                            />
                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={folder}>
                              {folder}
                            </span>
                          </label>
                          <button
                            className="explain-cluster-btn"
                            title="AI Explain Folder"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (onExplainFolder) onExplainFolder(folder);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--color-primary)',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              fontSize: '0.62rem',
                              opacity: 0.75,
                              transition: 'opacity 0.2s'
                            }}
                          >
                            🧠 explain
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="flex-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                  <span className="path-status-text" style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    {collapsedFolders.size} collapsed
                  </span>
                  {collapsedFolders.size > 0 && (
                    <button className="cyber-button text-btn" onClick={() => setCollapsedFolders(new Set())} style={{ padding: '3px 6px', fontSize: '0.65rem' }}>
                      Expand All
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Branch Comparison / Diff Graph Section */}
            {(viewMode === 'dependency' || viewMode === 'cluster') && (
              <div className="toolbox-section" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '10px' }}>
                <div className="section-header">🗂️ Branch Comparison (Diff)</div>
                
                {compareError && (
                  <div style={{ color: '#ef4444', fontSize: '0.65rem', marginBottom: '8px', padding: '6px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    ⚠️ {compareError}
                  </div>
                )}

                {diffData ? (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--panel-border)', borderRadius: '4px', fontSize: '0.68rem', marginBottom: '8px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
                        Active Diff Mode
                      </div>
                      <div style={{ color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        Comparing: <code>{diffData.base}</code> &rarr; <code>{diffData.head}</code>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '0.65rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '4px' }}>
                        <span style={{ color: '#10b981', fontWeight: 600 }}>● {Object.values(diffData.files).filter((f: any) => f.status === 'added').length} Added</span>
                        <span style={{ color: '#fb923c', fontWeight: 600 }}>● {Object.values(diffData.files).filter((f: any) => f.status === 'modified').length} Mod</span>
                        <span style={{ color: '#f43f5e', fontWeight: 600 }}>● {Object.values(diffData.files).filter((f: any) => f.status === 'deleted').length} Del</span>
                      </div>
                    </div>
                    <button 
                      className="cyber-button text-btn" 
                      style={{ width: '100%', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#f43f5e', fontSize: '0.7rem' }}
                      onClick={() => setDiffData(null)}
                    >
                      ⏹️ Exit Diff Mode
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '4px', lineHeight: '1.3' }}>
                      Compare codebase changes between branches or pull requests.
                    </div>
                    {repoName && !repoName.includes('.zip') && repoName.includes('/') ? (
                      <>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '0.6rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Base</label>
                            <input 
                              type="text" 
                              placeholder="main" 
                              className="search-input" 
                              style={{ width: '100%', fontSize: '0.7rem', padding: '4px 8px', height: '26px', background: 'rgba(0,0,0,0.2)' }}
                              value={baseBranch}
                              onChange={(e) => setBaseBranch(e.target.value)}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '0.6rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Head</label>
                            <input 
                              type="text" 
                              placeholder="feature" 
                              className="search-input" 
                              style={{ width: '100%', fontSize: '0.7rem', padding: '4px 8px', height: '26px', background: 'rgba(0,0,0,0.2)' }}
                              value={headBranch}
                              onChange={(e) => setHeadBranch(e.target.value)}
                            />
                          </div>
                        </div>
                        <button 
                          className="cyber-button text-btn" 
                          style={{ padding: '6px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.25)' }}
                          onClick={handleCompareGithub}
                          disabled={isComparing}
                        >
                          {isComparing ? 'Comparing...' : 'Compare GitHub Branches'}
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '0.6rem', color: 'var(--text-muted)', margin: '2px 0' }}>
                          <span>or</span>
                        </div>
                      </>
                    ) : null}
                    <button 
                      className="cyber-button text-btn" 
                      style={{ padding: '6px', fontSize: '0.7rem', background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.25)', color: 'var(--text-secondary)' }}
                      onClick={handleSimulateCompare}
                    >
                      ⚡ Simulate Pull Request Diff
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* Eco-Climate Weather Overlay Control */}
            <div className="toolbox-section" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '10px' }}>
              <div className="toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  🌧️ Eco-Climate Weather
                </span>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={weatherEnabled} 
                    onChange={(e) => setWeatherEnabled(e.target.checked)} 
                  />
                  <span className="slider round"></span>
                </label>
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', lineHeight: '1.2', marginTop: '4px' }}>
                Passive visual overlay & audio sonification mapping codebase complexity, circular loops, and vulnerabilities to atmospheric weather events.
              </div>
            </div>
          </>
        )}
      </div>

      <div className="graph-controls">
        <button className="control-btn" title="Zoom In" onClick={(e) => { e.stopPropagation(); (window as any).graphZoom?.zoomIn(); }}>
          <ZoomIn size={16} />
        </button>
        <button className="control-btn" title="Zoom Out" onClick={(e) => { e.stopPropagation(); (window as any).graphZoom?.zoomOut(); }}>
          <ZoomOut size={16} />
        </button>
        <button className="control-btn" title="Reset View" onClick={(e) => { e.stopPropagation(); (window as any).graphZoom?.reset(); }}>
          <RotateCcw size={16} />
        </button>
        <button 
          className="control-btn" 
          style={{ 
            width: 'auto', 
            padding: '0 8px', 
            gap: '4px', 
            background: is3DMode ? 'var(--color-primary-glow)' : 'transparent',
            borderColor: is3DMode ? 'var(--color-primary)' : 'var(--panel-border)'
          }} 
          title="Toggle 3D WebGL Graph" 
          onClick={(e) => { e.stopPropagation(); setIs3DMode(!is3DMode); }}
        >
          <Box size={14} />
          <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>{is3DMode ? '2D View' : '3D View'}</span>
        </button>
        {is3DMode && (
          <button 
            className="control-btn" 
            style={{ 
              width: 'auto', 
              padding: '0 8px', 
              gap: '4px', 
              background: autoRotate3D ? 'rgba(0, 242, 254, 0.15)' : 'transparent',
              borderColor: autoRotate3D ? 'var(--color-secondary)' : 'var(--panel-border)'
            }} 
            title="Auto-Rotate 3D Graph" 
            onClick={(e) => { e.stopPropagation(); setAutoRotate3D(!autoRotate3D); }}
          >
            <Globe size={14} />
            <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>Spin</span>
          </button>
        )}
        <button 
          className="control-btn" 
          style={{ 
            width: 'auto', 
            padding: '0 8px', 
            gap: '4px', 
            background: isFilterPanelOpen ? 'var(--color-primary-glow)' : 'transparent',
            borderColor: isFilterPanelOpen ? 'var(--color-primary)' : 'var(--panel-border)'
          }} 
          title="Filter Nodes" 
          onClick={(e) => { e.stopPropagation(); setIsFilterPanelOpen(!isFilterPanelOpen); }}
        >
          <Filter size={14} />
          <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>Filter</span>
        </button>
        <div style={{ position: 'relative' }}>
          <button 
            className="control-btn" 
            style={{ 
              width: 'auto', 
              padding: '0 8px', 
              gap: '4px', 
              background: isExportDropdownOpen ? 'var(--color-primary-glow)' : 'transparent',
              borderColor: isExportDropdownOpen ? 'var(--color-primary)' : 'var(--panel-border)'
            }} 
            title="Export Visualization" 
            onClick={(e) => { e.stopPropagation(); setIsExportDropdownOpen(!isExportDropdownOpen); }}
          >
            <Download size={14} />
            <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>Export</span>
          </button>
          {isExportDropdownOpen && (
            <div 
              className="glass-panel"
              style={{
                position: 'absolute',
                bottom: '100%',
                right: 0,
                marginBottom: '8px',
                minWidth: '150px',
                padding: '4px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                zIndex: 1000,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                border: '1px solid var(--panel-border)',
                borderRadius: '8px',
                background: 'rgba(10, 15, 30, 0.95)',
                backdropFilter: 'blur(12px)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
                onClick={() => {
                  setIsExportDropdownOpen(false);
                  exportGraph('svg');
                }}
              >
                <span>🖼️ Download SVG</span>
              </button>
              {viewMode !== 'dbSchema' && (
                <button
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                  onClick={() => {
                    setIsExportDropdownOpen(false);
                    exportGraph('png');
                  }}
                >
                  <span>🖼️ Download PNG</span>
                </button>
              )}
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
                onClick={() => {
                  setIsExportDropdownOpen(false);
                  copyMermaidCode();
                }}
              >
                <span>🔌 Copy Mermaid.js</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {isFilterPanelOpen && (
        <div 
          className="glass-panel"
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            width: '280px',
            borderRadius: '10px',
            border: '1px solid var(--panel-border)',
            background: 'var(--panel-bg)',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            zIndex: 100,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SlidersHorizontal size={14} style={{ color: 'var(--color-primary)' }} />
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Graph Filters
              </span>
            </div>
            <button 
              onClick={() => setIsFilterPanelOpen(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              ✕
            </button>
          </div>

          {/* Folder Path Search */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              {viewMode === 'dbSchema' ? 'Table Name Filter' : 'Folder / Path Regex'}
            </label>
            <input 
              type="text" 
              placeholder={viewMode === 'dbSchema' ? "e.g. Users..." : "e.g. src/components..."} 
              value={filterFolderPath}
              onChange={(e) => setFilterFolderPath(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--input-bg)',
                border: '1px solid var(--panel-border)',
                borderRadius: '6px',
                padding: '6px 8px',
                fontSize: '0.75rem',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
          </div>

          {/* Language Selection */}
          {viewMode !== 'dbSchema' && viewMode !== 'call' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Programming Language</label>
              <select
                value={filterLanguage}
                onChange={(e) => setFilterLanguage(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--panel-border)',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all" style={{ background: 'var(--panel-bg)', color: 'var(--text-primary)' }}>All Languages</option>
                <option value="typescript" style={{ background: 'var(--panel-bg)', color: 'var(--text-primary)' }}>TypeScript (.ts, .tsx)</option>
                <option value="javascript" style={{ background: 'var(--panel-bg)', color: 'var(--text-primary)' }}>JavaScript (.js, .jsx)</option>
                <option value="python" style={{ background: 'var(--panel-bg)', color: 'var(--text-primary)' }}>Python (.py)</option>
                <option value="css" style={{ background: 'var(--panel-bg)', color: 'var(--text-primary)' }}>CSS</option>
                <option value="json" style={{ background: 'var(--panel-bg)', color: 'var(--text-primary)' }}>JSON / Config</option>
              </select>
            </div>
          )}

          {/* Minimum Lines of Code */}
          {(viewMode === 'dependency' || viewMode === 'cluster') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Min complexity (lines of code)</label>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-secondary)', fontWeight: 600 }}>{filterMinLoc} LOC</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="500" 
                step="10"
                value={filterMinLoc}
                onChange={(e) => setFilterMinLoc(parseInt(e.target.value))}
                style={{
                  width: '100%',
                  cursor: 'pointer',
                  accentColor: 'var(--color-primary)'
                }}
              />
            </div>
          )}

          {/* Clear Filters Button */}
          {(filterLanguage !== 'all' || filterMinLoc > 0 || filterFolderPath !== '') && (
            <button
              onClick={() => {
                setFilterLanguage('all');
                setFilterMinLoc(0);
                setFilterFolderPath('');
              }}
              style={{
                width: '100%',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '6px',
                padding: '8px',
                fontSize: '0.7rem',
                color: '#ef4444',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
              }}
            >
              Reset All Filters
            </button>
          )}
        </div>
      )}

      <svg ref={svgRef} style={{ width: '100%', height: '100%', display: is3DMode ? 'none' : 'block' }} />
      {is3DMode && (
        <canvas ref={canvas3DRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }} />
      )}
      {weatherEnabled && (
        <canvas 
          ref={weatherCanvasRef} 
          style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height: '100%', 
            pointerEvents: 'none', 
            zIndex: 10 
          }} 
        />
      )}

      {viewMode === 'dbSchema' && dbSchema.tables.length === 0 && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(5, 7, 15, 0.7)',
          backdropFilter: 'blur(4px)',
          zIndex: 10
        }}>
          <div className="glass-panel" style={{
            padding: '40px',
            maxWidth: '500px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            borderRadius: '12px',
            border: '1px solid var(--panel-border)',
            boxShadow: '0 0 30px rgba(99, 102, 241, 0.15)'
          }}>
            <div style={{ fontSize: '3rem' }}>🗃️</div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)', fontWeight: 700 }}>
              No Database Schemas Found
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              We scanned your codebase but couldn't find any Prisma schemas (`.prisma`), SQL DDL (`.sql`), Mongoose schemas, or SQLAlchemy models.
            </p>
            <button
              className="cyber-button"
              style={{
                padding: '10px 20px',
                fontSize: '0.85rem',
                background: 'var(--color-primary)',
                borderColor: 'var(--color-primary)'
              }}
              onClick={() => setUseDemoDbSchema(true)}
            >
              ⚡ Load Interactive Demo Schema
            </button>
          </div>
        </div>
      )}

      {viewMode === 'dbSchema' && selectedDbTableId && (() => {
        const table = dbSchema.tables.find(t => t.id === selectedDbTableId);
        if (!table) return null;

        // Find incoming & outgoing relationships
        const outgoing = dbSchema.relationships.filter(r => r.source === selectedDbTableId);
        const incoming = dbSchema.relationships.filter(r => r.target === selectedDbTableId);

        return (
          <div 
            className="glass-panel" 
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              width: '320px',
              maxHeight: 'calc(100% - 40px)',
              overflowY: 'auto',
              borderRadius: '8px',
              border: '1px solid var(--panel-border)',
              background: 'var(--panel-bg)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
              zIndex: 100,
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={16} style={{ color: 'var(--color-primary)' }} />
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{table.id}</span>
              </div>
              <button 
                onClick={() => {
                  setSelectedDbTableId(null);
                  setSelectedNode(null);
                }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Source File: <code style={{ color: 'var(--text-secondary)' }}>{table.sourceFile}</code>
            </div>

            {/* Field Table */}
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-secondary)', marginBottom: '6px' }}>Fields & Columns</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--input-bg)', padding: '6px', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
                {table.fields.map(f => {
                  const displayType = f.type.includes('ObjectId') ? 'ObjectId' : f.type.replace(/^(mongoose\.)?(Schema\.)?Types\./i, '');
                  return (
                    <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', padding: '4px 2px', borderBottom: '1px solid var(--panel-border)', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, flexShrink: 0 }}>
                        <span>{f.isPrimaryKey ? '🔑' : f.isForeignKey ? '🔗' : '•'}</span>
                        <span style={{ fontWeight: f.isPrimaryKey || f.isForeignKey ? '600' : 'normal', color: f.isPrimaryKey ? 'var(--color-secondary)' : f.isForeignKey ? '#a855f7' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.8, fontSize: '0.68rem', wordBreak: 'break-all', textAlign: 'right', flexGrow: 1 }}>{displayType}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Relationships */}
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-secondary)', marginBottom: '6px' }}>Relationships</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.7rem' }}>
                {outgoing.length === 0 && incoming.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No active relations</span>
                ) : (
                  <>
                    {outgoing.map(r => (
                      <div key={r.id} style={{ display: 'flex', flexDirection: 'column', padding: '6px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '4px', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
                        <span style={{ fontWeight: 600, color: '#a855f7' }}>Outgoing Link (FK)</span>
                        <span style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Field <code style={{ color: 'var(--text-primary)' }}>{r.sourceField}</code> references <strong style={{ color: 'var(--color-primary)' }}>{r.target}</strong>.<code style={{ color: 'var(--text-primary)' }}>{r.targetField}</code>
                        </span>
                      </div>
                    ))}
                    {incoming.map(r => (
                      <div key={r.id} style={{ display: 'flex', flexDirection: 'column', padding: '6px', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                        <span style={{ fontWeight: 600, color: '#10b981' }}>Incoming Link</span>
                        <span style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Table <strong style={{ color: 'var(--color-primary)' }}>{r.source}</strong>.<code style={{ color: 'var(--text-primary)' }}>{r.sourceField}</code> references <code style={{ color: 'var(--text-primary)' }}>{r.targetField}</code>
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '10px', marginTop: '4px' }}>
              <button
                className="cyber-button secondary"
                disabled={isAuditingDb}
                style={{
                  width: '100%',
                  fontSize: '0.72rem',
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
                onClick={handleRunDbAudit}
              >
                <Sparkles size={11} style={{ color: '#fbbf24' }} />
                {isAuditingDb ? 'Auditing Schema...' : 'Audit Design Integrity'}
              </button>
            </div>

            {useDemoDbSchema && (
              <div style={{ marginTop: 'auto', borderTop: '1px solid var(--panel-border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', background: 'rgba(245,158,11,0.15)', color: '#fbbf24', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(245,158,11,0.25)', fontWeight: 600 }}>🧪 DEMO SCHEMA</span>
                <button 
                  className="cyber-button text-btn alert" 
                  style={{ padding: '3px 8px', fontSize: '0.65rem' }}
                  onClick={() => {
                    setUseDemoDbSchema(false);
                    setSelectedDbTableId(null);
                    setSelectedNode(null);
                  }}
                >
                  Clear Demo
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Heatmap Legend */}
      {viewMode === 'dependency' && heatmapMode !== 'none' && (
        <div className="heatmap-legend" onClick={(e) => e.stopPropagation()}>
          <span>Cool</span>
          <div className="legend-bar" />
          <span>Hot</span>
        </div>
      )}

      {/* Radar HUD Minimap */}
      <div className={`minimap-hud ${isMinimapExpanded ? 'expanded' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="minimap-header">
          <span className="minimap-title">
            {isMinimapExpanded ? '🔍 FULL RADAR OVERVIEW' : 'RADAR NAVIGATION HUD'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="radar-status-dot"></div>
            <button 
              className="minimap-expand-btn"
              onClick={() => setIsMinimapExpanded(!isMinimapExpanded)}
              title={isMinimapExpanded ? "Minimize Overview" : "Maximize Overview"}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {isMinimapExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          </div>
        </div>
        <canvas
          ref={minimapCanvasRef}
          width={isMinimapExpanded ? 432 : 158}
          height={isMinimapExpanded ? 298 : 98}
          className="minimap-canvas"
          style={{ width: '100%', height: 'calc(100% - 24px)', display: 'block' }}
          onClick={handleMinimapClick}
        />
      </div>
      {/* Cluster Hover Card */}
      {hoveredCluster && createPortal(
        <div 
          className="cluster-hover-card"
          style={{ 
            left: `${mousePos.x}px`, 
            top: `${mousePos.y}px`,
            position: 'fixed',
            transform: 'translate(15px, 15px)',
            opacity: 1,
            zIndex: 99999,
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--color-primary)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px', marginBottom: '6px', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
            📁 {hoveredCluster.folder.split('/').pop() || hoveredCluster.folder}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '24px' }}>
              <span>Files:</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{hoveredCluster.fileCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '24px' }}>
              <span>Cross-connections:</span>
              <span style={{ color: 'var(--color-secondary)', fontWeight: 600 }}>{hoveredCluster.connectionsCount}</span>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Component Hover Details Card */}
      {viewMode === 'hierarchy' && hoveredNode && hoveredNode !== selectedNode && hoveredComponentDetails && hoveredComponentDetails.type === 'component' && createPortal(
        <div 
          className="cluster-hover-card"
          style={{ 
            left: `${mousePos.x}px`, 
            top: `${mousePos.y}px`,
            position: 'fixed',
            transform: 'translate(15px, 15px)',
            opacity: 1,
            maxWidth: '280px',
            pointerEvents: 'none',
            zIndex: 99999,
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--color-primary)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px', marginBottom: '6px', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
            ⚛️ {hoveredComponentDetails.name}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Props</span>
              {hoveredComponentDetails.props && hoveredComponentDetails.props.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                  {hoveredComponentDetails.props.map((p: string) => (
                    <span key={p} style={{ fontSize: '0.65rem', background: 'var(--color-primary-glow)', color: 'var(--text-primary)', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>{p}</span>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>None detected</span>
              )}
            </div>
            <div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Hooks & State</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                {hoveredComponentDetails.state && hoveredComponentDetails.state.map((s: string) => (
                  <span key={s} style={{ fontSize: '0.65rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>useState ({s})</span>
                ))}
                {hoveredComponentDetails.hooks && hoveredComponentDetails.hooks.map((h: string) => (
                  <span key={h} style={{ fontSize: '0.65rem', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>{h}</span>
                ))}
                {(!hoveredComponentDetails.state?.length && !hoveredComponentDetails.hooks?.length) && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>None detected</span>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isEvolutionMode && (
        <EvolutionPlayer
          commits={gitHistory}
          currentStep={currentEvolutionStep}
          onChangeStep={setCurrentEvolutionStep}
          isReplaying={isReplaying}
          setIsReplaying={setIsReplaying}
          speed={replaySpeed}
          onChangeSpeed={setReplaySpeed}
          onClose={() => setIsEvolutionMode(false)}
        />
      )}

      {showUmlModal && activeTraceNodeId && createPortal(
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(5, 7, 15, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999
        }} onClick={() => setShowUmlModal(false)}>
          <div className="glass-panel" style={{
            width: '90%',
            maxWidth: '900px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '12px',
            border: '1px solid var(--panel-border)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
            overflow: 'hidden',
            background: 'var(--panel-bg)'
          }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              borderBottom: '1px solid var(--panel-border)',
              background: 'rgba(255,255,255,0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>📊</span>
                <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>UML Call Trace Sequence Diagram</span>
              </div>
              <button 
                onClick={() => setShowUmlModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Generated sequence flow from root function: <code style={{ color: 'var(--color-secondary)' }}>{activeTraceNodeId.split('::').pop()}()</code>
              </div>

              {/* Tab Selector */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '10px' }}>
                <button
                  className={`cyber-button ${umlActiveTab === 'preview' ? '' : 'secondary'}`}
                  style={{ fontSize: '0.72rem', padding: '6px 12px' }}
                  onClick={() => setUmlActiveTab('preview')}
                >
                  👁️ Visual Preview
                </button>
                <button
                  className={`cyber-button ${umlActiveTab === 'syntax' ? '' : 'secondary'}`}
                  style={{ fontSize: '0.72rem', padding: '6px 12px' }}
                  onClick={() => setUmlActiveTab('syntax')}
                >
                  📝 Mermaid Syntax
                </button>
              </div>

              {/* Tab Content */}
              {umlActiveTab === 'preview' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <MermaidDiagram chart={umlChartCode} />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      className="cyber-button secondary"
                      style={{ fontSize: '0.68rem', padding: '4px 8px' }}
                      onClick={() => {
                        navigator.clipboard.writeText(umlChartCode);
                        const toast = document.createElement('div');
                        toast.style.position = 'fixed';
                        toast.style.bottom = '20px';
                        toast.style.left = '50%';
                        toast.style.transform = 'translateX(-50%)';
                        toast.style.background = 'var(--color-secondary)';
                        toast.style.color = '#fff';
                        toast.style.padding = '8px 16px';
                        toast.style.borderRadius = '4px';
                        toast.style.fontSize = '0.75rem';
                        toast.style.zIndex = '9999999';
                        toast.innerText = 'Copied to clipboard!';
                        document.body.appendChild(toast);
                        setTimeout(() => document.body.removeChild(toast), 2000);
                      }}
                    >
                      Copy Code
                    </button>
                    <button
                      className="cyber-button secondary"
                      style={{ fontSize: '0.68rem', padding: '4px 8px' }}
                      onClick={() => {
                        const blob = new Blob([umlChartCode], { type: 'text/plain;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'call-trace.mermaid';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                    >
                      Download .mermaid
                    </button>
                  </div>
                  <pre style={{
                    background: '#05070f',
                    border: '1px solid var(--panel-border)',
                    borderRadius: '6px',
                    padding: '12px',
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    overflowX: 'auto',
                    margin: 0,
                    maxHeight: '300px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all'
                  }}>
                    {umlChartCode}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '12px 20px',
              borderTop: '1px solid var(--panel-border)',
              background: 'rgba(255,255,255,0.01)'
            }}>
              <button 
                className="cyber-button secondary"
                style={{ fontSize: '0.75rem', padding: '6px 16px' }}
                onClick={() => setShowUmlModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showDbAuditModal && createPortal(
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(5, 7, 15, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999
        }} onClick={() => setShowDbAuditModal(false)}>
          <div className="glass-panel" style={{
            width: '90%',
            maxWidth: '800px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '12px',
            border: '1px solid var(--panel-border)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
            overflow: 'hidden',
            background: 'var(--panel-bg)'
          }} onClick={(e) => e.stopPropagation()}>
            {/* Inline keyframe style */}
            <style dangerouslySetInnerHTML={{ __html: `
              @keyframes dbAuditModalSpin {
                to { transform: rotate(360deg); }
              }
            `}} />
            
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              borderBottom: '1px solid var(--panel-border)',
              background: 'rgba(255,255,255,0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} style={{ color: '#fbbf24' }} />
                <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>AI Database Design Audit</span>
              </div>
              <button 
                onClick={() => setShowDbAuditModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div 
              className="custom-scrollbar"
              style={{ 
                flex: 1, 
                padding: '20px', 
                overflowY: 'auto', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '16px' 
              }}
            >
              {dbAuditError ? (
                <div style={{ color: '#f43f5e', background: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.8rem' }}>
                  <strong>⚠️ Auditing Failed:</strong> {dbAuditError}
                </div>
              ) : dbAuditReport ? (
                <div 
                  className="ai-response-content markdown-body"
                  dangerouslySetInnerHTML={{ __html: formatMarkdown(dbAuditReport) }}
                  style={{
                    fontSize: '0.82rem',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.6'
                  }}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: '12px' }}>
                  <div className="spinner" style={{ width: '32px', height: '32px', border: '3px solid rgba(99, 102, 241, 0.1)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'dbAuditModalSpin 1s linear infinite' }} />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Analyzing database schema integrity...</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              padding: '12px 20px',
              borderTop: '1px solid var(--panel-border)',
              background: 'rgba(255,255,255,0.01)'
            }}>
              {dbAuditReport && (
                <button 
                  className="cyber-button"
                  style={{ fontSize: '0.75rem', padding: '6px 16px', cursor: 'pointer', background: 'var(--color-secondary)', borderColor: 'var(--color-secondary)' }}
                  onClick={handleExportDbAuditPDF}
                >
                  Export PDF
                </button>
              )}
              <button 
                className="cyber-button secondary"
                style={{ fontSize: '0.75rem', padding: '6px 16px', cursor: 'pointer' }}
                onClick={() => setShowDbAuditModal(false)}
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};
