import { useState, useEffect, useRef, useCallback } from "react";
import { documentsAPI, embeddingsAPI } from "../services/api";
import { toast } from "./Toast";

const TYPE_ICON = {
  pdf:  { icon: "📄", bg: "bg-red-500/10"    },
  docx: { icon: "📝", bg: "bg-blue-500/10"   },
  txt:  { icon: "📃", bg: "bg-slate-500/10"  },
  url:  { icon: "🔗", bg: "bg-indigo-500/10" },
};

const STATUS_BADGE = {
  processing: { label: "Processing",  cls: "bg-yellow-500/20 text-yellow-400"   },
  ready:      { label: "Ready",       cls: "bg-blue-500/20   text-blue-400"     },
  embedded:   { label: "Embedded ✓",  cls: "bg-emerald-500/20 text-emerald-400" },
  error:      { label: "Error",       cls: "bg-red-500/20    text-red-400"      },
};

function formatBytes(b) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DocumentCard({ doc: initialDoc, onDeleted, onStatusChange }) {
  const [doc,      setDoc]      = useState(initialDoc);
  const [deleting, setDeleting] = useState(false);

  // ─── Strict single-interval guard ────────────────────────────────────────
  const intervalRef   = useRef(null);
  const toastFiredRef = useRef(false);   // ← prevents duplicate toasts
  const docNameRef    = useRef(initialDoc.original_name);

  // sync doc when parent passes new props (e.g. from list refresh)
  useEffect(() => {
    setDoc(initialDoc);
    docNameRef.current = initialDoc.original_name;
  }, [initialDoc]);

  // ─── Stop polling helper ─────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ─── Start polling when status = "processing" ─────────────────────────
  useEffect(() => {
    if (doc.status !== "processing") {
      stopPolling();
      return;
    }

    // Already polling — don't start a second interval
    if (intervalRef.current) return;

    // Reset toast guard each time a new embed starts
    toastFiredRef.current = false;

    intervalRef.current = setInterval(async () => {
      try {
        const { data } = await embeddingsAPI.status(doc.id);

        if (data.status === "embedded") {
          stopPolling();
          setDoc((prev) => ({ ...prev, status: "embedded", error_msg: null }));
          onStatusChange?.(doc.id, "embedded");
          // Fire toast exactly once
          if (!toastFiredRef.current) {
            toastFiredRef.current = true;
            toast.success(`"${docNameRef.current}" embedded successfully!`);
          }
        } else if (data.status === "error") {
          stopPolling();
          setDoc((prev) => ({ ...prev, status: "error", error_msg: data.error_msg }));
          onStatusChange?.(doc.id, "error");
          if (!toastFiredRef.current) {
            toastFiredRef.current = true;
            toast.error(`Embedding failed: ${data.error_msg || "unknown error"}`);
          }
        } else if (data.status === "ready") {
          // Still waiting for Ollama to pick it up — keep polling
          setDoc((prev) => ({ ...prev, status: "processing" }));
        }
      } catch {
        stopPolling();
      }
    }, 2500);

    return stopPolling;
  // Only re-run when status flips to/from "processing" — NOT on every doc change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.status, doc.id]);

  // cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  // ─── Process / Embed handler ──────────────────────────────────────────────
  const handleProcess = async (e) => {
    e.stopPropagation();

    // Prevent double-click
    if (doc.status === "processing") return;

    // Reset toast guard for fresh embed
    toastFiredRef.current = false;

    setDoc((prev) => ({ ...prev, status: "processing" }));

    try {
      await embeddingsAPI.process(doc.id);
      toast.info(`Embedding "${doc.original_name}" with Ollama…`);
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to start embedding";
      toast.error(msg);
      setDoc((prev) => ({ ...prev, status: "error", error_msg: msg }));
    }
  };

  // ─── Delete handler ───────────────────────────────────────────────────────
  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${doc.original_name}"?`)) return;
    setDeleting(true);
    try {
      await documentsAPI.delete(doc.id);
      toast.success(`"${doc.original_name}" deleted`);
      onDeleted?.(doc.id);
    } catch {
      toast.error("Delete failed");
      setDeleting(false);
    }
  };

  const type       = TYPE_ICON[doc.file_type]  || TYPE_ICON.txt;
  const statusInfo = STATUS_BADGE[doc.status]  || STATUS_BADGE.processing;
  const isProcessing = doc.status === "processing";
  const canProcess   = doc.status === "ready"  || doc.status === "error";
  const isEmbedded   = doc.status === "embedded";

  return (
    <div className="group bg-[#13131a] border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition flex items-start gap-4">

      {/* File type icon */}
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${type.bg}`}>
        <span className="text-lg">{type.icon}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">

        {/* Top row: name + delete */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-white text-sm font-medium truncate" title={doc.original_name}>
            {doc.original_name}
          </p>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition flex-shrink-0"
            title="Delete"
          >
            {deleting ? <Spinner className="w-4 h-4" /> : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${statusInfo.cls}`}>
            {isProcessing && <Spinner className="w-3 h-3" />}
            {statusInfo.label}
          </span>
          <span className="text-slate-600 text-xs">{doc.file_type.toUpperCase()}</span>
          {doc.file_size   && <span className="text-slate-600 text-xs">{formatBytes(doc.file_size)}</span>}
          {doc.chunk_count > 0 && <span className="text-slate-600 text-xs">{doc.chunk_count} chunks</span>}
          {doc.page_count  && <span className="text-slate-600 text-xs">{doc.page_count} pages</span>}
          <span className="text-slate-700 text-xs ml-auto">{timeAgo(doc.created_at)}</span>
        </div>

        {/* Error message */}
        {doc.status === "error" && doc.error_msg && (
          <p className="text-red-400 text-xs mt-1.5 truncate" title={doc.error_msg}>
            ⚠ {doc.error_msg}
          </p>
        )}

        {/* Embedding progress bar */}
        {isProcessing && (
          <div className="mt-2 w-full bg-slate-800 rounded-full h-1 overflow-hidden">
            <div className="h-1 bg-indigo-500 rounded-full animate-[progress_1.5s_ease-in-out_infinite]" />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-3">
          {canProcess && (
            <button
              onClick={handleProcess}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white
                         px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              {doc.status === "error" ? "Retry Embed" : "Embed with Ollama"}
            </button>
          )}

          {isEmbedded && (
            <button
              onClick={handleProcess}
              className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5
                         rounded-lg hover:bg-slate-800 transition flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Re-embed
            </button>
          )}
        </div>
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