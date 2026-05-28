import { useState } from "react";
import { documentsAPI } from "../services/api";

const TYPE_ICON = {
  pdf:  { icon: "📄", color: "text-red-400",    bg: "bg-red-500/10"    },
  docx: { icon: "📝", color: "text-blue-400",   bg: "bg-blue-500/10"   },
  txt:  { icon: "📃", color: "text-slate-400",  bg: "bg-slate-500/10"  },
  url:  { icon: "🔗", color: "text-indigo-400", bg: "bg-indigo-500/10" },
};

const STATUS = {
  processing: { label: "Processing", cls: "bg-yellow-500/20 text-yellow-400" },
  ready:      { label: "Ready",      cls: "bg-emerald-500/20 text-emerald-400" },
  error:      { label: "Error",      cls: "bg-red-500/20 text-red-400" },
};

function formatBytes(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DocumentCard({ doc, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const type = TYPE_ICON[doc.file_type] || TYPE_ICON.txt;
  const statusInfo = STATUS[doc.status] || STATUS.processing;

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${doc.original_name}"?`)) return;
    setDeleting(true);
    try {
      await documentsAPI.delete(doc.id);
      onDeleted?.(doc.id);
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div className="group bg-[#13131a] border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition flex items-start gap-4">
      {/* Icon */}
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${type.bg}`}>
        <span className="text-lg">{type.icon}</span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-white text-sm font-medium truncate" title={doc.original_name}>
            {doc.original_name}
          </p>
          {/* Delete button — visible on hover */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition flex-shrink-0"
            title="Delete"
          >
            {deleting ? (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.cls}`}>
            {statusInfo.label}
          </span>
          <span className="text-slate-600 text-xs">{doc.file_type.toUpperCase()}</span>
          {doc.file_size && (
            <span className="text-slate-600 text-xs">{formatBytes(doc.file_size)}</span>
          )}
          {doc.chunk_count > 0 && (
            <span className="text-slate-600 text-xs">{doc.chunk_count} chunks</span>
          )}
          {doc.page_count && (
            <span className="text-slate-600 text-xs">{doc.page_count} pages</span>
          )}
          <span className="text-slate-700 text-xs ml-auto">{timeAgo(doc.created_at)}</span>
        </div>

        {/* Error message */}
        {doc.status === "error" && doc.error_msg && (
          <p className="text-red-400 text-xs mt-1.5 truncate" title={doc.error_msg}>
            ⚠ {doc.error_msg}
          </p>
        )}
      </div>
    </div>
  );
}