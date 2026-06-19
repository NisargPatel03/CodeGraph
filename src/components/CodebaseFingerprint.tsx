import React, { useRef, useEffect, useState } from 'react';
import type { CodebaseGraph } from '../utils/codeAnalyzer';

interface CodebaseFingerprintProps {
  graphData: CodebaseGraph;
  onHoverFile?: (fileName: string | null) => void;
}

export const CodebaseFingerprint: React.FC<CodebaseFingerprintProps> = ({
  graphData,
  onHoverFile
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredFile, setHoveredFile] = useState<{ name: string; path: string; loc: number; language: string; smells: number; vulnerable: boolean } | null>(null);
  const animationRef = useRef<number | null>(null);
  const scanAngleRef = useRef<number>(0);

  // Parse files and calculate coordinates
  const nodes = graphData.nodes.filter(n => !n.id.startsWith('npm::'));
  const totalFiles = nodes.length || 1;

  // Language colors mapping
  const getLanguageColor = (lang: string): string => {
    switch (lang?.toLowerCase()) {
      case 'typescript':
      case 'tsx':
        return '#6366f1'; // Indigo
      case 'javascript':
      case 'jsx':
        return '#3b82f6'; // Blue
      case 'python':
        return '#10b981'; // Green
      case 'rust':
        return '#f97316'; // Orange
      case 'go':
        return '#06b6d4'; // Cyan
      case 'css':
        return '#ec4899'; // Pink
      case 'html':
        return '#eab308'; // Yellow
      default:
        return '#8b5cf6'; // Violet
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = Math.min(width, height) * 0.42;
    const innerRadius = maxRadius * 0.25;

    // Map files to angles
    const fileSlices = nodes.map((node, index) => {
      const startAngle = (index / totalFiles) * Math.PI * 2 - Math.PI / 2;
      const endAngle = ((index + 1) / totalFiles) * Math.PI * 2 - Math.PI / 2;
      
      const loc = node.complexity || 0;
      // Number of biometric ridges based on file size
      const ridgesCount = Math.max(2, Math.min(8, Math.floor(Math.log2(loc + 10))));
      
      // Calculate code smells targeting this node
      const smellsCount = (graphData.codeSmells || []).filter(s => s.file === node.id).length;

      return {
        id: node.id,
        name: node.name,
        loc,
        language: node.language || 'unknown',
        startAngle,
        endAngle,
        ridgesCount,
        smellsCount,
        vulnerable: !!node.isVulnerable
      };
    });

    const handleMouseMove = (e: MouseEvent) => {
      const mouseRect = canvas.getBoundingClientRect();
      const mx = e.clientX - mouseRect.left;
      const my = e.clientY - mouseRect.top;

      // Calculate distance and angle from center
      const dx = mx - cx;
      const dy = my - cy;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance >= innerRadius && distance <= maxRadius + 15) {
        let angle = Math.atan2(dy, dx);
        if (angle < -Math.PI / 2) {
          angle += Math.PI * 2;
        }
        
        // Find which slice matches the angle
        const hovered = fileSlices.find(slice => {
          let start = slice.startAngle;
          let end = slice.endAngle;
          return angle >= start && angle <= end;
        });

        if (hovered) {
          const fileDetails = {
            name: hovered.name,
            path: hovered.id,
            loc: hovered.loc,
            language: hovered.language,
            smells: hovered.smellsCount,
            vulnerable: hovered.vulnerable
          };
          setHoveredFile(fileDetails);
          if (onHoverFile) onHoverFile(hovered.name);
          return;
        }
      }

      setHoveredFile(null);
      if (onHoverFile) onHoverFile(null);
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => {
      setHoveredFile(null);
      if (onHoverFile) onHoverFile(null);
    });

    // Draw frame loop
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Background decorative circle mesh
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let r = innerRadius; r <= maxRadius; r += (maxRadius - innerRadius) / 4) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw biometric file ridges
      fileSlices.forEach(slice => {
        const isHovered = hoveredFile && hoveredFile.path === slice.id;
        const color = getLanguageColor(slice.language);
        ctx.strokeStyle = isHovered ? color : `${color}cc`;
        ctx.lineWidth = isHovered ? 2.5 : 1.5;

        // Draw multiple ridges (curved fingerprints) in the slice
        for (let i = 0; i < slice.ridgesCount; i++) {
          // Add minor radius variations to make it look organic like a fingerprint
          const ridgeRadius = innerRadius + i * ((maxRadius - innerRadius) / 8);
          
          // Biometric dash effect
          ctx.beginPath();
          ctx.arc(cx, cy, ridgeRadius, slice.startAngle + 0.01, slice.endAngle - 0.01);
          ctx.stroke();
        }

        // Draw smell warning rings on active slices
        if (slice.smellsCount > 0) {
          ctx.fillStyle = 'rgba(249, 115, 22, 0.6)'; // Orange
          const midAngle = (slice.startAngle + slice.endAngle) / 2;
          const markerRadius = innerRadius + (slice.ridgesCount - 1) * ((maxRadius - innerRadius) / 8) + 8;
          ctx.beginPath();
          ctx.arc(
            cx + Math.cos(midAngle) * markerRadius,
            cy + Math.sin(midAngle) * markerRadius,
            isHovered ? 4.5 : 3,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }

        // Draw vulnerability alerts (red glowing shields/squares) on outer boundary
        if (slice.vulnerable) {
          const midAngle = (slice.startAngle + slice.endAngle) / 2;
          const markerRadius = maxRadius + 8;
          ctx.fillStyle = '#ef4444'; // Red
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = isHovered ? 12 : 6;
          
          ctx.beginPath();
          ctx.arc(
            cx + Math.cos(midAngle) * markerRadius,
            cy + Math.sin(midAngle) * markerRadius,
            isHovered ? 5.5 : 4,
            0,
            Math.PI * 2
          );
          ctx.fill();
          ctx.shadowBlur = 0; // Reset
        }
      });

      // Draw cycle bridge arcs (neon lines mapping circular dependency paths)
      if (graphData.cycles && graphData.cycles.length > 0) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; // Soft red
        ctx.lineWidth = 1;
        
        graphData.cycles.forEach(cycle => {
          if (cycle.length < 2) return;
          for (let i = 0; i < cycle.length; i++) {
            const nodeAId = cycle[i];
            const nodeBId = cycle[(i + 1) % cycle.length];
            
            const sliceA = fileSlices.find(s => s.id === nodeAId);
            const sliceB = fileSlices.find(s => s.id === nodeBId);
            
            if (sliceA && sliceB) {
              const angleA = (sliceA.startAngle + sliceA.endAngle) / 2;
              const angleB = (sliceB.startAngle + sliceB.endAngle) / 2;
              
              const startX = cx + Math.cos(angleA) * innerRadius;
              const startY = cy + Math.sin(angleA) * innerRadius;
              const endX = cx + Math.cos(angleB) * innerRadius;
              const endY = cy + Math.sin(angleB) * innerRadius;
              
              ctx.beginPath();
              ctx.moveTo(startX, startY);
              // Draw quadratic curve through the center space
              ctx.quadraticCurveTo(cx, cy, endX, endY);
              ctx.stroke();
            }
          }
        });
      }

      // Draw scan line beam overlay
      scanAngleRef.current = (scanAngleRef.current + 0.006) % (Math.PI * 2);
      const beamGrad = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, maxRadius);
      beamGrad.addColorStop(0, 'rgba(0, 242, 254, 0.05)');
      beamGrad.addColorStop(1, 'rgba(0, 242, 254, 0)');

      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxRadius, scanAngleRef.current - 0.25, scanAngleRef.current + 0.05);
      ctx.closePath();
      ctx.fill();

      // Draw fine scanning line
      ctx.strokeStyle = 'rgba(0, 242, 254, 0.25)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(scanAngleRef.current) * innerRadius, cy + Math.sin(scanAngleRef.current) * innerRadius);
      ctx.lineTo(cx + Math.cos(scanAngleRef.current) * maxRadius, cy + Math.sin(scanAngleRef.current) * maxRadius);
      ctx.stroke();

      // Center core dial (shows total files count)
      ctx.fillStyle = '#0f1016';
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius - 4, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius - 4, 0, Math.PI * 2);
      ctx.stroke();

      // Draw glowing central orb
      const orbGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, innerRadius - 8);
      orbGrad.addColorStop(0, 'rgba(99, 102, 241, 0.15)');
      orbGrad.addColorStop(1, 'rgba(99, 102, 241, 0.01)');
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius - 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#8b9bb4';
      ctx.font = '600 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FILES', cx, cy - 4);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.fillText(String(totalFiles), cx, cy + 8);

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [nodes, totalFiles, hoveredFile, graphData.codeSmells, graphData.cycles]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <canvas 
        ref={canvasRef} 
        style={{ width: '100%', height: '100%', display: 'block', maxHeight: '420px' }} 
      />
      
      {/* Tooltip Overlay */}
      {hoveredFile && (
        <div style={{
          position: 'absolute',
          bottom: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--panel-bg)',
          border: '1px solid var(--panel-border)',
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '0.74rem',
          color: 'var(--text-primary)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          pointerEvents: 'none',
          textAlign: 'center',
          backdropFilter: 'blur(8px)',
          minWidth: '220px',
          zIndex: 10
        }}>
          <div style={{ fontWeight: 600, color: 'var(--color-primary)', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {hoveredFile.name}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.66rem', marginBottom: '6px', wordBreak: 'break-all' }}>
            {hoveredFile.path}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', borderTop: '1px dashed var(--panel-border)', paddingTop: '6px', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.68rem' }}>
            <div>Language: <strong style={{ color: getLanguageColor(hoveredFile.language) }}>{hoveredFile.language}</strong></div>
            <div>LOC: <strong style={{ color: 'var(--text-primary)' }}>{hoveredFile.loc}</strong></div>
            {hoveredFile.smells > 0 && (
              <div>Smells: <strong style={{ color: 'var(--color-warning)' }}>{hoveredFile.smells}</strong></div>
            )}
            {hoveredFile.vulnerable && (
              <div style={{ color: '#ef4444', fontWeight: 600 }}>⚠️ CVE</div>
            )}
          </div>
        </div>
      )}
      {/* Visual Legend Key Overlay */}
      <div style={{
        position: 'absolute',
        bottom: '12px',
        left: '12px',
        background: 'var(--panel-bg)',
        border: '1px solid var(--panel-border)',
        borderRadius: '6px',
        padding: '8px 10px',
        fontSize: '0.64rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
      }}>
        <div style={{ fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.58rem', marginBottom: '2px' }}>Fingerprint Key</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
          <span style={{ display: 'inline-block', width: '12px', height: '1.5px', background: 'var(--color-primary)' }} />
          <span>Concentric Ridges: Complexity (LOC)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
          <span style={{ display: 'inline-block', width: '12px', height: '1.5px', background: 'rgba(239, 68, 68, 0.6)' }} />
          <span>Inner Arcs: Dependency Loops</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
          <span style={{ display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', background: 'rgba(249, 115, 22, 0.8)' }} />
          <span>Orange Nodes: Code Smells</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
          <span style={{ display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', background: '#ef4444' }} />
          <span>Red Orbs: Security CVEs</span>
        </div>
      </div>
    </div>
  );
};
