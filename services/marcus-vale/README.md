# Marcus Vale README

## 📌 Overview
Marcus Vale is a **private, voice-first executive assistant** for Victor Igboekwe, Founder of WHINK Group. This app provides:
- **Voice interaction** (STT/TTS via Whisper & Kokoro)
- **Task management** (3 lanes: Marcus, ECHELON, Victor)
- **Approval system** (voice/tap, protected classes)
- **Memory engine** (3 layers: immutable transcript, core facts, searchable store)
- **Spend cap** ($20/month, 70% warning, 100% block)
- **ECHELON integration** (EAR endpoint, status polling)
- **PWA support** (iPhone/iPad/Desktop)

---

## 🚀 Quick Start

### Prerequisites
- Docker + Docker Compose
- Node.js 20+ (for frontend)
- Python 3.11+ (for backend)

### 1. Clone & Configure
```bash
cd /Users/victorcheckingin/Developer/marcus-vale
cp .env.example .env
# Edit .env with your credentials
```

### 2. Start Dependencies
```bash
docker-compose up -d postgres whisper kokoro
```

### 3. Run Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 4. Run Frontend
```bash
cd frontend
npm install
npm run dev
```

### 5. Open App
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

---

## 🏗️ Architecture

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python) |
| Database | PostgreSQL + pgvector |
| ORM | SQLAlchemy (async) |
| Auth | OIDC (Keycloak) + API Key |
| STT | OpenAI Whisper (via OmniRoute) |
| TTS | Kokoro (via OmniRoute) |
| LLM | OmniRoute (`http://127.0.0.1:20128/v1`) |
| Frontend | React + TypeScript (PWA) |

---

## 📂 Project Structure

```
marcus-vale/
├── backend/
│   ├── main.py              # FastAPI app
│   ├── config.py            # Settings
│   ├── database.py          # PostgreSQL + pgvector
│   ├── models.py            # SQLAlchemy models
│   ├── schemas.py           # Pydantic schemas
│   ├── routes/              # API routes
│   │   ├── voice.py         # STT/TTS endpoints
│   │   ├── tasks.py         # Task lanes
│   │   ├── approvals.py     # Approval system
│   │   ├── memory.py        # Memory engine
│   │   ├── echelon.py       # ECHELON integration
│   │   └── spend.py         # Spend cap
│   └── services/            # External services
│       ├── whisper.py       # Whisper STT
│       ├── kokoro.py        # Kokoro TTS
│       ├── omniroute.py     # OmniRoute LLM
│       └── echelon_client.py # ECHELON client
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # React app
│   │   ├── components/      # React components
│   │   │   ├── VoiceButton.tsx  # Hold-to-talk
│   │   │   ├── ChatView.tsx     # Conversation UI
│   │   │   ├── TaskList.tsx     # Task lanes
│   │   │   ├── MemoryReview.tsx # Memory UI
│   │   │   └── Settings.tsx     # Settings
│   │   ├── styles/
│   │   │   └── global.css    # Global styles
│   │   └── main.tsx         # Entry point
│   ├── public/
│   │   └── manifest.json     # PWA manifest
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🎯 Features

### Voice Pipeline
- **STT**: Whisper (via OmniRoute at `http://127.0.0.1:8767`)
- **TTS**: Kokoro (via OmniRoute at `http://127.0.0.1:8768`)
- **LLM**: OmniRoute (`http://127.0.0.1:20128/v1`)

### Task Lanes
- **Lane 1 (Marcus)**: Personal tasks, drafts, research, quick actions.
- **Lane 2 (ECHELON)**: Company work, specialist work, anything that needs the workforce.
- **Lane 3 (Victor)**: Ambiguous tasks, protected-class actions, anything outside Marcus's authority.

### Approval System
- **Voice/Tap Approval**: One verbal or tap approval from Victor is sufficient.
- **Protected Classes**: Always require a second check for:
  1. Any action that spends money
  2. Any action that shares proprietary material outside WHINK Group
- **Approval IDs**: Stored in the database with a unique ID, content hash, timestamp, and method.

### Memory Engine
- **Layer 1 (Immutable Transcript)**: Every conversation, every call, every action. Never edited, never deleted.
- **Layer 2 (Core Facts)**: Always loaded at the start of every session. Victor's name, role, company, preferences, standing instructions, known contacts, active projects.
- **Layer 3 (Searchable Store)**: Everything else. Retrieved by entity, topic, or date. Uses pgvector for semantic search.

### Spend Cap
- **Default Cap**: $20/month
- **Warning Threshold**: 70% of cap
- **Block**: At 100%, Marcus stops all spending actions and tells Victor.

### ECHELON Integration
- **Connection**: Marcus connects to ECHELON as a named service identity: `marcus-vale`.
- **Handoff**: Sends tasks to ECHELON with:
  - `client_operation_id` (idempotent)
  - `title`, `goal`, `deadline`
  - `approval` (approval_id, approved_at, method, content_hash)
  - `sensitivity` (standard | proprietary | financial)
  - `directorate` (optional)
- **Status Polling**: Marcus polls ECHELON status for every task he hands off.

### Scheduling
- **Morning Briefing**: 9 AM weekdays
- **Evening Briefing**: 9 PM weekdays
- **Weekend Check-in**: 6 PM Saturdays and Sundays
- **Memory Review**: Sundays 4 PM (asks: call or send to read?)

### Kill Switch
- **Phrase**: "Marcus, stop everything."
- **Action**: Freeze all queued tasks and all pending ECHELON handoffs.
- **Resume**: "Marcus, resume."

---

## 🧪 Tests

Run tests with:
```bash
cd backend
pytest tests/ -v
```

Tests cover:
- Approvals
- Voice Pipeline
- Spend Cap
- Memory
- Tasks

---

## 🐳 Deployment

### Local Mode
```bash
# Start dependencies
docker-compose up -d postgres whisper kokoro

# Run backend
cd backend
uvicorn main:app --reload --port 8000

# Run frontend
cd frontend
npm run dev
```

### Server Mode
```bash
# Set MARCUS_ENV=server in .env
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## 📝 Notes

- **OmniRoute**: Must be running at `http://127.0.0.1:20128/v1`.
- **PostgreSQL**: Uses port `5433` to avoid conflict with `whink-ultimate-postgres-1`.
- **Whisper/Kokoro**: Use ports `8767`/`8768` to avoid OrbStack conflicts.
- **ECHELON**: Integration uses a mock endpoint for testing.

---

*End of Marcus Vale README. Victor Igboekwe authorises this build to proceed.*
