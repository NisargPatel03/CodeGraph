import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import type { CodebaseGraph } from '../utils/codeAnalyzer';

interface GraphCanvasProps {
  graphData: CodebaseGraph;
  selectedNode: string | null;
  setSelectedNode: (id: string | null) => void;
  viewMode: 'dependency' | 'cluster' | 'call' | 'hierarchy';
  searchQuery: string;
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  graphData,
  selectedNode,
  setSelectedNode,
  viewMode,
  searchQuery,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const boundsRef = useRef({ minX: -100, maxX: 100, minY: -100, maxY: 100 });
  const zoomBehaviorRef = useRef<any>(null);
  const drawMinimapRef = useRef<(() => void) | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const handleMinimapClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = minimapCanvasRef.current;
    if (!canvas || !svgRef.current || !containerRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    const { minX, maxX, minY, maxY } = boundsRef.current;
    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;

    if (boundsWidth <= 0 || boundsHeight <= 0) return;

    const targetNodeX = minX + (clickX / canvasWidth) * boundsWidth;
    const targetNodeY = minY + (clickY / canvasHeight) * boundsHeight;

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 500;

    if (zoomBehaviorRef.current) {
      const transform = d3.zoomTransform(svgRef.current);
      const targetTransform = d3.zoomIdentity
        .translate(width / 2 - targetNodeX * transform.k, height / 2 - targetNodeY * transform.k)
        .scale(transform.k);

      d3.select(svgRef.current)
        .transition()
        .duration(450)
        .ease(d3.easeCubicOut)
        .call(zoomBehaviorRef.current.transform, targetTransform);
    }
  };

  // Pre-calculate cyclic dependency links for quick lookup
  const cyclicLinks = useMemo(() => {
    const set = new Set<string>();
    if (graphData.cycles) {
      graphData.cycles.forEach((cycle) => {
        for (let i = 0; i < cycle.length - 1; i++) {
          set.add(`${cycle[i]}->${cycle[i + 1]}`);
        }
      });
    }
    return set;
  }, [graphData.cycles]);

