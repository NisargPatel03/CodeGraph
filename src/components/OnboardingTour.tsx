import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, X, Sparkles } from 'lucide-react';

interface TourStep {
  title: string;
  description: string;
  selector: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  onBeforeShow?: () => void;
}

interface OnboardingTourProps {
  isOpen: boolean;
  onClose: () => void;
  hasRepoLoaded: boolean;
  onLoadDemo: () => void;
  setViewMode: (mode: any) => void;
  setSelectedNodeId: (id: string | null) => void;
  selectedNodeId: string | null;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({
  isOpen,
  onClose,
  hasRepoLoaded,
  onLoadDemo,
  setViewMode,
  setSelectedNodeId,
  selectedNodeId
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const tooltipRef = useRef<HTMLDivElement>(null);

  const steps: TourStep[] = [
    {
      title: 'Welcome to CodeGraph! 🚀',
      description: 'CodeGraph is an advanced codebase visualization and intelligence engine. Let’s take a 2-minute tour to help you master its power.',
      selector: '',
      position: 'center'
    },
    {
      title: 'Ingest Your Codebase 📦',
      description: 'Analyze repositories instantly by entering a GitHub URL, uploading a ZIP archive, or launching a local history session.',
      selector: '.input-card',
      position: 'bottom',
      onBeforeShow: () => {
        if (!hasRepoLoaded) {
          // Keep showing selector
        }
      }
    },
    {
      title: 'D3 Interactive Canvas 🎨',
      description: 'The core visualization center. Use mouse-wheel to zoom and drag to pan. Click nodes to focus, trace paths, and play audibles.',
      selector: '.center-panel',
      position: 'center',
      onBeforeShow: () => {
        if (!hasRepoLoaded) {
          onLoadDemo();
        }
        setViewMode('dependency');
      }
    },
    {
      title: 'Visual Graph View Modes 🎛️',
      description: 'Toggle tabs to view: Module Clusters (folder grouping), Call Graphs (execution tracing), Component Trees, and direct DB Schema ER maps.',
      selector: '.tabs-group',
      position: 'bottom',
      onBeforeShow: () => {
        if (!hasRepoLoaded) onLoadDemo();
        setViewMode('dependency');
      }
    },
    {
      title: 'Files Panel & AI Search 🔍',
      description: 'Browse workspace folders. Enable checkboxes to run Multi-File refactors, or type a natural query (e.g. "where are keys parsed") to run Gemini Semantic Search.',
      selector: '.sidebar-left',
      position: 'right',
      onBeforeShow: () => {
        if (!hasRepoLoaded) onLoadDemo();
      }
    },
    {
      title: 'KPI Telemetry Ribbon 📊',
      description: 'Displays sticky metrics at-a-glance: total counts, detected circular dependency import loops, CVE vulnerability flags, and files with highest churn.',
      selector: '.kpi-ribbon-container',
      position: 'bottom',
      onBeforeShow: () => {
        if (!hasRepoLoaded) onLoadDemo();
        setViewMode('dependency');
      }
    },
    {
      title: 'Detailed Code Inspector 🕵️',
      description: 'Clicking any code node opens the side Inspector. Review functions list, call trace vectors, Git commit count HUDs, generate unit tests, or apply AI code patches directly.',
      selector: '.sidebar-right',
      position: 'left',
      onBeforeShow: () => {
        if (!hasRepoLoaded) onLoadDemo();
        setViewMode('dependency');
        if (!selectedNodeId) {
          setSelectedNodeId('src/App.tsx');
        }
      }
    },
    {
      title: 'Settings, Themes & Shortcuts ⚙️',
      description: 'Cycle between Cyber Neon, Midnight Green, Rose Gold, and Arctic Light modes. Check keyboard shortcut overlays (Hotkey "?") and enter your Gemini key to verify AI functions.',
      selector: '.header-actions',
      position: 'bottom',
      onBeforeShow: () => {
        if (!hasRepoLoaded) onLoadDemo();
      }
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      const nextIndex = currentStep + 1;
      const nextStep = steps[nextIndex];
      if (nextStep.onBeforeShow) {
        nextStep.onBeforeShow();
      }
      setCurrentStep(nextIndex);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      const prevIndex = currentStep - 1;
      const prevStep = steps[prevIndex];
      if (prevStep.onBeforeShow) {
        prevStep.onBeforeShow();
      }
      setCurrentStep(prevIndex);
    }
  };

  const handleComplete = () => {
    localStorage.setItem('completed_onboarding_tour', 'true');
    onClose();
  };

  // Keyboard navigation listeners
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleComplete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep]);

