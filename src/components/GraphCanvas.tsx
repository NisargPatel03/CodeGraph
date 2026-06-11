import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import { ZoomIn, ZoomOut, RotateCcw, ChevronUp, ChevronDown, Maximize2, Minimize2 } from 'lucide-react';
import type { CodebaseGraph } from '../utils/codeAnalyzer';

interface GraphCanvasProps {
  graphData: CodebaseGraph;
  selectedNode: string | null;
  setSelectedNode: (id: string | null) => void;
  viewMode: 'dependency' | 'cluster' | 'call' | 'hierarchy';
  searchQuery: string;
  collapsedFolders: Set<string>;
  setCollapsedFolders: React.Dispatch<React.SetStateAction<Set<string>>>;
  activeTraceNodeId: string | null;
  setActiveTraceNodeId: (id: string | null) => void;
  depthFilter: number;
  setDepthFilter: (depth: number) => void;
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  graphData,
  selectedNode,
  setSelectedNode,
  viewMode,
  searchQuery,
  collapsedFolders,
  setCollapsedFolders,
  activeTraceNodeId,
  setActiveTraceNodeId,
  depthFilter,
  setDepthFilter,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const boundsRef = useRef({ minX: -100, maxX: 100, minY: -100, maxY: 100 });
  const zoomBehaviorRef = useRef<any>(null);
  const drawMinimapRef = useRef<(() => void) | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredCluster, setHoveredCluster] = useState<{
    folder: string;
    fileCount: number;
    connectionsCount: number;
  } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Component Tree States
  const [treeLayoutStyle, setTreeLayoutStyle] = useState<'top-down' | 'radial'>('top-down');
  const [hoveredComponentDetails, setHoveredComponentDetails] = useState<any | null>(null);

  // Advanced features states
  const [showNpmPackages, setShowNpmPackages] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState<'none' | 'churn' | 'complexity'>('none');
  const [pathSource, setPathSource] = useState<string | null>(null);
  const [pathTarget, setPathTarget] = useState<string | null>(null);
  const [isToolboxCollapsed, setIsToolboxCollapsed] = useState(false);
  const [isMinimapExpanded, setIsMinimapExpanded] = useState(false);
  const [currentTraceStep, setCurrentTraceStep] = useState(0);


  const traceSteps = useMemo(() => {
    if (!activeTraceNodeId || viewMode !== 'call') return [];
    
    const steps: { source: string; target: string }[] = [];
    const visited = new Set<string>([activeTraceNodeId]);
    const queue: string[] = [activeTraceNodeId];
    let depth = 0;
    
    while (queue.length > 0 && depth < 3) {
      const nextLevel: string[] = [];
      for (const curr of queue) {
        const outgoing = graphData.callLinks.filter(l => {
          const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
          return s === curr;
        });
        
        for (const link of outgoing) {
          const sId = typeof link.source === 'object' ? (link.source as any).id : link.source;
          const tId = typeof link.target === 'object' ? (link.target as any).id : link.target;
          
          if (!visited.has(tId)) {
            visited.add(tId);
            nextLevel.push(tId);
            steps.push({ source: sId, target: tId });
          }
        }
      }
      queue.push(...nextLevel);
      queue.splice(0, queue.length - nextLevel.length);
      depth++;
    }
    
    return steps;
  }, [activeTraceNodeId, graphData.callLinks, viewMode]);

  useEffect(() => {
    if (traceSteps.length === 0) {
      setCurrentTraceStep(0);
      return;
    }
    setCurrentTraceStep(0);
    const interval = setInterval(() => {
      setCurrentTraceStep(prev => (prev + 1) % traceSteps.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [traceSteps]);

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

  // Pre-calculate node in-degree counts for importance-based sizing
  const inDegreeMap = useMemo(() => {
    const map = new Map<string, number>();
    
    graphData.nodes.forEach(n => map.set(n.id, 0));
    if (graphData.npmNodes) {
      graphData.npmNodes.forEach(n => map.set(n.id, 0));
    }
    if (graphData.callNodes) {
      graphData.callNodes.forEach(n => map.set(n.id, 0));
    }
    if (graphData.classNodes) {
      graphData.classNodes.forEach(n => map.set(n.id, 0));
    }
    
    const links = [
      ...graphData.links,
      ...(graphData.npmLinks || []),
      ...(graphData.callLinks || []),
      ...(graphData.classLinks || [])
    ];
    
    links.forEach(l => {
      const targetId = typeof l.target === 'object' ? (l.target as any).id : l.target;
      if (map.has(targetId)) {
        map.set(targetId, map.get(targetId)! + 1);
      }
    });
    
    return map;
  }, [graphData]);

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
  const isFunctionUnused = (d: any) => {
    if (viewMode !== 'call') return false;
    const name = d.name || '';
    const isEntry = name.startsWith('use') || name.startsWith('App') || name.startsWith('Main') || name === 'main' || name === 'index' || /^[A-Z]/.test(name);
    return d.callCount === 0 && !isEntry;
  };

  const applyLevelOfDetail = (k: number) => {
    if (!svgRef.current) return;
    const svgElement = d3.select(svgRef.current);
    svgElement.selectAll('.node-element').each(function(d: any) {
      if (!d) return;
      const node = d3.select(this);
      const label = node.select('.node-label');
      
      let shouldShowLabel = true;
      if (viewMode === 'call') {
        if (k < 0.6) {
          shouldShowLabel = d.id === selectedNode || d.id === hoveredNode || d.callCount >= 4;
        } else if (k < 1.1) {
          shouldShowLabel = !isFunctionUnused(d) || d.id === selectedNode || d.id === hoveredNode;
        }
      } else {
        if (k < 0.6) {
          shouldShowLabel = d.isFolder || d.id === selectedNode || d.id === hoveredNode || (d.size && d.size > 20000);
        }
      }
      label.style('display', shouldShowLabel ? 'block' : 'none');
    });
  };

  const getColorForNode = (d: any) => {
    if (viewMode === 'call') {
      if (isFunctionUnused(d)) return '#6b7280'; // Unused: Gray
      if (d.callCount >= 8) return '#ef4444'; // Hot (Red)
      if (d.callCount >= 4) return '#f97316'; // Warm (Orange)
      if (d.callCount >= 2) return '#eab308'; // Lukewarm (Yellow)
      return '#3b82f6'; // Cold (Blue)
    }
    
    if (viewMode === 'hierarchy') {
      const depth = d.treeDepth || 0;
      const depthColors = [
        '#6366f1', // Indigo (Root)
        '#00f2fe', // Cyan (Level 1)
        '#10b981', // Emerald (Level 2)
        '#f59e0b', // Amber (Level 3)
        '#ec4899', // Pink (Level 4)
        '#a855f7', // Purple (Level 5+)
      ];
      return depthColors[depth % depthColors.length];
    }

    // Folders
    if (d.isFolder) {
      return 'var(--color-warning)';
    }

    // NPM packages
    if (d.isNpm || d.language === 'npm') {
      return 'var(--color-primary-glow)';
    }

    const lang = d.language?.toLowerCase() || '';
    switch (lang) {
      case 'typescript': return 'var(--color-primary)';
      case 'javascript': return 'var(--color-secondary)';
      case 'python': return 'var(--color-primary-glow)';
      case 'go': return 'var(--color-secondary-glow)';
      case 'rust': return 'var(--color-alert)';
      case 'css': return 'var(--text-secondary)';
      case 'html': return 'var(--color-warning)';
      case 'json': return 'var(--text-muted)';
      default: return 'var(--color-primary)';
    }
  };

  const shortestPath = useMemo(() => {
    if (!pathSource || !pathTarget || viewMode !== 'dependency') return null;
    
    const activeNodes = showNpmPackages ? [...graphData.nodes, ...(graphData.npmNodes || [])] : graphData.nodes;
    const activeLinks = showNpmPackages ? [...graphData.links, ...(graphData.npmLinks || [])] : graphData.links;
    
    const adj = new Map<string, string[]>();
    activeNodes.forEach(n => adj.set(n.id, []));
    activeLinks.forEach(l => {
      const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
      if (adj.has(s)) adj.get(s)!.push(t);
    });
    
    const queue: string[][] = [[pathSource]];
    const visited = new Set<string>([pathSource]);
    
    while (queue.length > 0) {
      const path = queue.shift()!;
      const lastNode = path[path.length - 1];
      
      if (lastNode === pathTarget) return path;
      
      const neighbors = adj.get(lastNode) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
    }
    return null;
  }, [pathSource, pathTarget, graphData, viewMode, showNpmPackages]);

  const getHeatmapColor = (d: any) => {
    if (d.isNpm) return 'var(--color-primary-glow)';
    
    const colorScale = d3.scaleLinear<string>()
      .domain([0, 0.5, 1])
      .range(['#3b82f6', '#f59e0b', '#ef4444']);
      
    if (heatmapMode === 'churn') {
      const churn = d.churn || 1;
      const ratio = Math.min(Math.max((churn - 5) / 50, 0), 1);
      return colorScale(ratio);
    } else if (heatmapMode === 'complexity') {
      const complexity = d.complexity || 1;
      const ratio = Math.min(Math.max(Math.log10(complexity) / 3, 0), 1);
      return colorScale(ratio);
    }
    return getColorForNode(d);
  };

  const allFolders = useMemo(() => {
    const folders = new Set<string>();
    graphData.nodes.forEach(n => {
      if (n.folder) folders.add(n.folder);
    });
    return Array.from(folders).sort();
  }, [graphData.nodes]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svgElement = d3.select(svgRef.current);
    svgElement.selectAll('*').remove();

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 500;

    let nodes: any[] = [];
    let links: any[] = [];

    if (viewMode === 'dependency' || viewMode === 'cluster') {
      let activeNodes: any[] = [];
      let activeLinks: any[] = [];

      if (showNpmPackages && viewMode === 'dependency') {
        activeNodes = [...graphData.nodes.map((n) => ({ ...n })), ...(graphData.npmNodes || []).map((n) => ({ ...n }))];
        activeLinks = [...graphData.links.map((l) => ({ ...l })), ...(graphData.npmLinks || []).map((l) => ({ ...l }))];
      } else {
        activeNodes = graphData.nodes.map((n) => ({ ...n }));
        activeLinks = graphData.links.map((l) => ({ ...l }));
      }

      const getCollapsedAncestor = (nodeFolder: string): string | null => {
        if (!nodeFolder) return null;
        const sortedCollapsed = Array.from(collapsedFolders).sort((a, b) => a.length - b.length);
        for (const folder of sortedCollapsed) {
          if (nodeFolder === folder || nodeFolder.startsWith(folder + '/')) {
            return folder;
          }
        }
        return null;
      };

      const folderCoupling = new Map<string, number>();
      activeLinks.forEach(link => {
        const sId = typeof link.source === 'object' ? link.source.id : link.source;
        const tId = typeof link.target === 'object' ? link.target.id : link.target;
        const sNode = activeNodes.find(n => n.id === sId);
        const tNode = activeNodes.find(n => n.id === tId);
        if (sNode && tNode && sNode.folder && tNode.folder && sNode.folder !== tNode.folder) {
          const key = `${sNode.folder}->${tNode.folder}`;
          folderCoupling.set(key, (folderCoupling.get(key) || 0) + 1);
        }
      });

      const collapsedFolderNodes = new Map<string, any>();
      activeNodes.forEach(node => {
        const ancestor = getCollapsedAncestor(node.folder);
        if (ancestor) {
          if (!collapsedFolderNodes.has(ancestor)) {
            collapsedFolderNodes.set(ancestor, {
              id: `folder:${ancestor}`,
              name: ancestor.split('/').pop() || ancestor,
              folder: ancestor,
              isFolder: true,
              size: 0,
              language: 'folder',
              churn: 0,
              complexity: 0,
              fileCount: 0,
              x: 0,
              y: 0,
              sumX: 0,
              sumY: 0
            });
          }
          const fNode = collapsedFolderNodes.get(ancestor)!;
          fNode.size += node.size || 0;
          fNode.churn = Math.max(fNode.churn, node.churn || 0);
          fNode.complexity += node.complexity || 0;
          fNode.fileCount += 1;
          if (node.x !== undefined) {
            fNode.sumX += node.x;
            fNode.sumY += node.y;
            fNode.x = fNode.sumX / fNode.fileCount;
            fNode.y = fNode.sumY / fNode.fileCount;
          }
        }
      });

      const visibleFileNodes = activeNodes.filter(n => !getCollapsedAncestor(n.folder));
      const visibleFolderNodes = Array.from(collapsedFolderNodes.values());
      visibleFolderNodes.forEach(fNode => {
        delete fNode.sumX;
        delete fNode.sumY;
      });
      nodes = [...visibleFileNodes, ...visibleFolderNodes];

      const aggregatedLinks = new Map<string, any>();
      activeLinks.forEach(link => {
        const sId = typeof link.source === 'object' ? link.source.id : link.source;
        const tId = typeof link.target === 'object' ? link.target.id : link.target;

        const sNode = activeNodes.find(n => n.id === sId);
        const tNode = activeNodes.find(n => n.id === tId);
        if (!sNode || !tNode) return;

        const sAncestor = getCollapsedAncestor(sNode.folder);
        const tAncestor = getCollapsedAncestor(tNode.folder);

        const finalSourceId = sAncestor ? `folder:${sAncestor}` : sId;
        const finalTargetId = tAncestor ? `folder:${tAncestor}` : tId;

        if (finalSourceId === finalTargetId) return;

        const key = `${finalSourceId}->${finalTargetId}`;
        if (!aggregatedLinks.has(key)) {
          aggregatedLinks.set(key, {
            source: finalSourceId,
            target: finalTargetId,
            weight: 0,
            isAggregated: !!(sAncestor || tAncestor),
            isCrossFolder: false,
            coupling: 1
          });
        }
        aggregatedLinks.get(key)!.weight += 1;
      });

      aggregatedLinks.forEach(link => {
        if (!link.isAggregated) {
          const sNode = nodes.find(n => n.id === link.source);
          const tNode = nodes.find(n => n.id === link.target);
          if (sNode && tNode && sNode.folder && tNode.folder && sNode.folder !== tNode.folder) {
            link.isCrossFolder = true;
            link.coupling = folderCoupling.get(`${sNode.folder}->${tNode.folder}`) || 1;
          }
        }
      });

      links = Array.from(aggregatedLinks.values());
    } else if (viewMode === 'call') {
      let activeNodes = graphData.callNodes.map((n) => ({ ...n }));
      let activeLinks = graphData.callLinks.map((l) => ({ ...l }));

      // If a depth filter is active and a node is selected, prune the graph
      if (depthFilter !== -1 && selectedNode) {
        const startNode = activeNodes.find(n => n.id === selectedNode);
        if (startNode) {
          const visited = new Set<string>([selectedNode]);
          const distance = new Map<string, number>([[selectedNode, 0]]);
          const queue: string[] = [selectedNode];

          // Build adjacency list for both directions (caller and callee)
          const adj = new Map<string, string[]>();
          activeNodes.forEach(n => adj.set(n.id, []));
          activeLinks.forEach(l => {
            const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
            const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
            if (adj.has(s)) adj.get(s)!.push(t);
            if (adj.has(t)) adj.get(t)!.push(s); // bidirectional search for context
          });

          while (queue.length > 0) {
            const curr = queue.shift()!;
            const dist = distance.get(curr) || 0;
            if (dist < depthFilter) {
              const neighbors = adj.get(curr) || [];
              for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                  visited.add(neighbor);
                  distance.set(neighbor, dist + 1);
                  queue.push(neighbor);
                }
              }
            }
          }

          // Filter nodes and links
          activeNodes = activeNodes.filter(n => visited.has(n.id));
          activeLinks = activeLinks.filter(l => {
            const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
            const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
            return visited.has(s) && visited.has(t);
          });
        }
      }

      nodes = activeNodes;
      links = activeLinks;
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

      // 1. Grid Density Mapping
      const gridCols = 8;
      const gridRows = 8;
      const grid = Array(gridRows).fill(0).map(() => Array(gridCols).fill(0));
      
      nodes.forEach((n: any) => {
        if (typeof n.x === 'number' && typeof n.y === 'number') {
          const cx = toCanvasX(n.x);
          const cy = toCanvasY(n.y);
          const col = Math.max(0, Math.min(gridCols - 1, Math.floor((cx / canvasWidth) * gridCols)));
          const row = Math.max(0, Math.min(gridRows - 1, Math.floor((cy / canvasHeight) * gridRows)));
          grid[row][col]++;
        }
      });

      let maxDensity = 1;
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          if (grid[r][c] > maxDensity) maxDensity = grid[r][c];
        }
      }

      // 2. Draw Density Heat Gradients
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          const count = grid[r][c];
          if (count > 0) {
            const centerX = ((c + 0.5) / gridCols) * canvasWidth;
            const centerY = ((r + 0.5) / gridRows) * canvasHeight;
            const intensity = count / maxDensity;
            const radius = Math.min(canvasWidth / gridCols, canvasHeight / gridRows) * 1.5;

            const gradient = ctx.createRadialGradient(centerX, centerY, 2, centerX, centerY, radius);
            gradient.addColorStop(0, `rgba(0, 242, 254, ${0.22 * intensity})`);
            gradient.addColorStop(0.5, `rgba(99, 102, 241, ${0.1 * intensity})`);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }

      // 3. Draw Nodes
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
        applyLevelOfDetail(event.transform.k);
        drawMinimap();
      });

    zoomBehaviorRef.current = zoomBehavior;

    svgElement.call(zoomBehavior).on('dblclick.zoom', null);
    svgElement.call(zoomBehavior.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8));
    applyLevelOfDetail(0.8);

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
        if (d.isFolder) return 24;
        if (viewMode === 'call') return 12 + Math.min(d.callCount * 1.5, 20);
        if (viewMode === 'dependency') {
          const inDeg = inDegreeMap.get(d.id) || 0;
          return 12 + Math.min(inDeg * 2.0, 24);
        }
        const baseRad = viewMode === 'hierarchy' ? 14 : 15;
        return baseRad + Math.sqrt(d.size || 0) * 0.05 + 5;
      }))
      .force('center', d3.forceCenter(0, 0));

    if (viewMode === 'hierarchy') {
      // Build parent-child tree hierarchy
      const childrenMap = new Map<string, string[]>();
      nodes.forEach(n => childrenMap.set(n.id, []));
      links.forEach(l => {
        const parent = typeof l.source === 'object' ? l.source.id : l.source;
        const child = typeof l.target === 'object' ? l.target.id : l.target;
        if (childrenMap.has(parent)) {
          childrenMap.get(parent)!.push(child);
        }
      });

      // Find nodes that have no parents (roots)
      const childSet = new Set<string>();
      links.forEach(l => {
        const child = typeof l.target === 'object' ? l.target.id : l.target;
        childSet.add(child);
      });
      const roots = nodes.filter(n => !childSet.has(n.id));

      // Build tree hierarchy
      interface HierarchicalNode {
        id: string;
        name: string;
        data: any;
        children?: HierarchicalNode[];
      }

      const buildHierarchy = (nodeId: string, visited = new Set<string>()): HierarchicalNode => {
        visited.add(nodeId);
        const nodeData = nodes.find(n => n.id === nodeId);
        const childrenIds = childrenMap.get(nodeId) || [];
        const children: HierarchicalNode[] = [];
        childrenIds.forEach(cId => {
          if (!visited.has(cId)) {
            children.push(buildHierarchy(cId, visited));
          }
        });
        return {
          id: nodeId,
          name: nodeData?.name || nodeId,
          data: nodeData,
          children: children.length > 0 ? children : undefined
        };
      };

      let rootHierarchy: HierarchicalNode;
      if (roots.length === 1) {
        rootHierarchy = buildHierarchy(roots[0].id);
      } else if (roots.length > 1) {
        rootHierarchy = {
          id: 'virtual-root',
          name: 'Virtual Root',
          data: { id: 'virtual-root', name: 'Virtual Root', type: 'component', isVirtual: true },
          children: roots.map(r => buildHierarchy(r.id))
        };
      } else if (nodes.length > 0) {
        rootHierarchy = buildHierarchy(nodes[0].id);
      } else {
        rootHierarchy = { id: 'empty', name: 'Empty', data: null };
      }

      const rootNode = d3.hierarchy<HierarchicalNode>(rootHierarchy);
      const treeLayout = d3.tree<HierarchicalNode>();

      if (treeLayoutStyle === 'radial') {
        treeLayout.size([2 * Math.PI, 240]); 
        treeLayout(rootNode);

        rootNode.descendants().forEach(d => {
          const angle = d.x;
          const radius = d.y;
          if (angle !== undefined && radius !== undefined) {
            const targetNode = nodes.find(n => n.id === d.data.id);
            if (targetNode) {
              targetNode.x = radius * Math.cos(angle - Math.PI / 2);
              targetNode.y = radius * Math.sin(angle - Math.PI / 2);
              targetNode.treeDepth = d.depth;
              targetNode.fx = targetNode.x;
              targetNode.fy = targetNode.y;
            }
          }
        });
      } else {
        treeLayout.nodeSize([160, 150]);
        treeLayout(rootNode);

        rootNode.descendants().forEach(d => {
          if (d.x !== undefined && d.y !== undefined) {
            const targetNode = nodes.find(n => n.id === d.data.id);
            if (targetNode) {
              const yOffset = rootHierarchy.id === 'virtual-root' ? -150 : 0;
              targetNode.x = d.x;
              targetNode.y = d.y + yOffset - 150;
              targetNode.treeDepth = d.depth;
              targetNode.fx = targetNode.x;
              targetNode.fy = targetNode.y;
            }
          }
        });
      }

      // Ensure any virtual-root node coordinates are handled if referenced by links
      const virtualNode = nodes.find(n => n.id === 'virtual-root');
      if (virtualNode) {
        virtualNode.x = 0;
        virtualNode.y = -150;
        virtualNode.treeDepth = 0;
        virtualNode.fx = 0;
        virtualNode.fy = -150;
      }
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

    const hullDataList = Array.from(hullNodesGroup.entries())
      .filter(([key, members]) => members.length > 0 && !collapsedFolders.has(key));

    const hullWatermarks = hullGroup.selectAll('.hull-watermark')
      .data(hullDataList)
      .enter()
      .append('text')
      .attr('class', 'hull-watermark')
      .text(([key]) => key.split('/').pop() || key)
      .style('display', viewMode === 'cluster' ? 'block' : 'none');

    const handleHullMouseEnter = (_: any, [folderPath, members]: any) => {
      if (viewMode !== 'cluster') return;
      const memberIds = new Set(members.map((m: any) => m.id));
      let connectionsCount = 0;
      graphData.links.forEach((l: any) => {
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        const sIn = memberIds.has(sId);
        const tIn = memberIds.has(tId);
        if ((sIn && !tIn) || (!sIn && tIn)) {
          connectionsCount++;
        }
      });
      setHoveredCluster({
        folder: folderPath,
        fileCount: members.length,
        connectionsCount,
      });
    };

    const handleHullMouseLeave = () => {
      setHoveredCluster(null);
    };

    const handleHullClick = (event: any, [folderPath]: any) => {
      event.stopPropagation();
      setCollapsedFolders((prev) => {
        const next = new Set(prev);
        if (next.has(folderPath)) {
          next.delete(folderPath);
        } else {
          next.add(folderPath);
        }
        return next;
      });
    };

    const hulls = hullGroup.selectAll('.hull-boundary')
      .data(hullDataList)
      .enter()
      .append('path')
      .attr('class', 'hull-boundary')
      .attr('fill', (_, i) => hullColors[i % hullColors.length])
      .attr('stroke', (_, i) => hullColors[i % hullColors.length])
      .attr('stroke-opacity', 0.25)
      .style('opacity', (viewMode === 'cluster' || viewMode === 'call') ? 1.0 : 0)
      .on('click', handleHullClick)
      .on('mouseenter', handleHullMouseEnter)
      .on('mouseleave', handleHullMouseLeave);

    const hullLabels = hullGroup.selectAll('.hull-label')
      .data(hullDataList)
      .enter()
      .append('text')
      .attr('class', 'hull-label')
      .text(([key]) => key.split('/').pop() || key)
      .style('opacity', (viewMode === 'cluster' || viewMode === 'call') ? 0.6 : 0)
      .on('click', handleHullClick)
      .on('mouseenter', handleHullMouseEnter)
      .on('mouseleave', handleHullMouseLeave);

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
      hullWatermarks
        .attr('x', ([_, members]: any) => d3.mean(members, (m: any) => m.x) || 0)
        .attr('y', ([_, members]: any) => d3.mean(members, (m: any) => m.y) || 0);
    };

    const pipeline = mainGroup.append('g').selectAll('.pipeline-element')
      .data(links.filter((l: any) => l.isAggregated || l.isCrossFolder))
      .enter()
      .append('line')
      .attr('class', 'pipeline-element')
      .attr('stroke', 'var(--color-secondary-glow)')
      .attr('stroke-opacity', 0.18)
      .attr('stroke-width', (d: any) => d.isAggregated ? 5 + Math.min(d.weight * 2.5, 18) : 5 + Math.min(d.coupling * 2.0, 14))
      .style('filter', 'drop-shadow(0 0 5px var(--color-secondary))');

    const link = mainGroup.append('g').selectAll('.link-element')
      .data(links)
      .enter()
      .append('line')
      .attr('class', () => {
        let cls = 'link-element';
        if (viewMode === 'dependency') cls += ' flowing';
        if (viewMode === 'hierarchy') cls += ' props-flow';
        return cls;
      })
      .attr('stroke', 'var(--link-stroke)')
      .attr('stroke-width', (d: any) => {
        if (viewMode === 'dependency' && d.weight !== undefined) {
          return 1.0 + Math.min(d.weight * 0.5, 6.0);
        }
        return d.isAggregated ? 1.5 + Math.min(d.weight * 0.4, 4) : 1.5;
      })
      .attr('marker-end', 'url(#arrow-normal)');

    const node = mainGroup.append('g').selectAll('.node-element').data(nodes).enter().append('g').attr('class', 'node-element')
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNode(d.id);
        if (d.isFolder) {
          setCollapsedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(d.folder)) {
              next.delete(d.folder);
            } else {
              next.add(d.folder);
            }
            return next;
          });
        }
      })
      .on('dblclick', (event, d) => {
        if (d.isFolder) {
          event.stopPropagation();
          setCollapsedFolders((prev) => {
            const next = new Set(prev);
            next.delete(d.folder);
            return next;
          });
        } else {
          event.stopPropagation();
          svgElement.transition().duration(750).call(
            zoomBehavior.transform,
            d3.zoomIdentity.translate(width / 2 - d.x * 1.6, height / 2 - d.y * 1.6).scale(1.6)
          );
        }
      })
      .on('mouseenter', (_, d) => {
        setHoveredNode(d.id);
        if (viewMode === 'cluster' && d.folder) {
          const folderMembers = nodes.filter((n: any) => n.folder === d.folder);
          const memberIds = new Set(folderMembers.map((m: any) => m.id));
          let connectionsCount = 0;
          links.forEach((l: any) => {
            const sId = typeof l.source === 'object' ? l.source.id : l.source;
            const tId = typeof l.target === 'object' ? l.target.id : l.target;
            const sIn = memberIds.has(sId);
            const tIn = memberIds.has(tId);
            if ((sIn && !tIn) || (!sIn && tIn)) {
              connectionsCount++;
            }
          });
          setHoveredCluster({
            folder: d.folder,
            fileCount: folderMembers.length,
            connectionsCount,
          });
        }
        if (viewMode === 'hierarchy') {
          setHoveredComponentDetails(d);
        }
      })
      .on('mouseleave', () => {
        setHoveredNode(null);
        setHoveredCluster(null);
        setHoveredComponentDetails(null);
      })
      .call(d3.drag<any, any>().on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

    node.each(function (d: any) {
      const element = d3.select(this);
      if (d.isFolder) {
        element.append('path')
          .attr('d', 'M-12,-8 H-4 L-1,-5 H12 V8 H-12 Z')
          .attr('class', 'folder-node')
          .attr('transform', 'scale(1.2)');
      } else if (d.isNpm) {
        element.append('polygon')
          .attr('points', '0,-12 10.4,-6 10.4,6 0,12 -10.4,6 -10.4,-6')
          .attr('fill', 'var(--color-primary-glow)')
          .attr('stroke', 'var(--color-primary)')
          .attr('stroke-width', 1.5)
          .attr('class', 'npm-node');
      } else {
        const circle = element.append('circle')
          .attr('r', (d: any) => {
            if (viewMode === 'call') return 8 + Math.min(d.callCount * 1.5, 20);
            if (viewMode === 'dependency') {
              const inDeg = inDegreeMap.get(d.id) || 0;
              return 8 + Math.min(inDeg * 2.0, 24);
            }
            const baseSize = viewMode === 'hierarchy' ? 9 : 8;
            return baseSize + Math.min(Math.sqrt(d.size || 0) * 0.04, 30);
          })
          .attr('fill', getColorForNode)
          .attr('stroke', 'rgba(0,0,0,0.5)')
          .attr('stroke-width', 1.5);

        if (viewMode === 'call' && isFunctionUnused(d)) {
          circle.attr('class', 'call-node-unused');
        }
      }

      if (viewMode === 'hierarchy' && selectedNode === d.id && d.type === 'component') {
        const card = element.append('foreignObject')
          .attr('class', 'component-mini-card')
          .attr('width', 220)
          .attr('height', 140)
          .attr('x', 15)
          .attr('y', -70);

        const cardDiv = card.append('xhtml:div')
          .style('width', '210px')
          .style('height', '130px')
          .style('background', 'var(--panel-bg)')
          .style('backdrop-filter', 'blur(8px)')
          .style('border', '1px solid var(--color-primary)')
          .style('box-shadow', '0 4px 15px rgba(0,0,0,0.3)')
          .style('border-radius', '6px')
          .style('padding', '6px 10px')
          .style('font-family', 'var(--font-sans)')
          .style('color', 'var(--text-secondary)')
          .style('overflow-y', 'auto')
          .style('pointer-events', 'all')
          .on('click', (event: any) => event.stopPropagation())
          .on('dblclick', (event: any) => event.stopPropagation())
          .on('mousedown', (event: any) => event.stopPropagation());

        cardDiv.append('div')
          .style('font-weight', '700')
          .style('color', 'var(--color-primary)')
          .style('font-size', '0.75rem')
          .style('border-bottom', '1px solid rgba(255,255,255,0.1)')
          .style('padding-bottom', '2px')
          .style('margin-bottom', '4px')
          .text(`⚛️ ${d.name}`);

        // Props Section
        const propsContainer = cardDiv.append('div').style('margin-bottom', '6px');
        propsContainer.append('span')
          .style('font-size', '0.6rem')
          .style('color', 'var(--text-muted)')
          .style('text-transform', 'uppercase')
          .style('display', 'block')
          .text('Props');
        
        if (d.props && d.props.length > 0) {
          const list = propsContainer.append('div')
            .style('display', 'flex')
            .style('flex-wrap', 'wrap')
            .style('gap', '3px')
            .style('margin-top', '2px');
          d.props.forEach((p: string) => {
            list.append('span')
              .style('font-size', '0.55rem')
              .style('background', 'var(--color-primary-glow)')
              .style('color', 'var(--text-primary)')
              .style('padding', '1px 4px')
              .style('border-radius', '3px')
              .text(p);
          });
        } else {
          propsContainer.append('div')
            .style('font-size', '0.6rem')
            .style('color', 'var(--text-muted)')
            .style('font-style', 'italic')
            .text('None');
        }

        // State & Hooks Section
        const hooksContainer = cardDiv.append('div');
        hooksContainer.append('span')
          .style('font-size', '0.6rem')
          .style('color', 'var(--text-muted)')
          .style('text-transform', 'uppercase')
          .style('display', 'block')
          .text('State & Hooks');
        
        const hasStateOrHooks = (d.state && d.state.length > 0) || (d.hooks && d.hooks.length > 0);
        if (hasStateOrHooks) {
          const list = hooksContainer.append('div')
            .style('display', 'flex')
            .style('flex-wrap', 'wrap')
            .style('gap', '3px')
            .style('margin-top', '2px');

          if (d.state) {
            d.state.forEach((s: string) => {
              list.append('span')
                .style('font-size', '0.55rem')
                .style('background', 'rgba(16, 185, 129, 0.1)')
                .style('color', '#10b981')
                .style('padding', '1px 4px')
                .style('border-radius', '3px')
                .text(`state: ${s}`);
            });
          }
          if (d.hooks) {
            d.hooks.forEach((h: string) => {
              list.append('span')
                .style('font-size', '0.55rem')
                .style('background', 'rgba(245, 158, 11, 0.1)')
                .style('color', '#f59e0b')
                .style('padding', '1px 4px')
                .style('border-radius', '3px')
                .text(h);
            });
          }
        } else {
          hooksContainer.append('div')
            .style('font-size', '0.6rem')
            .style('color', 'var(--text-muted)')
            .style('font-style', 'italic')
            .text('None');
        }
      }
    });

    node.append('text').attr('class', 'node-label').attr('dx', 14).attr('dy', 4).text((d) => d.name);

    simulation.on('tick', () => {
      link.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y).attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
      if (pipeline) {
        pipeline.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y).attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
      }
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
  }, [graphData, viewMode, hierarchicalLevels, showNpmPackages, collapsedFolders, depthFilter, selectedNode, treeLayoutStyle]);

  useEffect(() => {
    if (!svgRef.current) return;
    const activeId = hoveredNode || selectedNode;
    const query = searchQuery ? searchQuery.toLowerCase().trim() : '';
    const svgElement = d3.select(svgRef.current);
    const nodesG = svgElement.selectAll('.node-element');
    const linksLine = svgElement.selectAll('.link-element');
    const hullsBoundary = svgElement.selectAll('.hull-boundary');
    const hullWatermarks = svgElement.selectAll('.hull-watermark');

    const getLinkId = (l: any) => ({
      sId: typeof l.source === 'object' ? l.source.id : l.source,
      tId: typeof l.target === 'object' ? l.target.id : l.target
    });

    // Update node fills based on heatmap mode
    nodesG.select('circle').style('fill', (d: any) => getHeatmapColor(d));
    nodesG.select('polygon').style('fill', (d: any) => getHeatmapColor(d));
    nodesG.select('path.folder-node').style('fill', (d: any) => {
      if (heatmapMode !== 'none') {
        return getHeatmapColor(d);
      }
      return 'var(--color-warning)';
    });
    nodesG.classed('hotspot', (d: any) => heatmapMode === 'churn' && d.churn && d.churn >= 45);

    const pipelines = svgElement.selectAll('.pipeline-element');

    if (activeTraceNodeId && traceSteps.length > 0 && viewMode === 'call') {
      const activeStep = traceSteps[currentTraceStep];
      const traceNodeIds = new Set<string>([activeTraceNodeId]);
      traceSteps.forEach(s => {
        traceNodeIds.add(s.source);
        traceNodeIds.add(s.target);
      });

      nodesG.style('opacity', (d: any) => traceNodeIds.has(d.id) ? 1.0 : 0.15);
      
      nodesG.each(function (d: any) {
        const circle = d3.select(this).select('circle');
        const isActiveTarget = activeStep && d.id === activeStep.target;
        
        if (isActiveTarget) {
          circle.attr('class', 'trace-node-active');
        } else {
          circle.attr('class', isFunctionUnused(d) ? 'call-node-unused' : '');
        }
      });

      nodesG.select('text')
        .style('fill', (d: any) => d.id === activeTraceNodeId ? 'var(--text-primary)' : 'var(--text-secondary)')
        .style('font-weight', (d: any) => d.id === activeTraceNodeId ? '700' : '500');

      linksLine.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        const line = d3.select(this);
        const isActiveLink = activeStep && sId === activeStep.source && tId === activeStep.target;
        
        if (isActiveLink) {
          line.attr('class', 'link-element trace-link-active').style('stroke-opacity', 1.0);
        } else {
          const isPartOfTrace = traceSteps.some(s => s.source === sId && s.target === tId);
          line.attr('class', 'link-element')
            .style('stroke-opacity', isPartOfTrace ? 0.35 : 0.03)
            .style('stroke', 'var(--link-stroke)')
            .attr('marker-end', 'url(#arrow-normal)');
        }
      });

      pipelines.style('stroke-opacity', 0.01);
      hullsBoundary.style('fill-opacity', 0.01).style('stroke-opacity', 0.1);
      hullWatermarks.style('opacity', 0.01);
    } else if (shortestPath) {
      const pathSet = new Set(shortestPath);
      nodesG.style('opacity', (d: any) => pathSet.has(d.id) ? 1.0 : 0.08);
      nodesG.select('text').style('fill', (d: any) => pathSet.has(d.id) ? 'var(--text-primary)' : 'var(--text-secondary)').style('font-weight', (d: any) => pathSet.has(d.id) ? '700' : '500');
      linksLine.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        const sIdx = shortestPath.indexOf(sId);
        const inPath = sIdx !== -1 && shortestPath[sIdx + 1] === tId;
        const line = d3.select(this);
        if (inPath) {
          line.attr('class', 'link-element shortest-path').style('stroke-opacity', 1.0);
        } else {
          line.attr('class', 'link-element').style('stroke-opacity', 0.02).style('stroke', 'var(--link-stroke)');
        }
      });
      pipelines.style('stroke-opacity', 0.01);
      hullsBoundary.style('fill-opacity', 0.01).style('stroke-opacity', 0.1);
      hullWatermarks.style('opacity', 0.01);
    } else if (activeId) {
      const neighbors = new Set<string>([activeId]);
      const activeRenderedLinks: any[] = [];
      linksLine.each(function (l: any) {
        if (l) activeRenderedLinks.push(l);
      });
      activeRenderedLinks.forEach((link: any) => {
        const { sId, tId } = getLinkId(link);
        if (sId === activeId) neighbors.add(tId);
        if (tId === activeId) neighbors.add(sId);
      });
      nodesG.style('opacity', (d: any) => neighbors.has(d.id) ? 1.0 : 0.15);
      nodesG.select('text').style('fill', (d: any) => d.id === activeId ? 'var(--text-primary)' : 'var(--text-secondary)').style('font-weight', (d: any) => d.id === activeId ? '700' : '500');
      linksLine.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        const line = d3.select(this);
        const isCyclic = viewMode === 'dependency' && cyclicLinks.has(`${sId}->${tId}`);
        const isFlowing = viewMode === 'dependency';
        let cls = 'link-element';
        if (isFlowing) cls += ' flowing';
        
        if (sId === activeId) {
          line.attr('class', cls + ' flow-out').style('stroke-opacity', 0.95).attr('marker-end', 'url(#arrow-highlight)');
        } else if (tId === activeId) {
          line.attr('class', cls + ' flow-in').style('stroke-opacity', 0.95).attr('marker-end', 'url(#arrow-highlight-incoming)');
        } else {
          line.attr('class', isCyclic ? 'link-element flow-cycle' : (isFlowing ? cls : 'link-element'))
            .style('stroke-opacity', isCyclic ? 0.25 : 0.03)
            .style('stroke', isCyclic ? 'var(--color-alert)' : 'var(--link-stroke)')
            .attr('marker-end', isCyclic ? 'url(#arrow-cycle)' : 'url(#arrow-normal)');
        }
      });
      pipelines.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        const line = d3.select(this);
        if (sId === activeId || tId === activeId) {
          line.style('stroke-opacity', 0.8);
        } else {
          line.style('stroke-opacity', 0.01);
        }
      });
      hullsBoundary.style('fill-opacity', 0.01).style('stroke-opacity', 0.1);
      
      let activeFolder: string | null = null;
      nodesG.each((d: any) => {
        if (d.id === activeId) {
          activeFolder = d.folder;
        }
      });
      hullWatermarks.style('opacity', (d: any) => {
        if (activeFolder && d[0] === activeFolder) {
          return 1.0;
        }
        return 0.05;
      });
    } else if (query) {
      const matches = new Set<string>();
      nodesG.each((d: any) => {
        // If node is NPM/External, only check query
        if (d.isNpm || d.language === 'npm') {
          if (query && d.name.toLowerCase().includes(query)) {
            matches.add(d.id);
          }
          return;
        }

        // Search Query
        let isMatch = false;
        const idLower = (d.id || '').toLowerCase();
        const nameLower = (d.name || '').toLowerCase();
        if (idLower.includes(query) || nameLower.includes(query)) {
          isMatch = true;
        }
        if (!isMatch && graphData.callNodes) {
          isMatch = graphData.callNodes.some(fn => fn.file === d.id && fn.name.toLowerCase().includes(query));
        }
        if (!isMatch && graphData.classNodes) {
          isMatch = graphData.classNodes.some(cn => {
            if (cn.file !== d.id) return false;
            if (cn.name.toLowerCase().includes(query)) return true;
            if (cn.props && cn.props.some(p => p.toLowerCase().includes(query))) return true;
            if (cn.state && cn.state.some(s => s.toLowerCase().includes(query))) return true;
            if (cn.hooks && cn.hooks.some(h => h.toLowerCase().includes(query))) return true;
            return false;
          });
        }
        
        if (isMatch) {
          matches.add(d.id);
        }
      });

      nodesG.style('opacity', (d: any) => matches.has(d.id) ? 1.0 : 0.15);
      nodesG.select('text').style('fill', (d: any) => matches.has(d.id) ? 'var(--text-primary)' : 'var(--text-secondary)').style('font-weight', (d: any) => matches.has(d.id) ? '600' : '500');
      linksLine.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        const isCyclic = viewMode === 'dependency' && cyclicLinks.has(`${sId}->${tId}`);
        const isMatch = matches.has(sId) || matches.has(tId);
        const isFlowing = viewMode === 'dependency';
        const cls = isFlowing ? 'link-element flowing' : 'link-element';
        
        d3.select(this)
          .attr('class', isCyclic ? 'link-element flow-cycle' : cls)
          .style('stroke-opacity', isMatch ? 0.7 : 0.03)
          .style('stroke', isCyclic ? 'var(--color-alert)' : 'var(--link-stroke)')
          .attr('marker-end', isCyclic ? 'url(#arrow-cycle)' : 'url(#arrow-normal)');
      });
      pipelines.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        const isMatch = matches.has(sId) || matches.has(tId);
        d3.select(this).style('stroke-opacity', isMatch ? 0.6 : 0.01);
      });
      hullsBoundary.style('fill-opacity', 0.01).style('stroke-opacity', 0.1);
      hullWatermarks.style('opacity', 0.05);
    } else {
      nodesG.style('opacity', 1.0);
      nodesG.select('text').style('fill', 'var(--text-secondary)').style('font-weight', '500');
      linksLine.each(function (l: any) {
        const { sId, tId } = getLinkId(l);
        const isCyclic = viewMode === 'dependency' && cyclicLinks.has(`${sId}->${tId}`);
        const isFlowing = viewMode === 'dependency';
        const cls = isFlowing ? 'link-element flowing' : 'link-element';
        
        d3.select(this)
          .attr('class', isCyclic ? 'link-element flow-cycle' : cls)
          .style('stroke-opacity', isCyclic ? 0.6 : (isFlowing ? 0.75 : 0.2))
          .style('stroke', isCyclic ? 'var(--color-alert)' : 'var(--link-stroke)')
          .attr('marker-end', isCyclic ? 'url(#arrow-cycle)' : 'url(#arrow-normal)');
      });
      pipelines.each(function () {
        const line = d3.select(this);
        line.style('stroke-opacity', (d: any) => d.isAggregated ? 0.18 : 0.12);
      });
      hullsBoundary.style('fill-opacity', 0.04).style('stroke-opacity', 0.4);
      hullWatermarks.style('opacity', 1.0);
    }

    const transform = d3.zoomTransform(svgRef.current);
    applyLevelOfDetail(transform.k);

    if (drawMinimapRef.current) {
      drawMinimapRef.current();
    }
  }, [hoveredNode, selectedNode, graphData, viewMode, searchQuery, cyclicLinks, heatmapMode, shortestPath, activeTraceNodeId, currentTraceStep, traceSteps, isMinimapExpanded]);

  return (
    <div 
      ref={containerRef} 
      className="graph-viewport" 
      onClick={() => setSelectedNode(null)}
      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
    >
      {/* Floating Control Toolbox */}
      <div className="graph-control-toolbox" onClick={(e) => e.stopPropagation()}>
        <div className="toolbox-header" onClick={() => setIsToolboxCollapsed(!isToolboxCollapsed)}>
          <span className="toolbox-title">⚙️ Graph Control Center</span>
          <button className="collapse-toggle-btn" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}>
            {isToolboxCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>

        {!isToolboxCollapsed && (
          <>
            {/* Shortest Path Finder */}
            {viewMode === 'dependency' && (
              <div className="toolbox-section">
                <div className="section-header">📍 Shortest Path Finder</div>
                <div className="flex-row">
                  <div className="select-container">
                    <label>Source:</label>
                    <select value={pathSource || ''} onChange={(e) => setPathSource(e.target.value || null)}>
                      <option value="">-- Select Source --</option>
                      {graphData.nodes.map(n => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                      {showNpmPackages && (graphData.npmNodes || []).map(n => (
                        <option key={n.id} value={n.id}>{`[npm] ${n.name}`}</option>
                      ))}
                    </select>
                  </div>
                  <button 
                    className="cyber-button text-btn" 
                    onClick={() => selectedNode && setPathSource(selectedNode)}
                    disabled={!selectedNode}
                    title="Set as Source"
                  >
                    Set
                  </button>
                </div>

                <div className="flex-row mt-2">
                  <div className="select-container">
                    <label>Target:</label>
                    <select value={pathTarget || ''} onChange={(e) => setPathTarget(e.target.value || null)}>
                      <option value="">-- Select Target --</option>
                      {graphData.nodes.map(n => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                      {showNpmPackages && (graphData.npmNodes || []).map(n => (
                        <option key={n.id} value={n.id}>{`[npm] ${n.name}`}</option>
                      ))}
                    </select>
                  </div>
                  <button 
                    className="cyber-button text-btn" 
                    onClick={() => selectedNode && setPathTarget(selectedNode)}
                    disabled={!selectedNode}
                    title="Set as Target"
                  >
                    Set
                  </button>
                </div>
                {pathSource && pathTarget && (
                  <div className="flex-row mt-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="path-status-text">
                      {shortestPath ? `${shortestPath.length - 1} hops` : 'No path found'}
                    </span>
                    <button className="cyber-button text-btn alert" onClick={() => { setPathSource(null); setPathTarget(null); }}>
                      Clear Path
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* NPM Package Toggle */}
            {viewMode === 'dependency' && (
              <div className="toolbox-section">
                <div className="toggle-row">
                  <span>📦 External Packages</span>
                  <label className="switch">
                    <input type="checkbox" checked={showNpmPackages} onChange={(e) => setShowNpmPackages(e.target.checked)} />
                    <span className="slider round"></span>
                  </label>
                </div>
              </div>
            )}

            {/* Heatmaps Mode */}
            {viewMode === 'dependency' && (
              <div className="toolbox-section">
                <div className="section-header">⏱️ Heatmap Overlay</div>
                <div className="heatmap-btn-group">
                  <button className={`heatmap-tab ${heatmapMode === 'none' ? 'active' : ''}`} onClick={() => setHeatmapMode('none')}>
                    None
                  </button>
                  <button className={`heatmap-tab ${heatmapMode === 'churn' ? 'active' : ''}`} onClick={() => setHeatmapMode('churn')}>
                    Churn
                  </button>
                  <button className={`heatmap-tab ${heatmapMode === 'complexity' ? 'active' : ''}`} onClick={() => setHeatmapMode('complexity')}>
                    LOC
                  </button>
                </div>
              </div>
            )}

            {/* Call Graph Controls */}
            {viewMode === 'call' && (
              <div className="toolbox-section">
                <div className="section-header">📞 Call Graph Analytics</div>
                
                {/* Depth Filter */}
                <div className="select-container" style={{ marginBottom: '8px' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Call Depth Filter:</span>
                    <span style={{ color: 'var(--color-secondary)', fontWeight: 600 }}>
                      {depthFilter === -1 ? 'All Hops' : `${depthFilter} Hop${depthFilter > 1 ? 's' : ''}`}
                    </span>
                  </label>
                  <input
                    type="range"
                    min="-1"
                    max="3"
                    step="1"
                    value={depthFilter}
                    disabled={!selectedNode}
                    onChange={(e) => setDepthFilter(Number(e.target.value))}
                    style={{
                      width: '100%',
                      accentColor: 'var(--color-secondary)',
                      marginTop: '4px',
                      cursor: selectedNode ? 'pointer' : 'not-allowed',
                      opacity: selectedNode ? 1 : 0.5
                    }}
                  />
                  {!selectedNode && (
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Select a node to enable depth filter
                    </span>
                  )}
                </div>

                {/* Call Stack Trace Status */}
                <div style={{
                  padding: '8px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--panel-border)',
                  borderRadius: '4px',
                  fontSize: '0.7rem'
                }}>
                  <div style={{ fontWeight: 600, color: 'var(--color-secondary)', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                    <span className="live-dot" style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: activeTraceNodeId ? '#10b981' : 'var(--text-muted)',
                      boxShadow: activeTraceNodeId ? '0 0 8px #10b981' : 'none',
                    }}></span>
                    Call Trace Simulator
                  </div>
                  
                  {activeTraceNodeId ? (
                    <div>
                      <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', marginBottom: '6px' }}>
                        Tracing: <code style={{ color: 'var(--text-primary)' }}>{activeTraceNodeId.split('::').pop()}()</code>
                      </div>
                      {traceSteps.length > 0 ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Step {currentTraceStep + 1} of {traceSteps.length}</span>
                          <button 
                            className="cyber-button text-btn" 
                            style={{ padding: '2px 8px', fontSize: '0.65rem' }}
                            onClick={() => setActiveTraceNodeId(null)}
                          >
                            Stop
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-muted)' }}>No outgoing calls found</span>
                          <button 
                            className="cyber-button text-btn" 
                            style={{ padding: '2px 8px', fontSize: '0.65rem' }}
                            onClick={() => setActiveTraceNodeId(null)}
                          >
                            Stop
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', lineHeight: '1.2' }}>
                      Select a node and click <strong>Trace Execution</strong> to animate path.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Component Tree Controls */}
            {viewMode === 'hierarchy' && (
              <div className="toolbox-section">
                <div className="section-header">🌳 Component Tree Layout</div>
                <div className="toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6.5px' }}>
                  <span>Radial Layout</span>
                  <label className="switch">
                    <input 
                      type="checkbox" 
                      checked={treeLayoutStyle === 'radial'} 
                      onChange={(e) => setTreeLayoutStyle(e.target.checked ? 'radial' : 'top-down')} 
                    />
                    <span className="slider round"></span>
                  </label>
                </div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '4.5px', lineHeight: '1.2' }}>
                  Toggle between a top-down hierarchical tree and a radial concentric circular layout.
                </div>
              </div>
            )}

            {/* Module Clusters (Folders) */}
            {(viewMode === 'dependency' || viewMode === 'cluster') && (
              <div className="toolbox-section">
                <div className="section-header">📁 Module Clusters</div>
                <div className="folder-list-container" style={{ maxHeight: '110px', overflowY: 'auto', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px', paddingRight: '4px' }}>
                  {allFolders.length === 0 ? (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>No folder structures found</span>
                  ) : (
                    allFolders.map(folder => {
                      const isCollapsed = collapsedFolders.has(folder);
                      return (
                        <label key={folder} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem', cursor: 'pointer', color: 'var(--text-secondary)', userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={isCollapsed}
                            onChange={() => {
                              setCollapsedFolders(prev => {
                                const next = new Set(prev);
                                if (next.has(folder)) next.delete(folder);
                                else next.add(folder);
                                return next;
                              });
                            }}
                            style={{ cursor: 'pointer', accentColor: 'var(--color-warning)' }}
                          />
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={folder}>
                            {folder}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                <div className="flex-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                  <span className="path-status-text" style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    {collapsedFolders.size} collapsed
                  </span>
                  {collapsedFolders.size > 0 && (
                    <button className="cyber-button text-btn" onClick={() => setCollapsedFolders(new Set())} style={{ padding: '3px 6px', fontSize: '0.65rem' }}>
                      Expand All
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

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

      {/* Heatmap Legend */}
      {viewMode === 'dependency' && heatmapMode !== 'none' && (
        <div className="heatmap-legend" onClick={(e) => e.stopPropagation()}>
          <span>Cool</span>
          <div className="legend-bar" />
          <span>Hot</span>
        </div>
      )}

      {/* Radar HUD Minimap */}
      <div className={`minimap-hud ${isMinimapExpanded ? 'expanded' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="minimap-header">
          <span className="minimap-title">
            {isMinimapExpanded ? '🔍 FULL RADAR OVERVIEW' : 'RADAR NAVIGATION HUD'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="radar-status-dot"></div>
            <button 
              className="minimap-expand-btn"
              onClick={() => setIsMinimapExpanded(!isMinimapExpanded)}
              title={isMinimapExpanded ? "Minimize Overview" : "Maximize Overview"}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {isMinimapExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          </div>
        </div>
        <canvas
          ref={minimapCanvasRef}
          width={isMinimapExpanded ? 432 : 158}
          height={isMinimapExpanded ? 298 : 98}
          className="minimap-canvas"
          style={{ width: '100%', height: 'calc(100% - 24px)', display: 'block' }}
          onClick={handleMinimapClick}
        />
      </div>
      {/* Cluster Hover Card */}
      {hoveredCluster && createPortal(
        <div 
          className="cluster-hover-card"
          style={{ 
            left: `${mousePos.x}px`, 
            top: `${mousePos.y}px`,
            position: 'fixed',
            transform: 'translate(15px, 15px)',
            opacity: 1,
            zIndex: 99999,
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--color-primary)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px', marginBottom: '6px', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
            📁 {hoveredCluster.folder.split('/').pop() || hoveredCluster.folder}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '24px' }}>
              <span>Files:</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{hoveredCluster.fileCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '24px' }}>
              <span>Cross-connections:</span>
              <span style={{ color: 'var(--color-secondary)', fontWeight: 600 }}>{hoveredCluster.connectionsCount}</span>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Component Hover Details Card */}
      {viewMode === 'hierarchy' && hoveredNode && hoveredNode !== selectedNode && hoveredComponentDetails && hoveredComponentDetails.type === 'component' && createPortal(
        <div 
          className="cluster-hover-card"
          style={{ 
            left: `${mousePos.x}px`, 
            top: `${mousePos.y}px`,
            position: 'fixed',
            transform: 'translate(15px, 15px)',
            opacity: 1,
            maxWidth: '280px',
            pointerEvents: 'none',
            zIndex: 99999,
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--color-primary)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px', marginBottom: '6px', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
            ⚛️ {hoveredComponentDetails.name}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Props</span>
              {hoveredComponentDetails.props && hoveredComponentDetails.props.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                  {hoveredComponentDetails.props.map((p: string) => (
                    <span key={p} style={{ fontSize: '0.65rem', background: 'var(--color-primary-glow)', color: 'var(--text-primary)', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>{p}</span>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>None detected</span>
              )}
            </div>
            <div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Hooks & State</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                {hoveredComponentDetails.state && hoveredComponentDetails.state.map((s: string) => (
                  <span key={s} style={{ fontSize: '0.65rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>useState ({s})</span>
                ))}
                {hoveredComponentDetails.hooks && hoveredComponentDetails.hooks.map((h: string) => (
                  <span key={h} style={{ fontSize: '0.65rem', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>{h}</span>
                ))}
                {(!hoveredComponentDetails.state?.length && !hoveredComponentDetails.hooks?.length) && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>None detected</span>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}


    </div>
  );
};
