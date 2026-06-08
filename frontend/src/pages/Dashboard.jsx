import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import ProjectModal from "../components/ProjectModal";
import { DashboardSkeleton } from "../components/Skeleton";
import { authAPI, documentsAPI, projectsAPI, statsAPI } from "../services/api";

// ─── All possible document statuses + their badge styles ──────────────────────
const STATUS_STYLE = {
  processing:    "bg-yellow-500/20  text-yellow-400",
  ready:         "bg-blue-500/20    text-blue-400",
  embedded:      "bg-indigo-500/20  text-indigo-400",
  graph_building:"bg-orange-500/20  text-orange-400",
  graph_ready:   "bg-emerald-500/20 text-emerald-400",
  error:         "bg-red-500/20     text-red-400",
};

function StatusBadge({ status }) {
  const cls   = STATUS_STYLE[status] || "bg-slate-500/20 text-slate-400";
  const label = status?.replace("_", " ") || "unknown";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${cls}`}>
      {label}
    </span>
  );
}

export default function Dashboard() {
  const navigate    = useNavigate();
  const [user,      setUser]      = useState(null);
  const [docs,      setDocs]      = useState([]);
  const [projects,  setProjects]  = useState([]);
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("gm_user");
    if (stored) setUser(JSON.parse(stored));
    else {
      authAPI.me()
        .then(({ data }) => {
          setUser(data);
          localStorage.setItem("gm_user", JSON.stringify(data));
        })
        .catch(() => navigate("/login"));
    }
  }, [navigate]);

  useEffect(() => {
    Promise.all([
      documentsAPI.list(),
      projectsAPI.list(),
      statsAPI.get(),
    ])
      .then(([docsRes, projRes, statsRes]) => {
        setDocs(docsRes.data);
        setProjects(projRes.data);
        setStats(statsRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("gm_token");
    localStorage.removeItem("gm_user");
    navigate("/login");
  };

  const handleProjectCreated = (p) => {
    setProjects((prev) => [p, ...prev]);
    setShowModal(false);
  };

  // ── Navbar (always visible) ────────────────────────────────────────────────
  const navbar = (
    <nav className="border-b border-slate-800 bg-[#0d0d14] px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
        </div>
        <span className="font-bold text-lg tracking-tight text-white">GraphMind RAG</span>
      </div>
      <div className="flex items-center gap-4">
        <Link to="/documents" className="text-sm text-slate-400 hover:text-white transition">Documents</Link>
        <Link to="/graph"     className="text-sm text-slate-400 hover:text-white transition">Graph</Link>
        <Link to="/chat"      className="text-sm text-slate-400 hover:text-white transition">Chat</Link>
        <Link to="/history"   className="text-sm text-slate-400 hover:text-white transition">History</Link>
        <Link to="/settings"  className="text-sm text-slate-400 hover:text-white transition">Settings</Link>
        {user && (
          <span className="text-slate-600 text-sm hidden sm:block">{user.email}</span>
        )}
        <button
          onClick={handleLogout}
          className="text-sm text-slate-400 hover:text-white bg-slate-800
                     hover:bg-slate-700 px-3 py-1.5 rounded-lg transition"
        >
          Logout
        </button>
      </div>
    </nav>
  );

  // ── Skeleton while loading ─────────────────────────────────────────────────
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
        {navbar}
        <DashboardSkeleton />
      </div>
    );
  }

  // ── Stat cards ─────────────────────────────────────────────────────────────
  const statCards = [
    {
      icon:  "📄",
      label: "Documents",
      value: stats?.documents?.total ?? docs.length,
      sub:   `${stats?.documents?.ready ?? 0} ready`,
      href:  "/documents",
    },
    {
      icon:  "📁",
      label: "Projects",
      value: stats?.projects?.total ?? projects.length,
      sub:   "Knowledge bases",
      href:  null,
    },
    {
      icon:  "💬",
      label: "Chat Sessions",
      value: stats?.chat?.sessions ?? 0,
      sub:   `${stats?.chat?.messages ?? 0} messages`,
      href:  "/history",
    },
    {
      icon:  "🔵",
      label: "Graph Nodes",
      value: stats?.graph?.nodes ?? 0,
      sub:   `${stats?.graph?.edges ?? 0} edges`,
      href:  "/graph",
    },
    {
      icon:  "🔢",
      label: "Chunks",
      value: stats?.vectors?.total ?? 0,
      sub:   "Stored embeddings",
      href:  null,
    },
    {
      icon:  "👍",
      label: "Good Answers",
      value: stats?.chat?.thumbs_up ?? 0,
      sub:   "Positive feedback",
      href:  null,
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {showModal && (
        <ProjectModal
          onClose={() => setShowModal(false)}
          onCreated={handleProjectCreated}
        />
      )}

      {navbar}

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Welcome */}
        <div className="mb-10 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Welcome, {user.full_name?.split(" ")[0] || "there"} 👋
            </h1>
            <p className="text-slate-400">Your knowledge graph workspace.</p>
          </div>
          <div className="flex gap-3">
            <Link
              to="/settings"
              className="text-sm text-slate-400 hover:text-white border border-slate-700
                         hover:border-slate-600 px-4 py-2 rounded-lg transition
                         flex items-center gap-2"
            >
              ⚙️ Settings
            </Link>
            <Link
              to="/chat"
              className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white
                         px-4 py-2 rounded-lg transition flex items-center gap-2"
            >
              💬 New Chat
            </Link>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
          {statCards.map((card) => (
            <div
              key={card.label}
              onClick={() => card.href && navigate(card.href)}
              className={`bg-[#13131a] border border-slate-800 rounded-xl p-4 transition
                ${card.href ? "cursor-pointer hover:border-indigo-500/50" : ""}`}
            >
              <div className="text-2xl mb-2">{card.icon}</div>
              <div className="text-2xl font-bold text-white mb-0.5">{card.value}</div>
              <div className="text-slate-400 text-xs font-medium">{card.label}</div>
              <div className="text-slate-600 text-xs mt-0.5">{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Projects + Recent Documents */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Projects panel */}
          <div className="bg-[#13131a] border border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Projects</h2>
              <button
                onClick={() => setShowModal(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs
                           font-medium px-3 py-1.5 rounded-lg transition
                           flex items-center gap-1"
              >
                + New
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500 text-sm mb-3">No projects yet</p>
                <button
                  onClick={() => setShowModal(true)}
                  className="text-indigo-400 hover:text-indigo-300 text-sm transition"
                >
                  Create your first project →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/project/${p.id}`)}
                    className="w-full text-left p-3 rounded-lg hover:bg-slate-800
                               border border-transparent hover:border-slate-700 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white text-sm font-medium">{p.name}</span>
                      <span className="text-slate-600 text-xs">{p.document_count} docs</span>
                    </div>
                    {p.description && (
                      <p className="text-slate-500 text-xs mt-0.5 truncate">
                        {p.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recent documents panel */}
          <div className="bg-[#13131a] border border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Recent Documents</h2>
              <Link
                to="/documents"
                className="text-indigo-400 hover:text-indigo-300 text-sm transition"
              >
                View all →
              </Link>
            </div>

            {docs.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500 text-sm mb-3">No documents yet</p>
                <Link
                  to="/documents"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white
                             text-sm px-4 py-2 rounded-lg transition inline-block"
                >
                  Upload first document
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {docs.slice(0, 6).map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between py-2
                               border-b border-slate-800 last:border-0"
                  >
                    <span
                      className="text-sm text-slate-300 truncate max-w-[200px]"
                      title={doc.original_name}
                    >
                      {doc.original_name}
                    </span>
                    {/* ✅ Fixed: uses StatusBadge which covers ALL statuses */}
                    <StatusBadge status={doc.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* ✅ 10-Day Build Progress section REMOVED */}
      </main>
    </div>
  );
}