  // Recalculate target positions
  useEffect(() => {
    if (!isOpen) return;

    const current = steps[currentStep];
    if (!current.selector) {
      setHighlightRect(null);
      setTooltipStyle({
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 999999
      });
      return;
    }

    const updatePosition = () => {
      const el = document.querySelector(current.selector);
      if (!el) {
        // Fallback to center if element not in DOM yet
        setHighlightRect(null);
        setTooltipStyle({
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 999999
        });
        return;
      }

      // Check if element is hidden
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || el.clientHeight === 0) {
        // If element is not displayed (like sidebar-right when inspector is closed), try to locate a parent or fallback
        setHighlightRect(null);
        setTooltipStyle({
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 999999
        });
        return;
      }

      const rect = el.getBoundingClientRect();
      setHighlightRect(rect);

      // Compute tooltip positioning
      const gap = 14;
      const tEl = tooltipRef.current;
      const tWidth = tEl ? tEl.clientWidth : 340;
      const tHeight = tEl ? tEl.clientHeight : 180;

      let left = 0;
      let top = 0;

      if (current.position === 'bottom') {
        left = rect.left + rect.width / 2 - tWidth / 2;
        top = rect.bottom + gap;
      } else if (current.position === 'top') {
        left = rect.left + rect.width / 2 - tWidth / 2;
        top = rect.top - tHeight - gap;
      } else if (current.position === 'left') {
        left = rect.left - tWidth - gap;
        top = rect.top + rect.height / 2 - tHeight / 2;
      } else if (current.position === 'right') {
        left = rect.right + gap;
        top = rect.top + rect.height / 2 - tHeight / 2;
      } else {
        // Center positioning fallback
        left = window.innerWidth / 2 - tWidth / 2;
        top = window.innerHeight / 2 - tHeight / 2;
      }

      // Keep inside screen bounds
      left = Math.max(16, Math.min(window.innerWidth - tWidth - 16, left));
      top = Math.max(16, Math.min(window.innerHeight - tHeight - 16, top));

      setTooltipStyle({
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 999999
      });
    };

    // Delay slightly to let React render transitions complete (like opening sidebar / tabs)
    const timeout = setTimeout(updatePosition, 150);

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, currentStep, selectedNodeId]);

  if (!isOpen) return null;

  const activeStep = steps[currentStep];

  return (
    <>
      {/* CSS Styles */}
      <style>{`
        .onboarding-overlay-mask {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(3, 7, 18, 0.45);
          backdrop-filter: blur(2px);
          z-index: 999990;
          pointer-events: auto;
          transition: background-color 0.3s;
        }

        .onboarding-spotlight {
          position: fixed;
          border-radius: 8px;
          border: 2px solid var(--color-secondary, #00f2fe);
          box-shadow: 0 0 0 9999px rgba(3, 7, 18, 0.65), 
                      0 0 15px var(--color-secondary, #00f2fe), 
                      inset 0 0 15px rgba(255, 255, 255, 0.08);
          z-index: 999991;
          pointer-events: none;
          transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
        }

        .onboarding-card {
          width: 360px;
          background: var(--panel-bg, rgba(15, 23, 42, 0.85));
          backdrop-filter: blur(16px) saturate(180%);
          border: 1px solid var(--panel-border, rgba(255, 255, 255, 0.1));
          border-top: 2px solid var(--color-secondary, #00f2fe);
          box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.5),
                      0 0 25px rgba(0, 242, 254, 0.08);
          border-radius: 12px;
          padding: 20px;
          color: var(--text-primary, #f3f4f6);
          transition: all 0.25s ease;
          animation: onboarding-card-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        [data-theme="arctic-light"] .onboarding-card {
          background: rgba(255, 255, 255, 0.98);
          border-color: rgba(15, 23, 42, 0.08);
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.1);
        }

        @keyframes onboarding-card-in {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(6px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .onboarding-dots {
          display: flex;
          gap: 6px;
        }

        .onboarding-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--text-muted, rgba(255, 255, 255, 0.15));
          opacity: 0.3;
          transition: all 0.2s;
        }

        .onboarding-dot.active {
          background: var(--color-secondary, #00f2fe);
          box-shadow: 0 0 8px var(--color-secondary, #00f2fe);
          width: 14px;
          border-radius: 4px;
          opacity: 1;
        }
      `}</style>

      {/* Screen Mask backdrop */}
      <div className="onboarding-overlay-mask" onClick={handleComplete} />

      {/* Spotlight box around active target */}
      {highlightRect && (
        <div
          className="onboarding-spotlight"
          style={{
            left: `${highlightRect.left - 6}px`,
            top: `${highlightRect.top - 6}px`,
            width: `${highlightRect.width + 12}px`,
            height: `${highlightRect.height + 12}px`
          }}
        />
      )}

      {/* Floating Tooltip Card */}
      <div
        ref={tooltipRef}
        className="onboarding-card"
        style={tooltipStyle}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-secondary, #00f2fe)', fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Sparkles size={13} />
            <span>Interactive Guide</span>
          </div>
          <button
            onClick={handleComplete}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted, #9ca3af)', cursor: 'pointer', display: 'flex', padding: 0 }}
            title="Skip Tour"
          >
            <X size={16} />
          </button>
        </div>

        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {activeStep.title}
        </h3>

        <p style={{ margin: '0 0 20px 0', fontSize: '0.82rem', color: 'var(--text-secondary, #9ca3af)', lineHeight: '1.5' }}>
          {activeStep.description}
        </p>

        {currentStep === 1 && !hasRepoLoaded && (
          <button
            className="cyber-button"
            style={{ width: '100%', marginBottom: '16px', fontSize: '0.8rem', padding: '10px' }}
            onClick={() => {
              onLoadDemo();
              // Advance to next step once demo loads
              setTimeout(() => handleNext(), 300);
            }}
          >
            🚀 Load Demo Sandbox & Start Tour
          </button>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="onboarding-dots">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`onboarding-dot ${idx === currentStep ? 'active' : ''}`}
              />
            ))}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {currentStep > 0 && (
              <button
                className="cyber-button secondary"
                style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={handlePrev}
              >
                <ArrowLeft size={12} />
                Back
              </button>
            )}
            <button
              className="cyber-button"
              style={{ padding: '6px 16px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
              onClick={handleNext}
            >
              {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
