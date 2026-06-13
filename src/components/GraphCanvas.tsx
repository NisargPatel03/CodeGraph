import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import { ZoomIn, ZoomOut, RotateCcw, ChevronUp, ChevronDown, Maximize2, Minimize2, Database, Sparkles } from 'lucide-react';
import type { CodebaseGraph } from '../utils/codeAnalyzer';
import { generateGitHistory, mapFilesToRealCommits } from '../utils/codeAnalyzer';
import { EvolutionPlayer } from './EvolutionPlayer';
import { parseDatabaseSchemas, GET_DEMO_SCHEMA } from '../utils/schemaParser';
import { auditDatabaseSchema } from '../utils/aiHelper';
import mermaid from 'mermaid';

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
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
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
  const [selectedDbTableId, setSelectedDbTableId] = useState<string | null>(null);
  const [hoveredDbTableId, setHoveredDbTableId] = useState<string | null>(null);

  // DB Auditor States
  const [isAuditingDb, setIsAuditingDb] = useState(false);
  const [dbAuditReport, setDbAuditReport] = useState<string | null>(null);
  const [showDbAuditModal, setShowDbAuditModal] = useState(false);
  const [dbAuditError, setDbAuditError] = useState<string | null>(null);

  // Advanced features states
  const [showNpmPackages, setShowNpmPackages] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState<'none' | 'churn' | 'complexity'>('none');
  const [pathSource, setPathSource] = useState<string | null>(null);
  const [pathTarget, setPathTarget] = useState<string | null>(null);
  const [isToolboxCollapsed, setIsToolboxCollapsed] = useState(false);
  const [isMinimapExpanded, setIsMinimapExpanded] = useState(false);
  const [currentTraceStep, setCurrentTraceStep] = useState(0);
  const [showUmlModal, setShowUmlModal] = useState(false);
  const [umlActiveTab, setUmlActiveTab] = useState<'preview' | 'syntax'>('preview');

  const dbSchema = useMemo(() => {
    if (viewMode !== 'dbSchema') return { tables: [], relationships: [] };
    if (useDemoDbSchema) {
      return GET_DEMO_SCHEMA();
    }
    return parseDatabaseSchemas(files);
  }, [files, viewMode, useDemoDbSchema]);

  const formatMarkdown = (text: string): string => {
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
      nodes = dbSchema.tables.map((table) => {
        const cached = nodePositionsRef.current.get(table.id);
        const cardHeight = 60 + table.fields.length * 24;
        return {
          id: table.id,
          name: table.id,
          sourceFile: table.sourceFile,
          fields: table.fields,
          width: 220,
          height: cardHeight,
          x: cached ? cached.x : undefined,
          y: cached ? cached.y : undefined
        };
      });

      links = dbSchema.relationships.map((rel) => ({
        id: rel.id,
        source: rel.source,
        target: rel.target,
        sourceField: rel.sourceField,
        targetField: rel.targetField
      }));
    }

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

    const simulation = d3.forceSimulation<any>(nodes)
      .force('link', d3.forceLink<any, any>(links).id((d) => d.id).distance(() => {
        if (viewMode === 'dbSchema') return 240;
        if (viewMode === 'cluster') return 65;
        if (viewMode === 'hierarchy') return 70;
        return 100;
      }))
      .force('charge', d3.forceManyBody().strength(() => {
        if (viewMode === 'dbSchema') return -600;
        if (viewMode === 'cluster') return -120;
        if (viewMode === 'hierarchy') return -160;
        return -220;
      }))
      .force('collision', d3.forceCollide<any>().radius((d) => {
        if (viewMode === 'dbSchema') return Math.max(d.width || 220, d.height || 150) / 2 + 40;
        if (d.isFolder) return 24;
        if (viewMode === 'call') return 12 + Math.min(d.callCount * 1.5, 20);
        if (viewMode === 'dependency') {
          const inDeg = inDegreeMap.get(d.id) || 0;
          return 12 + Math.min(inDeg * 2.0, 24);
        }
        const baseRad = viewMode === 'hierarchy' ? 14 : 15;
        return baseRad + Math.sqrt(d.size || 0) * 0.05 + 5;
      }))
      .force('center', d3.forceCenter(0, 0));

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
        { id: 'db-arrow-highlight', color: 'var(--color-secondary)' }
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
        const isViolating = linterViolations?.violatingNodes.includes(d.id);
        if (isViolating) cls += ' linter-violating-node';
        const isAtRisk = auditReport?.risks.some(r => r.filePath === d.id);
        if (isAtRisk) cls += ' risk-violating-node';
        return cls;
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        if (viewMode === 'dbSchema') {
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

        const cardDiv = card.append('xhtml:div')
          .style('width', '100%')
          .style('height', '100%')
          .style('border', '1px solid var(--panel-border)')
          .style('border-radius', '8px')
          .style('background', 'rgba(10, 14, 26, 0.85)')
          .style('backdrop-filter', 'blur(6px)')
          .style('box-shadow', '0 4px 15px rgba(0,0,0,0.4)')
          .style('display', 'flex')
          .style('flex-direction', 'column')
          .style('overflow', 'hidden')
          .style('pointer-events', 'auto')
          .style('user-select', 'none');

        // Table Header
        cardDiv.append('div')
          .style('background', 'rgba(99, 102, 241, 0.1)')
          .style('border-bottom', '1px solid var(--panel-border)')
          .style('padding', '8px 12px')
          .style('display', 'flex')
          .style('align-items', 'center')
          .style('gap', '8px')
          .style('flex-shrink', '0')
          .html(() => `
            <span style="color: var(--color-primary); font-size: 0.85rem;">🗃️</span>
            <span style="font-weight: 700; color: var(--text-primary); font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${d.id}</span>
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
            .style('border-bottom', '1px solid rgba(255,255,255,0.03)')
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

        // Hover styling updates
        cardDiv
          .on('mouseenter', () => {
            cardDiv.style('border-color', 'var(--color-secondary)');
            cardDiv.style('box-shadow', '0 0 15px rgba(0, 242, 254, 0.2)');
          })
          .on('mouseleave', () => {
            const isSelected = selectedDbTableId === d.id;
            cardDiv.style('border-color', isSelected ? 'var(--color-primary)' : 'var(--panel-border)');
            cardDiv.style('box-shadow', isSelected ? '0 0 10px rgba(99, 102, 241, 0.2)' : '0 4px 15px rgba(0,0,0,0.4)');
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
          .attr('fill', 'var(--color-primary-glow)')
          .attr('stroke', 'var(--color-primary)')
          .attr('stroke-width', 1.5)
          .attr('class', 'npm-node');
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

    simulation.on('tick', () => {
      nodes.forEach(n => {
        if (n.id && n.x !== undefined && n.y !== undefined) {
          nodePositionsRef.current.set(n.id, { x: n.x, y: n.y });
        }
      });
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
    });

    (window as any).graphZoom = {
      zoomIn: () => svgElement.transition().duration(300).call(zoomBehavior.scaleBy, 1.3),
      zoomOut: () => svgElement.transition().duration(300).call(zoomBehavior.scaleBy, 0.7),
      reset: () => svgElement.transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8)),
    };

    drawMinimap();

    return () => { simulation.stop(); };
  }, [graphData, viewMode, hierarchicalLevels, showNpmPackages, collapsedFolders, depthFilter, selectedNode, treeLayoutStyle, isEvolutionMode, currentEvolutionStep, activeEvolutionFiles, linterViolations, useDemoDbSchema, dbSchema]);
  useEffect(() => {
    if (!svgRef.current) return;
    if (viewMode === 'dbSchema') return;
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
        const isCyclic = viewMode === 'dependency' && cyclicLinks.has(`${sId}->${tId}`);
        const isFlowing = viewMode === 'dependency';
        let cls = 'link-element';
        if (isFlowing) cls += ' flowing';
        
        if (sId === activeId) {
          line.attr('class', cls + ' flow-out').style('stroke-opacity', 0.95).attr('marker-end', 'url(#arrow-highlight)');
        } else if (tId === activeId) {
          line.attr('class', cls + ' flow-in').style('stroke-opacity', 0.95).attr('marker-end', 'url(#arrow-highlight-incoming)');
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
        const isCyclic = viewMode === 'dependency' && cyclicLinks.has(`${sId}->${tId}`);
        const isFlowing = viewMode === 'dependency';
        let cls = isFlowing ? 'link-element flowing' : 'link-element';
        
        const isViolating = linterViolations?.violatingLinks.some((vl: any) => {
          const vlSource = typeof vl.source === 'object' ? vl.source.id : vl.source;
          const vlTarget = typeof vl.target === 'object' ? vl.target.id : vl.target;
          return vlSource === sId && vlTarget === tId;
        });
        if (isViolating) cls += ' linter-violating-link';

        d3.select(this)
          .attr('class', isViolating ? cls : (isCyclic ? 'link-element flow-cycle' : cls))
          .style('stroke-opacity', isViolating ? 0.95 : (isCyclic ? 0.6 : (isFlowing ? 0.75 : 0.2)))
          .style('stroke', isViolating ? '#f97316' : (isCyclic ? 'var(--color-alert)' : 'var(--link-stroke)'))
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
  }, [hoveredNode, selectedNode, graphData, viewMode, searchQuery, cyclicLinks, heatmapMode, shortestPath, activeTraceNodeId, currentTraceStep, traceSteps, isMinimapExpanded, diffData, isEvolutionMode, currentEvolutionStep, gitHistory, linterViolations, auditReport]);

  // Fast hover and selection highlighting for DB Schema
  useEffect(() => {
    if (viewMode !== 'dbSchema' || !svgRef.current) return;
    const svgElement = d3.select(svgRef.current);
    
    // Update links styles
    svgElement.selectAll('.db-relationship-link')
      .attr('stroke', (d: any) => {
        const isHovered = hoveredDbTableId === d.source.id || hoveredDbTableId === d.target.id;
        const isSelected = selectedDbTableId === d.source.id || selectedDbTableId === d.target.id;
        return isSelected || isHovered ? 'var(--color-secondary)' : 'rgba(99, 102, 241, 0.4)';
      })
      .attr('stroke-width', (d: any) => {
        const isHovered = hoveredDbTableId === d.source.id || hoveredDbTableId === d.target.id;
        const isSelected = selectedDbTableId === d.source.id || selectedDbTableId === d.target.id;
        return isSelected || isHovered ? 3 : 1.5;
      })
      .attr('marker-end', (d: any) => {
        const isHovered = hoveredDbTableId === d.source.id || hoveredDbTableId === d.target.id;
        const isSelected = selectedDbTableId === d.source.id || selectedDbTableId === d.target.id;
        return isSelected || isHovered ? 'url(#db-arrow-highlight)' : 'url(#db-arrow)';
      })
      .style('opacity', (d: any) => {
        if (!hoveredDbTableId) return 1.0;
        const isRelated = d.source.id === hoveredDbTableId || d.target.id === hoveredDbTableId;
        return isRelated ? 1.0 : 0.2;
      });

    // Update nodes opacity & borders
    svgElement.selectAll('.db-table-node').each(function (d: any) {
      const el = d3.select(this);
      const isHoveredSelf = hoveredDbTableId === d.id;
      
      let opacity = 1.0;
      if (hoveredDbTableId) {
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
        cardDiv.style('border-color', isSelectedSelf || isHoveredSelf ? 'var(--color-secondary)' : 'var(--panel-border)');
        cardDiv.style('box-shadow', isSelectedSelf || isHoveredSelf ? '0 0 15px rgba(0, 242, 254, 0.25)' : '0 4px 15px rgba(0,0,0,0.4)');
      }
    });
  }, [viewMode, hoveredDbTableId, selectedDbTableId, dbSchema.relationships]);

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
                        <label key={folder} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem', cursor: 'pointer', color: 'var(--text-secondary)', userSelect: 'none' }}>
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
      </div>

      <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />

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
              background: 'rgba(10, 14, 26, 0.92)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              zIndex: 100,
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                {table.fields.map(f => {
                  const displayType = f.type.includes('ObjectId') ? 'ObjectId' : f.type.replace(/^(mongoose\.)?(Schema\.)?Types\./i, '');
                  return (
                    <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', padding: '4px 2px', borderBottom: '1px solid rgba(255,255,255,0.02)', gap: '12px' }}>
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

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px', marginTop: '4px' }}>
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
              <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
              padding: '12px 20px',
              borderTop: '1px solid var(--panel-border)',
              background: 'rgba(255,255,255,0.01)'
            }}>
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
