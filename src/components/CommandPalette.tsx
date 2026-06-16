import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, Sparkles, Palette, File, Settings, Activity, Database, BookOpen, Layers, HelpCircle } from 'lucide-react';
import type { ParsedFile } from '../utils/repoParser';

interface CommandPaletteProps {
  viewMode: string;
  setViewMode: (mode: any) => void;
  theme: string;
  setTheme: (theme: string) => void;
  isChatOpen: boolean;
  setIsChatOpen: (open: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
  onToggleHelp: () => void;
  onRunDependencyAudit: () => void;
  onRunDbAudit: () => void;
  files: ParsedFile[];
  onSelectFile: (filePath: string) => void;
}

interface CommandItem {
  id: string;
  name: string;
  category: 'Navigation' | 'AI & Analytics' | 'Visual Controls';
  icon: React.ReactNode;
  shortcut?: string[];
  action: () => void;
}

export function CommandPalette({
  viewMode,
  setViewMode,
  theme,
  setTheme,
  isChatOpen,
  setIsChatOpen,
  setIsSettingsOpen,
  onToggleHelp,
  onRunDependencyAudit,
  onRunDbAudit,
  files,
  onSelectFile,
}: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // List of Themes for cycling
  const themes = ['cyberpunk', 'midnight-green', 'solar-amber', 'arctic-light', 'rose-gold', 'synthwave'];
  
  const cycleTheme = () => {
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  // Define static commands
  const commands = useMemo<CommandItem[]>(() => [
    {
      id: 'view-dependency',
      name: 'Switch to Dependency Graph View',
      category: 'Navigation',
      icon: <Layers size={14} />,
      shortcut: ['Alt', 'D'],
      action: () => setViewMode('dependency')
    },
    {
      id: 'view-cluster',
      name: 'Switch to Module Clusters View',
      category: 'Navigation',
      icon: <Layers size={14} />,
      action: () => setViewMode('cluster')
    },
    {
      id: 'view-call',
      name: 'Switch to Call Graph View',
      category: 'Navigation',
      icon: <Activity size={14} />,
      shortcut: ['Alt', 'C'],
      action: () => setViewMode('call')
    },
    {
      id: 'view-hierarchy',
      name: 'Switch to Component Tree View',
      category: 'Navigation',
      icon: <Layers size={14} />,
      action: () => setViewMode('hierarchy')
    },
    {
      id: 'view-db',
      name: 'Switch to Database Schema View',
      category: 'Navigation',
      icon: <Database size={14} />,
      shortcut: ['Alt', 'S'],
      action: () => setViewMode('dbSchema')
    },
    {
      id: 'view-docs',
      name: 'Switch to REST API Docs',
      category: 'Navigation',
      icon: <BookOpen size={14} />,
      action: () => setViewMode('docs')
    },
    {
      id: 'view-analytics',
      name: 'Switch to Reports & Analytics Dashboard',
      category: 'Navigation',
      icon: <Activity size={14} />,
      action: () => setViewMode('analytics')
    },
    {
      id: 'ai-chat',
      name: 'Toggle AI Chat Assistant',
      category: 'AI & Analytics',
      icon: <Sparkles size={14} style={{ color: '#a855f7' }} />,
      shortcut: ['Alt', 'A'],
      action: () => setIsChatOpen(!isChatOpen)
    },
    {
      id: 'ai-dependency-audit',
      name: 'Run Dependency Risk Audit',
      category: 'AI & Analytics',
      icon: <Activity size={14} style={{ color: '#fb923c' }} />,
      action: () => {
        setViewMode('analytics');
        onRunDependencyAudit();
      }
    },
    {
      id: 'ai-db-audit',
      name: 'Audit Database Schema Design',
      category: 'AI & Analytics',
      icon: <Database size={14} style={{ color: '#fbbf24' }} />,
      action: () => {
        setViewMode('dbSchema');
        setTimeout(() => onRunDbAudit(), 100);
      }
    },
    {
      id: 'cycle-theme',
      name: 'Cycle Application Theme',
      category: 'Visual Controls',
      icon: <Palette size={14} />,
      shortcut: ['Alt', 'T'],
      action: cycleTheme
    },
    {
      id: 'open-settings',
      name: 'Open API Key Settings',
      category: 'Visual Controls',
      icon: <Settings size={14} />,
      shortcut: ['Alt', 'O'],
      action: () => setIsSettingsOpen(true)
    },
    {
      id: 'toggle-help',
      name: 'Show Keyboard Shortcuts Reference',
      category: 'Visual Controls',
      icon: <HelpCircle size={14} />,
      shortcut: ['Alt', 'H'],
      action: onToggleHelp
    }
  ], [theme, isChatOpen]);

  // Global Keyboard Shortcuts Hook (runs even when palette is closed)
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      // Toggle Command Palette: Ctrl+K / Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
        setSearchQuery('');
        setSelectedIndex(0);
        return;
      }

      // Check if user is typing in an input element
      const activeEl = document.activeElement;
      const isTyping = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      );
      if (isTyping) return;

