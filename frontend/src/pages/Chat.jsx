import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import ChatMessage from "../components/ChatMessage";
import ChatInput   from "../components/ChatInput";
import { chatAPI, documentsAPI } from "../services/api";
import { toast } from "../components/Toast";

export default function Chat() {
  const navigate = useNavigate();
  const [sessions,     setSessions]     = useState([]);
  const [activeSession,setActiveSession]= useState(null);
  const [messages,     setMessages]     = useState([]);
  const [streaming,    setStreaming]     = useState(false);
  const [allDocs,      setAllDocs]      = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [loadingMsgs,  setLoadingMsgs]  = useState(false);
  const messagesEndRef = useRef(null);
  const abortRef       = useRef(null);

  // ── Load sessions + docs on mount ─────────────────────────────────────────
  useEffect(() => {
    chatAPI.listSessions().then(({ data }) => setSessions(data)).catch(() => {});
    documentsAPI.list().then(({ data }) => setAllDocs(data)).catch(() => {});
  }, []);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Load messages for active session ──────────────────────────────────────
  const loadMessages = useCallback(async (sessionId) => {
    setLoadingMsgs(true);
    try {
      const { data } = await chatAPI.getMessages(sessionId);
      setMessages(data);
    } catch {
      toast.error("Failed to load messages");
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  const selectSession = (session) => {
    setActiveSession(session);
    loadMessages(session.id);
  };

  const newChat = () => {
    setActiveSession(null);
    setMessages([]);
  };

  // ── Delete session ────────────────────────────────────────────────────────
  const deleteSession = async (e, sessionId) => {
    e.stopPropagation();
    try {
      await chatAPI.deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSession?.id === sessionId) newChat();
    } catch {
      toast.error("Failed to delete session");
    }
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = async (text) => {
    if (streaming) return;

    // Optimistically add user message
    const userMsg = {
      id: Date.now(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    // Placeholder for assistant streaming message
    const assistantId = Date.now() + 1;
    setMessages((prev) => [...prev, {
      id: assistantId,
      role: "assistant",
      content: "",
      citations: [],
      streaming: true,
      created_at: new Date().toISOString(),
    }]);

    try {
      const token = localStorage.getItem("gm_token");
      const body  = JSON.stringify({
        message:      text,
        session_id:   activeSession?.id || null,
        document_ids: selectedDocs.length > 0 ? selectedDocs : null,
        project_id:   null,
      });

      const response = await fetch("http://localhost:8000/api/chat/stream", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";
      let   fullText= "";
      let   finalCitations = [];
      let   newSessionId   = activeSession?.id || null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "session_id") {
              newSessionId = event.session_id;
              // Update or add session in sidebar
              if (!activeSession) {
                const { data: newSess } = await chatAPI.listSessions();
                setSessions(newSess);
                const created = newSess.find((s) => s.id === newSessionId);
                if (created) setActiveSession(created);
              }
            } else if (event.type === "token") {
              fullText += event.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: fullText, streaming: true }
                    : m
                )
              );
            } else if (event.type === "citations") {
              finalCitations = event.citations;
            } else if (event.type === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: fullText, citations: finalCitations, streaming: false }
                    : m
                )
              );
              // Refresh session list to update message count
              chatAPI.listSessions().then(({ data }) => setSessions(data)).catch(() => {});
            } else if (event.type === "error") {
              toast.error(event.content);
            }
          } catch {
            // Skip malformed SSE line
          }
        }
      }
    } catch (err) {
      toast.error("Connection error — is the backend running?");
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-[#0d0d14] px-6 py-4 flex items-center justify-between flex-shrink-0">
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
          <button onClick={() => navigate("/documents")} className="text-sm text-slate-400 hover:text-white transition">Documents</button>
          <button onClick={() => navigate("/graph")}     className="text-sm text-slate-400 hover:text-white transition">Graph</button>
          <button onClick={() => navigate("/dashboard")} className="text-sm text-slate-400 hover:text-white transition">Dashboard</button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Sessions sidebar */}
        <aside className="w-64 border-r border-slate-800 bg-[#0d0d14] flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-slate-800">
            <button
              onClick={newChat}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm
                         font-medium py-2 rounded-lg transition flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Chat
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.length === 0 ? (
              <p className="text-slate-600 text-xs text-center py-6">No chats yet</p>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => selectSession(s)}
                  className={`group flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition ${
                    activeSession?.id === s.id
                      ? "bg-indigo-600/20 border border-indigo-500/30"
                      : "hover:bg-slate-800 border border-transparent"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-300 text-xs font-medium truncate">{s.title}</p>
                    <p className="text-slate-600 text-xs mt-0.5">{s.message_count} messages</p>
                  </div>
                  <button
                    onClick={(e) => deleteSession(e, s.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-600
                               hover:text-red-400 transition ml-1 flex-shrink-0"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Chat area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 && !loadingMsgs ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="text-5xl mb-4">💬</div>
                <h2 className="text-white font-semibold text-lg mb-2">
                  Chat with your documents
                </h2>
                <p className="text-slate-500 text-sm max-w-sm">
                  Ask anything about your embedded documents. Answers use both
                  vector search and knowledge graph retrieval.
                </p>
                {allDocs.filter((d) => ["embedded","graph_ready"].includes(d.status)).length === 0 && (
                  <button
                    onClick={() => navigate("/documents")}
                    className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm transition"
                  >
                    Upload and embed a document first →
                  </button>
                )}
              </div>
            ) : loadingMsgs ? (
              <div className="flex justify-center py-10">
                <svg className="animate-spin w-6 h-6 text-indigo-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              </div>
            ) : (
              messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <ChatInput
            onSend={handleSend}
            disabled={streaming}
            selectedDocs={selectedDocs}
            onDocsChange={setSelectedDocs}
            allDocs={allDocs}
          />
        </main>
      </div>
    </div>
  );
}