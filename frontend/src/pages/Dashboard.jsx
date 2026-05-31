import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import ProjectModal from "../components/ProjectModal";
import { authAPI, documentsAPI, projectsAPI } from "../services/api";

export default function Dashboard() {
  const navigate  = useNavigate();
  const [user,     setUser]     = useState(null);
  const [docs,     setDocs]     = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showModal,setShowModal]= useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("gm_user");
    if (stored) setUser(JSON.parse(stored));
    else {
      authAPI.me()
        .then(({ data }) => { setUser(data); localStorage.setItem("gm_user", JSON.stringify(data)); })
        .catch(() => navigate("/login"));
    }
  }, [navigate]);

  useEffect(() => {
    Promise.all([documentsAPI.list(), projectsAPI.list()])
      .then(([docsRes, projRes]) => {
        setDocs(docsRes.data);
        setProjects(projRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("gm_token");
    localStorage.removeItem("gm_user");
    navigate("/login");
  };

  const handleProjectCreated = (newProject) => {
    setProjects((prev) => [newProject, ...prev]);
    setShowModal(false);
  };

  const readyDocs   = docs.filter((d) => d.status === "ready").length;
  const totalChunks = docs.reduce((s, d) => s + (d.chunk_count || 0), 0);

  if (!user) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <svg className="animate-spin w-6 h-6 text-indigo-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {showModal && (
        <ProjectModal
          onClose={() => setShowModal(false)}
          onCreated={handleProjectCreated}
        />
      )}

      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-[#0d0d14] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight">GraphMind RAG</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/documents" className="text-sm text-slate-400 hover:text-white transition">Documents</Link>
          <Link to="/graph"     className="text-sm text-slate-400 hover:text-white transition">Graph</Link>
          <Link to="/chat"      className="text-sm text-slate-400 hover:text-white transition">Chat</Link>
          <span className="text-slate-600 text-sm">{user.email}</span>
          <button onClick={handleLogout}
            className="text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition">
            Logout
          </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Welcome */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">
            Welcome, {user.full_name?.split(" ")[0] || "there"} 👋
          </h1>
          <p className="text-slate-400">Your knowledge graph workspace.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-10">
          {[
            { label: "Documents", value: loading ? "…" : docs.length,     sub: `${readyDocs} ready`,        icon: "📄", href: "/documents" },
            { label: "Projects",  value: loading ? "…" : projects.length, sub: "Knowledge bases",           icon: "📁", href: null },
            { label: "Chunks",    value: loading ? "…" : totalChunks,     sub: "Stored for retrieval",      icon: "🔢", href: null },
            { label: "Chat",      value: "→",                              sub: "Ask your documents",        icon: "💬", href: "/chat"  },
          ].map((card) => (
            <div key={card.label}
              onClick={() => card.href && navigate(card.href)}
              className={`bg-[#13131a] border border-slate-800 rounded-xl p-5 transition
                ${card.href ? "cursor-pointer hover:border-indigo-500/50" : ""}`}>
              <div className="text-2xl mb-3">{card.icon}</div>
              <div className="text-2xl font-bold text-white mb-0.5">{card.value}</div>
              <div className="text-slate-400 text-sm font-medium">{card.label}</div>
              <div className="text-slate-600 text-xs mt-1">{card.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Projects */}
          <div className="bg-[#13131a] border border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Projects</h2>
              <button
                onClick={() => setShowModal(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs
                           font-medium px-3 py-1.5 rounded-lg transition flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                </svg>
                New Project
              </button>
            </div>

            {loading ? (
              <p className="text-slate-500 text-sm">Loading…</p>
            ) : projects.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-slate-500 text-sm mb-3">No projects yet</p>
                <button onClick={() => setShowModal(true)}
                  className="text-indigo-400 hover:text-indigo-300 text-sm transition">
                  Create your first project →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.map((p) => (
                  <button key={p.id}
                    onClick={() => navigate(`/project/${p.id}`)}
                    className="w-full text-left p-3 rounded-lg hover:bg-slate-800
                               border border-transparent hover:border-slate-700 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white text-sm font-medium">{p.name}</span>
                      <span className="text-slate-600 text-xs">{p.document_count} docs</span>
                    </div>
                    {p.description && (
                      <p className="text-slate-500 text-xs mt-0.5 truncate">{p.description}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recent docs */}
          <div className="bg-[#13131a] border border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Recent Documents</h2>
              <Link to="/documents" className="text-indigo-400 hover:text-indigo-300 text-sm transition">
                View all →
              </Link>
            </div>

            {loading ? (
              <p className="text-slate-500 text-sm">Loading…</p>
            ) : docs.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-slate-500 text-sm mb-3">No documents yet</p>
                <Link to="/documents"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition">
                  Upload first document
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {docs.slice(0, 6).map((doc) => (
                  <div key={doc.id}
                    className="flex items-center justify-between py-2
                               border-b border-slate-800 last:border-0">
                    <span className="text-sm text-slate-300 truncate max-w-xs">{doc.original_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                      doc.status === "graph_ready" ? "bg-emerald-500/20 text-emerald-400" :
                      doc.status === "embedded"    ? "bg-blue-500/20    text-blue-400"    :
                      doc.status === "ready"       ? "bg-yellow-500/20  text-yellow-400"  :
                                                     "bg-slate-500/20   text-slate-400"
                    }`}>
                      {doc.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Build progress */}
        <div className="mt-6 bg-[#13131a] border border-slate-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">10-Day Build Progress</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { day: 1, label: "Auth",        done: true  },
              { day: 2, label: "Upload",       done: true  },
              { day: 3, label: "Embeddings",   done: true  },
              { day: 4, label: "Graph",        done: true  },
              { day: 5, label: "RAG Chat",     done: true  },
              { day: 6, label: "Projects",     done: true  },
              { day: 7, label: "Multi-KB",     done: false },
              { day: 8, label: "Team",         done: false },
              { day: 9, label: "Performance",  done: false },
              { day: 10, label: "Deploy",      done: false },
            ].map((item) => (
              <div key={item.day}
                className={`flex flex-col items-center p-3 rounded-xl border text-xs font-medium ${
                  item.done
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-slate-800/50 border-slate-800 text-slate-600"
                }`}>
                <span className="text-lg mb-1">{item.done ? "✓" : item.day}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}