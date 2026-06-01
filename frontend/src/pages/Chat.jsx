import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ChatMessage from "../components/ChatMessage";
import ChatInput   from "../components/ChatInput";
import { chatAPI, documentsAPI, projectsAPI } from "../services/api";
import { toast } from "../components/Toast";

export default function Chat() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [sessions,       setSessions]       = useState([]);
  const [activeSession,  setActiveSession]  = useState(null);
  const [messages,       setMessages]       = useState([]);
  const [streaming,      setStreaming]       = useState(false);
  const [allDocs,        setAllDocs]        = useState([]);
  const [selectedDocs,   setSelectedDocs]   = useState([]);
  const [projects,       setProjects]       = useState([]);
  const [activeProject,  setActiveProject]  = useState(null);
  const [projectDocIds,  setProjectDocIds]  = useState([]);
  const [loadingMsgs,    setLoadingMsgs]    = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    chatAPI.listSessions().then(({ data }) => setSessions(data)).catch(() => {});
    documentsAPI.list().then(({ data }) => setAllDocs(data)).catch(() => {});
    projectsAPI.list().then(({ data }) => {
      setProjects(data);
      const projectParam = searchParams.get("project");
      if (projectParam) {
        const found = data.find((p) => p.id === parseInt(projectParam));
        if (found) setActiveProject(found);
      }
    }).catch(() => {});
  }, []);

  // Pre-load project doc IDs
  useEffect(() => {
    if (!activeProject) { setProjectDocIds([]); return; }
    projectsAPI.getDocuments(activeProject.id)
      .then(({ data }) => {
        const ids = data
          .filter((d) => ["embedded", "graph_ready"].includes(d.status))
          .map((d) => d.id);
        setProjectDocIds(ids);
        if (ids.length === 0)
          toast.warn("No embedded documents in this project yet");
      })
      .catch(() => setProjectDocIds([]));
  }, [activeProject]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const selectSession = (session) => { setActiveSession(session); loadMessages(session.id); };
  const newChat = () => { setActiveSession(null); setMessages([]); };

  const deleteSession = async (e, sessionId) => {
    e.stopPropagation();
    try {
      await chatAPI.deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSession?.id === sessionId) newChat();
    } catch { toast.error("Failed to delete"); }
  };

  const handleSend = async (text) => {
    if (streaming) return;

    const docIds = activeProject
      ? (projectDocIds.length > 0 ? projectDocIds : null)
      : (selectedDocs.length > 0  ? selectedDocs  : null);

    if (activeProject && projectDocIds.length === 0) {
      toast.error("No embedded documents in this project.");
      return;
    }

    const userMsg = {
      id: Date.now(), role: "user", content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    const assistantId = Date.now() + 1;
    setMessages((prev) => [...prev, {
      id: assistantId, role: "assistant", content: "",
      citations: [], streaming: true, confidence: null,
      created_at: new Date().toISOString(),
    }]);

    try {
      const token    = localStorage.getItem("gm_token");
      const body     = JSON.stringify({
        message:      text,
        session_id:   activeSession?.id || null,
        document_ids: docIds,
        project_id:   activeProject?.id || null,
        use_crag:     true,
      });

      const response = await fetch("http://localhost:8000/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader    = response.body.getReader();
      const decoder   = new TextDecoder();
      let   buffer    = "";
      let   fullText  = "";
      let   finalCitations   = [];
      let   finalConfidence  = null;
      let   finalMessageId   = null;

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

            if (event.type === "session_id" && !activeSession) {
              const { data: newSess } = await chatAPI.listSessions();
              setSessions(newSess);
              const created = newSess.find((s) => s.id === event.session_id);
              if (created) setActiveSession(created);

            } else if (event.type === "confidence") {
              finalConfidence = event.confidence;
              setMessages((prev) =>
                prev.map((m) => m.id === assistantId
                  ? { ...m, confidence: event.confidence } : m)
              );

            } else if (event.type === "token") {
              fullText += event.content;
              setMessages((prev) =>
                prev.map((m) => m.id === assistantId
                  ? { ...m, content: fullText, streaming: true } : m)
              );

            } else if (event.type === "citations") {
              finalCitations = event.citations;

            } else if (event.type === "message_id") {
              finalMessageId = event.message_id;

            } else if (event.type === "done") {
              setMessages((prev) =>
                prev.map((m) => m.id === assistantId
                  ? {
                      ...m,
                      id:         finalMessageId || assistantId,
                      content:    fullText,
                      citations:  finalCitations,
                      confidence: finalConfidence,
                      streaming:  false,
                    }
                  : m)
              );
              chatAPI.listSessions().then(({ data }) => setSessions(data)).catch(() => {});

            } else if (event.type === "error") {
              toast.error(event.content);
            }
          } catch {}
        }
      }
    } catch (err) {
      toast.error("Connection error — is the backend running?");
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setStreaming(false);
    }
  };

  const embeddedDocs = allDocs.filter((d) =>
    ["embedded", "graph_ready"].includes(d.status)
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
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
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-sm">Project:</span>
            <select
              value={activeProject?.id || ""}
              onChange={(e) => {
                const p = projects.find((x) => x.id === parseInt(e.target.value));
                setActiveProject(p || null);
              }}
              className="bg-[#1c1c26] border border-slate-700 text-white text-sm
                         rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 transition"
            >
              <option value="">All documents</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <button onClick={() => navigate("/documents")} className="text-sm text-slate-400 hover:text-white transition">Docs</button>
          <button onClick={() => navigate("/graph")}     className="text-sm text-slate-400 hover:text-white transition">Graph</button>
        </div>
      </nav>

      {activeProject && (
        <div className="bg-indigo-600/10 border-b border-indigo-500/20 px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-indigo-400">📁</span>
            <span className="text-indigo-300 font-medium">{activeProject.name}</span>
            <span className="text-slate-500">
              · {projectDocIds.length} embedded doc{projectDocIds.length !== 1 ? "s" : ""} · CRAG enabled
            </span>
          </div>
          <button onClick={() => setActiveProject(null)} className="text-slate-500 hover:text-white text-xs transition">✕ Clear</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 border-r border-slate-800 bg-[#0d0d14] flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-slate-800">
            <button onClick={newChat}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm
                         font-medium py-2 rounded-lg transition flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              New Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.length === 0 ? (
              <p className="text-slate-600 text-xs text-center py-6">No chats yet</p>
            ) : (
              sessions.map((s) => (
                <div key={s.id} onClick={() => selectSession(s)}
                  className={`group flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition ${
                    activeSession?.id === s.id
                      ? "bg-indigo-600/20 border border-indigo-500/30"
                      : "hover:bg-slate-800 border border-transparent"
                  }`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-300 text-xs font-medium truncate">{s.title}</p>
                    <p className="text-slate-600 text-xs mt-0.5">{s.message_count} messages</p>
                  </div>
                  <button onClick={(e) => deleteSession(e, s.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition ml-1 flex-shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 && !loadingMsgs ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="text-5xl mb-4">💬</div>
                <h2 className="text-white font-semibold text-lg mb-2">
                  {activeProject ? `Chat with "${activeProject.name}"` : "Chat with your documents"}
                </h2>
                <p className="text-slate-500 text-sm max-w-sm">
                  {activeProject
                    ? `Searching ${projectDocIds.length} docs with CRAG for better answers.`
                    : "Ask anything about your embedded documents."}
                </p>
              </div>
            ) : loadingMsgs ? (
              <div className="flex justify-center py-10">
                <svg className="animate-spin w-6 h-6 text-indigo-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              </div>
            ) : (
              messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
            )}
            <div ref={messagesEndRef} />
          </div>
          <ChatInput
            onSend={handleSend}
            disabled={streaming}
            selectedDocs={selectedDocs}
            onDocsChange={setSelectedDocs}
            allDocs={activeProject ? [] : embeddedDocs}
          />
        </main>
      </div>
    </div>
  );
}