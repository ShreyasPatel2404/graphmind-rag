import { useState, useRef, useCallback } from "react";
import { documentsAPI } from "../services/api";

const ACCEPTED = { "application/pdf": ".pdf", "text/plain": ".txt", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx" };
const ACCEPT_LABEL = "PDF, TXT, DOCX";
const MAX_MB = 20;

export default function DocumentUpload({ onUploaded }) {
  const [dragging, setDragging]   = useState(false);
  const [uploads,  setUploads]    = useState([]);   // [{name, progress, status, error}]
  const [urlMode,  setUrlMode]    = useState(false);
  const [url,      setUrl]        = useState("");
  const inputRef = useRef();

  // ─── Drag handlers ──────────────────────────────────────────────────────────
  const onDragOver  = (e) => { e.preventDefault(); setDragging(true);  };
  const onDragLeave = (e) => { e.preventDefault(); setDragging(false); };
  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, []);

  // ─── Upload a batch of files ─────────────────────────────────────────────
  const handleFiles = (files) => {
    files.forEach((file) => {
      const ext = file.name.split(".").pop().toLowerCase();
      if (!["pdf", "txt", "docx"].includes(ext)) {
        setUploads((p) => [...p, { name: file.name, progress: 0, status: "error", error: "Unsupported type" }]);
        return;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setUploads((p) => [...p, { name: file.name, progress: 0, status: "error", error: `Exceeds ${MAX_MB} MB` }]);
        return;
      }
      uploadFile(file);
    });
  };

  const uploadFile = async (file) => {
    const entry = { name: file.name, progress: 0, status: "uploading", error: null };
    setUploads((p) => [...p, entry]);
    const idx = -1; // we'll use name as key

    try {
      const form = new FormData();
      form.append("file", file);

      const { data } = await documentsAPI.upload(file);

      setUploads((p) =>
        p.map((u) =>
          u.name === file.name && u.status === "uploading"
            ? { ...u, progress: 100, status: "done" }
            : u
        )
      );
      onUploaded?.(data);
    } catch (err) {
      const msg = err.response?.data?.detail || "Upload failed";
      setUploads((p) =>
        p.map((u) =>
          u.name === file.name && u.status === "uploading"
            ? { ...u, status: "error", error: msg }
            : u
        )
      );
    }
  };

  // ─── URL ingestion ───────────────────────────────────────────────────────
  const handleUrlIngest = async () => {
    if (!url.trim()) return;
    const entry = { name: url, progress: 50, status: "uploading", error: null };
    setUploads((p) => [...p, entry]);
    setUrl("");
    setUrlMode(false);
    try {
      const { data } = await documentsAPI.ingestUrl(url.trim());
      setUploads((p) =>
        p.map((u) => u.name === url.trim() ? { ...u, progress: 100, status: "done" } : u)
      );
      onUploaded?.(data);
    } catch (err) {
      const msg = err.response?.data?.detail || "URL ingest failed";
      setUploads((p) =>
        p.map((u) => u.name === url.trim() ? { ...u, status: "error", error: msg } : u)
      );
    }
  };

  const clearDone = () => setUploads((p) => p.filter((u) => u.status !== "done"));

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all
          ${dragging
            ? "border-indigo-500 bg-indigo-500/10"
            : "border-slate-700 hover:border-slate-500 hover:bg-slate-800/30"
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.docx"
          className="hidden"
          onChange={(e) => handleFiles(Array.from(e.target.files))}
        />
        <div className="flex flex-col items-center gap-3 pointer-events-none">
          <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center">
            <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div>
            <p className="text-white font-medium">Drop files here or <span className="text-indigo-400">browse</span></p>
            <p className="text-slate-500 text-sm mt-1">{ACCEPT_LABEL} · Max {MAX_MB} MB</p>
          </div>
        </div>
      </div>

      {/* URL Mode toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setUrlMode((v) => !v)}
          className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
          {urlMode ? "Cancel URL" : "Ingest from URL"}
        </button>
      </div>

      {urlMode && (
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUrlIngest()}
            placeholder="https://example.com/article"
            className="flex-1 bg-[#1c1c26] border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
          <button
            onClick={handleUrlIngest}
            disabled={!url.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition"
          >
            Ingest
          </button>
        </div>
      )}

      {/* Upload queue */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-slate-400 text-sm font-medium">Uploads</p>
            <button onClick={clearDone} className="text-slate-600 hover:text-slate-400 text-xs transition">
              Clear done
            </button>
          </div>
          {uploads.map((u, i) => (
            <div key={i} className="bg-[#1c1c26] border border-slate-800 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-white truncate max-w-[260px]">{u.name}</span>
                <StatusBadge status={u.status} />
              </div>
              {u.status === "uploading" && (
                <div className="w-full bg-slate-700 rounded-full h-1">
                  <div
                    className="bg-indigo-500 h-1 rounded-full transition-all duration-300"
                    style={{ width: `${u.progress}%` }}
                  />
                </div>
              )}
              {u.status === "error" && (
                <p className="text-red-400 text-xs mt-1">{u.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    uploading: "bg-blue-500/20 text-blue-400",
    done:      "bg-emerald-500/20 text-emerald-400",
    error:     "bg-red-500/20 text-red-400",
  };
  const labels = { uploading: "Uploading…", done: "Sent", error: "Error" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] || ""}`}>
      {labels[status] || status}
    </span>
  );
}