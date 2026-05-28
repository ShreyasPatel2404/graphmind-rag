import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authAPI, documentsAPI } from "../services/api";

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser]   = useState(null);
  const [docs, setDocs]   = useState([]);
  const [loading, setLoading] = useState(true);

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
    documentsAPI.list()
      .then(({ data }) => setDocs(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("gm_token");
    localStorage.removeItem("gm_user");
    navigate("/login");
  };

  const readyDocs      = docs.filter((d) => d.status === "ready").length;
  const processingDocs = docs.filter((d) => d.status === "processing").length;
  const totalChunks    = docs.reduce((s, d) => s + (d.chunk_count || 0), 0);

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <svg className="animate-spin w-6 h-6 text-indigo-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
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
          <Link to="/documents" className="text-sm text-slate-400 hover:text-white transition">
            Documents
          </Link>
          <span className="text-slate-600 text-sm">{user.email}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition"
          >
            Logout
          </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-16">
        {/* Welcome */}
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-white mb-2">
            Welcome, {user.full_name?.split(" ")[0] || "there"} 👋
          </h1>
          <p className="text-slate-400">Your knowledge graph workspace.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {[
            {
              label: "Documents",
              value: loading ? "…" : docs.length,
              sub: `${readyDocs} ready${processingDocs > 0 ? ` · ${processingDocs} processing` : ""}`,
              icon: "📄",
              href: "/documents",
            },
            {
              label: "Text Chunks",
              value: loading ? "…" : totalChunks,
              sub: "Stored for retrieval",
              icon: "🔢",
              href: null,
            },
            {
              label: "Chat Sessions",
              value: "0",
              sub: "Available Day 4",
              icon: "💬",
              href: null,
            },
          ].map((card) => (
            <div
              key={card.label}
              onClick={() => card.href && navigate(card.href)}
              className={`bg-[#13131a] border border-slate-800 rounded-xl p-5 transition ${
                card.href ? "cursor-pointer hover:border-indigo-500/50" : ""
              }`}
            >
              <div className="text-2xl mb-3">{card.icon}</div>
              <div className="text-2xl font-bold text-white mb-0.5">{card.value}</div>
              <div className="text-slate-400 text-sm font-medium">{card.label}</div>
              <div className="text-slate-600 text-xs mt-1">{card.sub}</div>
            </div>
          ))}
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
            <div className="text-center py-8">
              <p className="text-slate-500 text-sm mb-3">No documents uploaded yet</p>
              <Link
                to="/documents"
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition"
              >
                Upload your first document
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {docs.slice(0, 5).map((doc) => (
                <div key={doc.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                  <span className="text-sm text-slate-300 truncate max-w-xs">{doc.original_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    doc.status === "ready"      ? "bg-emerald-500/20 text-emerald-400" :
                    doc.status === "processing" ? "bg-yellow-500/20 text-yellow-400" :
                                                  "bg-red-500/20 text-red-400"
                  }`}>
                    {doc.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Build progress */}
        <div className="mt-6 bg-[#13131a] border border-slate-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">10-Day Build Progress</h2>
          <div className="space-y-1.5">
            {[
              { day: 1, label: "Auth System",                done: true  },
              { day: 2, label: "Document Upload Pipeline",   done: true  },
              { day: 3, label: "Knowledge Graph Builder",    done: false },
              { day: 4, label: "Hybrid RAG + Chat",          done: false },
              { day: 5, label: "Citations System",           done: false },
              { day: 6, label: "Graph Visualization (D3)",   done: false },
              { day: 7, label: "Projects + Multi-KB",        done: false },
              { day: 8, label: "Team Collaboration",         done: false },
              { day: 9, label: "Performance + Caching",      done: false },
              { day: 10, label: "Polish + Deploy",           done: false },
            ].map((item) => (
              <div key={item.day} className="flex items-center gap-3 text-sm">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  item.done ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-600"
                }`}>
                  {item.done ? "✓" : item.day}
                </span>
                <span className={item.done ? "text-slate-300" : "text-slate-600"}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}