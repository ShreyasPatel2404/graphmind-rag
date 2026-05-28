import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// ─── Request: attach JWT ──────────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("gm_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Response: auto-logout on 401 ────────────────────────────────────────────
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
  // Upload a file (multipart/form-data)
  upload: (file, projectId = null) => {
    const form = new FormData();
    form.append("file", file);
    if (projectId) form.append("project_id", projectId);
    return api.post("/api/documents/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: undefined, // caller can pass via config if needed
    });
  },

  // Ingest a URL
  ingestUrl: (url, projectId = null) =>
    api.post("/api/documents/ingest-url", { url, project_id: projectId }),

  // List all documents (optionally filter by project)
  list: (projectId = null) =>
    api.get("/api/documents", { params: projectId ? { project_id: projectId } : {} }),

  // Get single document
  get: (id) => api.get(`/api/documents/${id}`),

  // Delete document
  delete: (id) => api.delete(`/api/documents/${id}`),
};

// ─── Projects ─────────────────────────────────────────────────────────────────
export const projectsAPI = {
  create: (data) => api.post("/api/projects", data),
  list:   ()     => api.get("/api/projects"),
  get:    (id)   => api.get(`/api/projects/${id}`),
  delete: (id)   => api.delete(`/api/projects/${id}`),
};

export default api;