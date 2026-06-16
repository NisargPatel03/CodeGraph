import { X, Layers, Activity, Database, Sparkles, Settings, Palette, HelpCircle } from 'lucide-react';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  if (!isOpen) return null;

  const shortcutGroups = [
    {
      title: 'Global Navigation & Utilities',
      shortcuts: [
        { keys: ['Ctrl', 'K'], desc: 'Toggle global search Command Palette', icon: <Layers size={14} /> },
        { keys: ['?'], desc: 'Toggle keyboard shortcut help panel', icon: <HelpCircle size={14} /> },
        { keys: ['Esc'], desc: 'Dismiss active menus, palette, or panels', icon: <X size={14} /> },
      ],
    },
    {
      title: 'Graph Visualization Views',
      shortcuts: [
        { keys: ['Alt', 'D'], desc: 'Switch to Dependency Graph View', icon: <Layers size={14} /> },
        { keys: ['Alt', 'C'], desc: 'Switch to Call Graph View', icon: <Activity size={14} /> },
        { keys: ['Alt', 'S'], desc: 'Switch to Database Schema View', icon: <Database size={14} /> },
      ],
    },
    {
      title: 'AI, Settings & Diagnostics',
      shortcuts: [
        { keys: ['Alt', 'A'], desc: 'Toggle AI Chat Assistant drawer', icon: <Sparkles size={14} style={{ color: '#a855f7' }} /> },
        { keys: ['Alt', 'T'], desc: 'Cycle interface colors / Themes', icon: <Palette size={14} /> },
        { keys: ['Alt', 'O'], desc: 'Open API Key Settings Panel', icon: <Settings size={14} /> },
        { keys: ['Alt', 'H'], desc: 'Show Keyboard Shortcuts panel', icon: <HelpCircle size={14} /> },
      ],
    },
  ];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div 
        className="glass-panel settings-modal" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          width: '540px',
          border: '1px solid var(--color-primary)', 
          boxShadow: '0 8px 32px 0 rgba(139, 92, 246, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '12px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)', fontSize: '1.1rem' }}>
            <HelpCircle size={18} />
            Keyboard Shortcuts Reference
          </h3>
          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }} className="custom-scrollbar">
          {shortcutGroups.map((group, groupIdx) => (
            <div key={groupIdx} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                {group.title}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {group.shortcuts.map((shortcut, idx) => (
                  <div 
                    key={idx} 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '8px 12px', 
                      background: 'rgba(255, 255, 255, 0.02)', 
                      borderRadius: '6px', 
                      border: '1px solid var(--panel-border)' 
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
                        {shortcut.icon}
                      </span>
                      <span>{shortcut.desc}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {shortcut.keys.map((key, keyIdx) => (
                        <kbd 
                          key={keyIdx} 
                          className="command-palette-kbd"
                          style={{
                            margin: 0,
                            padding: '3px 6px',
                            fontSize: '0.7rem',
                            minWidth: '24px',
                            textAlign: 'center'
                          }}
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          <span>Press <kbd className="command-palette-kbd" style={{ padding: '1px 4px', fontSize: '0.65rem' }}>?</kbd> anywhere to open</span>
          <span>CodeGraph Shortcuts v1.0</span>
        </div>
      </div>
    </div>
  );
}
