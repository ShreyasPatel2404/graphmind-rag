import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import KnowledgeGraph from "../components/KnowledgeGraph";
import { documentsAPI, graphAPI } from "../services/api";
import { toast } from "../components/Toast";

export default function GraphView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [docs,       setDocs]       = useState([]);
  const [selectedDoc,setSelectedDoc]= useState(null);
  const [graphData,  setGraphData]  = useState({ nodes: [], edges: [] });
  const [loading,    setLoading]    = useState(false);
  const [building,   setBuilding]   = useState(false);
  const [loadingDocs,setLoadingDocs]= useState(true);

  const pollRef      = useRef(null);
  const toastFiredRef= useRef(false);

  // ─── Load documents on mount ─────────────────────────────────────────────
  useEffect(() => {
    documentsAPI.list()
      .then(({ data }) => {
        // Only show embedded or graph_ready docs
        const eligible = data.filter((d) =>
          ["embedded", "graph_ready", "graph_building"].includes(d.status)
        );
        setDocs(eligible);

        // Auto-select from URL param
        const paramId = searchParams.get("doc");
        if (paramId) {
          const found = eligible.find((d) => d.id === parseInt(paramId));
          if (found) handleSelectDoc(found);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDocs(false));
  }, []);

  // ─── Select a document ───────────────────────────────────────────────────
  const handleSelectDoc = async (doc) => {
    setSelectedDoc(doc);
    setGraphData({ nodes: [], edges: [] });

    if (doc.status === "graph_ready") {
      await loadGraph(doc.id);
    } else if (doc.status === "graph_building") {
      setBuilding(true);
      startPolling(doc.id);
    }
  };

  // ─── Load graph data ─────────────────────────────────────────────────────
  const loadGraph = async (docId) => {
    setLoading(true);
    try {
      const { data } = await graphAPI.get(docId);
      setGraphData({ nodes: data.nodes, edges: data.edges });
      if (data.node_count === 0) {
        toast.info("Graph built but no entities found — try a different document");
      }
    } catch {
      toast.error("Failed to load graph data");
    } finally {
      setLoading(false);
    }
  };

  // ─── Build graph ─────────────────────────────────────────────────────────
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
      const msg = err.response?.data?.detail || "Failed to start graph build";
      toast.error(msg);
      setBuilding(false);
    }
  };

  // ─── Poll for graph_ready ────────────────────────────────────────────────
  const startPolling = (docId) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const { data } = await graphAPI.status(docId);

        if (data.status === "graph_ready") {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setBuilding(false);
          setSelectedDoc((prev) => ({ ...prev, status: "graph_ready" }));
          await loadGraph(docId);
          if (!toastFiredRef.current) {
            toastFiredRef.current = true;
            toast.success("Knowledge graph built successfully!");
          }
        } else if (data.status === "embedded" && data.error_msg) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setBuilding(false);
          if (!toastFiredRef.current) {
            toastFiredRef.current = true;
            toast.error(`Graph build failed: ${data.error_msg}`);
          }
        }
      } catch {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setBuilding(false);
      }
    }, 3000);
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const canBuild = selectedDoc &&
    ["embedded", "graph_ready"].includes(selectedDoc.status) &&
    !building;

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

          {/* Doc list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loadingDocs ? (
              <div className="flex justify-center py-8">
                <Spinner className="w-5 h-5 text-indigo-500" />
              </div>
            ) : docs.length === 0 ? (
              <div className="text-center py-10 px-4">
                <p className="text-slate-500 text-sm">No embedded documents yet</p>
                <button
                  onClick={() => navigate("/documents")}
                  className="mt-3 text-indigo-400 hover:text-indigo-300 text-xs transition"
                >
                  Upload and embed a document →
                </button>
              </div>
            ) : (
              docs.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => handleSelectDoc(doc)}
                  className={`w-full text-left p-3 rounded-lg transition ${
                    selectedDoc?.id === doc.id
                      ? "bg-indigo-600/20 border border-indigo-500/40"
                      : "hover:bg-slate-800 border border-transparent"
                  }`}
                >
                  <p className="text-white text-sm font-medium truncate">{doc.original_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      doc.status === "graph_ready"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : doc.status === "graph_building"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-blue-500/20 text-blue-400"
                    }`}>
                      {doc.status === "graph_ready"    ? "Graph Ready" :
                       doc.status === "graph_building" ? "Building…"   : "Embedded"}
                    </span>
                    <span className="text-slate-600 text-xs">{doc.chunk_count} chunks</span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Build button */}
          {selectedDoc && (
            <div className="p-4 border-t border-slate-800">
              <button
                onClick={handleBuildGraph}
                disabled={!canBuild}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
                           disabled:cursor-not-allowed text-white text-sm font-medium
                           py-2.5 rounded-lg transition flex items-center justify-center gap-2"
              >
                {building ? (
                  <><Spinner className="w-4 h-4" /> Building graph…</>
                ) : selectedDoc.status === "graph_ready" ? (
                  <><RebuildIcon /> Rebuild Graph</>
                ) : (
                  <><BuildIcon /> Build Knowledge Graph</>
                )}
              </button>

              {building && (
                <p className="text-slate-500 text-xs text-center mt-2">
                  Extracting entities with Ollama LLM…
                </p>
              )}
            </div>
          )}
        </aside>

        {/* Graph canvas */}
        <main className="flex-1 overflow-hidden relative">
          {/* Stats bar */}
          {graphData.nodes.length > 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4
                            bg-[#13131a]/90 border border-slate-800 rounded-full px-5 py-2 text-xs">
              <span className="text-slate-400">
                <span className="text-white font-semibold">{graphData.nodes.length}</span> nodes
              </span>
              <span className="text-slate-700">·</span>
              <span className="text-slate-400">
                <span className="text-white font-semibold">{graphData.edges.length}</span> relationships
              </span>
              {selectedDoc && (
                <>
                  <span className="text-slate-700">·</span>
                  <span className="text-slate-500 max-w-[160px] truncate">{selectedDoc.original_name}</span>
                </>
              )}
            </div>
          )}

          {/* Loading overlay */}
          {(loading || building) && graphData.nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0f]">
              <Spinner className="w-8 h-8 text-indigo-500 mb-4" />
              <p className="text-slate-400 text-sm">
                {building ? "Extracting entities and relationships…" : "Loading graph…"}
              </p>
              {building && (
                <p className="text-slate-600 text-xs mt-1">This may take 30–90 seconds</p>
              )}
            </div>
          )}

          {/* No doc selected */}
          {!selectedDoc && !loadingDocs && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-6xl mb-4">🕸️</div>
              <p className="text-slate-400 font-medium">Select a document to visualize</p>
              <p className="text-slate-600 text-sm mt-1">
                Choose an embedded document from the sidebar
              </p>
            </div>
          )}

          <KnowledgeGraph nodes={graphData.nodes} edges={graphData.edges} />
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

function BuildIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
    </svg>
  );
}

function RebuildIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}