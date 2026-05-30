import { useState, useRef, useEffect } from "react";

export default function ChatInput({ onSend, disabled, selectedDocs = [], onDocsChange, allDocs = [] }) {
  const [message,   setMessage]   = useState("");
  const [showDocs,  setShowDocs]  = useState(false);
  const textareaRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [message]);

  const handleSend = () => {
    if (!message.trim() || disabled) return;
    onSend(message.trim());
    setMessage("");
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleDoc = (docId) => {
    onDocsChange(
      selectedDocs.includes(docId)
        ? selectedDocs.filter((id) => id !== docId)
        : [...selectedDocs, docId]
    );
  };

  const embeddedDocs = allDocs.filter((d) =>
    ["embedded", "graph_ready"].includes(d.status)
  );

  return (
    <div className="border-t border-slate-800 bg-[#0d0d14] p-4">
      {/* Document filter chips */}
      {embeddedDocs.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setShowDocs((v) => !v)}
            className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 mb-2 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            Filter by document{selectedDocs.length > 0 ? ` (${selectedDocs.length} selected)` : ""}
          </button>

          {showDocs && (
            <div className="flex flex-wrap gap-2">
              {embeddedDocs.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => toggleDoc(doc.id)}
                  className={`text-xs px-3 py-1 rounded-full border transition truncate max-w-[200px] ${
                    selectedDocs.includes(doc.id)
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                  title={doc.original_name}
                >
                  {doc.original_name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-3">
        <div className="flex-1 bg-[#1c1c26] border border-slate-700 rounded-xl
                        focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKey}
            disabled={disabled}
            placeholder={disabled ? "Generating response…" : "Ask anything about your documents… (Enter to send)"}
            rows={1}
            className="w-full bg-transparent text-white text-sm px-4 py-3 resize-none
                       placeholder-slate-600 focus:outline-none disabled:opacity-50"
          />
        </div>

        <button
          onClick={handleSend}
          disabled={!message.trim() || disabled}
          className="w-10 h-10 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
                     disabled:cursor-not-allowed rounded-xl flex items-center justify-center
                     transition flex-shrink-0"
          title="Send (Enter)"
        >
          {disabled ? (
            <svg className="animate-spin w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          ) : (
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          )}
        </button>
      </div>

      <p className="text-slate-700 text-xs mt-2 text-center">
        Shift+Enter for new line · powered by Ollama (local)
      </p>
    </div>
  );
}