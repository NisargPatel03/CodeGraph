import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FileText, Code, Sparkles, Send, Bot, User, HelpCircle, Terminal, AlertTriangle, Folder } from 'lucide-react';
import type { ParsedFile } from '../utils/repoParser';
import { getFileExplanation, askQuestionAboutCodebase } from '../utils/aiHelper';

interface InspectorProps {
  selectedFile: ParsedFile | null;
  allFiles: ParsedFile[];
  apiKey: string;
  cycles: string[][];
  imports: string[];
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  setCollapsedFolders: React.Dispatch<React.SetStateAction<Set<string>>>;
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
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'chat'>('info');
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<{ sender: 'user' | 'ai'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

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
  const currentFileCycles = selectedFile
    ? cycles.filter((cycle) => cycle.includes(selectedFile.path))
    : [];

  const fileExplanation = selectedFile ? explanations[selectedFile.path] : '';

  const isSelectedNodeFolder = selectedNodeId && selectedNodeId.startsWith('folder:');
  const selectedFolder = isSelectedNodeFolder ? selectedNodeId!.slice(7) : null;

  const folderFiles = useMemo(() => {
    if (!selectedFolder) return [];
    return allFiles.filter(f => f.path === selectedFolder || f.path.startsWith(selectedFolder + '/'));
  }, [selectedFolder, allFiles]);

  const totalLoc = useMemo(() => {
    return folderFiles.reduce((sum, f) => sum + (f.size || 0), 0);
  }, [folderFiles]);

  const fileFolder = selectedFile ? selectedFile.path.substring(0, selectedFile.path.lastIndexOf('/')) : null;

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
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeTab === 'info' ? (
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
            ) : !selectedFile ? (
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
                  <h3 style={{ wordBreak: 'break-all', fontSize: '1.1rem', marginBottom: '8px' }}>{selectedFile.name}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{selectedFile.path}</p>
                  
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                    <span className="logo-badge" style={{ fontSize: '0.7rem' }}>
                      {selectedFile.language.toUpperCase()}
                    </span>
                    <span className="logo-badge" style={{ fontSize: '0.7rem', background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)', borderColor: 'rgba(255, 255, 255, 0.08)' }}>
                      {(selectedFile.size / 1024).toFixed(2)} KB
                    </span>
                    <span className="logo-badge" style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.08)', color: 'var(--color-warning)', borderColor: 'rgba(245, 158, 11, 0.2)' }} title="Simulated Git Commit Frequency">
                      🔥 {Math.floor(((selectedFile.size + selectedFile.path.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % 55) + 5)} commits
                    </span>
                    <span className="logo-badge" style={{ fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.08)', color: 'var(--color-secondary)', borderColor: 'rgba(59, 130, 246, 0.2)' }} title="Lines of Code Complexity">
                      ⏱️ {selectedFile.content.split('\n').length} LOC
                    </span>
                  </div>

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
                </div>

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
                  <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={14} style={{ color: 'var(--color-primary)' }} />
                      AI Code Summary
                    </h4>
                  </div>

                  {fileExplanation ? (
                    <div className="markdown-body" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                      {/* Standard split to replace custom headings with HTML rendering in sidebar */}
                      <div dangerouslySetInnerHTML={{ 
                        __html: fileExplanation
                          .replace(/^### (.*$)/gim, '<h5 style="color:#fff; font-weight:600; margin: 10px 0 6px 0;">$1</h5>')
                          .replace(/^#### (.*$)/gim, '<h6 style="color:var(--text-primary); font-weight:600; margin: 8px 0 4px 0;">$1</h6>')
                          .replace(/^\s*\-\s*(.*$)/gim, '<li style="margin-left:14px; list-style-type:circle;">$1</li>')
                          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                          .replace(/\`(.*?)\`/g, '<code style="font-family:var(--font-mono); background:rgba(0,0,0,0.3); padding:2px 4px; border-radius:3px; font-size:0.8rem;">$1</code>')
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
                          <Sparkles size={14} />
                          Explain with Gemini AI
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
                  <pre style={{ margin: 0, padding: '12px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflowX: 'auto', maxHeight: '250px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {selectedFile.content}
                  </pre>
                </div>
              </>
            )}
          </div>
        ) : (
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
      </div>
    </aside>
  );
};
