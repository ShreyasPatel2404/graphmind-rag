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
  // Trigger embedding for a document
  process: (docId) => api.post(`/api/embeddings/${docId}/process`),

  // Poll embedding status
  status:  (docId) => api.get(`/api/embeddings/${docId}/status`),

  // Check Ollama health
  health:  ()      => api.get("/api/embeddings/health"),
};

// ─── Projects ─────────────────────────────────────────────────────────────────
export const projectsAPI = {
  create: (data) => api.post("/api/projects", data),
  list:   ()     => api.get("/api/projects"),
  get:    (id)   => api.get(`/api/projects/${id}`),
  delete: (id)   => api.delete(`/api/projects/${id}`),
};

export default api;