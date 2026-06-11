import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, 
  Activity, 
  AlertTriangle, 
  RefreshCw, 
  FileCode, 
  Trash2, 
  CheckCircle,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import type { CodebaseGraph } from '../utils/codeAnalyzer';

interface KpiRibbonProps {
  graphData: CodebaseGraph;
  onOpenAnalytics: () => void;
  onSelectFile: (filePath: string) => void;
}

export const KpiRibbon: React.FC<KpiRibbonProps> = ({
  graphData,
  onOpenAnalytics,
  onSelectFile,
}) => {
  const [activeDropdown, setActiveDropdown] = useState<'files' | 'fns' | 'smells' | 'cycles' | 'loc' | 'dead' | null>(null);
  const ribbonRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ribbonRef.current && !ribbonRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalFiles = graphData.stats?.totalFiles || graphData.nodes.length;
  const totalFunctions = graphData.stats?.totalFunctions || 0;
  const totalLoc = graphData.stats?.totalLoc || 0;
  const totalSmells = graphData.codeSmells?.length || 0;
  const totalCycles = graphData.cycles?.length || 0;
  const totalDead = graphData.deadFiles?.length || 0;

  // Compute live health status color/glow
  let ribbonGlowClass = 'health-glow-clean';
  if (totalCycles > 0) {
    ribbonGlowClass = 'health-glow-critical';
  } else if (totalSmells > 0) {
    ribbonGlowClass = 'health-glow-warning';
  }

  const toggleDropdown = (dropdown: 'files' | 'fns' | 'smells' | 'cycles' | 'loc' | 'dead') => {
    setActiveDropdown(prev => prev === dropdown ? null : dropdown);
  };

  // 5 largest files
  const topLargestFiles = [...graphData.nodes]
    .filter(n => !n.isNpm)
    .sort((a, b) => b.size - a.size)
    .slice(0, 5);

  // 5 most complex files / functions
  const topComplexFiles = [...graphData.nodes]
    .filter(n => !n.isNpm && n.complexity)
    .sort((a, b) => (b.complexity || 0) - (a.complexity || 0))
    .slice(0, 5);

  return (
    <div 
      ref={ribbonRef}
      className={`kpi-ribbon-bar ${ribbonGlowClass}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: '42px',
        background: 'rgba(10, 15, 30, 0.65)',
        borderBottom: '1px solid var(--panel-border)',
        position: 'relative',
        zIndex: 50,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }}>
        
        {/* Files Chip */}
        <div style={{ position: 'relative' }}>
          <div 
            onClick={() => toggleDropdown('files')}
            className={`kpi-chip ${activeDropdown === 'files' ? 'active' : ''}`}
          >
            <FileText size={13} style={{ color: 'var(--color-secondary)' }} />
            <span>{totalFiles} Files</span>
            <CheckCircle size={10} style={{ color: 'var(--color-accent)', marginLeft: '4px' }} />
            <ChevronDown size={11} style={{ opacity: 0.5, marginLeft: '2px' }} />
          </div>

          {activeDropdown === 'files' && (
            <div className="kpi-dropdown glass-panel">
              <div className="dropdown-title">Largest Source Files</div>
              <div className="dropdown-list">
                {topLargestFiles.map(file => (
                  <div 
                    key={file.id} 
                    className="dropdown-item"
                    onClick={() => {
                      onSelectFile(file.id);
                      setActiveDropdown(null);
                    }}
                  >
                    <span className="file-name">{file.name}</span>
                    <span className="file-val">{(file.size / 1024).toFixed(1)} KB</span>
                  </div>
                ))}
              </div>
              <div 
                className="dropdown-footer" 
                onClick={() => {
                  onOpenAnalytics();
                  setActiveDropdown(null);
                }}
              >
                <span>Open Full Analytics</span>
                <ExternalLink size={10} />
              </div>
            </div>
          )}
        </div>

        <div className="kpi-divider" />

        {/* Functions Chip */}
        <div style={{ position: 'relative' }}>
          <div 
            onClick={() => toggleDropdown('fns')}
            className={`kpi-chip ${activeDropdown === 'fns' ? 'active' : ''}`}
          >
            <Activity size={13} style={{ color: 'var(--color-primary)' }} />
            <span>{totalFunctions} Fns</span>
            <ChevronDown size={11} style={{ opacity: 0.5, marginLeft: '2px' }} />
          </div>

          {activeDropdown === 'fns' && (
            <div className="kpi-dropdown glass-panel">
              <div className="dropdown-title">Highest Complexity Files</div>
              <div className="dropdown-list">
                {topComplexFiles.length === 0 ? (
                  <div className="dropdown-empty">No complexity stats calculated.</div>
                ) : (
                  topComplexFiles.map(file => (
                    <div 
                      key={file.id} 
                      className="dropdown-item"
                      onClick={() => {
                        onSelectFile(file.id);
                        setActiveDropdown(null);
                      }}
                    >
                      <span className="file-name">{file.name}</span>
                      <span className="file-val">{file.complexity} loc</span>
                    </div>
                  ))
                )}
              </div>
              <div 
                className="dropdown-footer" 
                onClick={() => {
                  onOpenAnalytics();
                  setActiveDropdown(null);
                }}
              >
                <span>Open Full Analytics</span>
                <ExternalLink size={10} />
              </div>
            </div>
          )}
        </div>

        <div className="kpi-divider" />

        {/* Smells Chip */}
        <div style={{ position: 'relative' }}>
          <div 
            onClick={() => toggleDropdown('smells')}
            className={`kpi-chip ${activeDropdown === 'smells' ? 'active' : ''} ${totalSmells > 0 ? 'warning' : 'clean'}`}
          >
            <AlertTriangle size={13} />
            <span>{totalSmells} Smells</span>
            {totalSmells > 0 ? (
              <span className="pulse-dot warning" />
            ) : (
              <CheckCircle size={10} style={{ color: 'var(--color-accent)', marginLeft: '4px' }} />
            )}
            <ChevronDown size={11} style={{ opacity: 0.5, marginLeft: '2px' }} />
          </div>

          {activeDropdown === 'smells' && (
            <div className="kpi-dropdown glass-panel">
              <div className="dropdown-title">Active Code Smells ({totalSmells})</div>
              <div className="dropdown-list">
                {totalSmells === 0 ? (
                  <div className="dropdown-empty-success">
                    <CheckCircle size={14} style={{ color: 'var(--color-accent)' }} />
                    <span>No active code smells found!</span>
                  </div>
                ) : (
                  graphData.codeSmells.slice(0, 5).map(smell => (
                    <div 
                      key={smell.id} 
                      className="dropdown-item"
                      onClick={() => {
                        onSelectFile(smell.file);
                        setActiveDropdown(null);
                      }}
                    >
                      <span className="file-name" style={{ color: smell.severity === 'critical' ? 'var(--color-alert)' : 'var(--text-secondary)' }}>
                        ⚠️ {smell.message}
                      </span>
                      <span className="file-val" style={{ opacity: 0.6, fontSize: '0.65rem' }}>{smell.file.split('/').pop()}</span>
                    </div>
                  ))
                )}
              </div>
              <div 
                className="dropdown-footer" 
                onClick={() => {
                  onOpenAnalytics();
                  setActiveDropdown(null);
                }}
              >
                <span>Open Full Analytics</span>
                <ExternalLink size={10} />
              </div>
            </div>
          )}
        </div>

        <div className="kpi-divider" />

        {/* Cycles Chip */}
        <div style={{ position: 'relative' }}>
          <div 
            onClick={() => toggleDropdown('cycles')}
            className={`kpi-chip ${activeDropdown === 'cycles' ? 'active' : ''} ${totalCycles > 0 ? 'critical' : 'clean'}`}
          >
            <RefreshCw size={12} className={totalCycles > 0 ? 'spin-slow' : ''} />
            <span>{totalCycles} Cycles</span>
            {totalCycles > 0 ? (
              <span className="pulse-dot critical" />
            ) : (
              <CheckCircle size={10} style={{ color: 'var(--color-accent)', marginLeft: '4px' }} />
            )}
            <ChevronDown size={11} style={{ opacity: 0.5, marginLeft: '2px' }} />
          </div>

          {activeDropdown === 'cycles' && (
            <div className="kpi-dropdown glass-panel">
              <div className="dropdown-title">Circular Dependencies ({totalCycles})</div>
              <div className="dropdown-list">
                {totalCycles === 0 ? (
                  <div className="dropdown-empty-success">
                    <CheckCircle size={14} style={{ color: 'var(--color-accent)' }} />
                    <span>No circular imports! Great structure.</span>
                  </div>
                ) : (
                  graphData.cycles.slice(0, 4).map((cycle, idx) => (
                    <div 
                      key={idx} 
                      className="dropdown-item"
                      onClick={() => {
                        onSelectFile(cycle[0]);
                        setActiveDropdown(null);
                      }}
                    >
                      <span className="file-name" style={{ color: 'var(--color-alert)' }}>
                        🔁 Loop #{idx + 1}
                      </span>
                      <span className="file-val" style={{ opacity: 0.6, fontSize: '0.65rem' }}>
                        {cycle[0].split('/').pop()} ⇄ {cycle[cycle.length - 1].split('/').pop()}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div 
                className="dropdown-footer" 
                onClick={() => {
                  onOpenAnalytics();
                  setActiveDropdown(null);
                }}
              >
                <span>Open Full Analytics</span>
                <ExternalLink size={10} />
              </div>
            </div>
          )}
        </div>

        <div className="kpi-divider" />

        {/* LOC Chip */}
        <div style={{ position: 'relative' }}>
          <div 
            onClick={() => toggleDropdown('loc')}
            className={`kpi-chip ${activeDropdown === 'loc' ? 'active' : ''}`}
          >
            <FileCode size={13} style={{ color: 'var(--color-warning)' }} />
            <span>{totalLoc.toLocaleString()} LOC</span>
            <ChevronDown size={11} style={{ opacity: 0.5, marginLeft: '2px' }} />
          </div>

          {activeDropdown === 'loc' && (
            <div className="kpi-dropdown glass-panel">
              <div className="dropdown-title">Lines of Code Profile</div>
              <div style={{ padding: '10px 12px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span>Total Code Lines:</span>
                  <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{totalLoc}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Avg lines/file:</span>
                  <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{Math.round(totalLoc / (totalFiles || 1))}</span>
                </div>
              </div>
              <div 
                className="dropdown-footer" 
                onClick={() => {
                  onOpenAnalytics();
                  setActiveDropdown(null);
                }}
              >
                <span>Open Full Analytics</span>
                <ExternalLink size={10} />
              </div>
            </div>
          )}
        </div>

        <div className="kpi-divider" />

        {/* Dead Files Chip */}
        <div style={{ position: 'relative' }}>
          <div 
            onClick={() => toggleDropdown('dead')}
            className={`kpi-chip ${activeDropdown === 'dead' ? 'active' : ''} ${totalDead > 0 ? 'dead-warning' : 'clean'}`}
          >
            <Trash2 size={13} style={{ color: totalDead > 0 ? '#9ca3af' : 'var(--text-muted)' }} />
            <span>{totalDead} Dead Files</span>
            <ChevronDown size={11} style={{ opacity: 0.5, marginLeft: '2px' }} />
          </div>

          {activeDropdown === 'dead' && (
            <div className="kpi-dropdown glass-panel">
              <div className="dropdown-title">Unused / Dead Source Files ({totalDead})</div>
              <div className="dropdown-list">
                {totalDead === 0 ? (
                  <div className="dropdown-empty-success">
                    <CheckCircle size={14} style={{ color: 'var(--color-accent)' }} />
                    <span>0 dead files. All imports active.</span>
                  </div>
                ) : (
                  graphData.deadFiles.slice(0, 5).map(file => (
                    <div 
                      key={file} 
                      className="dropdown-item"
                      onClick={() => {
                        onSelectFile(file);
                        setActiveDropdown(null);
                      }}
                    >
                      <span className="file-name" style={{ color: 'var(--text-muted)' }}>💀 {file.split('/').pop()}</span>
                      <span className="file-val" style={{ opacity: 0.5, fontSize: '0.6rem' }}>0 imports</span>
                    </div>
                  ))
                )}
              </div>
              <div 
                className="dropdown-footer" 
                onClick={() => {
                  onOpenAnalytics();
                  setActiveDropdown(null);
                }}
              >
                <span>Open Full Analytics</span>
                <ExternalLink size={10} />
              </div>
            </div>
          )}
        </div>

      </div>

      <div 
        onClick={onOpenAnalytics}
        style={{
          fontSize: '0.72rem',
          color: 'var(--color-secondary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontWeight: 600,
          background: 'rgba(0, 242, 254, 0.08)',
          border: '1px solid rgba(0, 242, 254, 0.15)',
          padding: '3px 8px',
          borderRadius: '4px',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0, 242, 254, 0.15)';
          e.currentTarget.style.boxShadow = '0 0 8px rgba(0, 242, 254, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(0, 242, 254, 0.08)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <span>Open Intelligence Dashboard</span>
        <ExternalLink size={10} />
      </div>
    </div>
  );
};
