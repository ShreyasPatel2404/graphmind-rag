# 🧠 GraphMind RAG

> **Full-stack AI knowledge platform** combining Knowledge Graphs + Vector RAG — built in 10 days, runs 100% locally with zero API costs.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react)](https://react.dev)
[![Neo4j](https://img.shields.io/badge/Neo4j-5-008CC1?style=flat&logo=neo4j)](https://neo4j.com)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-latest-orange?style=flat)](https://www.trychroma.com)
[![Ollama](https://img.shields.io/badge/Ollama-local-black?style=flat)](https://ollama.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## ✨ What Makes This Special

GraphMind RAG doesn't just do keyword search — it **understands the relationships between concepts** in your documents.

| Feature | GraphMind RAG | Regular RAG |
|---------|--------------|-------------|
| Retrieval | Vector + Graph hybrid | Vector only |
| Relationships | Entity graph traversal | None |
| Answer quality | CRAG self-correction | Static |
| Cost | **$0 (fully local)** | API costs |
| Privacy | Data never leaves machine | Cloud dependent |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     GraphMind RAG                           │
├──────────────┬──────────────────────┬───────────────────────┤
│   Frontend   │      Backend         │      AI Layer         │
│   React +    │   FastAPI +          │   Ollama (local)      │
│   Vite +     │   SQLAlchemy +       │   ├─ llama3.2 (LLM)   │
│   Tailwind + │   AsyncSQLite        │   └─ nomic-embed      │
│   D3.js      ├──────────────────────┤                       │
│              │   ChromaDB           │      Neo4j            │
│              │   (vector store)     │   (knowledge graph)   │
└──────────────┴──────────────────────┴───────────────────────┘
```

**Request flow for a chat message:**
```
User query
  → Embed with nomic-embed-text
  → ChromaDB similarity search (top-5 chunks)
  → Neo4j graph traversal (entity neighbors)
  → CRAG: grade relevance → rewrite if low
  → llama3.2 generates answer with context
  → SSE stream response to frontend
  → Citations + confidence badge displayed
```

---

## 🚀 Features

### Document Processing
- ✅ Upload **PDF, DOCX, TXT** files (up to 20 MB)
- ✅ **URL ingestion** — scrape any webpage
- ✅ Smart chunking (500-token chunks, 50-token overlap)
- ✅ Background processing with live status updates

### Knowledge Graph
- ✅ **Automatic entity extraction** with spaCy NER + Ollama LLM
- ✅ Triple extraction: `(subject) → [relation] → (object)`
- ✅ **Interactive D3.js force graph** — zoom, pan, drag nodes
- ✅ Node size = connection count (degree)
- ✅ Entity type coloring: Person, Organization, Place, Concept
- ✅ **Path finder** — shortest path between any two entities
- ✅ Entity explorer table with sortable columns
- ✅ Graph export as JSON

### Hybrid RAG Chat
- ✅ **Vector + Graph hybrid retrieval** for best-of-both answers
- ✅ **Corrective RAG (CRAG)** — auto-grades relevance, rewrites weak queries
- ✅ **SSE streaming** — word-by-word like ChatGPT
- ✅ Citation cards with relevance % and excerpt
- ✅ **Confidence badges** — High / Medium / Low per answer
- ✅ 👍 👎 feedback buttons stored for analysis
- ✅ Chat history with search + JSON export

### Projects & Organization
- ✅ **Multi-document projects** — chat across all docs at once
- ✅ Merged knowledge graph per project
- ✅ Per-user settings (model, chunk size, retrieval-k, CRAG toggle)
- ✅ Analytics dashboard with usage stats

### Infrastructure
- ✅ JWT authentication (register, login, 7-day tokens)
- ✅ Async FastAPI backend (fully non-blocking)
- ✅ Docker Compose one-command deployment
- ✅ Zero API costs — everything runs locally with Ollama

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **LLM** | Ollama + llama3.2 (local, free) |
| **Embeddings** | Ollama + nomic-embed-text (local) |
| **Vector DB** | ChromaDB (persistent local) |
| **Graph DB** | Neo4j 5 Community |
| **Backend** | FastAPI + SQLAlchemy (async) |
| **Database** | SQLite (dev) / PostgreSQL (prod) |
| **Frontend** | React 18 + Vite + Tailwind CSS |
| **Graph Viz** | D3.js force-directed |
| **Auth** | JWT + bcrypt |
| **Streaming** | Server-Sent Events (SSE) |

---

## ⚡ Quick Start

### Option 1 — Docker (Recommended)

```bash
# Clone
git clone https://github.com/ShreyasPatel2404/graphmind-rag.git
cd graphmind-rag

# Start everything
docker-compose up -d

# Pull Ollama models (first time only, ~2.3 GB)
docker exec graphmind-ollama ollama pull llama3.2
docker exec graphmind-ollama ollama pull nomic-embed-text

# Open the app
open http://localhost:3000
```

### Option 2 — Manual Setup

**Prerequisites:** Python 3.12+, Node 20+, Neo4j Desktop, Ollama

```bash
# 1. Clone
git clone https://github.com/ShreyasPatel2404/graphmind-rag.git
cd graphmind-rag

# 2. Backend setup
cd backend
pip install -r requirements.txt
python -m spacy download en_core_web_sm
cp .env.example .env
# Edit .env with your Neo4j password

# 3. Start backend
uvicorn app.main:app --reload --port 8000

# 4. Frontend setup (new terminal)
cd frontend
npm install
npm run dev

# 5. Pull Ollama models
ollama pull llama3.2
ollama pull nomic-embed-text

# 6. Open http://localhost:5173
```

---

## 📖 Usage Guide

### 1. Upload a Document
Go to **Documents** → Upload PDF/DOCX/TXT or paste a URL → Wait for "Ready" status.

### 2. Embed the Document
Click **"Embed with Ollama"** → Wait for "Embedded ✓" (uses local nomic-embed-text).

### 3. Build Knowledge Graph
Go to **Graph** → Select document → Click **"Build Knowledge Graph"** → Wait 30–90s.

### 4. Chat with Your Documents
Go to **Chat** → Ask questions → Get streamed answers with citations + confidence scores.

### 5. Explore the Graph
- **Graph tab**: Interactive D3 visualization, click nodes for entity panel
- **Entities tab**: Full table sortable by connection count
- **Path Finder**: Find connections between any two entities

---

## 🔧 Configuration

All settings configurable via **Settings page** (`/settings`) or `.env` file:

| Setting | Default | Description |
|---------|---------|-------------|
| `OLLAMA_MODEL` | `llama3.2` | LLM for chat + graph extraction |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model |
| `DEFAULT_CHUNK_SIZE` | `2000` chars | Document chunk size |
| `DEFAULT_CHUNK_OVERLAP` | `200` chars | Overlap between chunks |
| `DEFAULT_RETRIEVAL_K` | `5` | Chunks retrieved per query |
| `DEFAULT_USE_CRAG` | `true` | Corrective RAG enabled |

---

## 📁 Project Structure

```
graphmind-rag/
├── backend/
│   ├── app/
│   │   ├── api/          # REST endpoints (auth, docs, chat, graph...)
│   │   ├── models/       # SQLAlchemy models
│   │   ├── rag/          # Core AI: retriever, CRAG, graph builder, Ollama client
│   │   └── utils/        # File parsers, chunker
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/   # ChatMessage, KnowledgeGraph, Toast...
│   │   ├── pages/        # Dashboard, Chat, Graph, Documents...
│   │   └── services/     # API client (axios)
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── demo_docs/            # Sample documents to try
└── README.md
```

---

## 🧪 Sample Documents

The `demo_docs/` folder contains sample documents to test immediately:
- `ai_basics.txt` — Introduction to AI concepts
- `ml_glossary.txt` — Machine learning terminology

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

Built on the shoulders of giants:
- [Ollama](https://ollama.ai) — Local LLM inference
- [ChromaDB](https://www.trychroma.com) — Vector storage
- [Neo4j](https://neo4j.com) — Graph database
- [FastAPI](https://fastapi.tiangolo.com) — Async Python API
- [D3.js](https://d3js.org) — Graph visualization

---

*Built in 10 days as a full-stack AI engineering project.*