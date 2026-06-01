import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import KnowledgeGraph from "../components/KnowledgeGraph";
import { documentsAPI, graphAPI } from "../services/api";
import { toast } from "../components/Toast";

export default function GraphView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [docs,         setDocs]         = useState([]);
  const [selectedDoc,  setSelectedDoc]  = useState(null);
  const [graphData,    setGraphData]    = useState({ nodes: [], edges: [] });
  const [loading,      setLoading]      = useState(false);
  const [building,     setBuilding]     = useState(false);
  const [loadingDocs,  setLoadingDocs]  = useState(true);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [searchResults,setSearchResults]= useState([]);
  const [searching,    setSearching]    = useState(false);
  const [highlightNode,setHighlightNode]= useState(null);

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
      const { data } = await graphAPI.get(docId);
      setGraphData({ nodes: data.nodes, edges: data.edges });
      if (data.node_count === 0 && !toastFiredRef.current) {
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
      toast.info("Building knowledge graph with Ollama LLM…");
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
          if (!toastFiredRef.current) {
            toastFiredRef.current = true;
            toast.success("Knowledge graph built successfully!");
          }
        } else if (data.status === "embedded" && data.error_msg) {
          clearInterval(pollRef.current); pollRef.current = null;
          setBuilding(false);
          if (!toastFiredRef.current) {
            toastFiredRef.current = true;
            toast.error(`Graph build failed: ${data.error_msg}`);
          }
        }
      } catch {
        clearInterval(pollRef.current); pollRef.current = null;
        setBuilding(false);
      }
    }, 3000);
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Graph search with debounce ─────────────────────────────────────────
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
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const handleSearchSelect = (result) => {
    setHighlightNode(result.node);
    setSearchQuery(result.node);
    setSearchResults([]);
  };

  const canBuild = selectedDoc &&
    ["embedded", "graph_ready"].includes(selectedDoc.status) && !building;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
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
          <button onClick={() => navigate("/documents")} className="text-sm text-slate-400 hover:text-white transition">Documents</button>
          <button onClick={() => navigate("/dashboard")} className="text-sm text-slate-400 hover:text-white transition">Dashboard</button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 border-r border-slate-800 bg-[#0d0d14] flex flex-col flex-shrink-0 overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-white font-semibold">Knowledge Graph</h2>
            <p className="text-slate-500 text-xs mt-1">Select an embedded document</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loadingDocs ? (
              <div className="flex justify-center py-8">
                <Spinner className="w-5 h-5 text-indigo-500"/>
              </div>
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

          {selectedDoc && (
            <div className="p-4 border-t border-slate-800 space-y-3">
              <button onClick={handleBuildGraph} disabled={!canBuild}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
                           disabled:cursor-not-allowed text-white text-sm font-medium
                           py-2.5 rounded-lg transition flex items-center justify-center gap-2">
                {building ? <><Spinner className="w-4 h-4"/> Building graph…</> :
                 selectedDoc.status === "graph_ready" ? "⟳ Rebuild Graph" : "Build Knowledge Graph"}
              </button>
              {building && (
                <p className="text-slate-500 text-xs text-center">Extracting entities… (30–90s)</p>
              )}
            </div>
          )}
        </aside>

        {/* Graph canvas */}
        <main className="flex-1 overflow-hidden relative">
          {/* Search bar */}
          {graphData.nodes.length > 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-80">
              <div className="relative">
                <input
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Search entities…"
                  className="w-full bg-[#13131a]/95 border border-slate-700 text-white text-sm
                             rounded-xl px-4 py-2 pl-9 focus:outline-none focus:border-indigo-500
                             backdrop-blur-sm transition placeholder-slate-600"
                />
                <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" fill="none"
                     viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                {searching && (
                  <Spinner className="absolute right-3 top-2.5 w-4 h-4 text-indigo-400"/>
                )}

                {/* Search results dropdown */}
                {searchResults.length > 0 && (
                  <div className="absolute top-full mt-1 w-full bg-[#13131a] border border-slate-700
                                  rounded-xl shadow-2xl overflow-hidden z-30">
                    {searchResults.map((r, i) => (
                      <button key={i} onClick={() => handleSearchSelect(r)}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-800 transition
                                   flex items-center justify-between">
                        <div>
                          <span className="text-white text-sm font-medium">{r.node}</span>
                          <span className="text-slate-500 text-xs ml-2">{r.node_type}</span>
                        </div>
                        <span className="text-slate-600 text-xs">{r.connections.length} connections</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Highlighted node detail */}
              {highlightNode && (
                <div className="mt-2 bg-[#13131a]/95 border border-indigo-500/40 rounded-xl p-3
                                backdrop-blur-sm text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-indigo-300 font-medium">{highlightNode}</span>
                    <button onClick={() => { setHighlightNode(null); setSearchQuery(""); }}
                      className="text-slate-500 hover:text-white transition">✕</button>
                  </div>
                  {searchResults.length === 0 && (
                    <p className="text-slate-500">Node highlighted in graph</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Stats bar */}
          {graphData.nodes.length > 0 && !searchQuery && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4
                            bg-[#13131a]/90 border border-slate-800 rounded-full px-5 py-2 text-xs">
              <span className="text-slate-400">
                <span className="text-white font-semibold">{graphData.nodes.length}</span> nodes
              </span>
              <span className="text-slate-700">·</span>
              <span className="text-slate-400">
                <span className="text-white font-semibold">{graphData.edges.length}</span> relationships
              </span>
            </div>
          )}

          {(loading || building) && graphData.nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0f]">
              <Spinner className="w-8 h-8 text-indigo-500 mb-4"/>
              <p className="text-slate-400 text-sm">
                {building ? "Extracting entities and relationships…" : "Loading graph…"}
              </p>
              {building && <p className="text-slate-600 text-xs mt-1">This may take 30–90 seconds</p>}
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
          />
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