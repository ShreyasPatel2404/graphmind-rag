# 🧠 GraphMind RAG — Complete Product Build Plan
### From GitHub Tutorial → Production AI Product (10 Days)

**GitHub Repo Name:** `graphmind-rag`
**Base:** `knowledge_graph_rag_citations` by Shubhamsaboo
**Stack:** FastAPI (Python) + `neo4j` driver + React (Frontend) + Ollama (Free LLM) + ChromaDB + Neo4j Community

---

## 🗂️ Product Overview

**GraphMind RAG** is a full-stack AI knowledge platform that lets users:
- Upload documents (PDF, TXT, DOCX, URLs)
- Auto-build a Knowledge Graph from content
- Chat with documents using Graph + Vector hybrid RAG
- Get answers with cited sources
- Visualize entity relationships as an interactive graph
- Manage multiple knowledge bases (projects)
- Collaborate with team members (auth system)

**Tech Stack:**
| Layer | Technology | Cost |
|---|---|---|
| LLM | Ollama + Llama 3.2 | FREE |
| Embeddings | Ollama nomic-embed-text | FREE |
| Vector DB | ChromaDB (local) | FREE |
| Graph | Neo4j Community / Desktop | FREE |
| Backend | FastAPI (Python) + `neo4j` driver | FREE |
| Frontend | React + TailwindCSS | FREE |
| Auth | JWT + bcrypt | FREE |
| DB | SQLite (dev) / PostgreSQL | FREE |
| Graph Viz | D3.js | FREE |

---

## 📁 Folder Structure

```
graphmind-rag/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── auth/                # JWT auth, user model
│   │   ├── rag/                 # Core RAG engine
│   │   │   ├── graph_builder.py # Knowledge graph creation
│   │   │   ├── retriever.py     # Hybrid vector + graph retrieval
│   │   │   ├── citations.py     # Citation tracking
│   │   │   └── ollama_client.py # Local LLM wrapper
│   │   ├── api/                 # REST API routes
│   │   │   ├── auth.py
│   │   │   ├── documents.py
│   │   │   ├── chat.py
│   │   │   ├── graph.py
│   │   │   └── projects.py
│   │   ├── models/              # SQLAlchemy models
│   │   └── utils/               # File parsers, chunkers
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Chat.jsx
│   │   │   ├── GraphView.jsx
│   │   │   ├── Documents.jsx
│   │   │   └── Settings.jsx
│   │   ├── components/
│   │   │   ├── ChatWindow.jsx
│   │   │   ├── KnowledgeGraph.jsx  # D3.js graph viz
│   │   │   ├── CitationCard.jsx
│   │   │   ├── DocumentUpload.jsx
│   │   │   └── Navbar.jsx
│   │   └── services/
│   │       └── api.js
│   ├── package.json
│   └── tailwind.config.js
├── docker-compose.yml
└── README.md
```

---

## 🗓️ DAY-BY-DAY BUILD PLAN

---

### DAY 1 — Project Setup + Authentication System
**Goal:** Working auth (register/login/JWT) with React frontend connected to FastAPI

**Backend Tasks:**
- [ ] `pip install fastapi uvicorn sqlalchemy bcrypt python-jose python-multipart`
- [ ] Set up FastAPI app with CORS middleware
- [ ] Create `User` model: id, email, password_hash, created_at
- [ ] `POST /api/auth/register` — hash password, store user
- [ ] `POST /api/auth/login` — verify password, return JWT token
- [ ] `GET /api/auth/me` — protected route, return user info
- [ ] JWT middleware: decode token on every protected route

**Frontend Tasks:**
- [ ] `npx create-react-app frontend` or `npm create vite@latest`
- [ ] Install: `npm install axios react-router-dom tailwindcss`
- [ ] Build Login page (email + password form)
- [ ] Build Register page
- [ ] Store JWT in localStorage, attach to all API calls
- [ ] Protected route wrapper: redirect to /login if no token

**End of Day Check:** You can register, login, and access a protected `/dashboard` page.

---

