import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("gm_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("gm_token");
      localStorage.removeItem("gm_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post("/api/auth/register", data),
  login:    (data) => api.post("/api/auth/login/json", data),
  me:       ()     => api.get("/api/auth/me"),
};

// ─── Documents ────────────────────────────────────────────────────────────────
export const documentsAPI = {
  upload: (file, projectId = null) => {
    const form = new FormData();
    form.append("file", file);
    if (projectId) form.append("project_id", projectId);
    return api.post("/api/documents/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  ingestUrl: (url, projectId = null) =>
    api.post("/api/documents/ingest-url", { url, project_id: projectId }),
  list:   (projectId = null) =>
    api.get("/api/documents", { params: projectId ? { project_id: projectId } : {} }),
  get:    (id) => api.get(`/api/documents/${id}`),
  delete: (id) => api.delete(`/api/documents/${id}`),
};

// ─── Embeddings ───────────────────────────────────────────────────────────────
export const embeddingsAPI = {
  process: (docId) => api.post(`/api/embeddings/${docId}/process`),
  status:  (docId) => api.get(`/api/embeddings/${docId}/status`),
  health:  ()      => api.get("/api/embeddings/health"),
};

// ─── Graph ────────────────────────────────────────────────────────────────────
export const graphAPI = {
  // Core
  build:  (docId) => api.post(`/api/graph/build/${docId}`),
  get:    (docId) => api.get(`/api/graph/${docId}`),
  status: (docId) => api.get(`/api/graph/status/${docId}`),
  health: ()      => api.get("/api/graph/health"),

  // Day 7 — search
  search: (q) => api.get("/api/graph/search", { params: { q } }),

  // Day 9 — analytics + explorer
  getStats:    (docId)             => api.get(`/api/graph/${docId}/stats`),
  getEntities: (docId)             => api.get(`/api/graph/${docId}/entities`),
  findPath:    (docId, from, to)   => api.get(`/api/graph/${docId}/path`, {
    params: { from, to },
  }),
  // export uses native fetch in GraphView.jsx (file download)
};

// ─── Chat ─────────────────────────────────────────────────────────────────────
export const chatAPI = {
  createSession: (data) => api.post("/api/chat/sessions", data),
  listSessions:  ()     => api.get("/api/chat/sessions"),
  getMessages:   (id)   => api.get(`/api/chat/sessions/${id}/messages`),
  deleteSession: (id)   => api.delete(`/api/chat/sessions/${id}`),
  feedback:      (messageId, feedbackValue) =>
    api.post("/api/chat/feedback", { message_id: messageId, feedback: feedbackValue }),
};

// ─── Projects ─────────────────────────────────────────────────────────────────
export const projectsAPI = {
  create:         (data)       => api.post("/api/projects", data),
  list:           ()           => api.get("/api/projects"),
  get:            (id)         => api.get(`/api/projects/${id}`),
  delete:         (id)         => api.delete(`/api/projects/${id}`),
  getDocuments:   (id)         => api.get(`/api/projects/${id}/documents`),
  addDocuments:   (id, docIds) => api.post(`/api/projects/${id}/documents`, { document_ids: docIds }),
  removeDocument: (id, docId)  => api.delete(`/api/projects/${id}/documents/${docId}`),
  getGraph:       (id)         => api.get(`/api/projects/${id}/graph`),
};

// ─── Stats ────────────────────────────────────────────────────────────────────
export const statsAPI = {
  get:      () => api.get("/api/stats"),
  activity: () => api.get("/api/stats/activity"),
};

// ─── Settings ─────────────────────────────────────────────────────────────────
export const settingsAPI = {
  get:        ()     => api.get("/api/settings"),
  update:     (data) => api.put("/api/settings", data),
  listModels: ()     => api.get("/api/settings/models"),
};

export default api;