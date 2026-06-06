import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import type { CodebaseGraph } from '../utils/codeAnalyzer';

interface GraphCanvasProps {
  graphData: CodebaseGraph;
  selectedNode: string | null;
  setSelectedNode: (id: string | null) => void;
  viewMode: 'dependency' | 'cluster' | 'call' | 'hierarchy';
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  graphData,
  selectedNode,
  setSelectedNode,
  viewMode,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);


  // Colors for languages / types
  const getColorForNode = (d: any) => {
    if (viewMode === 'call') {
      // Color call nodes by call count (higher call count = hotter color)
      if (d.callCount > 10) return '#f43f5e'; // Hot Rose
      if (d.callCount > 4) return '#f59e0b'; // Amber
      return '#00f2fe'; // Cyber Teal
    }
    
    if (viewMode === 'hierarchy') {
      return d.type === 'component' ? '#10b981' : '#8b5cf6'; // Component: Green, Class: Purple
    }

    // Default: Dependency/Cluster mode based on language
    const lang = d.language?.toLowerCase() || '';
    switch (lang) {
      case 'typescript': return '#3178c6';
      case 'javascript': return '#f7df1e';
      case 'python': return '#3572A5';
      case 'go': return '#00ADD8';
      case 'rust': return '#dea584';
      case 'css': return '#563d7c';
      case 'html': return '#e34c26';
      case 'json': return '#8b5cf6';
      default: return '#a78bfa';
    }
  };

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    // Clear previous elements
    const svgElement = d3.select(svgRef.current);
    svgElement.selectAll('*').remove();

    // Get current dimensions
    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 500;

    // Define data based on viewMode
    let nodes: any[] = [];
    let links: any[] = [];

    if (viewMode === 'dependency' || viewMode === 'cluster') {
      nodes = graphData.nodes.map((n) => ({ ...n }));
      links = graphData.links.map((l) => ({ ...l }));
    } else if (viewMode === 'call') {
      nodes = graphData.callNodes.map((n) => ({ ...n }));
      links = graphData.callLinks.map((l) => ({ ...l }));
    } else if (viewMode === 'hierarchy') {
      nodes = graphData.classNodes.map((n) => ({ ...n }));
      links = graphData.classLinks.map((l) => ({ ...l }));
    }

    if (nodes.length === 0) {
      // Draw empty warning
      const g = svgElement.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--text-muted)')
        .attr('font-size', '14px')
        .text('No matching elements found in this view mode.');
      return;
    }

    // Create main outer group for zoom & pan
    const mainGroup = svgElement.append('g').attr('class', 'main-container');

    // Setup zoom behavior
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => {
        mainGroup.attr('transform', event.transform);
      });

    svgElement.call(zoomBehavior);

    // Initial positioning: center of screen
    svgElement.call(zoomBehavior.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8));

    // Force simulation setup
    const simulation = d3.forceSimulation<any>(nodes)
      .force('link', d3.forceLink<any, any>(links).id((d) => d.id).distance(() => {
        if (viewMode === 'cluster') return 50;
        return 100;
      }))
      .force('charge', d3.forceManyBody().strength(() => {
        if (viewMode === 'cluster') return -80;
        return -200;
      }))
      .force('collision', d3.forceCollide<any>().radius((d) => {
        const baseRad = viewMode === 'call' ? 12 : 15;
        return baseRad + Math.sqrt(d.size || 0) * 0.05;
      }))
      .force('center', d3.forceCenter(0, 0));

    // In Cluster Map mode, add a force pulling nodes of the same folder together
    if (viewMode === 'cluster') {
      const folderGroups = Array.from(new Set(nodes.map(n => n.folder)));
      const clusterCenters = new Map<string, { x: number; y: number }>();
      
      folderGroups.forEach((folder, idx) => {
        // Arrange cluster centers in a circle
        const angle = (idx / folderGroups.length) * 2 * Math.PI;
        const radius = Math.min(width, height) * 0.35;
        clusterCenters.set(folder, {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        });
      });

      simulation.force('folderGrouping', (alpha) => {
        nodes.forEach((node) => {
          const center = clusterCenters.get(node.folder);
          if (center) {
            node.vx += (center.x - node.x) * 0.06 * alpha;
            node.vy += (center.y - node.y) * 0.06 * alpha;
          }
        });
      });
    }

    // Add arrow markers for directional links
    svgElement.append('defs').selectAll('marker')
      .data(['arrow-normal', 'arrow-highlight'])
      .enter().append('marker')
      .attr('id', d => d)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22) // Place arrow near node boundary
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', d => d === 'arrow-highlight' ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.15)');

    // 1. Draw Links (Edges)
    const link = mainGroup.append('g')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('class', 'link-element')
      .attr('stroke', 'rgba(255, 255, 255, 0.08)')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrow-normal)');

    // 2. Draw Nodes
    const node = mainGroup.append('g')
      .selectAll('.node-element')
      .data(nodes)
      .enter().append('g')
      .attr('class', 'node-element')
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNode(d.id);
      })
      .on('mouseenter', (_, d) => {
        setHoveredNode(d.id);
      })
      .on('mouseleave', () => {
        setHoveredNode(null);
      })
      .call(d3.drag<any, any>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
      );

    // Draw circles representing the nodes
    node.append('circle')
      .attr('r', (d) => {
        if (viewMode === 'call') {
          return 8 + Math.min(d.callCount * 1.5, 20); // Scale by hot path count
        }
        const baseSize = 8;
        return baseSize + Math.min(Math.sqrt(d.size || 0) * 0.04, 30);
      })
      .attr('fill', getColorForNode)
      .attr('stroke', 'rgba(0,0,0,0.5)')
      .attr('stroke-width', 1.5);

    // Draw Labels text
    node.append('text')
      .attr('class', 'node-label')
      .attr('dx', 12)
      .attr('dy', 4)
      .text((d) => d.name);

    // D3 Drag handlers
    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Tick update logic
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);

      node.attr('transform', (d) => `translate(${d.x}, ${d.y})`);
    });

    // Save functions to window for zoom controls
    (window as any).graphZoom = {
      zoomIn: () => svgElement.transition().duration(300).call(zoomBehavior.scaleBy, 1.3),
      zoomOut: () => svgElement.transition().duration(300).call(zoomBehavior.scaleBy, 0.7),
      reset: () => svgElement.transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8)),
    };

    return () => {
      simulation.stop();
    };
  }, [graphData, viewMode]);

  // Effect to highlight paths (run on hover / selection changes)
  useEffect(() => {
    if (!svgRef.current) return;
    const activeId = hoveredNode || selectedNode;

    const svgElement = d3.select(svgRef.current);
    const nodesG = svgElement.selectAll('.node-element');
    const linksLine = svgElement.selectAll('.link-element');

    if (activeId) {
      // Find all neighbors
      const neighbors = new Set<string>();
      neighbors.add(activeId);

      // Inspect connections
      let filteredLinks: any[] = [];
      if (viewMode === 'dependency' || viewMode === 'cluster') {
        filteredLinks = graphData.links;
      } else if (viewMode === 'call') {
        filteredLinks = graphData.callLinks;
      } else if (viewMode === 'hierarchy') {
        filteredLinks = graphData.classLinks;
      }

      filteredLinks.forEach((link: any) => {
        const sId = typeof link.source === 'object' ? link.source.id : link.source;
        const tId = typeof link.target === 'object' ? link.target.id : link.target;
        if (sId === activeId) neighbors.add(tId);
        if (tId === activeId) neighbors.add(sId);
      });

      // Update node opacity
      nodesG.style('opacity', (d: any) => neighbors.has(d.id) ? 1.0 : 0.15);
      nodesG.select('text').style('fill', (d: any) => d.id === activeId ? '#fff' : 'var(--text-secondary)');
      
      // Update link styles
      linksLine
        .style('stroke-opacity', (l: any) => {
          const sId = typeof l.source === 'object' ? l.source.id : l.source;
          const tId = typeof l.target === 'object' ? l.target.id : l.target;
          return (sId === activeId || tId === activeId) ? 0.95 : 0.05;
        })
        .style('stroke', (l: any) => {
          const sId = typeof l.source === 'object' ? l.source.id : l.source;
          const tId = typeof l.target === 'object' ? l.target.id : l.target;
          return (sId === activeId || tId === activeId) ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.08)';
        })
        .attr('marker-end', (l: any) => {
          const sId = typeof l.source === 'object' ? l.source.id : l.source;
          const tId = typeof l.target === 'object' ? l.target.id : l.target;
          return (sId === activeId || tId === activeId) ? 'url(#arrow-highlight)' : 'url(#arrow-normal)';
        });
    } else {
      // Clear highlights
      nodesG.style('opacity', 1.0);
      nodesG.select('text').style('fill', 'var(--text-secondary)');
      linksLine
        .style('stroke-opacity', 0.2)
        .style('stroke', 'rgba(255, 255, 255, 0.08)')
        .attr('marker-end', 'url(#arrow-normal)');
    }
  }, [hoveredNode, selectedNode, graphData, viewMode]);

  return (
    <div ref={containerRef} className="graph-viewport" onClick={() => setSelectedNode(null)}>
      {/* Zoom controls */}
      <div className="graph-controls">
        <button className="control-btn" title="Zoom In" onClick={(e) => { e.stopPropagation(); (window as any).graphZoom?.zoomIn(); }}>
          <ZoomIn size={16} />
        </button>
        <button className="control-btn" title="Zoom Out" onClick={(e) => { e.stopPropagation(); (window as any).graphZoom?.zoomOut(); }}>
          <ZoomOut size={16} />
        </button>
        <button className="control-btn" title="Reset View" onClick={(e) => { e.stopPropagation(); (window as any).graphZoom?.reset(); }}>
          <RotateCcw size={16} />
        </button>
      </div>

      <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
};
