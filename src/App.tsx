import { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Search, Folder, File, ChevronRight, ChevronDown, Sparkles, Key, X, Download, Share2, Activity, HelpCircle } from 'lucide-react';
import JSZip from 'jszip';
import type { ParsedFile } from './utils/repoParser';
import { fetchGitHubRepo } from './utils/repoParser';
import { analyzeCodebase } from './utils/codeAnalyzer';
import type { CodebaseGraph } from './utils/codeAnalyzer';
import { RepoSelector, GET_DEMO_FILES } from './components/RepoSelector';
import { GraphCanvas } from './components/GraphCanvas';
import { Inspector } from './components/Inspector';
import { AiChatDrawer } from './components/AiChatDrawer';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { KpiRibbon } from './components/KpiRibbon';
import { ApiDocsPortal } from './components/ApiDocsPortal';
import { AiIcon } from './components/AiIcon';
import { CommandPalette } from './components/CommandPalette';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import logoImg from './assets/logo.png';
import { audioSonifier } from './utils/audioSonifier';
import { 
  semanticSearchCodebase, 
  lintCodebaseRules, 
  runDependencyAudit,
  explainEntireFolderStream,
  suggestCrossFileRefactorStream,
  getCacheTelemetry,
  refineCallGraphWithLLM
} from './utils/aiHelper';
import type { SemanticSearchResult } from './utils/aiHelper';

// Tree interface for File Explorer
interface FileTreeItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children: Record<string, FileTreeItem>;
}