### DAY 2 — Document Upload + File Processing Pipeline
**Goal:** Users can upload PDF/TXT/DOCX and see them listed in their dashboard

**Backend Tasks:**
- [ ] `pip install pypdf python-docx langchain langchain-community`
- [ ] Create `Document` model: id, user_id, filename, status, created_at
- [ ] Create `Project` model: id, user_id, name, description
- [ ] `POST /api/documents/upload` — accept file, store in `/uploads/{user_id}/`
- [ ] File parser utils:
  - PDF → extract text with pypdf
  - DOCX → extract text with python-docx
  - TXT → read directly
  - URL ingestion → BeautifulSoup scrape
- [ ] Chunking: split text into 500-token chunks with 50-token overlap
- [ ] Store chunks in SQLite with document_id reference

**Frontend Tasks:**
- [ ] Dashboard page: show user's documents list
- [ ] Drag-and-drop upload component (react-dropzone)
- [ ] Show upload progress bar
- [ ] Document cards: filename, upload date, status badge (Processing / Ready)
- [ ] `GET /api/documents` → list all user docs

**End of Day Check:** Upload a PDF and see it appear in dashboard with status "Ready".

---

### DAY 3 — Ollama Integration + Vector Embeddings
**Goal:** Documents are embedded locally using Ollama, stored in ChromaDB — zero API cost

**Backend Tasks:**
- [ ] `pip install chromadb ollama langchain-ollama`
- [ ] `ollama pull nomic-embed-text` (run this in terminal)
- [ ] `ollama pull llama3.2` (the main LLM)
- [ ] Build `ollama_client.py`:
  ```python
  # embed text chunks
  def embed_chunks(chunks: list[str]) -> list[list[float]]
  # generate response
  def generate(prompt: str, context: str) -> str
  # stream response  
  def generate_stream(prompt: str, context: str) -> Generator
  ```
- [ ] ChromaDB setup: one collection per user/project
- [ ] `POST /api/documents/{id}/process` → embed all chunks → store in ChromaDB
- [ ] Update document status: Pending → Processing → Ready

**Frontend Tasks:**
- [ ] Add "Process" button on document card
- [ ] Show embedding progress (polling `/api/documents/{id}/status`)
- [ ] Status indicators: spinner while processing, green tick when ready
- [ ] Toast notifications (react-hot-toast)

**End of Day Check:** Upload PDF → click Process → watch it embed locally → status turns green.

---

### DAY 4 — Knowledge Graph Builder (Core Feature)
**Goal:** Auto-extract entities + relationships from documents, store in Neo4j graph database

**Backend Tasks:**
- [ ] Install Neo4j Desktop from https://neo4j.com/download/ (free, local)
  - Create a local DB, set password, start it — runs on `bolt://localhost:7687`
- [ ] `pip install neo4j spacy langchain-community`
- [ ] `python -m spacy download en_core_web_sm`
- [ ] Build `graph_builder.py`:
  ```python
  # Uses Ollama LLM to extract triples from text
  # Prompt: "Extract entities and relationships as JSON:
  # [{"subject": "...", "relation": "...", "object": "..."}]"
  def extract_triples(text_chunk: str) -> list[dict]

  # Write triples to Neo4j using neo4j Python driver
  # CREATE (a:Entity {name: subject})-[:RELATION {type: relation}]->(b:Entity {name: object})
  def write_to_neo4j(triples: list[dict], doc_id: str, driver) -> None

  # Serialize graph back as JSON for frontend (nodes + edges)
  def fetch_graph_json(doc_id: str, driver) -> dict
  ```
- [ ] Neo4j driver setup in `neo4j_client.py`:
  ```python
  from neo4j import GraphDatabase
  driver = GraphDatabase.driver("bolt://localhost:7687", auth=("neo4j", "your_password"))
  ```
- [ ] `POST /api/graph/build/{document_id}` → extract triples → write to Neo4j
- [ ] `GET /api/graph/{document_id}` → query Neo4j → return JSON for frontend
- [ ] Each node tagged with `doc_id` property so graphs stay isolated per document

