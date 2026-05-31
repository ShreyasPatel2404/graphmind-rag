import { useState, useEffect } from "react";
import { projectsAPI, documentsAPI } from "../services/api";
import { toast } from "./Toast";

export default function ProjectModal({ onClose, onCreated }) {
  const [name,     setName]     = useState("");
  const [desc,     setDesc]     = useState("");
  const [allDocs,  setAllDocs]  = useState([]);
  const [selDocs,  setSelDocs]  = useState([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    documentsAPI.list()
      .then(({ data }) => setAllDocs(data.filter((d) =>
        ["ready","embedded","graph_ready"].includes(d.status)
      )))
      .catch(() => {});
  }, []);

  const toggle = (id) =>
    setSelDocs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Project name is required"); return; }
    setLoading(true);
    try {
      const { data } = await projectsAPI.create({
        name: name.trim(),
        description: desc.trim() || null,
        document_ids: selDocs,
      });
      toast.success(`Project "${data.name}" created!`);
      onCreated(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#13131a] border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <h2 className="text-white font-semibold text-lg">Create Project</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-slate-400 text-sm mb-1.5">Project name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Research Q3 2025"
              className="w-full bg-[#1c1c26] border border-slate-700 text-white rounded-lg
                         px-4 py-2.5 text-sm placeholder-slate-600 focus:outline-none
                         focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-1.5">Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Optional description…"
              rows={2}
              className="w-full bg-[#1c1c26] border border-slate-700 text-white rounded-lg
                         px-4 py-2.5 text-sm placeholder-slate-600 focus:outline-none
                         focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-2">
              Add documents
              {selDocs.length > 0 && (
                <span className="ml-2 text-indigo-400">({selDocs.length} selected)</span>
              )}
            </label>
            {allDocs.length === 0 ? (
              <p className="text-slate-600 text-sm">No ready documents available</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {allDocs.map((doc) => (
                  <label key={doc.id}
                    className="flex items-center gap-3 p-3 bg-[#1c1c26] border border-slate-800
                               rounded-lg cursor-pointer hover:border-slate-700 transition">
                    <input
                      type="checkbox"
                      checked={selDocs.includes(doc.id)}
                      onChange={() => toggle(doc.id)}
                      className="accent-indigo-500 w-4 h-4"
                    />
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{doc.original_name}</p>
                      <p className="text-slate-600 text-xs">
                        {doc.file_type.toUpperCase()} · {doc.chunk_count} chunks · {doc.status}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-slate-800">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300
                       py-2.5 rounded-lg text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
                       text-white py-2.5 rounded-lg text-sm font-medium transition
                       flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Creating…
              </>
            ) : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}