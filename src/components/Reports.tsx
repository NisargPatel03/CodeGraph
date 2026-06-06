import React, { useState } from 'react';
import { BookOpen, Milestone, AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { ParsedFile } from '../utils/repoParser';
import { generateOnboardingGuide, generateArchitectureOverview } from '../utils/aiHelper';

interface ReportsProps {
  files: ParsedFile[];
  cycles: string[][];
  apiKey: string;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  onSelectFile: (filePath: string) => void;
}

export const Reports: React.FC<ReportsProps> = ({
  files,
  cycles,
  apiKey,
  isExpanded,
  setIsExpanded,
  onSelectFile,
}) => {
  const [activeTab, setActiveTab] = useState<'cycles' | 'onboarding' | 'architecture'>('cycles');
  const [onboardingDoc, setOnboardingDoc] = useState('');
  const [loadingOnboarding, setLoadingOnboarding] = useState(false);
  const [architectureDoc, setArchitectureDoc] = useState('');
  const [loadingArchitecture, setLoadingArchitecture] = useState(false);

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

  const handleGenerateArchitecture = async () => {
    setLoadingArchitecture(true);
    try {
      const summary = files.map((f) => ({ path: f.path, language: f.language, size: f.size }));
      const doc = await generateArchitectureOverview(summary, apiKey);
      setArchitectureDoc(doc);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingArchitecture(false);
    }
  };

  if (!isExpanded) {
    return (
      <div className="glass-panel bottom-panel-header" style={{ cursor: 'pointer' }} onClick={() => setIsExpanded(true)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Milestone size={16} style={{ color: 'var(--color-secondary)' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>CodeBase Reports & Insights ({cycles.length} warnings)</span>
        </div>
        <ChevronUp size={16} />
      </div>
    );
  }

  return (
    <div className="glass-panel bottom-panel">
      {/* Tab Selectors */}
      <div className="bottom-panel-header">
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            className={`tab-btn ${activeTab === 'cycles' ? 'active' : ''}`}
            onClick={() => setActiveTab('cycles')}
          >
            <AlertTriangle size={14} style={{ color: cycles.length > 0 ? 'var(--color-alert)' : 'var(--text-muted)' }} />
            Circular Dependencies ({cycles.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'onboarding' ? 'active' : ''}`}
            onClick={() => setActiveTab('onboarding')}
          >
            <BookOpen size={14} />
            Onboarding Guide
          </button>
          <button
            className={`tab-btn ${activeTab === 'architecture' ? 'active' : ''}`}
            onClick={() => setActiveTab('architecture')}
          >
            <Milestone size={14} />
            Architecture Overview
          </button>
        </div>
        <button className="control-btn" onClick={() => setIsExpanded(false)} style={{ width: '28px', height: '28px' }}>
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Tab Panels */}
      <div className="bottom-panel-content">
        {activeTab === 'cycles' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {cycles.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--color-accent)', padding: '12px', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <CheckCircle size={24} style={{ flexShrink: 0 }} />
                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Clean Architecture!</h4>
                  <p style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '2px' }}>No circular imports detected. Your codebase modularity is looking great.</p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  We found the following circular reference loops. Circular imports make code harder to refactor and test.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                  {cycles.map((cycle, idx) => (
                    <div key={idx} style={{ background: 'rgba(244, 63, 94, 0.04)', border: '1px solid rgba(244, 63, 94, 0.15)', borderRadius: '6px', padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--color-alert)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                        <AlertTriangle size={14} />
                        <span>Loop #{idx + 1}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                        {cycle.map((node, nodeIdx) => (
                          <React.Fragment key={nodeIdx}>
                            <span
                              style={{ cursor: 'pointer', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}
                              onClick={() => onSelectFile(node)}
                            >
                              {node.split('/').pop()}
                            </span>
                            {nodeIdx < cycle.length - 1 && <span style={{ color: 'var(--color-alert)', fontWeight: 'bold' }}>&rarr;</span>}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'onboarding' && (
          <div>
            {onboardingDoc ? (
              <div className="markdown-body" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <div dangerouslySetInnerHTML={{
                  __html: onboardingDoc
                    .replace(/^### (.*$)/gim, '<h5 style="color:#fff; font-weight:600; margin:16px 0 8px 0;">$1</h5>')
                    .replace(/^#### (.*$)/gim, '<h6 style="color:var(--text-primary); font-weight:600; margin:12px 0 6px 0;">$1</h6>')
                    .replace(/^\s*\-\s*(.*$)/gim, '<li style="margin-left:14px; list-style-type:circle; margin-bottom:4px;">$1</li>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\`(.*?)\`/g, '<code style="font-family:var(--font-mono); background:rgba(0,0,0,0.3); padding:2px 4px; border-radius:3px;">$1</code>')
                }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px', textAlign: 'center' }}>
                <BookOpen size={32} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                <div>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>No Onboarding Guide Generated</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '400px' }}>
                    Gemini can scan your folder layout and entry points to write a detailed onboarding walk-through for new developers.
                  </p>
                </div>
                <button className="cyber-button" onClick={handleGenerateOnboarding} disabled={loadingOnboarding} style={{ fontSize: '0.85rem', padding: '8px 16px', marginTop: '4px' }}>
                  {loadingOnboarding ? 'Analyzing Codebase...' : 'Generate Onboarding Guide'}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'architecture' && (
          <div>
            {architectureDoc ? (
              <div className="markdown-body" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <div dangerouslySetInnerHTML={{
                  __html: architectureDoc
                    .replace(/^### (.*$)/gim, '<h5 style="color:#fff; font-weight:600; margin:16px 0 8px 0;">$1</h5>')
                    .replace(/^#### (.*$)/gim, '<h6 style="color:var(--text-primary); font-weight:600; margin:12px 0 6px 0;">$1</h6>')
                    .replace(/^\s*\-\s*(.*$)/gim, '<li style="margin-left:14px; list-style-type:circle; margin-bottom:4px;">$1</li>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\`(.*?)\`/g, '<code style="font-family:var(--font-mono); background:rgba(0,0,0,0.3); padding:2px 4px; border-radius:3px;">$1</code>')
                }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px', textAlign: 'center' }}>
                <Milestone size={32} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                <div>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>No Architecture Report Generated</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '400px' }}>
                    Let AI audit your repository framework structures, layering boundaries, and dependencies.
                  </p>
                </div>
                <button className="cyber-button" onClick={handleGenerateArchitecture} disabled={loadingArchitecture} style={{ fontSize: '0.85rem', padding: '8px 16px', marginTop: '4px' }}>
                  {loadingArchitecture ? 'Analyzing Architecture...' : 'Generate Architecture Overview'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
