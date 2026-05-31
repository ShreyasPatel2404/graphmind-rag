import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import KnowledgeGraph from "../components/KnowledgeGraph";
import { projectsAPI, documentsAPI } from "../services/api";
import { toast } from "../components/Toast";

export default function ProjectView() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const [project, setProject] = useState(null);
  const [docs,    setDocs]    = useState([]);
  const [graph,   setGraph]   = useState({ nodes: [], edges: [] });
  const [allDocs, setAllDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState("docs"); // docs | graph

  useEffect(() => {
    const load = async () => {
      try {
        const [projRes, docsRes, graphRes, allDocsRes] = await Promise.all([
          projectsAPI.get(id),
          projectsAPI.getDocuments(id),
          projectsAPI.getGraph(id).catch(() => ({ data: { nodes: [], edges: [] } })),
          documentsAPI.list(),
        ]);
        setProject(projRes.data);
        setDocs(docsRes.data);
        setGraph(graphRes.data);
        setAllDocs(allDocsRes.data.filter((d) =>
          ["ready","embedded","graph_ready"].includes(d.status) && !d.project_id
        ));
      } catch {
        toast.error("Failed to load project");
        navigate("/dashboard");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleAddDoc = async (docId) => {
    try {
      await projectsAPI.addDocuments(id, [docId]);
      const [docsRes, allDocsRes] = await Promise.all([
        projectsAPI.getDocuments(id),
        documentsAPI.list(),
      ]);
      setDocs(docsRes.data);
      setAllDocs(allDocsRes.data.filter((d) =>
        ["ready","embedded","graph_ready"].includes(d.status) && !d.project_id
      ));
      toast.success("Document added to project");
    } catch {
      toast.error("Failed to add document");
    }
  };

  const handleRemoveDoc = async (docId) => {
    try {
      await projectsAPI.removeDocument(id, docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      toast.success("Document removed from project");
    } catch {
      toast.error("Failed to remove document");
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <svg className="animate-spin w-6 h-6 text-indigo-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
    </div>
  );

  const statusColor = (s) =>
    s === "graph_ready"    ? "bg-emerald-500/20 text-emerald-400" :
    s === "embedded"       ? "bg-blue-500/20    text-blue-400"    :
    s === "ready"          ? "bg-yellow-500/20  text-yellow-400"  :
                             "bg-slate-500/20   text-slate-400";

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-[#0d0d14] px-6 py-4 flex items-center justify-between">
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
          <button
            onClick={() => navigate(`/chat?project=${id}`)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium
                       px-4 py-2 rounded-lg transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
            Chat with Project
          </button>
          <button onClick={() => navigate("/dashboard")}
            className="text-sm text-slate-400 hover:text-white transition">
            Dashboard
          </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">{project?.name}</h1>
              {project?.description && (
                <p className="text-slate-400 text-sm">{project.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span>{docs.length} documents</span>
              <span>·</span>
              <span>{graph.node_count || 0} graph nodes</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-[#13131a] border border-slate-800 rounded-xl p-1 w-fit">
          {["docs", "graph"].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-1.5 rounded-lg text-sm font-medium transition capitalize ${
                tab === t ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
              }`}>
              {t === "docs" ? `Documents (${docs.length})` : `Merged Graph`}
            </button>
          ))}
        </div>

        {tab === "docs" && (
          <div className="space-y-4">
            {/* Current docs */}
            {docs.length === 0 ? (
              <div className="text-center py-12 bg-[#13131a] border border-slate-800 rounded-xl">
                <p className="text-slate-400 mb-2">No documents in this project yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div key={doc.id}
                    className="group bg-[#13131a] border border-slate-800 rounded-xl p-4
                               flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">
                        {doc.file_type === "pdf" ? "📄" :
                         doc.file_type === "docx" ? "📝" : "📃"}
                      </span>
                      <div>
                        <p className="text-white text-sm font-medium">{doc.original_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(doc.status)}`}>
                            {doc.status}
                          </span>
                          <span className="text-slate-600 text-xs">{doc.chunk_count} chunks</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveDoc(doc.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-600
                                 hover:text-red-400 transition text-xs"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add more docs */}
            {allDocs.length > 0 && (
              <div className="bg-[#13131a] border border-slate-800 rounded-xl p-5">
                <p className="text-slate-400 text-sm font-medium mb-3">Add more documents</p>
                <div className="space-y-2">
                  {allDocs.map((doc) => (
                    <div key={doc.id}
                      className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                      <span className="text-slate-300 text-sm truncate">{doc.original_name}</span>
                      <button
                        onClick={() => handleAddDoc(doc.id)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition ml-4 flex-shrink-0"
                      >
                        + Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "graph" && (
          <div className="bg-[#13131a] border border-slate-800 rounded-xl overflow-hidden"
               style={{ height: "500px" }}>
            <KnowledgeGraph nodes={graph.nodes || []} edges={graph.edges || []} />
          </div>
        )}
      </main>
    </div>
  );
}