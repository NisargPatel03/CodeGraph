import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Bot, Sparkles, MessageSquare, Trash2, HelpCircle } from 'lucide-react';
import { askQuestionAboutCodebase } from '../utils/aiHelper';
import type { ParsedFile } from '../utils/repoParser';

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
    .replace(/\`(.*?)\`/g, '<code style="font-family:var(--font-mono); background:rgba(0,0,0,0.3); padding:2px 4px; border-radius:3px; color: var(--color-secondary);">$1</code>');
}


interface Message {
  role: 'user' | 'model';
  text: string;
}

interface AiChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFile: ParsedFile | null;
  allFiles: ParsedFile[];
  apiKey: string;
}

export const AiChatDrawer: React.FC<AiChatDrawerProps> = ({
  isOpen,
  onClose,
  selectedFile,
  allFiles,
  apiKey,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userMsg: Message = { role: 'user', text: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const allFilesSummary = allFiles.map(f => ({
        path: f.path,
        size: f.size,
        language: f.language || ''
      }));

      const activeFileContext = selectedFile 
        ? { path: selectedFile.path, content: selectedFile.content }
        : null;

      const reply = await askQuestionAboutCodebase(
        textToSend,
        activeFileContext,
        allFilesSummary,
        apiKey
      );

      setMessages((prev) => [...prev, { role: 'model', text: reply }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: `⚠️ Failed to get reply: ${err.message || err}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([]);
  };

  const quickPrompts = [
    { label: 'Explain architecture', text: 'Explain the overall architecture and folder structure of this codebase.' },
    { label: 'Identify entry points', text: 'What are the main entry points and config files in this repository?' },
    ...(selectedFile
      ? [{ label: `Explain active file`, text: `Explain the purpose, exports, and logic inside the active file: ${selectedFile.path}` }]
      : []),
  ];

  if (!isOpen) return null;

  return (
    <div 
      className="glass-panel"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '400px',
        height: '100vh',
        background: 'var(--panel-bg)',
        borderLeft: '1px solid var(--panel-border)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(20px)',
        animation: 'slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div 
        style={{
          padding: '16px',
          borderBottom: '1px solid var(--panel-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.01)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bot size={20} style={{ color: 'var(--color-primary)' }} />
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>AI Code Assistant</h3>
            <span style={{ fontSize: '0.65rem', color: apiKey ? 'var(--color-accent)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sparkles size={8} /> {apiKey ? 'Gemini 1.5 Flash Connected' : 'Offline Mock Mode'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {messages.length > 0 && (
            <button 
              onClick={handleClearHistory}
              title="Clear chat history"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <Trash2 size={16} />
            </button>
          )}
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Active File Context Bar */}
      <div 
        style={{
          background: 'rgba(255,255,255,0.02)',
          padding: '8px 16px',
          borderBottom: '1px solid var(--panel-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.72rem'
        }}
      >
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: selectedFile ? 'var(--color-accent)' : 'var(--text-muted)' }} />
        <span style={{ color: 'var(--text-muted)' }}>
          {selectedFile ? (
            <>Context: <strong style={{ color: 'var(--text-primary)' }}>{selectedFile.name}</strong></>
          ) : (
            'No active file selected'
          )}
        </span>
      </div>

      {/* Messages */}
      <div 
        style={{
          flex: 1,
          padding: '16px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        {messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center', gap: '16px', textAlign: 'center', opacity: 0.8 }}>
            <MessageSquare size={36} style={{ color: 'var(--color-primary)', opacity: 0.6 }} />
            <div>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '4px' }}>Ask me about the codebase</h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '240px', lineHeight: '1.4' }}>
                Ask questions about component states, dependencies, file exports, or ask for general code explanations.
              </p>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', marginTop: '12px' }}>
              <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', alignSelf: 'flex-start' }}>Suggested Questions:</span>
              {quickPrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(p.text)}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--panel-border)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: '0.72rem',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                    e.currentTarget.style.borderColor = 'var(--panel-border)';
                  }}
                >
                  <HelpCircle size={12} style={{ color: 'var(--color-primary)' }} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, idx) => (
            <div 
              key={idx}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                display: 'flex',
                gap: '8px',
                flexDirection: m.role === 'user' ? 'row-reverse' : 'row'
              }}
            >
              <div 
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: m.role === 'user' ? 'var(--color-secondary)' : 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.65rem',
                  fontWeight: 'bold',
                  color: '#fff',
                  flexShrink: 0
                }}
              >
                {m.role === 'user' ? 'U' : 'AI'}
              </div>

              <div 
                style={{
                  background: m.role === 'user' ? 'var(--color-primary-glow)' : 'rgba(255,255,255,0.02)',
                  border: '1px solid ' + (m.role === 'user' ? 'rgba(99, 102, 241, 0.2)' : 'var(--panel-border)'),
                  borderRadius: '12px',
                  borderTopRightRadius: m.role === 'user' ? '2px' : '12px',
                  borderTopLeftRadius: m.role === 'model' ? '2px' : '12px',
                  padding: '8px 12px',
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.4',
                  whiteSpace: 'pre-wrap',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden'
                }}
              >
                <div dangerouslySetInnerHTML={{
                  __html: formatMarkdown(m.text)
                }} />
              </div>
            </div>
          ))
        )}

        {loading && (
          <div style={{ alignSelf: 'flex-start', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div 
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Bot size={12} style={{ color: '#fff' }} />
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <div className="bounce-dot" style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--text-muted)', animation: 'bounce 1.4s infinite ease-in-out both' }} />
              <div className="bounce-dot" style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--text-muted)', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }} />
              <div className="bounce-dot" style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--text-muted)', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div 
        style={{
          padding: '16px',
          borderTop: '1px solid var(--panel-border)',
          background: 'rgba(255,255,255,0.01)'
        }}
      >
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(0,0,0,0.2)',
            border: '1px solid var(--panel-border)',
            borderRadius: '8px',
            padding: '8px 12px'
          }}
        >
          <input 
            type="text"
            placeholder="Type your question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              outline: 'none'
            }}
          />
          <button 
            onClick={() => handleSend(input)}
            disabled={!input.trim() || loading}
            style={{
              background: input.trim() ? 'var(--color-primary)' : 'transparent',
              border: 'none',
              borderRadius: '6px',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: input.trim() ? '#fff' : 'var(--text-muted)',
              cursor: input.trim() ? 'pointer' : 'default',
              transition: 'background 0.2s'
            }}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
