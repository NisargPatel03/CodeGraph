import React from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Users, 
  Clock,
  X 
} from 'lucide-react';
import type { SimulatedCommit } from '../utils/codeAnalyzer';

interface EvolutionPlayerProps {
  commits: SimulatedCommit[];
  currentStep: number;
  onChangeStep: (step: number) => void;
  isReplaying: boolean;
  setIsReplaying: (val: boolean) => void;
  speed: number; // in ms per step
  onChangeSpeed: (speed: number) => void;
  onClose: () => void;
}

export const EvolutionPlayer: React.FC<EvolutionPlayerProps> = ({
  commits,
  currentStep,
  onChangeStep,
  isReplaying,
  setIsReplaying,
  speed,
  onChangeSpeed,
  onClose
}) => {
  if (!commits || commits.length === 0) return null;

  const currentCommit = commits[currentStep] || commits[0];

  const handlePrev = () => {
    if (currentStep > 0) {
      onChangeStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (currentStep < commits.length - 1) {
      onChangeStep(currentStep + 1);
    }
  };


  return (
    <div className="evolution-player-panel glass-panel">
      {/* Top title & Close */}
      <div className="evolution-player-header">
        <div className="evolution-player-title-group">
          <span className="evolution-pulse-indicator"></span>
          <h3>📊 Git History Replay</h3>
        </div>
        <button className="evolution-close-btn" onClick={onClose} title="Exit Evolution Mode">
          <X size={15} />
        </button>
      </div>

      <div className="evolution-player-body">
        {/* Active Commit Metadata Card */}
        <div className="evolution-commit-details glass-panel">
          <div className="commit-detail-header">
            <span className="commit-sha-badge">#{currentCommit.sha}</span>
            <span className="commit-date"><Clock size={12} /> {currentCommit.date}</span>
          </div>

          <p className="commit-message">"{currentCommit.message}"</p>

          <div className="commit-author-row">
            <span className="commit-author"><Users size={12} /> {currentCommit.author}</span>
            <span className="commit-stats">
              {currentCommit.filesAdded.length > 0 && (
                <span className="added-count">+{currentCommit.filesAdded.length}</span>
              )}
              {currentCommit.filesModified.length > 0 && (
                <span className="modified-count">~{currentCommit.filesModified.length}</span>
              )}
              {currentCommit.filesDeleted.length > 0 && (
                <span className="deleted-count">-{currentCommit.filesDeleted.length}</span>
              )}
            </span>
          </div>

          {/* Files Changed Detail list */}
          {currentCommit.filesAdded.length > 0 && (
            <div className="changed-files-list">
              <span className="changed-files-label">Added files:</span>
              <div className="changed-files-scroller">
                {currentCommit.filesAdded.map(f => (
                  <span key={f} className="changed-file-tag add" title={f}>
                    {f.split('/').pop()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Playback Controls and Slider */}
        <div className="evolution-controls-section">
          <div className="playback-buttons-row">
            <button 
              className="playback-btn" 
              onClick={handlePrev} 
              disabled={currentStep === 0}
              title="Previous Commit"
            >
              <SkipBack size={16} />
            </button>

            <button 
              className="playback-btn play-pause-btn" 
              onClick={() => setIsReplaying(!isReplaying)}
              title={isReplaying ? "Pause" : "Play Replay"}
            >
              {isReplaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>

            <button 
              className="playback-btn" 
              onClick={handleNext} 
              disabled={currentStep === commits.length - 1}
              title="Next Commit"
            >
              <SkipForward size={16} />
            </button>

            <div className="playback-speed-selector">
              <button 
                className={`speed-option-btn ${speed === 3000 ? 'active' : ''}`} 
                onClick={() => onChangeSpeed(3000)}
              >
                1x
              </button>
              <button 
                className={`speed-option-btn ${speed === 1500 ? 'active' : ''}`} 
                onClick={() => onChangeSpeed(1500)}
              >
                2x
              </button>
              <button 
                className={`speed-option-btn ${speed === 600 ? 'active' : ''}`} 
                onClick={() => onChangeSpeed(600)}
              >
                5x
              </button>
            </div>
          </div>

          {/* Slider Row */}
          <div className="evolution-slider-row">
            <input 
              type="range" 
              min="0" 
              max={commits.length - 1} 
              value={currentStep} 
              onChange={(e) => onChangeStep(Number(e.target.value))}
              className="evolution-timeline-slider"
            />
            <div className="evolution-slider-labels">
              <span>Birth ({commits[0].sha})</span>
              <span className="current-progress">Commit {currentStep + 1} of {commits.length}</span>
              <span>Present ({commits[commits.length - 1].sha})</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