export default function App() {
  const [audioEnabled, setAudioEnabled] = useState(() => audioSonifier.isEnabled());
  const [audioVolume, setAudioVolume] = useState(() => audioSonifier.getVolume());

  const [theme, setTheme] = useState(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const urlTheme = queryParams.get('theme');
    const validThemes = ['cyberpunk', 'midnight-green', 'solar-amber', 'arctic-light', 'rose-gold', 'synthwave'];
    if (urlTheme && validThemes.includes(urlTheme)) return urlTheme;

    const saved = localStorage.getItem('app_theme');
    if (saved && validThemes.includes(saved)) return saved;
    return 'cyberpunk';
  });
  const [apiKey] = useState(() => {
    return (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
  });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [repoData, setRepoData] = useState<{ 
    files: ParsedFile[]; 
    repoName: string; 
    commits?: import('./utils/repoParser').GitHubCommitInfo[];
  } | null>(null);
  const [graphData, setGraphData] = useState<CodebaseGraph | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(() => {
    const queryParams = new URLSearchParams(window.location.search);
    return queryParams.get('node');
  });
  const [viewMode, setViewMode] = useState<'dependency' | 'cluster' | 'call' | 'hierarchy' | 'analytics' | 'docs' | 'dbSchema'>(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const view = queryParams.get('view');
    const validViews = ['dependency', 'cluster', 'call', 'hierarchy', 'analytics', 'docs', 'dbSchema'];
    if (view && validViews.includes(view)) return view as any;
    return 'dependency';
  });
  const [searchQuery, setSearchQuery] = useState(() => {
    const queryParams = new URLSearchParams(window.location.search);
    return queryParams.get('search') || '';
  });
  const [diffData, setDiffData] = useState<any | null>(null);
  const [semanticSearchResults, setSemanticSearchResults] = useState<SemanticSearchResult[] | null>(null);
  const [isSearchingSemantically, setIsSearchingSemantically] = useState(false);
  const [semanticSearchError, setSemanticSearchError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ 'root': true });
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [activeTraceNodeId, setActiveTraceNodeId] = useState<string | null>(() => {
    const queryParams = new URLSearchParams(window.location.search);
    return queryParams.get('trace');
  });
  const [depthFilter, setDepthFilter] = useState<number>(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const depth = queryParams.get('depth');
    return depth ? parseInt(depth, 10) : -1;
  }); // -1 means All/no limit
  const [isEvolutionMode, setIsEvolutionMode] = useState(false);
  const [currentEvolutionStep, setCurrentEvolutionStep] = useState(0);
  const [dbAuditTrigger, setDbAuditTrigger] = useState(0);

  // URL Import/Share states
  const [isLoadingRepo, setIsLoadingRepo] = useState(false);
  const [repoLoadError, setRepoLoadError] = useState<string | null>(null);
  const isInitialUrlLoadRef = useRef(true);

  // Multi-File AI Analysis States
  const [isMultiSelectActive, setIsMultiSelectActive] = useState(false);
  const [selectedFilePaths, setSelectedFilePaths] = useState<Set<string>>(new Set());
  const [showRefactorModal, setShowRefactorModal] = useState(false);
  const [isRefactoring, setIsRefactoring] = useState(false);
  const [refactorProposal, setRefactorProposal] = useState<string | null>(null);

  const [showFolderExplainModal, setShowFolderExplainModal] = useState(false);
  const [isExplainingFolder, setIsExplainingFolder] = useState(false);
  const [folderExplainReport, setFolderExplainReport] = useState<string | null>(null);
  const [explainingFolderName, setExplainingFolderName] = useState<string | null>(null);

  // AI Architectural Linter States
  const [linterViolations, setLinterViolations] = useState<import('./utils/aiHelper').LinterViolation | null>(null);
  const [linterRule, setLinterRule] = useState('');
  const [isLinting, setIsLinting] = useState(false);
  const [linterError, setLinterError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [telemetry, setTelemetry] = useState(() => getCacheTelemetry());

  useEffect(() => {
    if (isSettingsOpen) {
      setTelemetry(getCacheTelemetry());
    }
  }, [isSettingsOpen]);

  const handleRunLinter = async (rule: string) => {
    if (!repoData || !graphData) return;
    setIsLinting(true);
    setLinterError(null);
    setLinterRule(rule);
    try {
      const result = await lintCodebaseRules(rule, repoData.files, graphData.links, apiKey);
      setLinterViolations(result);
    } catch (err: any) {
      console.error(err);
      setLinterError(err.message || 'An error occurred during rule evaluation.');
    } finally {
      setIsLinting(false);
    }
  };

  // AI Dependency Risk Auditor States
  const [auditReport, setAuditReport] = useState<import('./utils/aiHelper').AuditReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const handleRunDependencyAudit = async () => {
    if (!repoData || !graphData) return;
    setIsAuditing(true);
    setAuditError(null);
    try {
      const report = await runDependencyAudit(repoData.files, graphData.links, apiKey);
      setAuditReport(report);
    } catch (err: any) {
      console.error(err);
      setAuditError(err.message || 'An error occurred during dependency risk audit.');
    } finally {
      setIsAuditing(false);
    }
  };

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Call Graph Refinement States & Handlers
  const [isRefiningCallGraph, setIsRefiningCallGraph] = useState(false);

  const handleRefineCallGraph = async () => {
    if (!repoData || !graphData) return;
    setIsRefiningCallGraph(true);
    showToast('Initiating Call Graph validation pass...');
    try {
      const refinedLinks = await refineCallGraphWithLLM(
        graphData.callNodes || [],
        graphData.callLinks || [],
        repoData.files,
        apiKey
      );

      const originalAmbiguousCount = (graphData.callLinks || []).filter(l => l.isAmbiguous).length;
      const newAmbiguousCount = refinedLinks.filter(l => l.isAmbiguous).length;
      const resolvedCount = originalAmbiguousCount - newAmbiguousCount;

      setGraphData(prev => {
        if (!prev) return null;
        return {
          ...prev,
          callLinks: refinedLinks
        };
      });

      showToast(`Refined call graph successfully! Resolved ${resolvedCount} ambiguous connections.`);
    } catch (err: any) {
      console.error(err);
      showToast(`Refinement failed: ${err.message || err}`);
    } finally {
      setIsRefiningCallGraph(false);
    }
  };

  // Cleanup old local storage API key (now loaded exclusively from environment)
  useEffect(() => {
    localStorage.removeItem('gemini_api_key');
  }, []);

  // Sync theme to root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  const handleThemeClick = (e: React.MouseEvent, themeId: string) => {
    audioSonifier.playClick();
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



  const lastRepoNameRef = useRef<string | null>(null);

  // Fetch shareable repo on mount
  useEffect(() => {
    const fetchSharedRepo = async () => {
      const queryParams = new URLSearchParams(window.location.search);
      const repo = queryParams.get('repo');
      if (!repo) return;

      setIsLoadingRepo(true);
      setRepoLoadError(null);
      try {
        if (repo === 'demo' || repo === 'CodeGraph-Demo-Project') {
          // Load demo files
          setRepoData({
            files: GET_DEMO_FILES(),
            repoName: 'CodeGraph-Demo-Project'
          });
        } else {
          // Fetch GitHub repo
          const token = localStorage.getItem('gh_token') || '';
          const result = await fetchGitHubRepo(repo, token);
          setRepoData(result);
        }
      } catch (err: any) {
        console.error('Failed to load shared workspace:', err);
        setRepoLoadError(err.message || 'An error occurred while loading the shared repository.');
      } finally {
        setIsLoadingRepo(false);
      }
    };

    fetchSharedRepo();
  }, []);

  // Sync state changes back to URL
  useEffect(() => {
    if (isLoadingRepo) return;

    const queryParams = new URLSearchParams(window.location.search);

    if (repoData) {
      queryParams.set('repo', repoData.repoName);
      queryParams.set('view', viewMode);

      if (selectedNodeId) {
        queryParams.set('node', selectedNodeId);
      } else {
        queryParams.delete('node');
      }

      if (searchQuery) {
        queryParams.set('search', searchQuery);
      } else {
        queryParams.delete('search');
      }

      if (activeTraceNodeId) {
        queryParams.set('trace', activeTraceNodeId);
      } else {
        queryParams.delete('trace');
      }

      if (depthFilter !== -1) {
        queryParams.set('depth', String(depthFilter));
      } else {
        queryParams.delete('depth');
      }
      
      queryParams.set('theme', theme);
    } else {
      queryParams.delete('repo');
      queryParams.delete('view');
      queryParams.delete('node');
      queryParams.delete('search');
      queryParams.delete('trace');
      queryParams.delete('depth');
      if (theme !== 'cyberpunk') {
        queryParams.set('theme', theme);
      } else {
        queryParams.delete('theme');
      }
    }

    const newUrl = queryParams.toString() 
      ? `${window.location.pathname}?${queryParams.toString()}` 
      : window.location.pathname;

    window.history.replaceState(null, '', newUrl);
  }, [repoData, viewMode, selectedNodeId, searchQuery, activeTraceNodeId, depthFilter, theme, isLoadingRepo]);

  const handleCopyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    
    // Show toast
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = 'var(--color-secondary, #00f2fe)';
    toast.style.color = '#000';
    toast.style.padding = '8px 16px';
    toast.style.borderRadius = '6px';
    toast.style.fontSize = '0.75rem';
    toast.style.fontWeight = 'bold';
    toast.style.zIndex = '9999999';
    toast.style.boxShadow = '0 0 15px rgba(0, 242, 254, 0.4)';
    toast.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    toast.innerText = 'Shareable URL copied to clipboard!';
    document.body.appendChild(toast);
    setTimeout(() => document.body.removeChild(toast), 2500);
  };

  // Run analysis when files are loaded
  useEffect(() => {
    if (repoData) {
      const result = analyzeCodebase(repoData.files);
      setGraphData(result);
      if (lastRepoNameRef.current !== repoData.repoName) {
        lastRepoNameRef.current = repoData.repoName;
        if (!isInitialUrlLoadRef.current) {
          setSelectedNodeId(null);
          setDiffData(null);
          setIsEvolutionMode(false);
          setCurrentEvolutionStep(0);
          setLinterViolations(null);
          setAuditReport(null);
        } else {
          isInitialUrlLoadRef.current = false;
        }
      }
    } else {
      lastRepoNameRef.current = null;
      setGraphData(null);
      setDiffData(null);
      setIsEvolutionMode(false);
      setCurrentEvolutionStep(0);
      setLinterViolations(null);
      setAuditReport(null);
      isInitialUrlLoadRef.current = false;
    }
  }, [repoData]);

  // Global file/schema node locator handler
  useEffect(() => {
    (window as any).locateFileNode = (filePath: string) => {
      if (!filePath) return;
      
      const hasExtension = filePath.includes('.');
      const isDbTable = !hasExtension && !filePath.includes('/') && !filePath.includes('\\');

      if (isDbTable) {
        setViewMode('dbSchema');
        setSelectedNodeId(filePath);
      } else {
        if (viewMode === 'dbSchema' || viewMode === 'analytics' || viewMode === 'docs') {
          setViewMode('dependency');
        }
        setSelectedNodeId(filePath);
      }
    };

    return () => {
      delete (window as any).locateFileNode;
    };
  }, [viewMode]);

  const handleUpdateFileContent = (filePath: string, newContent: string) => {
    if (!repoData) return;
    const updatedFiles = repoData.files.map((f) => {
      if (f.path === filePath) {
        return {
          ...f,
          content: newContent,
          size: newContent.length,
        };
      }
      return f;
    });
    setRepoData({
      ...repoData,
      files: updatedFiles,
    });
  };

  const handleRunFolderExplanation = async (folderPath: string) => {
    if (!repoData) return;
    setExplainingFolderName(folderPath);
    setIsExplainingFolder(true);
    setShowFolderExplainModal(true);
    setFolderExplainReport('');
    try {
      await explainEntireFolderStream(
        folderPath,
        repoData.files,
        apiKey,
        (cumulativeText) => {
          setFolderExplainReport(cumulativeText);
        }
      );
    } catch (err: any) {
      setFolderExplainReport(`### ⚠️ Audit Error\nFailed to explain module folder: ${err.message || err}`);
    } finally {
      setIsExplainingFolder(false);
    }
  };

  const handleRunCrossFileRefactor = async () => {
    if (!repoData || selectedFilePaths.size < 2) return;
    setIsRefactoring(true);
    setShowRefactorModal(true);
    setRefactorProposal('');
    try {
      const selectedFiles = repoData.files.filter(f => selectedFilePaths.has(f.path));
      await suggestCrossFileRefactorStream(
        selectedFiles,
        apiKey,
        (cumulativeText) => {
          setRefactorProposal(cumulativeText);
        }
      );
    } catch (err: any) {
      setRefactorProposal(`### ⚠️ Refactoring Error\nFailed to generate refactoring proposal: ${err.message || err}`);
    } finally {
      setIsRefactoring(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!repoData) return;
    try {
      const zip = new JSZip();
      repoData.files.forEach((file) => {
        zip.file(file.path, file.content);
      });
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${repoData.repoName.replace(/\//g, '_')}-updated.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate ZIP archive:', err);
    }
  };

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

  const handleDataLoaded = (data: { 
    files: ParsedFile[]; 
    repoName: string; 
    commits?: import('./utils/repoParser').GitHubCommitInfo[];
  }) => {
    setRepoData(data);
    setSemanticSearchResults(null);
    setSemanticSearchError(null);
    setDiffData(null);
    setIsEvolutionMode(false);
    setCurrentEvolutionStep(0);
    setLinterViolations(null);
    setAuditReport(null);
  };

  const handleResetRepo = () => {
    setRepoData(null);
    setSemanticSearchResults(null);
    setSemanticSearchError(null);
    setSearchQuery('');
    setDiffData(null);
    setIsEvolutionMode(false);
    setCurrentEvolutionStep(0);
    setLinterViolations(null);
    setAuditReport(null);
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
    audioSonifier.playClick();
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
          style={{ paddingLeft: `${depth * 14 + 8}px`, display: 'flex', alignItems: 'center' }}
          onClick={() => {
            audioSonifier.playClick();
            if (isMultiSelectActive) {
              setSelectedFilePaths(prev => {
                const next = new Set(prev);
                if (next.has(item.path)) next.delete(item.path);
                else next.add(item.path);
                return next;
              });
            } else {
              setSelectedNodeId(item.path);
            }
          }}
        >
          {isMultiSelectActive && (
            <input
              type="checkbox"
              className="file-select-checkbox"
              checked={selectedFilePaths.has(item.path)}
              onChange={(e) => {
                e.stopPropagation();
                setSelectedFilePaths(prev => {
                  const next = new Set(prev);
                  if (next.has(item.path)) next.delete(item.path);
                  else next.add(item.path);
                  return next;
                });
              }}
            />
          )}
          <File size={14} style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: '6px' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <button
                className="folder-explain-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRunFolderExplanation(item.path);
                }}
                title="Explain Folder Architecture"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-primary)',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  fontSize: '0.65rem',
                  opacity: 0.8,
                  transition: 'opacity 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px'
                }}
              >
                🧠 explain
              </button>
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
            <>
              <button className="cyber-button" style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={handleDownloadZip}>
                <Download size={14} />
                Export ZIP
              </button>
              <button 
                className="cyber-button secondary" 
                style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }} 
                onClick={handleCopyShareLink}
                title="Copy shareable link with current view state"
              >
                <Share2 size={14} />
                Share View
              </button>
              <button className="cyber-button secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={handleResetRepo}>
                <ArrowLeft size={14} style={{ marginRight: '6px' }} />
                Reset Workspace
              </button>
            </>
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

          {/* Keyboard Shortcuts Help Button */}
          <div
            onClick={() => setIsHelpOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              transition: 'var(--transition-smooth)',
              borderLeft: '1px solid var(--panel-border)',
              paddingLeft: '12px',
              paddingRight: '4px',
              userSelect: 'none'
            }}
            title="Keyboard Shortcuts Reference (?)"
            className="help-indicator-btn"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
              <HelpCircle size={14} />
              <span>Shortcuts</span>
            </div>
          </div>

          {/* Settings API Key Toggle indicator */}
          <div 
            onClick={() => setIsSettingsOpen(true)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              borderLeft: '1px solid var(--panel-border)', 
              paddingLeft: '12px',
              cursor: 'pointer',
              userSelect: 'none'
            }}
            title="Configure Gemini API Key Settings"
            className="api-indicator-btn"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: apiKey ? 'var(--color-secondary)' : '#f59e0b' }}>
              <Key size={14} style={{ color: apiKey ? 'var(--color-secondary)' : '#f59e0b' }} />
              <span style={{ fontWeight: 500 }}>{apiKey ? 'AI Key Verified' : 'AI Offline Mode'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      {isLoadingRepo ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          gap: '20px',
          color: 'var(--text-primary)'
        }}>
          <div className="search-spinner" style={{ width: '40px', height: '40px', borderWidth: '3px', borderTopColor: 'var(--color-primary)' }} />
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 600 }}>Loading Shareable Workspace</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Fetching codebase data for <span style={{ color: 'var(--color-secondary)', fontWeight: 600 }}>{new URLSearchParams(window.location.search).get('repo')}</span>...
            </p>
          </div>
        </div>
      ) : repoLoadError ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          gap: '20px',
          color: 'var(--text-primary)',
          maxWidth: '500px',
          margin: '0 auto',
          padding: '20px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem' }}>⚠️</div>
          <div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-alert)' }}>Failed to Load Workspace</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              {repoLoadError}
            </p>
            <button 
              className="cyber-button" 
              style={{ margin: '0 auto' }}
              onClick={() => {
                setRepoLoadError(null);
                const cleanUrl = `${window.location.pathname}`;
                window.history.replaceState(null, '', cleanUrl);
              }}
            >
              Go to Workspace Setup
            </button>
          </div>
        </div>
      ) : !repoData ? (
        <RepoSelector 
          onDataLoaded={handleDataLoaded} 
        />
      ) : (
        graphData && (
          <main className={`workspace-layout ${viewMode === 'docs' ? 'docs-active-layout' : ''}`}>
            {/* Left Sidebar - File Explorer */}
            {viewMode !== 'docs' && (
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
              
              {repoData && (
                <div className="multi-select-toggle-row" style={{ padding: '8px 12px', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)' }}>
                  <button 
                    className={`cyber-button ${isMultiSelectActive ? 'active' : 'secondary'}`} 
                    style={{ fontSize: '0.68rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }} 
                    onClick={() => {
                      setIsMultiSelectActive(!isMultiSelectActive);
                      setSelectedFilePaths(new Set());
                    }}
                  >
                    {isMultiSelectActive ? '✕ Exit Multi-Select' : '☑️ Multi-File Refactor'}
                  </button>
                  {isMultiSelectActive && selectedFilePaths.size > 0 && (
                    <span 
                      className="multi-select-clear-link"
                      onClick={() => setSelectedFilePaths(new Set())}
                    >
                      Clear ({selectedFilePaths.size})
                    </span>
                  )}
                </div>
              )}

              <div className="file-tree-container" style={{ position: 'relative' }}>
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
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AiIcon size={14} />
                        AI Matches ({semanticSearchResults.length})
                      </span>
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
              {isMultiSelectActive && selectedFilePaths.size >= 2 && (
                <div className="multi-select-toolbar">
                  <div className="multi-select-header">
                    <span>Selected Files</span>
                    <span className="multi-select-count">{selectedFilePaths.size}</span>
                  </div>
                  <button className="multi-select-btn" onClick={handleRunCrossFileRefactor}>
                    <Sparkles size={14} /> Refactor Selected Files
                  </button>
                </div>
              )}
            </aside>
            )}

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
                  <button
                    className={`tab-btn ${viewMode === 'docs' ? 'active' : ''}`}
                    onClick={() => setViewMode('docs')}
                  >
                    📖 API Docs
                  </button>
                  <button
                    className={`tab-btn ${viewMode === 'dbSchema' ? 'active' : ''}`}
                    onClick={() => setViewMode('dbSchema')}
                  >
                    🗃️ DB Schema
                  </button>
                </div>

                <div className="tabs-right-controls">
                  {viewMode !== 'analytics' && viewMode !== 'docs' && viewMode !== 'dbSchema' && (
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
              {viewMode !== 'analytics' && viewMode !== 'docs' && viewMode !== 'dbSchema' && (
                <KpiRibbon
                  graphData={graphData}
                  onOpenAnalytics={() => setViewMode('analytics')}
                  onSelectFile={(filePath) => setSelectedNodeId(filePath)}
                />
              )}

              {/* D3 Canvas Viewport, Analytics Dashboard or API Docs Portal Content */}
              {viewMode === 'analytics' ? (
                <AnalyticsDashboard
                  files={repoData.files}
                  cycles={graphData.cycles}
                  graphData={graphData}
                  apiKey={apiKey}
                  onSelectFile={(filePath) => setSelectedNodeId(filePath)}
                  onUpdateFileContent={handleUpdateFileContent}
                />
              ) : viewMode === 'docs' ? (
                <ApiDocsPortal
                  files={repoData.files}
                  apiKey={apiKey}
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
                  commits={repoData.commits}
                  linterViolations={linterViolations}
                  auditReport={auditReport}
                  apiKey={apiKey}
                  dbAuditTrigger={dbAuditTrigger}
                  onExplainFolder={handleRunFolderExplanation}
                  onRefineCallGraph={handleRefineCallGraph}
                  isRefiningCallGraph={isRefiningCallGraph}
                />
              )}
            </section>

            {/* Right Sidebar - Inspector Panel */}
            {viewMode !== 'docs' && (
              <Inspector
                selectedFile={activeFile}
                repoName={repoData.repoName}
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
                linterViolations={linterViolations}
                setLinterViolations={setLinterViolations}
                linterRule={linterRule}
                setLinterRule={setLinterRule}
                isLinting={isLinting}
                linterError={linterError}
                onRunLinter={handleRunLinter}
                auditReport={auditReport}
                setAuditReport={setAuditReport}
                isAuditing={isAuditing}
                auditError={auditError}
                onRunAudit={handleRunDependencyAudit}
                onUpdateFileContent={handleUpdateFileContent}
              />
            )}
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
          <img 
            src="/ai-logo.png" 
            alt="CodeGraph AI" 
            style={{ 
              width: '30px', 
              height: '30px', 
              borderRadius: '50%',
              boxShadow: '0 0 10px var(--color-primary-glow)',
              border: '1px solid rgba(255,255,255,0.05)'
            }} 
          />
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

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="settings-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="glass-panel settings-modal" onClick={(e) => e.stopPropagation()} style={{ border: '1px solid var(--color-primary)', boxShadow: '0 8px 32px 0 rgba(139, 92, 246, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)', fontSize: '1.1rem' }}>
                <Key size={18} />
                AI Linter & Assistant Settings
              </h3>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--panel-border)', marginTop: '16px' }}>
              <img 
                src="/ai-logo.png" 
                alt="CodeGraph AI Logo" 
                style={{ 
                  width: '56px', 
                  height: '56px', 
                  borderRadius: '10px', 
                  boxShadow: '0 0 16px var(--color-primary-glow)',
                  border: '1px solid rgba(255,255,255,0.1)'
                }} 
              />
              <div>
                <h4 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>CodeGraph Gemini Intelligence</h4>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  Unlocks codebase Q&A, custom lint rules, schema contract drift analysis, and automated unit test generators.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px', borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ 
                  width: '10px', 
                  height: '10px', 
                  borderRadius: '50%', 
                  background: apiKey ? '#10b981' : '#ef4444',
                  boxShadow: apiKey ? '0 0 8px #10b981' : '0 0 8px #ef4444'
                }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {apiKey ? 'Status: Active (API Key Loaded from Environment)' : 'Status: Offline (No API Key Detected)'}
                </span>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                The application reads the Gemini API Key securely from the build environment variables (`VITE_GEMINI_API_KEY`). Users cannot view, modify, or extract the key from this settings screen.
              </p>
            </div>

            {/* AI Cache & Token Telemetry Dashboard */}
            <div style={{ marginTop: '20px', borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <Activity size={14} />
                AI Cache & Token Telemetry
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                {/* Cache Hit Rate */}
                <div className="glass-panel" style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--panel-border)' }}>
                  <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cache Hit Rate</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--color-secondary)' }}>{telemetry.hitRate}%</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>({telemetry.cacheHits} / {telemetry.totalRequests} reqs)</span>
                  </div>
                </div>

                {/* Dev Savings */}
                <div className="glass-panel" style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--panel-border)' }}>
                  <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Dev Time Saved</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#10b981' }}>~{telemetry.timeSavedMinutes}m</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>(${telemetry.costSaved.toFixed(4)} saved)</span>
                  </div>
                </div>

                {/* Tokens Saved */}
                <div className="glass-panel" style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--panel-border)', gridColumn: 'span 2' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    <span>Tokens Processed vs Saved</span>
                    <span style={{ color: 'var(--color-primary)' }}>{(telemetry.savedTokens / (telemetry.processedTokens + telemetry.savedTokens || 1) * 100).toFixed(0)}% Offloaded</span>
                  </div>
                  
                  {/* Progress bar visual */}
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', marginTop: '8px', overflow: 'hidden', display: 'flex' }}>
                    <div style={{ 
                      width: `${(telemetry.processedTokens / (telemetry.processedTokens + telemetry.savedTokens || 1)) * 100}%`, 
                      background: 'var(--color-primary)' 
                    }} />
                    <div style={{ 
                      width: `${(telemetry.savedTokens / (telemetry.processedTokens + telemetry.savedTokens || 1)) * 100}%`, 
                      background: '#10b981' 
                    }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.65rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Processed: <strong>{telemetry.processedTokens.toLocaleString()}</strong></span>
                    <span style={{ color: 'var(--text-secondary)' }}>Saved (Cached): <strong style={{ color: '#10b981' }}>{telemetry.savedTokens.toLocaleString()}</strong></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Audio Settings Panel */}
            <div style={{ marginTop: '20px', borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <span>🔊 Codebase Sonification (Audio Feedback)</span>
              </h4>
              
              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Enable Auditory Feedback</span>
                    <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>Plays responsive synthesized chimes on hover and simulation ticks.</span>
                  </div>
                  <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '38px', height: '20px' }}>
                    <input 
                      type="checkbox" 
                      checked={audioEnabled}
                      onChange={(e) => {
                        const nextVal = e.target.checked;
                        audioSonifier.setEnabled(nextVal);
                        setAudioEnabled(nextVal);
                        if (nextVal) {
                          audioSonifier.playClick();
                        }
                      }}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                      backgroundColor: audioEnabled ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)',
                      transition: '0.3s', borderRadius: '20px',
                      boxShadow: audioEnabled ? '0 0 8px var(--color-primary-glow)' : 'none'
                    }}>
                      <span style={{
                        position: 'absolute', content: '""', height: '14px', width: '14px', left: '3px', bottom: '3px',
                        backgroundColor: '#ffffff', transition: '0.3s', borderRadius: '50%',
                        transform: audioEnabled ? 'translateX(18px)' : 'translateX(0)'
                      }} />
                    </span>
                  </label>
                </div>

                {audioEnabled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      <span>Master Volume</span>
                      <span>{Math.round(audioVolume * 100)}%</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.05"
                        value={audioVolume}
                        onChange={(e) => {
                          const nextVol = parseFloat(e.target.value);
                          audioSonifier.setVolume(nextVol);
                          setAudioVolume(nextVol);
                        }}
                        style={{
                          flex: 1,
                          accentColor: 'var(--color-primary)',
                          background: 'rgba(255,255,255,0.1)',
                          height: '4px',
                          borderRadius: '2px',
                          cursor: 'pointer'
                        }}
                      />
                      <button 
                        className="cyber-button secondary"
                        style={{ fontSize: '0.7rem', padding: '4px 10px', height: '24px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => {
                          audioSonifier.playClick();
                          audioSonifier.playNodeHover({ size: 100, complexity: 10 });
                        }}
                      >
                        🎵 Test sound
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', borderTop: '1px solid var(--panel-border)', paddingTop: '12px' }}>
              <button 
                className="cyber-button"
                style={{ padding: '8px 20px', fontSize: '0.85rem' }}
                onClick={() => setIsSettingsOpen(false)}
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Explainer Modal */}
      {showFolderExplainModal && (
        <div className="settings-overlay" onClick={() => setShowFolderExplainModal(false)}>
          <div className="glass-panel settings-modal" onClick={(e) => e.stopPropagation()} style={{ width: '80%', maxWidth: '800px', border: '1px solid var(--color-primary)', boxShadow: '0 8px 32px 0 rgba(139, 92, 246, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)', fontSize: '1.1rem' }}>
                🧠 Module Explainer: {explainingFolderName}
              </h3>
              <button 
                onClick={() => setShowFolderExplainModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>
            
            <div className="custom-scrollbar" style={{ maxHeight: '60vh', overflowY: 'auto', marginTop: '16px', paddingRight: '8px' }}>
              {isExplainingFolder && !folderExplainReport ? (
                <div style={{ padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <div className="search-spinner" style={{ width: '32px', height: '32px' }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>AI is mapping module boundaries & reading files...</span>
                </div>
              ) : (
                <div 
                  className="markdown-body" 
                  dangerouslySetInnerHTML={{ __html: formatMarkdown(folderExplainReport || '') + (isExplainingFolder ? ' <span class="typing-cursor"></span>' : '') }} 
                />
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', borderTop: '1px solid var(--panel-border)', paddingTop: '12px' }}>
              <button 
                className="cyber-button"
                style={{ padding: '8px 20px', fontSize: '0.85rem' }}
                onClick={() => setShowFolderExplainModal(false)}
              >
                Close Explanation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cross-File Refactoring Modal */}
      {showRefactorModal && (
        <div className="settings-overlay" onClick={() => setShowRefactorModal(false)}>
          <div className="glass-panel settings-modal" onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: '1000px', border: '1px solid var(--color-primary)', boxShadow: '0 8px 32px 0 rgba(139, 92, 246, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)', fontSize: '1.1rem' }}>
                ✨ Cross-File AI Refactoring Proposal
              </h3>
              <button 
                onClick={() => setShowRefactorModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>
            
            <div className="custom-scrollbar" style={{ maxHeight: '65vh', overflowY: 'auto', marginTop: '16px', paddingRight: '8px' }}>
              {isRefactoring && !refactorProposal ? (
                <div style={{ padding: '50px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <div className="search-spinner" style={{ width: '32px', height: '32px' }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Gemini is auditing overlapping logic & compiling DRY blueprints...</span>
                </div>
              ) : (
                <div 
                  className="markdown-body" 
                  dangerouslySetInnerHTML={{ __html: formatMarkdown(refactorProposal || '') + (isRefactoring ? ' <span class="typing-cursor"></span>' : '') }} 
                />
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', borderTop: '1px solid var(--panel-border)', paddingTop: '12px' }}>
              <button 
                className="cyber-button"
                style={{ padding: '8px 20px', fontSize: '0.85rem' }}
                onClick={() => setShowRefactorModal(false)}
              >
                Close Refactor Sheet
              </button>
            </div>
          </div>
        </div>
      )}

      {repoData && (
        <CommandPalette
          viewMode={viewMode}
          setViewMode={setViewMode}
          theme={theme}
          setTheme={setTheme}
          isChatOpen={isChatOpen}
          setIsChatOpen={setIsChatOpen}
          setIsSettingsOpen={setIsSettingsOpen}
          onToggleHelp={() => setIsHelpOpen(prev => !prev)}
          onRunDependencyAudit={handleRunDependencyAudit}
          onRunDbAudit={() => setDbAuditTrigger(prev => prev + 1)}
          files={repoData.files}
          onSelectFile={setSelectedNodeId}
        />
      )}

      <KeyboardShortcutsHelp 
        isOpen={isHelpOpen} 
        onClose={() => setIsHelpOpen(false)} 
      />

      {toastMessage && (
        <div className="toast-notification">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
