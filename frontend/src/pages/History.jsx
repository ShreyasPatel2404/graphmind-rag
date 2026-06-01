import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { chatAPI, statsAPI } from "../services/api";
import { toast } from "../components/Toast";

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function History() {
  const navigate = useNavigate();
  const [sessions,  setSessions]  = useState([]);
  const [filtered,  setFiltered]  = useState([]);
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(true);
  const [exporting, setExporting] = useState(null);

  useEffect(() => {
    chatAPI.listSessions()
      .then(({ data }) => { setSessions(data); setFiltered(data); })
      .catch(() => toast.error("Failed to load history"))
      .finally(() => setLoading(false));
  }, []);

  // Search filter
  useEffect(() => {
    if (!search.trim()) { setFiltered(sessions); return; }
    const q = search.toLowerCase();
    setFiltered(sessions.filter((s) => s.title.toLowerCase().includes(q)));
  }, [search, sessions]);

  const handleDelete = async (id) => {
    if (!confirm("Delete this chat session?")) return;
    try {
      await chatAPI.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      toast.success("Session deleted");
    } catch { toast.error("Failed to delete"); }
  };

  const handleExport = async (id, title) => {
    setExporting(id);
    try {
      const token    = localStorage.getItem("gm_token");
      const response = await fetch(`http://localhost:8000/api/chat/${id}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `chat_${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported "${title}"`);
    } catch { toast.error("Export failed"); }
    finally  { setExporting(null); }
  };

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
          <button onClick={() => navigate("/chat")}      className="text-sm text-slate-400 hover:text-white transition">New Chat</button>
          <button onClick={() => navigate("/dashboard")} className="text-sm text-slate-400 hover:text-white transition">Dashboard</button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Chat History</h1>
            <p className="text-slate-400 text-sm">{sessions.length} sessions</p>
          </div>
          <button onClick={() => navigate("/chat")}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium
                       px-4 py-2 rounded-lg transition flex items-center gap-2">
            + New Chat
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" fill="none"
               viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats…"
            className="w-full bg-[#13131a] border border-slate-800 text-white rounded-xl
                       px-4 py-2.5 pl-10 text-sm placeholder-slate-600 focus:outline-none
                       focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
        </div>

        {/* Sessions list */}
        {loading ? (
          <div className="flex justify-center py-20">
            <svg className="animate-spin w-6 h-6 text-indigo-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">💬</div>
            <p className="text-slate-400">{search ? "No matching chats" : "No chat history yet"}</p>
            {!search && (
              <button onClick={() => navigate("/chat")}
                className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm transition">
                Start your first chat →
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((s) => (
              <div key={s.id}
                className="group bg-[#13131a] border border-slate-800 hover:border-slate-700
                           rounded-xl p-5 transition">
                <div className="flex items-start justify-between gap-4">
                  {/* Title + meta */}
                  <button
                    onClick={() => navigate(`/chat?session=${s.id}`)}
                    className="flex-1 text-left"
                  >
                    <p className="text-white font-medium mb-1 hover:text-indigo-300 transition">
                      {s.title}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>💬 {s.message_count} messages</span>
                      <span>·</span>
                      <span>{timeAgo(s.created_at)}</span>
                      {s.project_id && (
                        <><span>·</span><span className="text-indigo-400">📁 project</span></>
                      )}
                    </div>
                  </button>

                  {/* Actions */}
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                    <button
                      onClick={() => handleExport(s.id, s.title)}
                      disabled={exporting === s.id}
                      className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg
                                 hover:bg-slate-800 transition text-xs flex items-center gap-1"
                      title="Export as JSON"
                    >
                      {exporting === s.id ? (
                        <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round"
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                        </svg>
                      )}
                      Export
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-slate-600 hover:text-red-400 p-1.5 rounded-lg
                                 hover:bg-slate-800 transition"
                      title="Delete"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}