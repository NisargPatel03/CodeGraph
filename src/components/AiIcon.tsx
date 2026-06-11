import React from 'react';
import aiIconSrc from '../assets/ai-icon.png';

interface AiIconProps {
  size?: number;
  style?: React.CSSProperties;
  className?: string;
  /** Show a glowing circular badge container (default: true for headers, false for buttons) */
  badge?: boolean;
}

/**
 * CodeGraph AI Icon — Graph-node spark badge.
 * Drop-in replacement for <Sparkles> wherever AI features are surfaced.
 */
export const AiIcon: React.FC<AiIconProps> = ({ size = 16, style, className, badge = false }) => {
  if (badge) {
    return (
      <span
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size + 6,
          height: size + 6,
          borderRadius: '50%',
          background: 'rgba(168, 85, 247, 0.15)',
          border: '1px solid rgba(168, 85, 247, 0.35)',
          boxShadow: '0 0 8px rgba(168, 85, 247, 0.4)',
          flexShrink: 0,
          ...style,
        }}
      >
        <img
          src={aiIconSrc}
          alt="AI"
          width={size}
          height={size}
          style={{ objectFit: 'contain', display: 'block' }}
        />
      </span>
    );
  }

  // Inline icon — add a subtle glow so neon details pop on dark backgrounds
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        filter: 'drop-shadow(0 0 3px #a855f7) drop-shadow(0 0 6px #22d3ee)',
        ...style,
      }}
    >
      <img
        src={aiIconSrc}
        alt="AI"
        width={size}
        height={size}
        style={{ objectFit: 'contain', display: 'block' }}
      />
    </span>
  );
};