  // Compute hierarchical levels for Component Tree (viewMode === 'hierarchy')
  const hierarchicalLevels = useMemo(() => {
    if (viewMode !== 'hierarchy') return new Map<string, number>();

    const nodes = graphData.classNodes;
    const links = graphData.classLinks;

    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    nodes.forEach((n) => {
      adj.set(n.id, []);
      inDegree.set(n.id, 0);
    });

    links.forEach((l) => {
      const source = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const target = typeof l.target === 'object' ? (l.target as any).id : l.target;

      if (adj.has(source)) {
        adj.get(source)!.push(target);
      }
      if (inDegree.has(target)) {
        inDegree.set(target, inDegree.get(target)! + 1);
      }
    });

    const levels = new Map<string, number>();
    const queue: string[] = [];

    // Roots are nodes with 0 in-degree
    nodes.forEach((n) => {
      if ((inDegree.get(n.id) || 0) === 0) {
        queue.push(n.id);
        levels.set(n.id, 0);
      }
    });

    if (queue.length === 0 && nodes.length > 0) {
      queue.push(nodes[0].id);
      levels.set(nodes[0].id, 0);
    }

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currLevel = levels.get(curr) || 0;

      const neighbors = adj.get(curr) || [];
      neighbors.forEach((neighbor) => {
        if (!levels.has(neighbor)) {
          levels.set(neighbor, currLevel + 1);
          queue.push(neighbor);
        }
      });
    }

    return levels;
  }, [graphData.classNodes, graphData.classLinks, viewMode]);

  // Colors for languages / types
  const getColorForNode = (d: any) => {
    if (viewMode === 'call') {
      if (d.callCount > 10) return '#f43f5e';
      if (d.callCount > 4) return '#f59e0b';
      return '#00f2fe';
    }
    
    if (viewMode === 'hierarchy') {
      return d.type === 'component' ? '#10b981' : '#8b5cf6';
    }

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

    const svgElement = d3.select(svgRef.current);
    svgElement.selectAll('*').remove();

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 500;

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
      const g = svgElement.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--text-muted)')
        .attr('font-size', '14px')
        .text('No matching elements found in this view mode.');
      return;
    }

    const drawMinimap = () => {
      const canvas = minimapCanvasRef.current;
      if (!canvas || !svgRef.current) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Radar sweeps
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(canvasWidth / 2, canvasHeight / 2, 20, 0, 2 * Math.PI);
      ctx.arc(canvasWidth / 2, canvasHeight / 2, 40, 0, 2 * Math.PI);
      ctx.stroke();

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      nodes.forEach((n: any) => {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      });

      if (minX === Infinity) { minX = -100; maxX = 100; minY = -100; maxY = 100; }
      
      const padding = 50;
      minX -= padding;
      maxX += padding;
      minY -= padding;
      maxY += padding;

      const boundsWidth = maxX - minX;
      const boundsHeight = maxY - minY;

      boundsRef.current = { minX, maxX, minY, maxY };

      const toCanvasX = (x: number) => ((x - minX) / boundsWidth) * canvasWidth;
      const toCanvasY = (y: number) => ((y - minY) / boundsHeight) * canvasHeight;

      nodes.forEach((n: any) => {
        const cx = toCanvasX(n.x);
        const cy = toCanvasY(n.y);
        const isActive = selectedNode === n.id || hoveredNode === n.id;
        ctx.fillStyle = isActive ? 'var(--color-secondary)' : 'var(--color-primary)';
        ctx.beginPath();
        ctx.arc(cx, cy, isActive ? 2.5 : 1.5, 0, 2 * Math.PI);
        ctx.fill();
      });

      const transform = d3.zoomTransform(svgRef.current);
      const vpLeft = (0 - transform.x) / transform.k;
      const vpTop = (0 - transform.y) / transform.k;
      const vpRight = (width - transform.x) / transform.k;
      const vpBottom = (height - transform.y) / transform.k;

      const rx = toCanvasX(vpLeft);
      const ry = toCanvasY(vpTop);
      const rw = toCanvasX(vpRight) - rx;
      const rh = toCanvasY(vpBottom) - ry;

      ctx.strokeStyle = 'var(--color-secondary)';
      ctx.lineWidth = 1.2;
      ctx.fillStyle = 'rgba(0, 242, 254, 0.05)';
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.fill();
      ctx.stroke();
    };

    drawMinimapRef.current = drawMinimap;

    const mainGroup = svgElement.append('g').attr('class', 'main-container');

    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => {
        mainGroup.attr('transform', event.transform);
        drawMinimap();
      });

    zoomBehaviorRef.current = zoomBehavior;

    svgElement.call(zoomBehavior);
    svgElement.call(zoomBehavior.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8));

    const simulation = d3.forceSimulation<any>(nodes)
      .force('link', d3.forceLink<any, any>(links).id((d) => d.id).distance(() => {
        if (viewMode === 'cluster') return 65;
        if (viewMode === 'hierarchy') return 70;
        return 100;
      }))
      .force('charge', d3.forceManyBody().strength(() => {
        if (viewMode === 'cluster') return -120;
        if (viewMode === 'hierarchy') return -160;
        return -220;
      }))
      .force('collision', d3.forceCollide<any>().radius((d) => {
        const baseRad = viewMode === 'call' ? 12 : (viewMode === 'hierarchy' ? 14 : 15);
        return baseRad + Math.sqrt(d.size || 0) * 0.05 + 5;
      }))
      .force('center', d3.forceCenter(0, 0));

    if (viewMode === 'hierarchy') {
      nodes.forEach((n) => {
        n.depth = hierarchicalLevels.get(n.id) || 0;
      });
      simulation.force('y', d3.forceY((d: any) => (d.depth || 0) * 120 - 150).strength(1.2));
      simulation.force('x', d3.forceX(0).strength(0.06));
    }

    if (viewMode === 'cluster') {
      const folderGroups = Array.from(new Set(nodes.map((n) => n.folder)));
      const clusterCenters = new Map<string, { x: number; y: number }>();
      folderGroups.forEach((folder, idx) => {
        const angle = (idx / folderGroups.length) * 2 * Math.PI;
        const radius = Math.min(width, height) * 0.35;
        clusterCenters.set(folder, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
      });
      simulation.force('folderGrouping', (alpha) => {
        nodes.forEach((node) => {
          const center = clusterCenters.get(node.folder);
          if (center) {
            node.vx += (center.x - node.x) * 0.08 * alpha;
            node.vy += (center.y - node.y) * 0.08 * alpha;
          }
        });
      });
    }

    if (viewMode === 'call') {
      const fileGroups = Array.from(new Set(nodes.map((n) => n.file)));
      const fileCenters = new Map<string, { x: number; y: number }>();
      fileGroups.forEach((file, idx) => {
        const angle = (idx / fileGroups.length) * 2 * Math.PI;
        const radius = Math.min(width, height) * 0.35;
        fileCenters.set(file, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
      });
      simulation.force('fileGrouping', (alpha) => {
        nodes.forEach((node) => {
          const center = fileCenters.get(node.file);
          if (center) {
            node.vx += (center.x - node.x) * 0.06 * alpha;
            node.vy += (center.y - node.y) * 0.06 * alpha;
          }
        });
      });
    }

    svgElement.append('defs').selectAll('marker')
      .data([
        { id: 'arrow-normal', color: 'rgba(255, 255, 255, 0.15)' },
        { id: 'arrow-highlight', color: 'var(--color-primary)' },
        { id: 'arrow-highlight-incoming', color: 'var(--color-secondary)' },
        { id: 'arrow-cycle', color: 'var(--color-alert)' }
      ])
      .enter().append('marker')
      .attr('id', (d) => d.id)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', () => (viewMode === 'call' ? 16 : (viewMode === 'hierarchy' ? 18 : 22)))
      .attr('refY', 0)
      .attr('markerWidth', 5.5)
      .attr('markerHeight', 5.5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', (d) => d.color);

    const hullGroup = mainGroup.append('g').attr('class', 'hulls-container');
    const hullColors = ['#8b5cf6', '#00f2fe', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#14b8a6', '#f43f5e', '#a855f7', '#6366f1'];
    const hullNodesGroup = new Map<string, any[]>();
    nodes.forEach((n) => {
      const key = viewMode === 'cluster' ? n.folder : (viewMode === 'call' ? n.file : null);
      if (!key) return;
      if (!hullNodesGroup.has(key)) hullNodesGroup.set(key, []);
      hullNodesGroup.get(key)!.push(n);
    });

    const hullDataList = Array.from(hullNodesGroup.entries()).filter(([_, members]) => members.length > 0);
    const hulls = hullGroup.selectAll('.hull-boundary')
      .data(hullDataList)
      .enter()
      .append('path')
      .attr('class', 'hull-boundary')
      .attr('fill', (_, i) => hullColors[i % hullColors.length])
      .attr('stroke', (_, i) => hullColors[i % hullColors.length])
      .attr('stroke-opacity', 0.25)
      .style('opacity', (viewMode === 'cluster' || viewMode === 'call') ? 1.0 : 0);

    const hullLabels = hullGroup.selectAll('.hull-label')
      .data(hullDataList)
      .enter()
      .append('text')
      .attr('class', 'hull-label')
      .text(([key]) => key.split('/').pop() || key)
      .style('opacity', (viewMode === 'cluster' || viewMode === 'call') ? 0.6 : 0);

    const updateHulls = () => {
      hulls.each(function ([_, members]: any) {
        const points: [number, number][] = [];
        members.forEach((node: any) => {
          const r = viewMode === 'call' ? 18 : 28;
          for (let a = 0; a < 2 * Math.PI; a += Math.PI / 4) {
            points.push([node.x + r * Math.cos(a), node.y + r * Math.sin(a)]);
          }
        });
        const hull = d3.polygonHull(points);
        if (!hull) { d3.select(this).attr('d', null); return; }
        const lineGenerator = d3.line().curve(d3.curveCatmullRomClosed);
        d3.select(this).attr('d', lineGenerator(hull));
      });
      hullLabels
        .attr('x', ([_, members]: any) => d3.mean(members, (m: any) => m.x) || 0)
        .attr('y', ([_, members]: any) => {
          const minY = d3.min(members, (m: any) => m.y) as any;
          const yVal = minY !== undefined ? minY : 0;
          const pad = viewMode === 'call' ? 22 : 36;
          return yVal - pad;
        });
    };

    const link = mainGroup.append('g').selectAll('line').data(links).enter().append('line')
      .attr('class', 'link-element').attr('stroke', 'rgba(255, 255, 255, 0.08)').attr('stroke-width', 1.5).attr('marker-end', 'url(#arrow-normal)');

    const node = mainGroup.append('g').selectAll('.node-element').data(nodes).enter().append('g').attr('class', 'node-element')
      .on('click', (event, d) => { event.stopPropagation(); setSelectedNode(d.id); })
      .on('mouseenter', (_, d) => setHoveredNode(d.id))
      .on('mouseleave', () => setHoveredNode(null))
      .call(d3.drag<any, any>().on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

    node.append('circle')
      .attr('r', (d) => {
        if (viewMode === 'call') return 8 + Math.min(d.callCount * 1.5, 20);
        const baseSize = viewMode === 'hierarchy' ? 9 : 8;
        return baseSize + Math.min(Math.sqrt(d.size || 0) * 0.04, 30);
      })
      .attr('fill', getColorForNode).attr('stroke', 'rgba(0,0,0,0.5)').attr('stroke-width', 1.5);

    node.append('text').attr('class', 'node-label').attr('dx', 14).attr('dy', 4).text((d) => d.name);

    simulation.on('tick', () => {
      link.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y).attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
      node.attr('transform', (d) => `translate(${d.x}, ${d.y})`);
      if (viewMode === 'cluster' || viewMode === 'call') updateHulls();
      drawMinimap();
    });

    (window as any).graphZoom = {
      zoomIn: () => svgElement.transition().duration(300).call(zoomBehavior.scaleBy, 1.3),
      zoomOut: () => svgElement.transition().duration(300).call(zoomBehavior.scaleBy, 0.7),
      reset: () => svgElement.transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8)),
    };

    drawMinimap();

    return () => { simulation.stop(); };
  }, [graphData, viewMode, hierarchicalLevels]);

  useEffect(() => {
    if (!svgRef.current) return;
    const activeId = hoveredNode || selectedNode;
    const query = searchQuery ? searchQuery.toLowerCase().trim() : '';
    const svgElement = d3.select(svgRef.current);
    const nodesG = svgElement.selectAll('.node-element');
    const linksLine = svgElement.selectAll('.link-element');
    const hullsBoundary = svgElement.selectAll('.hull-boundary');

    const getLinkId = (l: any) => ({
      sId: typeof l.source === 'object' ? l.source.id : l.source,
      tId: typeof l.target === 'object' ? l.target.id : l.target
    });

    if (activeId) {
      const neighbors = new Set<string>([activeId]);
      let filteredLinks: any[] = viewMode === 'dependency' || viewMode === 'cluster' ? graphData.links : (viewMode === 'call' ? graphData.callLinks : graphData.classLinks);
      filteredLinks.forEach((link: any) => {
        const { sId, tId } = getLinkId(link);
        if (sId === activeId) neighbors.add(tId);
        if (tId === activeId) neighbors.add(sId);
      });
      nodesG.style('opacity', (d: any) => neighbors.has(d.id) ? 1.0 : 0.15);
      nodesG.select('text').style('fill', (d: any) => d.id === activeId ? '#fff' : 'var(--text-secondary)').style('font-weight', (d: any) => d.id === activeId ? '700' : '500');
      linksLine.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        const line = d3.select(this);
        const isCyclic = viewMode === 'dependency' && cyclicLinks.has(`${sId}->${tId}`);
        if (sId === activeId) line.attr('class', 'link-element flow-out').style('stroke-opacity', 0.95).attr('marker-end', 'url(#arrow-highlight)');
        else if (tId === activeId) line.attr('class', 'link-element flow-in').style('stroke-opacity', 0.95).attr('marker-end', 'url(#arrow-highlight-incoming)');
        else line.attr('class', isCyclic ? 'link-element flow-cycle' : 'link-element').style('stroke-opacity', 0.03).style('stroke', isCyclic ? 'var(--color-alert)' : 'rgba(255, 255, 255, 0.08)').attr('marker-end', isCyclic ? 'url(#arrow-cycle)' : 'url(#arrow-normal)');
      });
      hullsBoundary.style('fill-opacity', 0.01).style('stroke-opacity', 0.1);
    } else if (query) {
      const matches = new Set<string>();
      nodesG.each((d: any) => { if ((d.name && d.name.toLowerCase().includes(query)) || (d.id && d.id.toLowerCase().includes(query))) matches.add(d.id); });
      nodesG.style('opacity', (d: any) => matches.has(d.id) ? 1.0 : 0.15);
      nodesG.select('text').style('fill', (d: any) => matches.has(d.id) ? '#fff' : 'var(--text-secondary)').style('font-weight', (d: any) => matches.has(d.id) ? '600' : '500');
      linksLine.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        const isCyclic = viewMode === 'dependency' && cyclicLinks.has(`${sId}->${tId}`);
        const isMatch = matches.has(sId) || matches.has(tId);
        d3.select(this).attr('class', isCyclic ? 'link-element flow-cycle' : 'link-element').style('stroke-opacity', isMatch ? 0.7 : 0.03).style('stroke', isCyclic ? 'var(--color-alert)' : 'rgba(255, 255, 255, 0.08)').attr('marker-end', isCyclic ? 'url(#arrow-cycle)' : 'url(#arrow-normal)');
      });
      hullsBoundary.style('fill-opacity', 0.01).style('stroke-opacity', 0.1);
    } else {
      nodesG.style('opacity', 1.0);
      nodesG.select('text').style('fill', 'var(--text-secondary)').style('font-weight', '500');
      linksLine.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        const isCyclic = viewMode === 'dependency' && cyclicLinks.has(`${sId}->${tId}`);
        d3.select(this).attr('class', isCyclic ? 'link-element flow-cycle' : 'link-element').style('stroke-opacity', isCyclic ? 0.6 : 0.2).style('stroke', isCyclic ? 'var(--color-alert)' : 'rgba(255, 255, 255, 0.08)').attr('marker-end', isCyclic ? 'url(#arrow-cycle)' : 'url(#arrow-normal)');
      });
      hullsBoundary.style('fill-opacity', 0.04).style('stroke-opacity', 0.4);
    }

    if (drawMinimapRef.current) {
      drawMinimapRef.current();
    }
  }, [hoveredNode, selectedNode, graphData, viewMode, searchQuery, cyclicLinks]);

  return (
    <div ref={containerRef} className="graph-viewport" onClick={() => setSelectedNode(null)}>
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

      {/* Radar HUD Minimap */}
      <div className="minimap-hud" onClick={(e) => e.stopPropagation()}>
        <div className="minimap-header">
          <span className="minimap-title">RADAR NAVIGATION HUD</span>
          <div className="radar-status-dot"></div>
        </div>
        <canvas
          ref={minimapCanvasRef}
          width={158}
          height={98}
          className="minimap-canvas"
          onClick={handleMinimapClick}
        />
      </div>
    </div>
  );
};
