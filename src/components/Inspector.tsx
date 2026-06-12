import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FileText, Code, Sparkles, Send, Bot, User, HelpCircle, Terminal, AlertTriangle, Folder, Copy, ExternalLink, Activity, ChevronDown, ChevronRight, List } from 'lucide-react';
import { AiIcon } from './AiIcon';
import type { ParsedFile } from '../utils/repoParser';
import { getFileExplanation, askQuestionAboutCodebase, generateTestSuite } from '../utils/aiHelper';
import type { LinterViolation } from '../utils/aiHelper';

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


interface ParsedFunction {
  name: string;
  line: number;
}



function parseFunctions(content: string, language: string): ParsedFunction[] {
  if (!content) return [];
  const lines = content.split('\n');
  const functions: ParsedFunction[] = [];
  const lowerLang = language.toLowerCase();

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    if (lowerLang === 'python') {
      const match = line.match(/^\s*def\s+([a-zA-Z0-9_]+)\s*\(/);
      if (match) {
        functions.push({ name: match[1], line: lineNum });
      }
      return;
    }
    if (lowerLang === 'go') {
      const match = line.match(/^\s*func\s+([a-zA-Z0-9_]+)\s*\(/);
      if (match) {
        functions.push({ name: match[1], line: lineNum });
      }
      return;
    }
    if (lowerLang === 'rust') {
      const match = line.match(/^\s*(?:pub\s+)?fn\s+([a-zA-Z0-9_]+)\s*\(/);
      if (match) {
        functions.push({ name: match[1], line: lineNum });
      }
      return;
    }
    if (['javascript', 'typescript'].includes(lowerLang)) {
      const f1 = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(/);
      if (f1) {
        functions.push({ name: f1[1], line: lineNum });
        return;
      }
      const f2 = line.match(/^\s*(?:export\s+)?const\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/);
      if (f2) {
        functions.push({ name: f2[1], line: lineNum });
        return;
      }
      const f3 = line.match(/^\s*(?:public|private|protected|async|static\s+)*([a-zA-Z0-9_]+)\s*\([^)]*\)\s*\{/);
      if (f3) {
        const name = f3[1];
        const reserved = ['if', 'for', 'while', 'switch', 'catch', 'constructor', 'return', 'else'];
        if (!reserved.includes(name)) {
          functions.push({ name, line: lineNum });
        }
      }
    }
  });
  return functions;
}

function calculateComplexity(content: string): { score: number; level: 'Low' | 'Medium' | 'High'; color: string } {
  if (!content) return { score: 1, level: 'Low', color: '#10b981' };
  const lines = content.split('\n');
  let score = 1;

  const keywords = ['\\bif\\b', '\\bfor\\b', '\\bwhile\\b', '\\bswitch\\b', '\\bcatch\\b', '&&', '\\|\\|', '\\?\\.', '\\?'];
  keywords.forEach(kw => {
    const regex = new RegExp(kw, 'g');
    const matches = content.match(regex);
    if (matches) {
      score += matches.length;
    }
  });

  score += Math.floor(lines.length / 30);

  let level: 'Low' | 'Medium' | 'High' = 'Low';
  let color = '#10b981';
  if (score > 35) {
    level = 'High';
    color = '#ef4444';
  } else if (score > 15) {
    level = 'Medium';
    color = '#f59e0b';
  }

  return { score, level, color };
}



function getSimilarFiles(selectedFile: ParsedFile, allFiles: ParsedFile[]): ParsedFile[] {
  if (!selectedFile || allFiles.length <= 1) return [];
  const scoreMap = new Map<string, number>();

  const currentFolder = selectedFile.path.substring(0, selectedFile.path.lastIndexOf('/'));
  const currentImports = new Set(selectedFile.content.match(/['"][^'"]+['"]/g) || []);

  allFiles.forEach(f => {
    if (f.path === selectedFile.path) return;
    let score = 0;

    if (f.language === selectedFile.language) {
      score += 3;
    }

    const folder = f.path.substring(0, f.path.lastIndexOf('/'));
    if (folder === currentFolder) {
      score += 4;
    } else if (folder.split('/')[0] === currentFolder.split('/')[0]) {
      score += 1.5;
    }

    const fImports = f.content.match(/['"][^'"]+['"]/g) || [];
    fImports.forEach(imp => {
      if (currentImports.has(imp)) {
        score += 1;
      }
    });

    if (f.name.toLowerCase().includes(selectedFile.name.toLowerCase()) || 
        selectedFile.name.toLowerCase().includes(f.name.toLowerCase())) {
      score += 2;
    }

    scoreMap.set(f.path, score);
  });

  return [...allFiles]
    .filter(f => f.path !== selectedFile.path && scoreMap.has(f.path))
    .sort((a, b) => (scoreMap.get(b.path) || 0) - (scoreMap.get(a.path) || 0))
    .slice(0, 3);
}

interface InspectorProps {
  selectedFile: ParsedFile | null;
  allFiles: ParsedFile[];
  apiKey: string;
  cycles: string[][];
  imports: string[];
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  setCollapsedFolders: React.Dispatch<React.SetStateAction<Set<string>>>;
  activeTraceNodeId: string | null;
  setActiveTraceNodeId: (id: string | null) => void;
  callNodes: any[];
  callLinks: any[];
  diffData: any | null;
  linterViolations: LinterViolation | null;
  setLinterViolations: (violations: LinterViolation | null) => void;
  linterRule: string;
  setLinterRule: (rule: string) => void;
  isLinting: boolean;
  linterError: string | null;
  onRunLinter: (rule: string) => void;
}

export const Inspector: React.FC<InspectorProps> = ({
  selectedFile,
  allFiles,
  apiKey,
  cycles,
  imports,
  selectedNodeId,
  setSelectedNodeId,
  setCollapsedFolders,
  activeTraceNodeId,
  setActiveTraceNodeId,
  callNodes,
  callLinks,
  diffData,
  linterViolations,
  setLinterViolations,
  linterRule,
  setLinterRule,
  isLinting,
  linterError,
  onRunLinter,
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'chat' | 'linter'>('info');
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [testSuites, setTestSuites] = useState<Record<string, string>>({});
  const [loadingTest, setLoadingTest] = useState(false);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<{ sender: 'user' | 'ai'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // Extended File Inspector States
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    functions: false,
    relations: false,
    similar: false
  });
  const codePreviewRef = useRef<HTMLPreElement>(null);

  const renderPatch = (patchText: string) => {
    if (!patchText) {
      return (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          No line-level patch details available.
        </div>
      );
    }
    const lines = patchText.split('\n');
    return (
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.7rem',
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid var(--panel-border)',
        borderRadius: '6px',
        padding: '8px',
        overflowX: 'auto',
        lineHeight: '1.45',
        maxHeight: '340px',
        overflowY: 'auto'
      }}>
        {lines.map((line, idx) => {
          let bgColor = 'transparent';
          let textColor = 'var(--text-secondary)';
          if (line.startsWith('+')) {
            bgColor = 'rgba(16, 185, 129, 0.08)';
            textColor = '#10b981';
          } else if (line.startsWith('-')) {
            bgColor = 'rgba(244, 63, 94, 0.08)';
            textColor = '#f43f5e';
          } else if (line.startsWith('@@')) {
            bgColor = 'rgba(99, 102, 241, 0.08)';
            textColor = '#818cf8';
          }
          return (
            <div key={idx} style={{ backgroundColor: bgColor, color: textColor, whiteSpace: 'pre', padding: '2px 4px', borderRadius: '2px', fontFamily: 'var(--font-mono)' }}>
              {line}
            </div>
          );
        })}
      </div>
    );
  };

  const [diffSubTab, setDiffSubTab] = useState<'diff' | 'meta'>('diff');

  useEffect(() => {
    setDiffSubTab('diff');
  }, [selectedNodeId]);

  const activeInspectorFile = useMemo(() => {
    if (selectedFile) return selectedFile;
    if (selectedNodeId && diffData && diffData.files[selectedNodeId]) {
      return {
        name: selectedNodeId.split('/').pop() || '',
        path: selectedNodeId,
        language: selectedNodeId.split('.').pop() || 'text',
        size: 0,
        content: '',
        commitCount: 0
      } as ParsedFile;
    }
    return null;
  }, [selectedFile, selectedNodeId, diffData]);

  // Memoized metadata values
  const parsedFunctions = useMemo(() => {
    return activeInspectorFile ? parseFunctions(activeInspectorFile.content || '', activeInspectorFile.language) : [];
  }, [activeInspectorFile]);

  const complexityInfo = useMemo(() => {
    return activeInspectorFile ? calculateComplexity(activeInspectorFile.content || '') : null;
  }, [activeInspectorFile]);



  const similarFiles = useMemo(() => {
    return activeInspectorFile ? getSimilarFiles(activeInspectorFile, allFiles) : [];
  }, [activeInspectorFile, allFiles]);

  const reverseImports = useMemo(() => {
    if (!activeInspectorFile) return [];
    return allFiles.filter(f => {
      if (f.path === activeInspectorFile.path) return false;
      const pathSnippet = activeInspectorFile.path.split('/').pop()?.split('.')[0] || '';
      if (!pathSnippet) return false;
      return f.content.toLowerCase().includes(pathSnippet.toLowerCase()) && 
        (f.content.includes('import') || f.content.includes('require'));
    });
  }, [activeInspectorFile, allFiles]);

  const handleCopyPath = () => {
    if (!selectedFile) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(selectedFile.path);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = selectedFile.path;
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (e) {
      console.warn('Clipboard write failed, showing notification anyway', e);
    }
    setToastMessage('Relative path copied!');
    setTimeout(() => setToastMessage(null), 2000);
  };

  const handleOpenInEditor = () => {
    if (!selectedFile) return;
    const absPath = `c:/Sem-6/SGP_4/CodeGraph/${selectedFile.path}`;
    try {
      window.open(`vscode://file/${absPath}`);
    } catch (e) {
      console.error(e);
    }
    setToastMessage('Opening in VS Code...');
    setTimeout(() => setToastMessage(null), 2000);
  };

  const scrollToLine = (line: number) => {
    const element = codePreviewRef.current;
    if (!element) return;
    const lines = selectedFile ? selectedFile.content.split('\n') : [];
    const totalLines = lines.length || 1;
    const ratio = (line - 1) / totalLines;
    element.scrollTop = element.scrollHeight * ratio - 60;
    
    setToastMessage(`Navigated to line ${line}`);
    setTimeout(() => setToastMessage(null), 1500);
  };

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Reset tab to info if selected file changes
  useEffect(() => {
    if (selectedFile) {
      setActiveTab('info');
    }
  }, [selectedFile]);

  const handleExplain = async () => {
    if (!selectedFile) return;
    setLoadingExplanation(true);
    try {
      const explanation = await getFileExplanation(selectedFile.path, selectedFile.content, apiKey);
      setExplanations((prev) => ({
        ...prev,
        [selectedFile.path]: explanation,
      }));
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingExplanation(false);
    }
  };

  const handleGenerateTest = async () => {
    if (!selectedFile) return;
    setLoadingTest(true);
    try {
      const suite = await generateTestSuite(selectedFile.path, selectedFile.content, apiKey);
      setTestSuites((prev) => ({
        ...prev,
        [selectedFile.path]: suite,
      }));
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingTest(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userText = chatInput;
    setChatMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setChatInput('');
    setChatLoading(true);

    try {
      const filesSummary = allFiles.map((f) => ({
        path: f.path,
        size: f.size,
        language: f.language,
      }));

      const activeContext = selectedFile
        ? { path: selectedFile.path, content: selectedFile.content }
        : null;

      const aiResponse = await askQuestionAboutCodebase(userText, activeContext, filesSummary, apiKey);
      setChatMessages((prev) => [...prev, { sender: 'ai', text: aiResponse }]);
    } catch (err: any) {
      setChatMessages((prev) => [...prev, { sender: 'ai', text: `Failed to get reply: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Find if current file is part of any circular dependency cycles
  const currentFileCycles = activeInspectorFile
    ? cycles.filter((cycle) => cycle.includes(activeInspectorFile.path))
    : [];

  const fileExplanation = activeInspectorFile ? explanations[activeInspectorFile.path] : '';

  const isSelectedNodeFolder = selectedNodeId && selectedNodeId.startsWith('folder:');
  const selectedFolder = isSelectedNodeFolder ? selectedNodeId!.slice(7) : null;

  const isSelectedNodeFunction = selectedNodeId && selectedNodeId.includes('::');
  const selectedFunctionNode = useMemo(() => {
    if (!isSelectedNodeFunction) return null;
    return callNodes.find(n => n.id === selectedNodeId);
  }, [isSelectedNodeFunction, selectedNodeId, callNodes]);

  const selectedFunctionCallers = useMemo(() => {
    if (!selectedNodeId) return [];
    return callLinks
      .filter(l => {
        const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
        return t === selectedNodeId;
      })
      .map(l => {
        const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
        return callNodes.find(n => n.id === s);
      })
      .filter(Boolean);
  }, [selectedNodeId, callLinks, callNodes]);

  const selectedFunctionCallees = useMemo(() => {
    if (!selectedNodeId) return [];
    return callLinks
      .filter(l => {
        const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
        return s === selectedNodeId;
      })
      .map(l => {
        const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
        return callNodes.find(n => n.id === t);
      })
      .filter(Boolean);
  }, [selectedNodeId, callLinks, callNodes]);

  const folderFiles = useMemo(() => {
    if (!selectedFolder) return [];
    return allFiles.filter(f => f.path === selectedFolder || f.path.startsWith(selectedFolder + '/'));
  }, [selectedFolder, allFiles]);

  const totalLoc = useMemo(() => {
    return folderFiles.reduce((sum, f) => sum + (f.size || 0), 0);
  }, [folderFiles]);

  const fileFolder = activeInspectorFile ? activeInspectorFile.path.substring(0, activeInspectorFile.path.lastIndexOf('/')) : null;

  return (
    <aside className="glass-panel sidebar-right">
      <div className="inspector-tabs">
        <button
          className={`inspector-tab ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          <FileText size={14} style={{ marginRight: '6px', display: 'inline-block', verticalAlign: 'middle' }} />
          File Inspector
        </button>
        <button
          className={`inspector-tab ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <Sparkles size={14} style={{ marginRight: '6px', display: 'inline-block', verticalAlign: 'middle' }} />
          Ask CodeBase AI
        </button>
        <button
          className={`inspector-tab ${activeTab === 'linter' ? 'active' : ''}`}
          onClick={() => setActiveTab('linter')}
        >
          <AlertTriangle size={14} style={{ marginRight: '6px', display: 'inline-block', verticalAlign: 'middle', color: '#f97316' }} />
          AI Rules Linter
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeTab === 'info' && (
          <div className="inspector-content">
            {selectedFolder ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-warning)', marginBottom: '8px' }}>
                    <Folder size={18} />
                    <h3 style={{ wordBreak: 'break-all', fontSize: '1.1rem' }}>{selectedFolder.split('/').pop()}</h3>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{selectedFolder}</p>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="logo-badge" style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.08)', color: 'var(--color-warning)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
                    📁 Folder Cluster
                  </span>
                  <span className="logo-badge" style={{ fontSize: '0.7rem', background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)', borderColor: 'rgba(255, 255, 255, 0.08)' }}>
                    {folderFiles.length} files
                  </span>
                  <span className="logo-badge" style={{ fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.08)', color: 'var(--color-secondary)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                    {(totalLoc / 1024).toFixed(1)} KB
                  </span>
                </div>

                <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }}>
                  <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Files in Cluster</h4>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {folderFiles.map((f) => (
                      <div key={f.path} style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', background: 'rgba(255,255,255,0.02)', padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.03)', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                        {f.path.replace(selectedFolder + '/', '')}
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  className="cyber-button"
                  style={{ width: '100%', padding: '10px 14px', fontSize: '0.85rem', marginTop: '12px' }}
                  onClick={() => {
                    setCollapsedFolders(prev => {
                      const next = new Set(prev);
                      next.delete(selectedFolder);
                      return next;
                    });
                    setSelectedNodeId(null);
                  }}
                >
                  📁 Expand Folder Cluster
                </button>
              </div>
            ) : isSelectedNodeFunction ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-secondary)', marginBottom: '8px' }}>
                    <Code size={18} />
                    <h3 style={{ wordBreak: 'break-all', fontSize: '1.1rem', fontFamily: 'var(--font-mono)' }}>
                      {selectedNodeId.split('::').pop()}()
                    </h3>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                    File: {selectedNodeId.split('::')[0]}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {selectedFunctionNode && selectedFunctionNode.callCount === 0 ? (
                    <span className="logo-badge" style={{ fontSize: '0.7rem', background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                      🗑️ Unused Function
                    </span>
                  ) : (
                    <span className="logo-badge" style={{ fontSize: '0.7rem', background: 'rgba(16, 185, 129, 0.08)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                      ⚡ Active Function
                    </span>
                  )}
                  <span className="logo-badge" style={{ fontSize: '0.7rem', background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)', borderColor: 'rgba(255, 255, 255, 0.08)' }}>
                    {selectedFunctionNode ? selectedFunctionNode.callCount : 0} Calls
                  </span>
                </div>

                {/* Trace Simulator Button */}
                <button
                  className="cyber-button"
                  style={{ 
                    width: '100%', 
                    padding: '10px 14px', 
                    fontSize: '0.85rem', 
                    marginTop: '4px',
                    backgroundColor: activeTraceNodeId === selectedNodeId ? 'var(--color-alert)' : 'var(--color-primary-glow)',
                    borderColor: activeTraceNodeId === selectedNodeId ? 'var(--color-alert)' : 'var(--color-primary)'
                  }}
                  onClick={() => {
                    if (activeTraceNodeId === selectedNodeId) {
                      setActiveTraceNodeId(null);
                    } else {
                      setActiveTraceNodeId(selectedNodeId);
                    }
                  }}
                >
                  {activeTraceNodeId === selectedNodeId ? '⏹️ Stop Flow Simulation' : '⚡ Simulate Execution Flow'}
                </button>

                {/* Callers List */}
                <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '12px' }}>
                  <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                    Callers (Incoming)
                  </h4>
                  <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {selectedFunctionCallers.length === 0 ? (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No callers detected</span>
                    ) : (
                      selectedFunctionCallers.map((caller: any) => (
                        <div 
                          key={caller.id} 
                          onClick={() => setSelectedNodeId(caller.id)}
                          style={{ 
                            fontSize: '0.7rem', 
                            fontFamily: 'var(--font-mono)', 
                            background: 'rgba(255,255,255,0.02)', 
                            padding: '4px 8px', 
                            borderRadius: '4px', 
                            border: '1px solid rgba(255,255,255,0.03)', 
                            color: 'var(--color-secondary)', 
                            cursor: 'pointer',
                            wordBreak: 'break-all'
                          }}
                        >
                          {caller.name}() <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>in {caller.file.split('/').pop()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Callees List */}
                <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '12px' }}>
                  <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                    Callees (Outgoing)
                  </h4>
                  <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {selectedFunctionCallees.length === 0 ? (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No outgoing calls detected</span>
                    ) : (
                      selectedFunctionCallees.map((callee: any) => (
                        <div 
                          key={callee.id} 
                          onClick={() => setSelectedNodeId(callee.id)}
                          style={{ 
                            fontSize: '0.7rem', 
                            fontFamily: 'var(--font-mono)', 
                            background: 'rgba(255,255,255,0.02)', 
                            padding: '4px 8px', 
                            borderRadius: '4px', 
                            border: '1px solid rgba(255,255,255,0.03)', 
                            color: 'var(--color-accent)', 
                            cursor: 'pointer',
                            wordBreak: 'break-all'
                          }}
                        >
                          {callee.name}() <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>in {callee.file.split('/').pop()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : !activeInspectorFile ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: '12px', textAlign: 'center', padding: '20px' }}>
                <HelpCircle size={40} style={{ opacity: 0.5 }} />
                <div>
                  <p style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>No File Selected</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>Click any node on the graph or file in the tree to inspect its internals.</p>
                </div>
              </div>
            ) : (
              <>
                {/* File Header Details */}
                <div>
                  <h3 style={{ wordBreak: 'break-all', fontSize: '1.1rem', marginBottom: '8px' }}>{activeInspectorFile.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '4px' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all', margin: 0, flex: 1 }}>{activeInspectorFile.path}</p>
                    {selectedFile && (
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button className="cyber-button text-btn" onClick={handleCopyPath} title="Copy Path" style={{ padding: '4px 6px' }}>
                          <Copy size={12} />
                        </button>
                        <button className="cyber-button text-btn" onClick={handleOpenInEditor} title="Open in VS Code" style={{ padding: '4px 6px' }}>
                          <ExternalLink size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {diffData && diffData.files[activeInspectorFile.path] ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {diffData.files[activeInspectorFile.path].status === 'added' && (
                          <span className="logo-badge" style={{ fontSize: '0.7rem', background: 'rgba(16, 185, 129, 0.08)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                            [+] Added
                          </span>
                        )}
                        {diffData.files[activeInspectorFile.path].status === 'modified' && (
                          <span className="logo-badge" style={{ fontSize: '0.7rem', background: 'rgba(251, 146, 60, 0.08)', color: '#fb923c', borderColor: 'rgba(251, 146, 60, 0.2)' }}>
                            [~] Modified
                          </span>
                        )}
                        {diffData.files[activeInspectorFile.path].status === 'deleted' && (
                          <span className="logo-badge" style={{ fontSize: '0.7rem', background: 'rgba(244, 63, 94, 0.08)', color: '#f43f5e', borderColor: 'rgba(244, 63, 94, 0.2)' }}>
                            [-] Deleted
                          </span>
                        )}
                        <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>+{diffData.files[activeInspectorFile.path].additions} additions</span>
                        <span style={{ fontSize: '0.72rem', color: '#f43f5e', fontWeight: 600 }}>-{diffData.files[activeInspectorFile.path].deletions} deletions</span>
                      </div>

                      {diffData.files[activeInspectorFile.path].status !== 'deleted' && selectedFile && (
                        <div style={{ display: 'flex', borderBottom: '1px solid var(--panel-border)', paddingBottom: '2px', gap: '12px', marginTop: '4px' }}>
                          <button
                            onClick={() => setDiffSubTab('diff')}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              borderBottom: diffSubTab === 'diff' ? '2px solid var(--color-primary)' : '2px solid transparent',
                              color: diffSubTab === 'diff' ? 'var(--text-primary)' : 'var(--text-muted)',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              padding: '4px 0',
                              cursor: 'pointer'
                            }}
                          >
                            🔎 Code Review Diff
                          </button>
                          <button
                            onClick={() => setDiffSubTab('meta')}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              borderBottom: diffSubTab === 'meta' ? '2px solid var(--color-primary)' : '2px solid transparent',
                              color: diffSubTab === 'meta' ? 'var(--text-primary)' : 'var(--text-muted)',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              padding: '4px 0',
                              cursor: 'pointer'
                            }}
                          >
                            📄 General Metrics
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {(!diffData || !diffData.files[activeInspectorFile.path] || diffSubTab === 'meta') && selectedFile ? (
                    <>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                        <span className="logo-badge" style={{ fontSize: '0.7rem' }}>
                          {activeInspectorFile.language.toUpperCase()}
                        </span>
                        <span className="logo-badge" style={{ fontSize: '0.7rem', background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)', borderColor: 'rgba(255, 255, 255, 0.08)' }}>
                          {(activeInspectorFile.size / 1024).toFixed(2)} KB
                        </span>
                        <span className="logo-badge" style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.08)', color: 'var(--color-warning)', borderColor: 'rgba(245, 158, 11, 0.2)' }} title="Simulated Git Commit Frequency">
                          🔥 {Math.floor(((activeInspectorFile.size + activeInspectorFile.path.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % 55) + 5)} commits
                        </span>
                        <span className="logo-badge" style={{ fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.08)', color: 'var(--color-secondary)', borderColor: 'rgba(59, 130, 246, 0.2)' }} title="Lines of Code Complexity">
                          ⏱️ {activeInspectorFile.content ? activeInspectorFile.content.split('\n').length : 0} LOC
                        </span>
                      </div>

                      {/* Complexity Score HUD */}
                      {complexityInfo && (
                        <div style={{
                          marginTop: '12px',
                          padding: '10px 12px',
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid var(--panel-border)',
                          borderRadius: '6px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                              <Activity size={13} style={{ color: complexityInfo.color }} />
                              Code Complexity Score
                            </span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: complexityInfo.color }}>
                              {complexityInfo.score} ({complexityInfo.level})
                            </span>
                          </div>
                          <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(complexityInfo.score * 2.0, 100)}%`,
                              background: complexityInfo.color,
                              boxShadow: `0 0 8px ${complexityInfo.color}`,
                              transition: 'width 0.4s ease'
                            }} />
                          </div>
                        </div>
                      )}

                      {fileFolder && (
                        <button
                          className="cyber-button text-btn"
                          onClick={() => {
                            setCollapsedFolders(prev => {
                              const next = new Set(prev);
                              next.add(fileFolder);
                              return next;
                            });
                            setSelectedNodeId(null);
                          }}
                          style={{ marginTop: '12px', width: '100%', fontSize: '0.75rem', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        >
                          <Folder size={12} />
                          Collapse Parent Folder ({fileFolder.split('/').pop()})
                        </button>
                      )}
                    </>
                  ) : null}

                  {diffData && diffData.files[activeInspectorFile.path] && (diffSubTab === 'diff' || diffData.files[activeInspectorFile.path].status === 'deleted') ? (
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Git Patch Changeset</div>
                      {renderPatch(diffData.files[activeInspectorFile.path].patch)}
                      {diffData.files[activeInspectorFile.path].status === 'deleted' && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <AlertTriangle size={14} style={{ color: 'var(--color-alert)' }} />
                          Note: This file is not accessible in the current repository state (deleted).
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                {selectedFile && (!diffData || !diffData.files[activeInspectorFile.path] || diffSubTab === 'meta') && (
                  <>
                    {/* Circular Dependency Warnings */}
                {currentFileCycles.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '12px', borderRadius: '8px', color: 'var(--color-alert)', fontSize: '0.8rem' }}>
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <p style={{ fontWeight: 600 }}>Circular Dependency Loop Detected!</p>
                      <p style={{ opacity: 0.8, marginTop: '2px' }}>This file is imported in a cyclic loop. Check the circular dependencies report below.</p>
                    </div>
                  </div>
                )}

                {/* Functions Accordion */}
                <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '12px' }}>
                  <button 
                    onClick={() => toggleSection('functions')}
                    style={{ width: '100%', background: 'none', border: 'none', padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <List size={13} style={{ color: 'var(--color-primary)' }} />
                      Functions ({parsedFunctions.length})
                    </span>
                    {collapsedSections.functions ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                  
                  {!collapsedSections.functions && (
                    <div style={{ marginTop: '8px', maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '4px' }}>
                      {parsedFunctions.length === 0 ? (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No functions parsed in this file</span>
                      ) : (
                        parsedFunctions.map(fn => (
                          <div 
                            key={`${fn.name}-${fn.line}`}
                            onClick={() => scrollToLine(fn.line)}
                            style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center', 
                              fontSize: '0.75rem', 
                              fontFamily: 'var(--font-mono)', 
                              background: 'rgba(255,255,255,0.02)', 
                              padding: '5px 8px', 
                              borderRadius: '4px', 
                              border: '1px solid rgba(255,255,255,0.03)', 
                              cursor: 'pointer',
                              color: 'var(--color-secondary)'
                            }}
                            className="func-list-item"
                          >
                            <span>{fn.name}()</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>Line {fn.line}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Who Calls This File Accordion */}
                <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '12px' }}>
                  <button 
                    onClick={() => toggleSection('relations')}
                    style={{ width: '100%', background: 'none', border: 'none', padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <Code size={13} style={{ color: 'var(--color-secondary)' }} />
                      Who Calls This File ({reverseImports.length})
                    </span>
                    {collapsedSections.relations ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {!collapsedSections.relations && (
                    <div style={{ marginTop: '8px', maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '4px' }}>
                      {reverseImports.length === 0 ? (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No incoming references detected</span>
                      ) : (
                        reverseImports.map(caller => (
                          <div 
                            key={caller.path}
                            onClick={() => setSelectedNodeId(caller.path)}
                            style={{ 
                              fontSize: '0.75rem', 
                              fontFamily: 'var(--font-mono)', 
                              background: 'rgba(255,255,255,0.02)', 
                              padding: '5px 8px', 
                              borderRadius: '4px', 
                              border: '1px solid rgba(255,255,255,0.03)', 
                              cursor: 'pointer',
                              color: 'var(--color-primary)',
                              wordBreak: 'break-all'
                            }}
                            className="caller-list-item"
                          >
                            {caller.name}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Similar Files Accordion */}
                <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '12px' }}>
                  <button 
                    onClick={() => toggleSection('similar')}
                    style={{ width: '100%', background: 'none', border: 'none', padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <Folder size={13} style={{ color: 'var(--color-accent)' }} />
                      Similar Files ({similarFiles.length})
                    </span>
                    {collapsedSections.similar ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {!collapsedSections.similar && (
                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '4px' }}>
                      {similarFiles.length === 0 ? (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No similar files found</span>
                      ) : (
                        similarFiles.map(file => (
                          <div 
                            key={file.path}
                            onClick={() => setSelectedNodeId(file.path)}
                            style={{ 
                              fontSize: '0.75rem', 
                              background: 'rgba(255,255,255,0.02)', 
                              padding: '5px 8px', 
                              borderRadius: '4px', 
                              border: '1px solid rgba(255,255,255,0.03)', 
                              cursor: 'pointer',
                              color: 'var(--text-secondary)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                            className="similar-file-item"
                          >
                            <span>{file.name}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{file.path.substring(0, file.path.indexOf('/')) || 'root'}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* File Imports */}
                {imports.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Imports ({imports.length})</h4>
                    <div style={{ maxHeight: '100px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {imports.map((imp) => (
                        <div key={imp} style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', background: 'rgba(255,255,255,0.02)', padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.03)', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                          {imp}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Summary Section */}
                <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AiIcon size={14} badge />
                      AI Code Summary
                    </h4>
                  </div>

                  {fileExplanation ? (
                    <div className="markdown-body" style={{ color: 'var(--text-primary)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                      <div dangerouslySetInnerHTML={{ 
                        __html: formatMarkdown(fileExplanation)
                      }} />
                    </div>
                  ) : (
                    <button
                      className="cyber-button"
                      style={{ width: '100%', padding: '10px 14px', fontSize: '0.85rem' }}
                      onClick={handleExplain}
                      disabled={loadingExplanation}
                    >
                      {loadingExplanation ? (
                        <>
                          <Terminal size={14} className="dropzone-icon" />
                          Summarizing...
                        </>
                      ) : (
                        <>
                          <AiIcon size={14} />
                          Explain with Gemini AI
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* AI Test Suite Generator Section */}
                <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '16px', marginTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AiIcon size={14} badge />
                      AI Test Suite
                    </h4>
                  </div>

                  {testSuites[selectedFile.path] ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div className="markdown-body" style={{ color: 'var(--text-primary)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                        <div dangerouslySetInnerHTML={{ 
                          __html: formatMarkdown(testSuites[selectedFile.path])
                        }} />
                      </div>
                      <button
                        className="cyber-button"
                        onClick={() => {
                          const testText = testSuites[selectedFile.path];
                          // Extract code from inside markdown code block if present
                          const codeMatch = testText.match(/\`\`\`(?:typescript|javascript|js|ts)?([\s\S]*?)\`\`\?/);
                          const cleanCode = codeMatch ? codeMatch[1].trim() : testText;
                          
                          try {
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                              navigator.clipboard.writeText(cleanCode);
                            } else {
                              const textArea = document.createElement("textarea");
                              textArea.value = cleanCode;
                              textArea.style.position = "fixed";
                              document.body.appendChild(textArea);
                              textArea.focus();
                              textArea.select();
                              document.execCommand('copy');
                              document.body.removeChild(textArea);
                            }
                          } catch (e) {
                            console.warn('Clipboard write failed', e);
                          }
                          setToastMessage('Test Suite copied to clipboard!');
                          setTimeout(() => setToastMessage(null), 2000);
                        }}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '0.8rem', background: 'rgba(14, 165, 233, 0.15)', borderColor: 'var(--color-accent)' }}
                      >
                        Copy Test Suite Code
                      </button>
                    </div>
                  ) : (
                    <button
                      className="cyber-button"
                      style={{ width: '100%', padding: '10px 14px', fontSize: '0.85rem', borderColor: 'var(--color-accent)' }}
                      onClick={handleGenerateTest}
                      disabled={loadingTest}
                    >
                      {loadingTest ? (
                        <>
                          <Terminal size={14} className="dropzone-icon" />
                          Generating Test Suite...
                        </>
                      ) : (
                        <>
                          <AiIcon size={14} />
                          Generate Test Suite
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Raw Code Preview */}
                <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }}>
                  <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Code size={14} />
                    Code Preview
                  </h4>
                  <pre ref={codePreviewRef} style={{ margin: 0, padding: '12px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflowX: 'auto', maxHeight: '250px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {selectedFile.content}
                  </pre>
                </div>
              </>
            )}
          </>
        )}
      </div>
        )}

        {activeTab === 'chat' && (
          <div className="chat-container">
            <div className="chat-messages">
              {chatMessages.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: '12px', textAlign: 'center', padding: '20px' }}>
                  <Bot size={40} style={{ opacity: 0.5 }} />
                  <div>
                    <p style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Chat with Gemini</p>
                    <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>Ask architectural questions, locate features, or explain algorithms across the codebase.</p>
                  </div>
                </div>
              )}
              {chatMessages.map((msg, index) => (
                <div key={index} className={`chat-message ${msg.sender}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontSize: '0.75rem', fontWeight: 600, color: msg.sender === 'user' ? 'var(--color-secondary)' : 'var(--color-primary)' }}>
                    {msg.sender === 'user' ? <User size={12} /> : <Bot size={12} />}
                    {msg.sender === 'user' ? 'You' : 'Gemini'}
                  </div>
                  <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ 
                    __html: msg.text
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\`(.*?)\`/g, '<code style="font-family:var(--font-mono); background:rgba(0,0,0,0.3); padding:2px 4px; border-radius:3px;">$1</code>')
                  }} />
                </div>
              ))}
              {chatLoading && (
                <div className="chat-message ai">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Bot size={12} />
                    <span>Gemini is thinking...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="chat-input-area">
              <input
                type="text"
                className="cyber-input"
                placeholder={selectedFile ? `Ask about ${selectedFile.name}...` : 'Ask anything about the codebase...'}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                style={{ padding: '10px 14px', fontSize: '0.85rem' }}
                disabled={chatLoading}
              />
              <button type="submit" className="cyber-button" style={{ padding: '10px' }} disabled={chatLoading || !chatInput.trim()}>
                <Send size={16} />
              </button>
            </form>
          </div>
        )}

        {activeTab === 'linter' && (
          <div className="inspector-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f97316', marginBottom: '4px' }}>
              <AlertTriangle size={20} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Architectural Rules Linter</h3>
            </div>
            
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              Write dependency constraints in plain English. Gemini will evaluate the codebase graph, highlight files in warning orange, and dashed connections that break the rules.
            </p>

            {!apiKey && (
              <div className="glass-panel" style={{
                border: '1px solid rgba(245, 158, 11, 0.3)',
                background: 'rgba(245, 158, 11, 0.05)',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
                fontSize: '0.75rem',
                color: '#f59e0b',
                marginTop: '4px'
              }}>
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ display: 'block', marginBottom: '2px' }}>Offline Demo Mode</strong>
                  API Key is missing. CodeGraph will use dynamic heuristic simulation to analyze rules. Configure an API key in the top header settings to use live Gemini analysis.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Plain-English Rule
              </label>
              <textarea
                className="cyber-input"
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '10px',
                  fontSize: '0.85rem',
                  resize: 'vertical',
                  lineHeight: '1.4',
                  background: 'rgba(0,0,0,0.2)'
                }}
                placeholder="e.g., Components in src/components/ should never import anything from src/utils/aiHelper.ts directly."
                value={linterRule}
                onChange={(e) => setLinterRule(e.target.value)}
                disabled={isLinting}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                className="cyber-button"
                style={{
                  flex: 1,
                  padding: '10px',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
                onClick={() => onRunLinter(linterRule)}
                disabled={isLinting || !linterRule.trim()}
              >
                {isLinting ? (
                  <>
                    <span className="spinner" style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite', marginRight: '4px' }} />
                    <span>Analyzing codebase...</span>
                  </>
                ) : (
                  <>
                    <Activity size={14} />
                    <span>Run Linter</span>
                  </>
                )}
              </button>
              {linterViolations && (
                <button
                  className="cyber-button secondary"
                  style={{
                    padding: '10px 14px',
                    fontSize: '0.85rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--panel-border)',
                    color: 'var(--text-secondary)'
                  }}
                  onClick={() => {
                    setLinterViolations(null);
                    setLinterRule('');
                  }}
                  disabled={isLinting}
                >
                  Reset
                </button>
              )}
            </div>

            {linterError && (
              <div style={{
                border: '1px solid rgba(239, 68, 68, 0.3)',
                background: 'rgba(239, 68, 68, 0.05)',
                borderRadius: '8px',
                padding: '12px',
                color: '#ef4444',
                fontSize: '0.8rem',
                display: 'flex',
                gap: '8px',
                marginTop: '8px'
              }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ display: 'block', marginBottom: '2px' }}>Analysis Failed</strong>
                  {linterError}
                </div>
              </div>
            )}

            {linterViolations && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px', borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: linterViolations.violatingNodes.length > 0 ? '#f97316' : '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {linterViolations.violatingNodes.length > 0 ? (
                      <>
                        <AlertTriangle size={16} />
                        <span>{linterViolations.violatingNodes.length} Violations Found</span>
                      </>
                    ) : (
                      <>
                        <span style={{ color: '#10b981' }}>✓ Codebase Compliant</span>
                      </>
                    )}
                  </span>
                </div>

                {linterViolations.explanation && (
                  <div 
                    className="linter-explanation-box" 
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--panel-border)',
                      borderRadius: '6px',
                      padding: '10px',
                      lineHeight: '1.45'
                    }}
                    dangerouslySetInnerHTML={{ __html: formatMarkdown(linterViolations.explanation) }}
                  />
                )}

                {linterViolations.violatingNodes.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Violating Files
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                      {linterViolations.violatingNodes.map((nodeId) => {
                        const fileObj = allFiles.find(f => f.path === nodeId);
                        return (
                          <div 
                            key={nodeId}
                            className="violating-file-card"
                            style={{
                              background: 'rgba(249, 115, 22, 0.03)',
                              border: '1px solid rgba(249, 115, 22, 0.15)',
                              borderRadius: '6px',
                              padding: '8px 10px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(249, 115, 22, 0.08)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(249, 115, 22, 0.03)'}
                            onClick={() => {
                              setSelectedNodeId(nodeId);
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#fb923c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {fileObj ? fileObj.name : nodeId.split('/').pop()}
                              </span>
                              <ExternalLink size={12} style={{ color: 'var(--text-muted)' }} />
                            </div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                              {nodeId}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {toastMessage && (
        <div className="toast-notification">
          {toastMessage}
        </div>
      )}
    </aside>
  );
};
