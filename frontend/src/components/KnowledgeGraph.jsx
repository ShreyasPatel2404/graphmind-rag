import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

// ─── Color map by entity type ─────────────────────────────────────────────────
const TYPE_COLOR = {
  Person:       "#818cf8",   // indigo
  Organization: "#34d399",   // emerald
  Place:        "#f59e0b",   // amber
  Concept:      "#60a5fa",   // blue
  Product:      "#f472b6",   // pink
  Event:        "#a78bfa",   // violet
  Default:      "#94a3b8",   // slate
};

function nodeColor(type) {
  return TYPE_COLOR[type] || TYPE_COLOR.Default;
}

export default function KnowledgeGraph({ nodes = [], edges = [] }) {
  const svgRef       = useRef(null);
  const [selected,   setSelected]   = useState(null);
  const [neighbors,  setNeighbors]  = useState(new Set());
  const simRef       = useRef(null);

  useEffect(() => {
    if (!nodes.length) return;

    const container = svgRef.current.parentElement;
    const W = container.clientWidth  || 900;
    const H = container.clientHeight || 600;

    // ── Clear old render ───────────────────────────────────────────────────
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("width",  W)
      .attr("height", H);

    // ── Zoom + Pan ─────────────────────────────────────────────────────────
    const root = svg.append("g");
    svg.call(
      d3.zoom()
        .scaleExtent([0.2, 4])
        .on("zoom", (e) => root.attr("transform", e.transform))
    );

    // ── Arrow markers ──────────────────────────────────────────────────────
    svg.append("defs").selectAll("marker")
      .data(["default", "highlighted"])
      .join("marker")
        .attr("id",          (d) => `arrow-${d}`)
        .attr("viewBox",     "0 -5 10 10")
        .attr("refX",        22)
        .attr("refY",        0)
        .attr("markerWidth", 6)
        .attr("markerHeight",6)
        .attr("orient",      "auto")
      .append("path")
        .attr("d",    "M0,-5L10,0L0,5")
        .attr("fill", (d) => d === "highlighted" ? "#818cf8" : "#475569");

    // ── Clone data (D3 mutates) ────────────────────────────────────────────
    const nodeData = nodes.map((n) => ({ ...n }));
    const edgeData = edges.map((e) => ({ ...e }));

    // ── Force simulation ───────────────────────────────────────────────────
    const sim = d3.forceSimulation(nodeData)
      .force("link",    d3.forceLink(edgeData).id((d) => d.id).distance(120).strength(0.8))
      .force("charge",  d3.forceManyBody().strength(-350))
      .force("center",  d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide(40));
    simRef.current = sim;

    // ── Edges ──────────────────────────────────────────────────────────────
    const linkG = root.append("g").attr("class", "links");

    const link = linkG.selectAll("line")
      .data(edgeData)
      .join("line")
        .attr("stroke",       "#334155")
        .attr("stroke-width", 1.5)
        .attr("marker-end",   "url(#arrow-default)");

    // Edge labels
    const linkLabel = linkG.selectAll("text")
      .data(edgeData)
      .join("text")
        .attr("fill",        "#64748b")
        .attr("font-size",   "9px")
        .attr("text-anchor", "middle")
        .attr("dy",          "-3")
        .text((d) => d.relation);

    // ── Nodes ──────────────────────────────────────────────────────────────
    const nodeG = root.append("g").attr("class", "nodes");

    const node = nodeG.selectAll("g")
      .data(nodeData)
      .join("g")
        .attr("cursor", "pointer")
        .call(
          d3.drag()
            .on("start", (e, d) => {
              if (!e.active) sim.alphaTarget(0.3).restart();
              d.fx = d.x; d.fy = d.y;
            })
            .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
            .on("end",  (e, d) => {
              if (!e.active) sim.alphaTarget(0);
              d.fx = null; d.fy = null;
            })
        )
        .on("click", (e, d) => {
          e.stopPropagation();
          // Compute neighbors
          const nbrs = new Set();
          edgeData.forEach((edge) => {
            const src = typeof edge.source === "object" ? edge.source.id : edge.source;
            const tgt = typeof edge.target === "object" ? edge.target.id : edge.target;
            if (src === d.id) nbrs.add(tgt);
            if (tgt === d.id) nbrs.add(src);
          });
          setSelected(d);
          setNeighbors(nbrs);
          highlightNode(d.id, nbrs);
        });

    // Click on background = deselect
    svg.on("click", () => {
      setSelected(null);
      setNeighbors(new Set());
      resetHighlight();
    });

    // Node circles
    node.append("circle")
      .attr("r",    18)
      .attr("fill", (d) => nodeColor(d.type))
      .attr("fill-opacity", 0.85)
      .attr("stroke",       (d) => nodeColor(d.type))
      .attr("stroke-width", 2);

    // Node labels
    node.append("text")
      .attr("text-anchor", "middle")
      .attr("dy",          "0.35em")
      .attr("fill",        "#fff")
      .attr("font-size",   "9px")
      .attr("font-weight", "600")
      .attr("pointer-events", "none")
      .text((d) => {
        const words = d.label.split(/\s+/);
        return words.length > 2
          ? words.slice(0, 2).join(" ") + "…"
          : d.label.length > 14
          ? d.label.slice(0, 12) + "…"
          : d.label;
      });

    // ── Highlight helpers ──────────────────────────────────────────────────
    function highlightNode(id, nbrs) {
      node.selectAll("circle")
        .attr("fill-opacity", (d) =>
          d.id === id || nbrs.has(d.id) ? 1 : 0.2
        )
        .attr("stroke-width", (d) => d.id === id ? 4 : 2);

      link
        .attr("stroke", (d) => {
          const src = typeof d.source === "object" ? d.source.id : d.source;
          const tgt = typeof d.target === "object" ? d.target.id : d.target;
          return src === id || tgt === id ? "#818cf8" : "#1e293b";
        })
        .attr("stroke-width", (d) => {
          const src = typeof d.source === "object" ? d.source.id : d.source;
          const tgt = typeof d.target === "object" ? d.target.id : d.target;
          return src === id || tgt === id ? 2.5 : 1;
        })
        .attr("marker-end", (d) => {
          const src = typeof d.source === "object" ? d.source.id : d.source;
          const tgt = typeof d.target === "object" ? d.target.id : d.target;
          return src === id || tgt === id
            ? "url(#arrow-highlighted)"
            : "url(#arrow-default)";
        });
    }

    function resetHighlight() {
      node.selectAll("circle")
        .attr("fill-opacity", 0.85)
        .attr("stroke-width", 2);
      link
        .attr("stroke",       "#334155")
        .attr("stroke-width", 1.5)
        .attr("marker-end",   "url(#arrow-default)");
    }

    // ── Tick ──────────────────────────────────────────────────────────────
    sim.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      linkLabel
        .attr("x", (d) => (d.source.x + d.target.x) / 2)
        .attr("y", (d) => (d.source.y + d.target.y) / 2);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => sim.stop();
  }, [nodes, edges]);

  // ─── Build adjacency for panel ──────────────────────────────────────────
  const connections = selected
    ? edges.filter((e) => e.source === selected.id || e.target === selected.id)
    : [];

  return (
    <div className="relative w-full h-full bg-[#0d0d14] rounded-xl overflow-hidden">
      {/* D3 canvas */}
      <svg ref={svgRef} className="w-full h-full" />

      {/* Legend */}
      <div className="absolute top-3 left-3 bg-[#13131a]/90 border border-slate-800 rounded-lg p-3 text-xs space-y-1.5">
        {Object.entries(TYPE_COLOR).filter(([k]) => k !== "Default").map(([type, color]) => (
          <div key={type} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
            <span className="text-slate-400">{type}</span>
          </div>
        ))}
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-3 left-3 text-slate-600 text-xs space-y-0.5">
        <p>Scroll to zoom · Drag to pan · Click node to inspect</p>
      </div>

      {/* Node detail panel */}
      {selected && (
        <div className="absolute top-3 right-3 w-64 bg-[#13131a]/95 border border-slate-700
                        rounded-xl p-4 text-sm shadow-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ background: nodeColor(selected.type) }} />
              <span className="text-slate-400 text-xs">{selected.type}</span>
            </div>
            <button
              onClick={() => { setSelected(null); setNeighbors(new Set()); }}
              className="text-slate-600 hover:text-white transition text-xs"
            >✕</button>
          </div>

          <p className="text-white font-semibold mb-3 break-words">{selected.label}</p>

          {connections.length > 0 && (
            <>
              <p className="text-slate-500 text-xs mb-2 uppercase tracking-wide">
                Connections ({connections.length})
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {connections.map((e, i) => {
                  const isSource = e.source === selected.id;
                  const other    = isSource ? e.target : e.source;
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-slate-600 mt-0.5 flex-shrink-0">
                        {isSource ? "→" : "←"}
                      </span>
                      <div>
                        <span className="text-indigo-400">{e.relation}</span>
                        <span className="text-slate-400"> · {other}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Empty state */}
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