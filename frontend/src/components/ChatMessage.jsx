import { useState } from "react";

export default function ChatMessage({ message }) {
  const isUser = message.role === "user";
  const [showCitations, setShowCitations] = useState(false);
  const hasCitations = message.citations?.length > 0;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1
        ${isUser ? "bg-indigo-600" : "bg-slate-700"}`}>
        {isUser ? (
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        )}
      </div>

      <div className={`flex flex-col gap-2 max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Bubble */}
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
          ${isUser
            ? "bg-indigo-600 text-white rounded-tr-sm"
            : "bg-[#1c1c26] border border-slate-800 text-slate-200 rounded-tl-sm"
          }`}>
          {message.content}
          {/* Streaming cursor */}
          {message.streaming && (
            <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
          )}
        </div>

        {/* Citations toggle */}
        {hasCitations && !isUser && (
          <button
            onClick={() => setShowCitations((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {showCitations ? "Hide" : "Show"} {message.citations.length} source{message.citations.length !== 1 ? "s" : ""}
          </button>
        )}

        {/* Citation cards */}
        {hasCitations && showCitations && (
          <div className="space-y-2 w-full">
            {message.citations.map((c, i) => (
              <CitationCard key={i} citation={c} index={i + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CitationCard({ citation, index }) {
  const relevancePct = Math.round((citation.relevance || 0) * 100);

  return (
    <div className="bg-[#13131a] border border-slate-800 rounded-xl p-3 text-xs">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-5 h-5 bg-indigo-500/20 text-indigo-400 rounded-full
                           flex items-center justify-center font-bold flex-shrink-0">
            {index}
          </span>
          <span className="text-slate-300 font-medium truncate" title={citation.document_name}>
            📄 {citation.document_name}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {citation.page_number && (
            <span className="text-slate-600">p.{citation.page_number}</span>
          )}
          <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
            relevancePct >= 70 ? "bg-emerald-500/20 text-emerald-400" :
            relevancePct >= 40 ? "bg-yellow-500/20  text-yellow-400"  :
                                 "bg-slate-500/20   text-slate-400"
          }`}>
            {relevancePct}% match
          </span>
        </div>
      </div>
      <p className="text-slate-500 italic leading-relaxed line-clamp-3">
        "{citation.excerpt}"
      </p>
    </div>
  );
}