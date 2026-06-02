import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

const TYPE_COLOR = {
  Person:       "#818cf8",
  Organization: "#34d399",
  Place:        "#f59e0b",
  Concept:      "#60a5fa",
  Product:      "#f472b6",
  Event:        "#a78bfa",
  Default:      "#94a3b8",
};

function nodeColor(type) {
  return TYPE_COLOR[type] || TYPE_COLOR.Default;
}

export default function KnowledgeGraph({
  nodes = [],
  edges = [],
  highlightNode = null,
  pathNodes = [],        // array of node ids in path
  pathEdges = [],        // array of {source, target} in path
  onNodeClick = null,    // callback(node)
}) {
  const svgRef  = useRef(null);
  const simRef  = useRef(null);
  const [selected, setSelected] = useState(null);

  // Degree map for node sizing
  const degreeMap = {};
  edges.forEach((e) => {
    degreeMap[e.source] = (degreeMap[e.source] || 0) + 1;
    degreeMap[e.target] = (degreeMap[e.target] || 0) + 1;
  });
  const maxDegree = Math.max(1, ...Object.values(degreeMap));

  function nodeRadius(id) {
    const deg = degreeMap[id] || 0;
    return 12 + (deg / maxDegree) * 16;  // 12–28px
  }

  const pathNodeSet = new Set(pathNodes);
  const pathEdgeSet = new Set(pathEdges.map((e) => `${e.source}__${e.target}`));

  useEffect(() => {
    if (!nodes.length) return;

    const container = svgRef.current?.parentElement;
    const W = container?.clientWidth  || 900;
    const H = container?.clientHeight || 600;

    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("width", W).attr("height", H);

    const root = svg.append("g");

    svg.call(
      d3.zoom().scaleExtent([0.15, 5])
        .on("zoom", (e) => root.attr("transform", e.transform))
    );

    // Arrow markers
    const defs = svg.append("defs");
    ["default", "path", "dimmed"].forEach((id) => {
      defs.append("marker")
        .attr("id",           `arrow-${id}`)
        .attr("viewBox",      "0 -5 10 10")
        .attr("refX",         24)
        .attr("refY",         0)
        .attr("markerWidth",  6)
        .attr("markerHeight", 6)
        .attr("orient",       "auto")
        .append("path")
        .attr("d",    "M0,-5L10,0L0,5")
        .attr("fill",
          id === "path"   ? "#f59e0b" :
          id === "dimmed" ? "#1e293b" : "#475569"
        );
    });

    const nodeData = nodes.map((n) => ({ ...n }));
    const edgeData = edges.map((e) => ({ ...e }));

    const sim = d3.forceSimulation(nodeData)
      .force("link",    d3.forceLink(edgeData).id((d) => d.id).distance(130).strength(0.7))
      .force("charge",  d3.forceManyBody().strength(-400))
      .force("center",  d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide((d) => nodeRadius(d.id) + 8));
    simRef.current = sim;

    // Edges
    const linkG = root.append("g");
    const link  = linkG.selectAll("line").data(edgeData).join("line")
      .attr("stroke",       (d) => {
        const key = `${typeof d.source === "object" ? d.source.id : d.source}__${typeof d.target === "object" ? d.target.id : d.target}`;
        return pathEdgeSet.has(key) ? "#f59e0b" : "#334155";
      })
      .attr("stroke-width", (d) => {
        const key = `${typeof d.source === "object" ? d.source.id : d.source}__${typeof d.target === "object" ? d.target.id : d.target}`;
        return pathEdgeSet.has(key) ? 3 : 1.5;
      })
      .attr("marker-end",   (d) => {
        const key = `${typeof d.source === "object" ? d.source.id : d.source}__${typeof d.target === "object" ? d.target.id : d.target}`;
        return pathEdgeSet.has(key) ? "url(#arrow-path)" : "url(#arrow-default)";
      });

    const linkLabel = linkG.selectAll("text").data(edgeData).join("text")
      .attr("fill",        "#64748b")
      .attr("font-size",   "9px")
      .attr("text-anchor", "middle")
      .text((d) => d.relation);

    // Nodes
    const nodeG = root.append("g");
    const node  = nodeG.selectAll("g").data(nodeData).join("g")
      .attr("cursor", "pointer")
      .call(
        d3.drag()
          .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on("drag",  (e, d) => { d.fx = e.x; d.fy = e.y; })
          .on("end",   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on("click", (e, d) => {
        e.stopPropagation();
        setSelected(d);
        onNodeClick?.(d);
      });

    svg.on("click", () => setSelected(null));

    // Circle with glow for path nodes
    node.append("circle")
      .attr("r",            (d) => nodeRadius(d.id))
      .attr("fill",         (d) => {
        if (pathNodeSet.has(d.id)) return "#f59e0b";
        return nodeColor(d.type);
      })
      .attr("fill-opacity", (d) => {
        if (pathNodes.length > 0) return pathNodeSet.has(d.id) ? 1 : 0.25;
        if (highlightNode)       return d.id === highlightNode ? 1 : 0.3;
        return 0.85;
      })
      .attr("stroke",       (d) => pathNodeSet.has(d.id) ? "#fbbf24" : nodeColor(d.type))
      .attr("stroke-width", (d) => pathNodeSet.has(d.id) ? 3 : 1.5);

    // Labels
    node.append("text")
      .attr("text-anchor", "middle")
      .attr("dy",          "0.35em")
      .attr("fill",        "#fff")
      .attr("font-size",   (d) => Math.max(8, Math.min(11, nodeRadius(d.id) * 0.6)) + "px")
      .attr("font-weight", "600")
      .attr("pointer-events", "none")
      .text((d) => {
        const r     = nodeRadius(d.id);
        const chars = Math.floor(r * 1.4);
        return d.label.length > chars ? d.label.slice(0, chars - 1) + "…" : d.label;
      });

    // Degree badge for top nodes
    node.filter((d) => (degreeMap[d.id] || 0) >= 3)
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy",          (d) => nodeRadius(d.id) + 12)
      .attr("fill",        "#64748b")
      .attr("font-size",   "8px")
      .text((d) => `${degreeMap[d.id] || 0} links`);

    sim.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
      linkLabel
        .attr("x", (d) => (d.source.x + d.target.x) / 2)
        .attr("y", (d) => (d.source.y + d.target.y) / 2);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => sim.stop();
  }, [nodes, edges, highlightNode, pathNodes.join(","), pathEdges.length]);

  return (
    <div className="relative w-full h-full bg-[#0d0d14] rounded-xl overflow-hidden">
      <svg ref={svgRef} className="w-full h-full"/>

      {/* Legend */}
      <div className="absolute top-3 left-3 bg-[#13131a]/90 border border-slate-800 rounded-lg p-3 text-xs space-y-1.5">
        {Object.entries(TYPE_COLOR).filter(([k]) => k !== "Default").map(([type, color]) => (
          <div key={type} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: color }}/>
            <span className="text-slate-400">{type}</span>
          </div>
        ))}
        <div className="border-t border-slate-800 pt-1.5 mt-1.5 text-slate-600">
          Node size = connections
        </div>
      </div>

      <div className="absolute bottom-3 left-3 text-slate-600 text-xs">
        Scroll to zoom · Drag to pan · Click node
      </div>

      {nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-5xl mb-4">🕸️</div>
          <p className="text-slate-400 font-medium">No graph data yet</p>
          <p className="text-slate-600 text-sm mt-1">Build a graph from an embedded document</p>
        </div>
      )}
    </div>
  );
}