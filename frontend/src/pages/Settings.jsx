import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { settingsAPI } from "../services/api";
import { toast } from "../components/Toast";

export default function Settings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [models,   setModels]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [form,     setForm]     = useState(null);

  useEffect(() => {
    Promise.all([settingsAPI.get(), settingsAPI.listModels()])
      .then(([settRes, modRes]) => {
        setSettings(settRes.data);
        setForm(settRes.data);
        setModels(modRes.data.models || []);
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await settingsAPI.update(form);
      setSettings(data);
      toast.success("Settings saved!");
    } catch { toast.error("Failed to save settings"); }
    finally  { setSaving(false); }
  };

  const update = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const llmModels   = models.filter((m) => !m.is_embed);
  const embedModels = models.filter((m) =>  m.is_embed);

  if (loading || !form) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <svg className="animate-spin w-6 h-6 text-indigo-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
    </div>
  );

  const changed = JSON.stringify(form) !== JSON.stringify(settings);

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
        <button onClick={() => navigate("/dashboard")} className="text-sm text-slate-400 hover:text-white transition">
          ← Dashboard
        </button>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
            <p className="text-slate-400 text-sm">Configure models, chunking, and retrieval</p>
          </div>
          {changed && (
            <button onClick={handleSave} disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white
                         text-sm font-medium px-5 py-2 rounded-lg transition flex items-center gap-2">
              {saving ? (
                <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>Saving…</>
              ) : "Save Changes"}
            </button>
          )}
        </div>

        <div className="space-y-6">
          {/* LLM Model */}
          <Section title="Language Model" desc="Ollama model used for chat responses and graph extraction">
            {llmModels.length > 0 ? (
              <div className="grid grid-cols-1 gap-2">
                {llmModels.map((m) => (
                  <label key={m.name}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                      form.ollama_model === m.name
                        ? "border-indigo-500 bg-indigo-500/10"
                        : "border-slate-700 hover:border-slate-600"
                    }`}>
                    <div className="flex items-center gap-3">
                      <input type="radio" name="llm" checked={form.ollama_model === m.name}
                        onChange={() => update("ollama_model", m.name)}
                        className="accent-indigo-500"/>
                      <span className="text-white text-sm font-medium">{m.name}</span>
                    </div>
                    {m.size_gb && (
                      <span className="text-slate-500 text-xs">{m.size_gb} GB</span>
                    )}
                  </label>
                ))}
              </div>
            ) : (
              <div className="bg-[#1c1c26] border border-slate-700 rounded-xl p-4">
                <input
                  value={form.ollama_model}
                  onChange={(e) => update("ollama_model", e.target.value)}
                  placeholder="e.g. llama3.2"
                  className="w-full bg-transparent text-white text-sm focus:outline-none placeholder-slate-600"
                />
                <p className="text-slate-600 text-xs mt-1">Ollama not running — enter model name manually</p>
              </div>
            )}
          </Section>

          {/* Embed Model */}
          <Section title="Embedding Model" desc="Model used to create vector embeddings">
            {embedModels.length > 0 ? (
              <div className="grid grid-cols-1 gap-2">
                {embedModels.map((m) => (
                  <label key={m.name}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                      form.embed_model === m.name
                        ? "border-indigo-500 bg-indigo-500/10"
                        : "border-slate-700 hover:border-slate-600"
                    }`}>
                    <input type="radio" name="embed" checked={form.embed_model === m.name}
                      onChange={() => update("embed_model", m.name)}
                      className="accent-indigo-500"/>
                    <span className="text-white text-sm font-medium">{m.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="bg-[#1c1c26] border border-slate-700 rounded-xl p-3">
                <input
                  value={form.embed_model}
                  onChange={(e) => update("embed_model", e.target.value)}
                  placeholder="e.g. nomic-embed-text"
                  className="w-full bg-transparent text-white text-sm focus:outline-none placeholder-slate-600"
                />
              </div>
            )}
          </Section>

          {/* Chunking */}
          <Section title="Document Chunking" desc="How documents are split into chunks for retrieval">
            <div className="space-y-5">
              <SliderField
                label="Chunk Size"
                value={form.chunk_size}
                min={500} max={8000} step={100}
                unit=" chars"
                hint="~500 chars = ~125 tokens"
                onChange={(v) => update("chunk_size", v)}
              />
              <SliderField
                label="Overlap"
                value={form.chunk_overlap}
                min={0} max={500} step={50}
                unit=" chars"
                hint="Context shared between adjacent chunks"
                onChange={(v) => update("chunk_overlap", v)}
              />
            </div>
          </Section>

          {/* Retrieval */}
          <Section title="Retrieval" desc="Controls how many chunks are retrieved per query">
            <div className="space-y-5">
              <SliderField
                label="Top-K Chunks"
                value={form.retrieval_k}
                min={1} max={20} step={1}
                unit=" chunks"
                hint="More = broader context, slower response"
                onChange={(v) => update("retrieval_k", v)}
              />

              {/* CRAG toggle */}
              <div className="flex items-center justify-between p-4 bg-[#1c1c26]
                              border border-slate-700 rounded-xl">
                <div>
                  <p className="text-white text-sm font-medium">Corrective RAG (CRAG)</p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Auto-grades and rewrites queries when relevance is low
                  </p>
                </div>
                <button
                  onClick={() => update("use_crag", !form.use_crag)}
                  className={`relative w-11 h-6 rounded-full transition ${
                    form.use_crag ? "bg-indigo-600" : "bg-slate-700"
                  }`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full
                                   transition-transform ${form.use_crag ? "translate-x-5" : ""}`}/>
                </button>
              </div>
            </div>
          </Section>

          {/* Save button (bottom) */}
          <div className="flex justify-end pt-2">
            <button onClick={handleSave} disabled={saving || !changed}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white
                         text-sm font-medium px-6 py-2.5 rounded-lg transition">
              {saving ? "Saving…" : changed ? "Save Changes" : "Saved ✓"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function Section({ title, desc, children }) {
  return (
    <div className="bg-[#13131a] border border-slate-800 rounded-xl p-6">
      <h3 className="text-white font-semibold mb-1">{title}</h3>
      <p className="text-slate-500 text-xs mb-4">{desc}</p>
      {children}
    </div>
  );
}

function SliderField({ label, value, min, max, step, unit, hint, onChange }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-slate-300 text-sm">{label}</label>
        <span className="text-indigo-400 text-sm font-medium tabular-nums">
          {value}{unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-indigo-500 h-1.5 rounded-full cursor-pointer"
        style={{
          background: `linear-gradient(to right, #6366f1 ${pct}%, #334155 ${pct}%)`,
        }}
      />
      {hint && <p className="text-slate-600 text-xs mt-1">{hint}</p>}
    </div>
  );
}