**Frontend Tasks:**
  - Nodes = entities (colored by type: Person, Place, Org, Concept)
  - Edges = relationships (labeled)
  - Zoom + pan + click-to-highlight
- [ ] `/graph` page — select a document → see its graph
- [ ] Node detail panel: click a node → see all its connections

**End of Day Check:** Upload a document → Build Graph → See interactive D3 knowledge graph.

---

### DAY 5 — Hybrid RAG Chat (Vector + Graph Retrieval)
**Goal:** Users can chat with documents — answers use BOTH vector search + graph traversal

**Backend Tasks:**
- [ ] `pip install langchain-core`
- [ ] Build `retriever.py` — Hybrid Retrieval:
  ```python
  # Step 1: Vector search — find top-k similar chunks
  def vector_retrieve(query: str, collection_id: str, top_k=5) -> list[str]
  
  # Step 2: Graph retrieve — query Neo4j for entities in query, expand neighbors (Cypher)
  def graph_retrieve(query: str, doc_id: str, driver, hops=2) -> list[str]
  
  # Step 3: Merge + deduplicate context
  def hybrid_retrieve(query, collection_id, doc_id, driver) -> dict
  ```
- [ ] Build `citations.py`:
  ```python
  # Track which chunk each answer piece came from
  def build_citation(chunk_id, document_name, page_num) -> Citation
  ```
- [ ] `POST /api/chat` → accept {message, project_id} → hybrid retrieve → stream response
- [ ] Stream response using Server-Sent Events (SSE)
- [ ] Save chat history in SQLite: session_id, role, content, citations

**Frontend Tasks:**
- [ ] `/chat` page with split layout:
  - Left: document list + graph preview
  - Right: chat window with streaming responses
- [ ] Streaming message display (word-by-word like ChatGPT)
- [ ] Citation cards below each answer: 📄 source filename, page number, excerpt
- [ ] Chat history sidebar: previous sessions

**End of Day Check:** Ask "Who is the CEO of X?" → get streamed answer with citation cards.

---

### DAY 6 — Multi-Document Projects + Graph Merging
**Goal:** Users create Projects, add multiple docs, query across all of them at once