      // Toggle Help Shortcuts: ? or Alt+H
      if (e.key === '?' || (e.altKey && e.key.toLowerCase() === 'h')) {
        e.preventDefault();
        onToggleHelp();
        return;
      }

      // Alt Key Shortcuts
      if (e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'd') {
          e.preventDefault();
          setViewMode('dependency');
        } else if (key === 's') {
          e.preventDefault();
          setViewMode('dbSchema');
        } else if (key === 'c') {
          e.preventDefault();
          setViewMode('call');
        } else if (key === 'a') {
          e.preventDefault();
          setIsChatOpen(!isChatOpen);
        } else if (key === 't') {
          e.preventDefault();
          cycleTheme();
        } else if (key === 'o') {
          e.preventDefault();
          setIsSettingsOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [theme, isChatOpen, onToggleHelp]);

  // Filter commands and files based on searchQuery
  const filteredItems = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    
    // 1. Matches static commands
    const matchedCommands = commands.filter(cmd => 
      cmd.name.toLowerCase().includes(query) || 
      cmd.category.toLowerCase().includes(query)
    );

    // 2. Matches files (limit to top 15 results to prevent clutter)
    const matchedFiles = files
      .filter(file => file.path.toLowerCase().includes(query))
      .slice(0, 15)
      .map(file => ({
        id: `file-${file.path}`,
        name: file.path,
        category: 'Codebase Files' as const,
        icon: <File size={14} style={{ color: 'var(--color-secondary)' }} />,
        action: () => {
          onSelectFile(file.path);
          if (viewMode === 'analytics' || viewMode === 'docs') {
            setViewMode('dependency');
          }
        }
      }));

    return [...matchedCommands, ...matchedFiles];
  }, [searchQuery, commands, files, viewMode]);

  // Reset selection index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Handle keys while Command Palette is Open
  useEffect(() => {
    if (!isOpen) return;
    
    const handlePaletteKeys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = filteredItems[selectedIndex];
        if (selected) {
          selected.action();
          setIsOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handlePaletteKeys);
    return () => window.removeEventListener('keydown', handlePaletteKeys);
  }, [isOpen, filteredItems, selectedIndex]);

  // Focus input automatically on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector('.command-palette-item.selected');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  // Group items by category for rendering
  const groupedItems = filteredItems.reduce((acc, item) => {
    const cat = item.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, typeof filteredItems>);

  // Flattened items list coordinates to map index selection
  let globalItemIndex = 0;

  return createPortal(
    <div 
      className="command-palette-backdrop" 
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) setIsOpen(false);
      }}
    >
      <div className="command-palette-container" onClick={(e) => e.stopPropagation()}>
        {/* Search Input */}
        <div className="command-palette-search-wrapper">
          <Search size={18} className="command-palette-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Type a command or file path..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <kbd className="command-palette-esc-badge">ESC</kbd>
        </div>

        {/* Results list */}
        <div className="command-palette-results custom-scrollbar" ref={listRef}>
          {filteredItems.length === 0 ? (
            <div className="command-palette-no-results">
              No matching commands or files found
            </div>
          ) : (
            Object.entries(groupedItems).map(([category, items]) => (
              <div key={category}>
                <div className="command-palette-group-title">{category}</div>
                {items.map((item) => {
                  const itemIndex = globalItemIndex++;
                  const isSelected = itemIndex === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      className={`command-palette-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        item.action();
                        setIsOpen(false);
                      }}
                    >
                      <div className="command-palette-item-content">
                        <span className="command-palette-item-icon">{item.icon}</span>
                        <span className="command-palette-item-text">{item.name}</span>
                      </div>
                      
                      {/* Optional shortcut displays */}
                      {('shortcut' in item) && item.shortcut && (
                        <div className="command-palette-item-shortcut">
                          {item.shortcut.map(key => (
                            <kbd key={key} className="command-palette-kbd">{key}</kbd>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="command-palette-footer">
          <div className="command-palette-hints">
            <span className="command-palette-hint-item">
              <kbd className="command-palette-kbd">↑↓</kbd> navigate
            </span>
            <span className="command-palette-hint-item">
              <kbd className="command-palette-kbd">↵</kbd> select
            </span>
          </div>
          <span>CodeGraph Spotlight</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
