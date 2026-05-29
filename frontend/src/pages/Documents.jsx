import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DocumentUpload from "../components/DocumentUpload";
import DocumentCard from "../components/DocumentCard";
import { documentsAPI } from "../services/api";

export default function Documents() {
  const navigate = useNavigate();
  const [docs, setDocs]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [filter, setFilter]         = useState("all");

  // ─── Fetch docs ─────────────────────────────────────────────────────────────
  const fetchDocs = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const { data } = await documentsAPI.list();
      setDocs(data);
    } catch {
      // 401 handled by interceptor
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // ─── Poll while ANY doc is processing or embedding ───────────────────────
  useEffect(() => {
    const hasActive = docs.some(
      (d) => d.status === "processing"
    );
    if (!hasActive) return;

    const interval = setInterval(() => fetchDocs(true), 2000);
    return () => clearInterval(interval);
  }, [docs, fetchDocs]);

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const handleUploaded = (newDoc) => {
    setDocs((prev) => [newDoc, ...prev]);
    setShowUpload(false);
    // Refresh quickly to catch fast background processing
    setTimeout(() => fetchDocs(true), 800);
    setTimeout(() => fetchDocs(true), 2500);
    setTimeout(() => fetchDocs(true), 5000);
  };

  const handleDeleted = (id) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const handleStatusChange = (id, newStatus) => {
    setDocs((prev) =>
      prev.map((d) => d.id === id ? { ...d, status: newStatus } : d)
    );
  };

  const filtered = filter === "all"
    ? docs
    : docs.filter((d) => d.status === filter);

  const counts = {
    all:        docs.length,
    ready:      docs.filter((d) => d.status === "ready").length,
    processing: docs.filter((d) => d.status === "processing").length,
    embedded:   docs.filter((d) => d.status === "embedded").length,
    error:      docs.filter((d) => d.status === "error").length,
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
          <button
            onClick={() => navigate("/dashboard")}
            className="text-sm text-slate-400 hover:text-white transition"
          >
            Dashboard
          </button>
          <button
            onClick={() => setShowUpload((v) => !v)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium
                       px-4 py-2 rounded-lg transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Upload
          </button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Documents</h1>
            <p className="text-slate-400 text-sm">Upload and manage your knowledge sources</p>
          </div>
          <button
            onClick={() => fetchDocs()}
            className="text-slate-500 hover:text-slate-300 transition p-2 rounded-lg hover:bg-slate-800"
            title="Refresh"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Upload panel */}
        {showUpload && (
          <div className="mb-8 bg-[#13131a] border border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Add Document</h2>
              <button
                onClick={() => setShowUpload(false)}
                className="text-slate-500 hover:text-white transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <DocumentUpload onUploaded={handleUploaded} />
          </div>
        )}

        {/* Filter tabs — include "embedded" tab */}
        <div className="flex gap-1 mb-6 bg-[#13131a] border border-slate-800 rounded-xl p-1 w-fit flex-wrap">
          {["all", "ready", "embedded", "processing", "error"].map((f) => (
            counts[f] > 0 || f === "all" ? (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition capitalize ${
                  filter === f
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {f}{" "}
                {counts[f] > 0 && (
                  <span className="ml-1 opacity-60">({counts[f]})</span>
                )}
              </button>
            ) : null
          ))}
        </div>

        {/* Documents list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <svg className="animate-spin w-6 h-6 text-indigo-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📂</div>
            <p className="text-slate-400 font-medium">No documents yet</p>
            <p className="text-slate-600 text-sm mt-1">
              Upload a PDF, DOCX, TXT, or ingest a URL
            </p>
            <button
              onClick={() => setShowUpload(true)}
              className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white text-sm
                         font-medium px-5 py-2.5 rounded-lg transition"
            >
              Upload your first document
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onDeleted={handleDeleted}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}