**Backend Tasks:**
- [ ] `POST /api/projects` → create project
- [ ] `POST /api/projects/{id}/documents` → add documents to project
- [ ] Graph merge: Neo4j handles this natively — just tag nodes with `project_id`
  ```python
  # No manual merge needed — query by project_id across all doc nodes
  # MATCH (n:Entity {project_id: $project_id}) RETURN n
  # Deduplicate same-name entities using MERGE in Cypher:
  # MERGE (a:Entity {name: $name, project_id: $pid})
  def assign_project_to_graph(doc_id: str, project_id: str, driver) -> None
- [ ] Multi-doc vector retrieval: search across all collections in a project
- [ ] `GET /api/projects/{id}/graph` → return merged project graph
- [ ] Cross-document citations: answer can cite multiple documents

**Frontend Tasks:**
- [ ] Projects sidebar in dashboard
- [ ] Create Project modal: name + description + select documents
- [ ] Project overview page: docs list + merged graph preview
- [ ] Chat page: project selector dropdown at top
- [ ] Multi-citation display: "From: doc1.pdf (p.3), doc2.pdf (p.7)"

**End of Day Check:** Create a project with 3 PDFs → ask a question → get answer citing all 3.

---

### DAY 7 — Advanced Features: Web URL Ingestion + Corrective RAG
**Goal:** Add URL scraping + smart re-retrieval if first answer is insufficient

**Backend Tasks:**
- [ ] `pip install beautifulsoup4 requests`
- [ ] `POST /api/documents/url` → scrape URL → chunk → embed → build graph
- [ ] Implement Corrective RAG (CRAG) pattern:
  ```python
  # After retrieval, grade relevance of each chunk (0-1)
  def grade_relevance(query: str, chunk: str) -> float
  
  # If avg relevance < 0.5, do web search or re-retrieve with expanded query
  def corrective_retrieve(query, context_chunks) -> list[str]
  ```
- [ ] Query rewriting: if answer quality is low, rewrite query and retry
- [ ] `GET /api/graph/search?q=entity_name` → find node + neighbors

**Frontend Tasks:**
- [ ] "Add URL" button in document upload area
- [ ] URL input with scrape progress indicator
- [ ] Graph search bar: type entity name → highlight matching nodes
- [ ] "Confidence" badge on answers: High / Medium (based on relevance scores)
- [ ] Answer feedback buttons: 👍 👎 (store in DB for later analysis)

**End of Day Check:** Add a Wikipedia URL → process it → chat with it — see confidence scores.

---

### DAY 8 — User Dashboard, Analytics + Settings
**Goal:** Professional dashboard with usage stats, chat history management, model settings

**Backend Tasks:**
- [ ] Analytics endpoints:
  - `GET /api/stats` → total docs, total chats, graph nodes/edges count
  - `GET /api/chat/history` → paginated chat sessions
  - `GET /api/chat/{session_id}` → full conversation
- [ ] Settings:
  - `PUT /api/settings/model` → change Ollama model (llama3.2, mistral, etc.)
  - `PUT /api/settings/chunk_size` → adjust chunking params
  - `PUT /api/settings/retrieval_k` → top-k chunks setting
- [ ] Export chat: `GET /api/chat/{id}/export` → return as PDF or JSON
- [ ] Delete document: remove from DB + ChromaDB + Neo4j (MATCH {doc_id} DELETE)

**Frontend Tasks:**
- [ ] Dashboard home with stat cards:
  - 📄 Documents uploaded
  - 💬 Total chats
  - 🔗 Graph nodes
  - 🗂️ Projects
- [ ] Chat history page with search and filter
- [ ] Settings page:
  - Model selector dropdown (shows available Ollama models)
  - Chunk size slider
  - Theme toggle (dark/light)
- [ ] Export chat button → download as PDF

**End of Day Check:** Dashboard shows stats, settings save correctly, chat history loads.

---

### DAY 9 — Graph Visualization Polish + Entity Explorer
**Goal:** Make the graph view the WOW feature that impresses interviewers

**Backend Tasks:**
- [ ] Graph analytics:
  - `GET /api/graph/{id}/stats` → node count, edge count, most connected entities
  - `GET /api/graph/{id}/entities` → list all entities with type + degree
  - `GET /api/graph/{id}/path?from=X&to=Y` → shortest path between two entities
- [ ] Entity type classification using spaCy (PERSON, ORG, GPE, CONCEPT)
- [ ] Community detection using Neo4j Graph Data Science (GDS) plugin — Louvain algorithm
  - `CALL gds.louvain.stream('entityGraph') YIELD nodeId, communityId`
- [ ] Shortest path via Neo4j Cypher:
  - `MATCH p=shortestPath((a:Entity {name:$from})-[*]-(b:Entity {name:$to})) RETURN p`
- [ ] Graph export: `GET /api/graph/{id}/export` → query Neo4j → return as JSON

**Frontend Tasks:**
- [ ] Full-screen Graph Explorer page (`/graph/{project_id}`)
- [ ] D3 force graph with:
  - Node color by entity type (PERSON=blue, ORG=orange, CONCEPT=purple)
  - Node size by degree (more connections = bigger)
  - Edge labels showing relationship
  - Zoom, pan, drag nodes
- [ ] Right sidebar: Entity info panel
  - Entity name + type
  - List of all relationships
  - "Ask about this" button → opens chat pre-filled with entity
- [ ] Path finder UI: select two nodes → highlight shortest path
- [ ] Entity list view (table): sortable by degree, type, document

**End of Day Check:** Open graph → click a person node → see all their connections → click "Ask about this" → chat opens with context.

---

### DAY 10 — Docker, README, Polish + Demo Prep
**Goal:** Deployable with one command, stunning README, ready to show recruiters

**Tasks:**
- [ ] Write `docker-compose.yml`:
  ```yaml
  services:
    backend:
      build: ./backend
      ports: ["8000:8000"]
      volumes: ["./data:/app/data"]
      environment:
        - NEO4J_URI=bolt://neo4j:7687
        - NEO4J_PASSWORD=graphmind123
    frontend:
      build: ./frontend
      ports: ["3000:3000"]
    neo4j:
      image: neo4j:5-community
      ports: ["7474:7474", "7687:7687"]
      environment:
        - NEO4J_AUTH=neo4j/graphmind123
      volumes: ["./neo4j_data:/data"]
  ```
- [ ] Write `README.md` with:
  - Product screenshots (take during testing)
  - Architecture diagram
  - One-command setup: `docker-compose up`
  - Tech stack badges
  - Feature list with checkmarks
  - Demo GIF (record with OBS or Loom)
- [ ] `.env.example` with all config keys documented
- [ ] Error handling polish: all API errors return proper JSON
- [ ] Loading skeletons on frontend (no blank screens)
- [ ] Mobile responsive layout check
- [ ] Add sample demo documents in `/demo_docs/` folder
- [ ] Final test: fresh clone → `docker-compose up` → everything works

**End of Day Check:** Someone can clone your repo, run `docker-compose up`, and use the full product.

---

## 🌟 Complete Feature List (For Your Resume)

**Core RAG Features:**
- ✅ Knowledge Graph extraction from documents (entities + relationships)
- ✅ Hybrid retrieval: Vector search + Graph traversal
- ✅ Corrective RAG (CRAG) — self-correcting retrieval
- ✅ Source citations on every answer
- ✅ Streaming LLM responses (SSE)
- ✅ Multi-document cross-referencing

**Document Features:**
- ✅ PDF, DOCX, TXT upload
- ✅ Web URL ingestion
- ✅ Multi-document projects
- ✅ Document status tracking

**Graph Features:**
- ✅ Interactive D3.js force-directed graph
- ✅ Entity type classification (Person, Org, Place, Concept)
- ✅ Shortest path finder between entities
- ✅ Community detection
- ✅ Graph search + entity explorer
- ✅ Graph export (JSON/GEXF)

**Product Features:**
- ✅ JWT Authentication (register/login)
- ✅ User dashboard with analytics
- ✅ Chat history with search
- ✅ Export conversations as PDF
- ✅ Model selector (switch Ollama models)
- ✅ Dark/light mode
- ✅ Docker deployment
- ✅ 100% local — no API keys, no cost

---

## 💼 What to Say in Interviews

> "I built GraphMind RAG — a full-stack AI product with a React frontend and FastAPI backend. It uses Ollama to run Llama 3.2 locally at zero cost. The core feature is hybrid retrieval: it combines vector similarity search with knowledge graph traversal using Neo4j, which solves multi-hop reasoning that basic RAG fails at. Every answer includes source citations. I also implemented Corrective RAG — the system grades its own retrieved context and re-queries if confidence is low. The whole thing runs locally with Docker including a Neo4j Community container — no OpenAI key, no cloud, no cost."

**Skills this project demonstrates:**
- RAG pipeline architecture (vector + graph hybrid)
- FastAPI REST API design
- React frontend development
- LangChain + Ollama integration
- Knowledge Graph construction + Neo4j Cypher queries
- JWT authentication
- Docker containerization
- D3.js data visualization
- SQLite/PostgreSQL database design

---

## 🔗 Related Repos to Reference/Extend From

All from `awesome-llm-apps/rag_tutorials/`:
- `corrective_rag` → for the CRAG implementation (Day 7)
- `agentic_rag_with_reasoning` → for reasoning display feature
- `autonomous_rag` → for URL ingestion pattern
- `local_rag_agent` → for Ollama + ChromaDB setup reference

---

## 📌 GitHub Repo Setup Commands

```bash
# Day 1 - initialize
git init graphmind-rag
cd graphmind-rag
git remote add origin https://github.com/YOUR_USERNAME/graphmind-rag.git

# Commit pattern each day
git add .
git commit -m "Day 1: Auth system - JWT register/login with React frontend"
git push origin main
```

**Commit one working feature each day — this shows consistent progress to recruiters.**
