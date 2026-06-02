import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import KnowledgeGraph from "../components/KnowledgeGraph";
import { documentsAPI, graphAPI } from "../services/api";
import { toast } from "../components/Toast";

const TYPE_COLOR = {
  Person:       "text-indigo-400",
  Organization: "text-emerald-400",
  Place:        "text-amber-400",
  Concept:      "text-blue-400",
  Product:      "text-pink-400",
  Event:        "text-violet-400",
};

export default function GraphView() {
  const navigate     = useNavigate();
  const [searchParams] = useSearchParams();

  const [docs,          setDocs]          = useState([]);
  const [selectedDoc,   setSelectedDoc]   = useState(null);
  const [graphData,     setGraphData]     = useState({ nodes: [], edges: [] });
  const [graphStats,    setGraphStats]    = useState(null);
  const [entities,      setEntities]      = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [building,      setBuilding]      = useState(false);
  const [loadingDocs,   setLoadingDocs]   = useState(true);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching,     setSearching]     = useState(false);
  const [highlightNode, setHighlightNode] = useState(null);
  const [activePanel,   setActivePanel]   = useState("graph"); // graph | entities
  const [clickedEntity, setClickedEntity] = useState(null);

  // Path finder state
  const [pathFrom,      setPathFrom]      = useState("");
  const [pathTo,        setPathTo]        = useState("");
  const [pathResult,    setPathResult]    = useState(null);
  const [findingPath,   setFindingPath]   = useState(false);
  const [showPath,      setShowPath]      = useState(false);

  const pollRef       = useRef(null);
  const toastFiredRef = useRef(false);
  const searchTimer   = useRef(null);

  useEffect(() => {
    documentsAPI.list()
      .then(({ data }) => {
        const eligible = data.filter((d) =>
          ["embedded", "graph_ready", "graph_building"].includes(d.status)
        );
        setDocs(eligible);
        const paramId = searchParams.get("doc");
        if (paramId) {
          const found = eligible.find((d) => d.id === parseInt(paramId));
          if (found) handleSelectDoc(found);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDocs(false));
  }, []);

  const handleSelectDoc = async (doc) => {
    toastFiredRef.current = false;
    setSelectedDoc(doc);
    setGraphData({ nodes: [], edges: [] });
    setGraphStats(null);
    setEntities([]);
    setClickedEntity(null);
    setPathResult(null);
    setSearchQuery("");
    setSearchResults([]);
    setHighlightNode(null);
    if (doc.status === "graph_ready") await loadGraph(doc.id);
    else if (doc.status === "graph_building") { setBuilding(true); startPolling(doc.id); }
  };

  const loadGraph = async (docId) => {
    setLoading(true);
    toastFiredRef.current = false;
    try {
      const [graphRes, statsRes, entRes] = await Promise.all([
        graphAPI.get(docId),
        graphAPI.getStats(docId).catch(() => ({ data: null })),
        graphAPI.getEntities(docId).catch(() => ({ data: { entities: [] } })),
      ]);
      setGraphData({ nodes: graphRes.data.nodes, edges: graphRes.data.edges });
      setGraphStats(statsRes.data);
      setEntities(entRes.data.entities || []);

      if (graphRes.data.node_count === 0 && !toastFiredRef.current) {
        toastFiredRef.current = true;
        toast.info("No entities found — try rebuilding the graph");
      }
    } catch {
      if (!toastFiredRef.current) {
        toastFiredRef.current = true;
        toast.error("Failed to load graph data");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBuildGraph = async () => {
    if (!selectedDoc) return;
    setBuilding(true);
    setGraphData({ nodes: [], edges: [] });
    toastFiredRef.current = false;
    try {
      await graphAPI.build(selectedDoc.id);
      toast.info("Building knowledge graph…");
      startPolling(selectedDoc.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to start graph build");
      setBuilding(false);
    }
  };

  const startPolling = (docId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await graphAPI.status(docId);
        if (data.status === "graph_ready") {
          clearInterval(pollRef.current); pollRef.current = null;
          setBuilding(false);
          setSelectedDoc((prev) => prev ? { ...prev, status: "graph_ready" } : prev);
          await loadGraph(docId);
          if (!toastFiredRef.current) { toastFiredRef.current = true; toast.success("Graph built!"); }
        } else if (data.status === "embedded" && data.error_msg) {
          clearInterval(pollRef.current); pollRef.current = null;
          setBuilding(false);
          if (!toastFiredRef.current) { toastFiredRef.current = true; toast.error(`Build failed: ${data.error_msg}`); }
        }
      } catch { clearInterval(pollRef.current); pollRef.current = null; setBuilding(false); }
    }, 3000);
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Graph search debounce
  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    setHighlightNode(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await graphAPI.search(q.trim());
        setSearchResults(data.results || []);
      } catch { setSearchResults([]); }
      finally  { setSearching(false); }
    }, 400);
  };

  const handleSearchSelect = (result) => {
    setHighlightNode(result.node);
    setSearchQuery(result.node);
    setSearchResults([]);
    setClickedEntity(result);
  };

  // Path finder
  const handleFindPath = async () => {
    if (!pathFrom.trim() || !pathTo.trim() || !selectedDoc) return;
    setFindingPath(true);
    setPathResult(null);
    try {
      const { data } = await graphAPI.findPath(selectedDoc.id, pathFrom.trim(), pathTo.trim());
      setPathResult(data);
      setShowPath(true);
      if (!data.found) toast.info("No path found between those entities");
    } catch { toast.error("Path search failed"); }
    finally  { setFindingPath(false); }
  };

  // Node click → entity panel
  const handleNodeClick = (node) => {
    const found = (graphAPI.search && entities.find((e) => e.name === node.id));
    setClickedEntity({ node: node.id, node_type: node.type, connections: [] });
    // Fetch connections
    graphAPI.search(node.id)
      .then(({ data }) => {
        const match = data.results?.find((r) => r.node === node.id);
        if (match) setClickedEntity(match);
      })
      .catch(() => {});
  };

  // Export graph
  const handleExport = async () => {
    if (!selectedDoc) return;
    try {
      const token    = localStorage.getItem("gm_token");
      const response = await fetch(
        `http://localhost:8000/api/graph/${selectedDoc.id}/export`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `graph_${selectedDoc.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Graph exported!");
    } catch { toast.error("Export failed"); }
  };

  const pathNodeIds  = pathResult?.found ? pathResult.path_nodes.map((n) => n.id) : [];
  const pathEdgeList = pathResult?.found ? pathResult.path_edges : [];
  const canBuild     = selectedDoc && ["embedded","graph_ready"].includes(selectedDoc.status) && !building;

  // Entity type distribution
  const typeDist = entities.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-[#0d0d14] px-6 py-4 flex items-center justify-between flex-shrink-0">
        <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight">GraphMind RAG</span>
        </button>
        <div className="flex items-center gap-3">
          {selectedDoc?.status === "graph_ready" && (
            <button onClick={handleExport}
              className="text-sm text-slate-400 hover:text-white border border-slate-700
                         hover:border-slate-600 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Export
            </button>
          )}
          <button onClick={() => navigate("/documents")} className="text-sm text-slate-400 hover:text-white transition">Documents</button>
          <button onClick={() => navigate("/dashboard")} className="text-sm text-slate-400 hover:text-white transition">Dashboard</button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — doc list + controls */}
        <aside className="w-72 border-r border-slate-800 bg-[#0d0d14] flex flex-col flex-shrink-0 overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-white font-semibold">Knowledge Graph</h2>
            <p className="text-slate-500 text-xs mt-1">Select an embedded document</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loadingDocs ? (
              <div className="flex justify-center py-8"><Spinner className="w-5 h-5 text-indigo-500"/></div>
            ) : docs.length === 0 ? (
              <div className="text-center py-10 px-4">
                <p className="text-slate-500 text-sm">No embedded documents yet</p>
                <button onClick={() => navigate("/documents")}
                  className="mt-3 text-indigo-400 hover:text-indigo-300 text-xs transition">
                  Upload and embed a document →
                </button>
              </div>
            ) : (
              docs.map((doc) => (
                <button key={doc.id} onClick={() => handleSelectDoc(doc)}
                  className={`w-full text-left p-3 rounded-lg transition ${
                    selectedDoc?.id === doc.id
                      ? "bg-indigo-600/20 border border-indigo-500/40"
                      : "hover:bg-slate-800 border border-transparent"
                  }`}>
                  <p className="text-white text-sm font-medium truncate">{doc.original_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      doc.status === "graph_ready"    ? "bg-emerald-500/20 text-emerald-400" :
                      doc.status === "graph_building" ? "bg-yellow-500/20  text-yellow-400"  :
                                                        "bg-blue-500/20    text-blue-400"
                    }`}>
                      {doc.status === "graph_ready" ? "Graph Ready" :
                       doc.status === "graph_building" ? "Building…" : "Embedded"}
                    </span>
                    <span className="text-slate-600 text-xs">{doc.chunk_count} chunks</span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Graph stats mini panel */}
          {graphStats && (
            <div className="px-4 py-3 border-t border-slate-800 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Nodes</span>
                <span className="text-white font-medium">{graphStats.node_count}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Edges</span>
                <span className="text-white font-medium">{graphStats.edge_count}</span>
              </div>
              {Object.entries(typeDist).slice(0, 3).map(([type, cnt]) => (
                <div key={type} className="flex justify-between text-xs">
                  <span className={`${TYPE_COLOR[type] || "text-slate-400"}`}>{type}</span>
                  <span className="text-slate-500">{cnt}</span>
                </div>
              ))}
            </div>
          )}

          {selectedDoc && (
            <div className="p-4 border-t border-slate-800 space-y-2">
              <button onClick={handleBuildGraph} disabled={!canBuild}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
                           disabled:cursor-not-allowed text-white text-sm font-medium
                           py-2.5 rounded-lg transition flex items-center justify-center gap-2">
                {building ? <><Spinner className="w-4 h-4"/> Building…</> :
                 selectedDoc.status === "graph_ready" ? "⟳ Rebuild" : "Build Graph"}
              </button>
            </div>
          )}
        </aside>

        {/* Main graph area */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {/* Tab bar */}
          {selectedDoc?.status === "graph_ready" && (
            <div className="border-b border-slate-800 bg-[#0d0d14] px-4 py-2 flex items-center gap-1 flex-shrink-0">
              {["graph", "entities", "pathfinder"].map((tab) => (
                <button key={tab} onClick={() => setActivePanel(tab)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition capitalize ${
                    activePanel === tab
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}>
                  {tab === "pathfinder" ? "Path Finder" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {tab === "entities" && entities.length > 0 && (
                    <span className="ml-1.5 text-xs opacity-60">({entities.length})</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* ── Graph tab ── */}
          {activePanel === "graph" && (
            <div className="flex-1 overflow-hidden relative">
              {/* Search bar */}
              {graphData.nodes.length > 0 && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-72">
                  <div className="relative">
                    <input value={searchQuery} onChange={handleSearchChange}
                      placeholder="Search entities…"
                      className="w-full bg-[#13131a]/95 border border-slate-700 text-white text-sm
                                 rounded-xl px-4 py-2 pl-9 focus:outline-none focus:border-indigo-500
                                 backdrop-blur-sm transition placeholder-slate-600"/>
                    <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" fill="none"
                         viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    {searching && <Spinner className="absolute right-3 top-2.5 w-4 h-4 text-indigo-400"/>}
                    {searchResults.length > 0 && (
                      <div className="absolute top-full mt-1 w-full bg-[#13131a] border border-slate-700
                                      rounded-xl shadow-2xl overflow-hidden z-30">
                        {searchResults.map((r, i) => (
                          <button key={i} onClick={() => handleSearchSelect(r)}
                            className="w-full text-left px-4 py-2.5 hover:bg-slate-800 transition
                                       flex items-center justify-between">
                            <div>
                              <span className="text-white text-sm font-medium">{r.node}</span>
                              <span className={`ml-2 text-xs ${TYPE_COLOR[r.node_type] || "text-slate-500"}`}>
                                {r.node_type}
                              </span>
                            </div>
                            <span className="text-slate-600 text-xs">{r.connections.length} links</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Stats bar */}
              {graphData.nodes.length > 0 && !searchQuery && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4
                                bg-[#13131a]/90 border border-slate-800 rounded-full px-5 py-2 text-xs">
                  <span className="text-slate-400">
                    <span className="text-white font-semibold">{graphData.nodes.length}</span> nodes
                  </span>
                  <span className="text-slate-700">·</span>
                  <span className="text-slate-400">
                    <span className="text-white font-semibold">{graphData.edges.length}</span> edges
                  </span>
                </div>
              )}

              {(loading || building) && graphData.nodes.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0f]">
                  <Spinner className="w-8 h-8 text-indigo-500 mb-4"/>
                  <p className="text-slate-400 text-sm">
                    {building ? "Extracting entities…" : "Loading graph…"}
                  </p>
                </div>
              )}

              {!selectedDoc && !loadingDocs && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-6xl mb-4">🕸️</div>
                  <p className="text-slate-400 font-medium">Select a document to visualize</p>
                </div>
              )}

              <KnowledgeGraph
                nodes={graphData.nodes}
                edges={graphData.edges}
                highlightNode={highlightNode}
                pathNodes={showPath ? pathNodeIds : []}
                pathEdges={showPath ? pathEdgeList : []}
                onNodeClick={handleNodeClick}
              />

              {/* Entity panel (click on node) */}
              {clickedEntity && (
                <div className="absolute top-3 right-3 w-64 bg-[#13131a]/95 border border-slate-700
                                rounded-xl p-4 text-sm shadow-2xl backdrop-blur-sm z-20">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-medium ${TYPE_COLOR[clickedEntity.node_type] || "text-slate-400"}`}>
                      {clickedEntity.node_type || "Entity"}
                    </span>
                    <button onClick={() => setClickedEntity(null)}
                      className="text-slate-500 hover:text-white transition text-xs">✕</button>
                  </div>
                  <p className="text-white font-semibold mb-3 break-words">{clickedEntity.node}</p>

                  {clickedEntity.connections?.length > 0 && (
                    <>
                      <p className="text-slate-500 text-xs mb-2 uppercase tracking-wide">
                        Connections ({clickedEntity.connections.length})
                      </p>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 mb-3">
                        {clickedEntity.connections.slice(0, 8).map((c, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className="text-slate-600 mt-0.5 flex-shrink-0">
                              {c.direction === "out" ? "→" : "←"}
                            </span>
                            <div>
                              <span className="text-indigo-400">{c.relation}</span>
                              <span className="text-slate-400"> · {c.neighbor}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Ask about this */}
                  <button
                    onClick={() => navigate(`/chat?q=${encodeURIComponent(`Tell me about ${clickedEntity.node}`)}`)}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs
                               font-medium py-2 rounded-lg transition flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                    </svg>
                    Ask about this entity
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Entities tab ── */}
          {activePanel === "entities" && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-white font-semibold">All Entities</h2>
                <span className="text-slate-500 text-sm">{entities.length} total</span>
              </div>

              {/* Type breakdown */}
              {Object.keys(typeDist).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {Object.entries(typeDist).map(([type, cnt]) => (
                    <span key={type}
                      className={`text-xs px-2.5 py-1 rounded-full border ${
                        type === "Person"       ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-400" :
                        type === "Organization" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                        type === "Place"        ? "border-amber-500/30  bg-amber-500/10  text-amber-400"  :
                                                  "border-blue-500/30   bg-blue-500/10   text-blue-400"
                      }`}>
                      {type}: {cnt}
                    </span>
                  ))}
                </div>
              )}

              {/* Entity table */}
              <div className="bg-[#13131a] border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left text-slate-500 text-xs font-medium px-4 py-3">Entity</th>
                      <th className="text-left text-slate-500 text-xs font-medium px-4 py-3">Type</th>
                      <th className="text-right text-slate-500 text-xs font-medium px-4 py-3">Connections</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entities.map((e, i) => (
                      <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3 text-white font-medium">{e.name}</td>
                        <td className={`px-4 py-3 text-xs ${TYPE_COLOR[e.type] || "text-slate-400"}`}>{e.type}</td>
                        <td className="px-4 py-3 text-right text-slate-400 text-xs">{e.degree}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => {
                              setHighlightNode(e.name);
                              setActivePanel("graph");
                              setClickedEntity({ node: e.name, node_type: e.type, connections: [] });
                              graphAPI.search(e.name).then(({ data }) => {
                                const m = data.results?.find((r) => r.node === e.name);
                                if (m) setClickedEntity(m);
                              }).catch(() => {});
                            }}
                            className="text-indigo-400 hover:text-indigo-300 text-xs transition"
                          >
                            View →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Path Finder tab ── */}
          {activePanel === "pathfinder" && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-6">
                <h2 className="text-white font-semibold mb-1">Path Finder</h2>
                <p className="text-slate-500 text-sm">Find the shortest path between two entities in the graph</p>
              </div>

              <div className="bg-[#13131a] border border-slate-800 rounded-xl p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 text-xs mb-1.5">From entity</label>
                    <input value={pathFrom} onChange={(e) => setPathFrom(e.target.value)}
                      placeholder="e.g. Neural network"
                      className="w-full bg-[#1c1c26] border border-slate-700 text-white rounded-lg
                                 px-3 py-2 text-sm placeholder-slate-600 focus:outline-none
                                 focus:border-indigo-500 transition"/>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs mb-1.5">To entity</label>
                    <input value={pathTo} onChange={(e) => setPathTo(e.target.value)}
                      placeholder="e.g. Transformer"
                      className="w-full bg-[#1c1c26] border border-slate-700 text-white rounded-lg
                                 px-3 py-2 text-sm placeholder-slate-600 focus:outline-none
                                 focus:border-indigo-500 transition"/>
                  </div>
                </div>

                <button onClick={handleFindPath} disabled={findingPath || !pathFrom || !pathTo}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white
                             text-sm font-medium py-2.5 rounded-lg transition flex items-center justify-center gap-2">
                  {findingPath ? <><Spinner className="w-4 h-4"/> Finding path…</> : "Find Shortest Path"}
                </button>

                {/* Path result */}
                {pathResult && (
                  <div className={`p-4 rounded-xl border ${
                    pathResult.found
                      ? "border-amber-500/30 bg-amber-500/10"
                      : "border-red-500/30  bg-red-500/10"
                  }`}>
                    {pathResult.found ? (
                      <>
                        <p className="text-amber-400 text-sm font-medium mb-3">
                          Path found! Length: {pathResult.length} hop{pathResult.length !== 1 ? "s" : ""}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          {pathResult.path_nodes.map((node, i) => (
                            <span key={i} className="flex items-center gap-2">
                              <span className="bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-lg text-xs font-medium">
                                {node.label}
                              </span>
                              {i < pathResult.path_edges.length && (
                                <span className="text-slate-500 text-xs">
                                  —{pathResult.path_edges[i]?.relation}→
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={() => { setActivePanel("graph"); setShowPath(true); }}
                          className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition"
                        >
                          Highlight path in graph →
                        </button>
                      </>
                    ) : (
                      <p className="text-red-400 text-sm">
                        No path found between "{pathResult.from}" and "{pathResult.to}"
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Top entities hint */}
              {graphStats?.top_entities?.length > 0 && (
                <div className="mt-6">
                  <p className="text-slate-500 text-xs mb-3">Most connected entities (click to use):</p>
                  <div className="flex flex-wrap gap-2">
                    {graphStats.top_entities.slice(0, 8).map((e, i) => (
                      <button key={i}
                        onClick={() => { if (!pathFrom) setPathFrom(e.name); else setPathTo(e.name); }}
                        className="text-xs bg-[#13131a] border border-slate-800 hover:border-slate-600
                                   text-slate-300 px-3 py-1.5 rounded-lg transition">
                        {e.name}
                        <span className="ml-1.5 text-slate-600">{e.degree}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Spinner({ className = "w-4 h-4" }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  );
}