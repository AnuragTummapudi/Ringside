# Ringside

Ringside is an AI bill negotiation agent. It understands a bill, builds a negotiating position, runs a live negotiation, and records what happened. The repository contains a local demo transport plus an optional Twilio voice transport.

## What works locally

The app uses Google sign-in before a negotiation can start, so each history is private to its owner. Once Google OAuth is configured, the local demo path is:

```text
Open /new
  -> upload a synthetic or real bill, or enter details manually
  -> review the live negotiation preview
  -> sign in with Google when you start Demo mode
  -> watch the real negotiation engine update via SSE
  -> inspect the verified report and history
```

Demo mode uses the same lever-based state machine as a real call. Only the phone transport is simulated. No Twilio, Maya, Anthropic, OCR provider, or web research key is required for this path. Neon is optional in local development; production requires it.

## Run locally

```bash
npm install
cp .env.example .env
npm run build
npm run dev
```

Open http://localhost:3000. `npm run build` compiles the React app into `public/`; `npm run dev` runs the Express server and serves that build.

For frontend-only development:

```bash
cd frontend
npm install
npm run dev
```

## Default demo

The polished sample scenario is in `sample-bills/airtel-demo.txt`:

```text
Provider: Airtel
Plan: Xstream Fiber 500 Mbps
Monthly bill: Rs 1499
Customer tenure: 3 years
Comparable market offer: Rs 999
```

The upload extractor supports PDF, PNG, JPG, JPEG, TXT, Markdown, and JSON. Selectable PDF text is read with `pdftotext` when installed. Images use `tesseract` when installed. If neither local tool is available, the UI keeps manual entry available and marks extraction as needing confirmation.

## Architecture

```text
React/Vite
  /new -> upload/manual entry -> preview -> start
  /call/:id -> scoped SSE transcript and offer dashboard
  /negotiation/:id -> durable report and transcript
  /history -> saved results and savings metrics
          |
          v
Express
  bill.js       layered extraction, normalization, masking
  rag.js        local chunking + keyword/metadata hybrid retrieval
  negotiate.js  guarded lever state machine and offer policy
  report.js     verification, savings, outcome, report generation
  tts.js        Maya adapter, timeout, fallback cache, cleanup
  server.js     API, SSE, demo transport, Twilio transport, auth guards
          |
          v
Neon Postgres          production users, sessions, negotiations, and bills
data/ringside.json     local development fallback and RAG knowledge store
```

The local RAG layer is intentionally small and dependency-free. It stores chunks and metadata in JSON, ranks keyword overlap plus recency, and filters by metadata. It is a truthful local fallback, not a pretend embedding service. The `rag.js` interfaces are the seam where PostgreSQL/pgvector or a hosted retriever can be added later.

## RAG ingestion

Ingest a text, Markdown, or JSON knowledge source:

```bash
npm run rag:ingest -- sample-bills/airtel-demo.txt pricing Airtel
npm run rag:ingest -- sample-bills/negotiation-scenarios.txt scenarios Ringside
```

The command stores chunks with `source`, `company`, `category`, `documentType`, `country`, `plan`, and `createdAt` metadata. Retrieval is available through:

```text
POST /api/rag/search
POST /api/research
```

Research responses identify whether local sources were actually found. Reports do not claim external research when none was available.

## Negotiation engine

The engine keeps the existing levers and hard policy checks:

- loyalty and comparable pricing
- escalation and retention review
- offer extraction
- target and acceptance threshold
- maximum turns
- prompt-injection filtering for company, notes, and speech
- spoken-text sanitization
- no fabricated offer acceptance above the policy ceiling

The model receives filtered, labeled context. It never receives a user-controlled string as an instruction block. Model reasoning is not sent to the browser; the dashboard exposes only structured status such as listening, negotiating, and verifying.

## Voice transports

### Demo mode

`POST /api/call/start` with `mode: "agent"` uses the local demo transport by default. It emits the same `call_answered`, `turn_playing`, `call_resolved`, and error events used by the dashboard.

### Twilio mode

Send `transport: "twilio"` for Agent Mode or use `mode: "human"` for a real call. Twilio needs a reachable `NGROK_URL`, account credentials, and a Ringside number. Maya audio is optional because the existing fallback cache and TwiML `<Say>` path remain available.

Anthropic improves generated speech, but the deterministic fallback lines keep the call flow demonstrable when the provider is unavailable. The local demo explicitly skips external LLM calls for low latency and zero-key reliability.

## Bill and negotiation APIs

```text
POST /api/bills/upload       multipart field: bill
POST /api/bills/extract      JSON text fallback
POST /api/research           build local research context
POST /api/rag/search         hybrid retrieval
POST /api/negotiations       create a local demo negotiation
POST /api/call/start         compatible call creation endpoint
GET  /api/events             scoped SSE stream
GET  /api/state/:id          active or durable negotiation state
GET  /api/negotiations/:id   durable report and transcript
GET  /api/calls              authenticated, owner-scoped history
POST /api/verify-offer       policy-aware final-offer verification
POST /api/call/:id/pause     takeover architecture hook
POST /api/call/:id/resume    takeover architecture hook
POST /api/call/:id/end       end-call architecture hook
```

Existing `/api/negotiate` and `/twiml/*` endpoints remain available for compatibility.

## Environment

Copy `.env.example` to `.env`. Important groups:

```dotenv
# App and cookies
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Google OAuth - the only end-user sign-in method
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
AUTH_SESSION_SECRET=
AUTH_COOKIE_SAME_SITE=lax
AUTH_COOKIE_SECURE=false

# Neon Postgres - mandatory in production
DATABASE_URL=

# Anthropic (optional for local demo)
ANTHROPIC_API_KEY=

# Maya (optional; fallback speech remains available)
MAYA_API_KEY=
RINGSIDE_VOICE_ID=Ananya
REP_VOICE_ID=Arjun

# Twilio (required for real phone calls)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_RINGSIDE_NUMBER=
TWILIO_REP_NUMBER=
NGROK_URL=

# Production guardrails
RINGSIDE_API_TOKEN=
PUBLIC_OUTBOUND_CALLS_ENABLED=false
REQUIRE_TWILIO_SIGNATURES=false
TTS_CONCURRENCY=3
TTS_TIMEOUT_MS=8000
AUDIO_RETENTION_MS=900000

# Local document/RAG settings
DEMO_MODE=true
MAX_UPLOAD_MB=8
RAG_STORAGE=local-json
```

To configure Google, create a Google Cloud OAuth Web application and add `${APP_URL}/auth/google/callback` as an authorized redirect URI. For a split frontend and API deployment, use `AUTH_COOKIE_SAME_SITE=none`, `AUTH_COOKIE_SECURE=true`, and list the frontend URL in `ALLOWED_ORIGINS`.

Create a Neon database, set `DATABASE_URL`, then apply the idempotent schema setup:

```bash
npm run db:migrate
```

Production startup refuses to run without both Neon and Google OAuth. Production outbound calling is closed unless explicitly enabled or authenticated. Twilio webhook signatures are required in production. CORS, request size, upload size, filename, audio access, CallSid binding, signed OAuth state, hashed opaque sessions, owner-scoped records, and SSE scope are all enforced in the backend.

## Persistence and privacy

In production, Neon stores Google account profiles, hashed opaque session tokens, owner-scoped negotiations, and sanitized bill metadata. Google refresh tokens are not requested or stored. The app only asks Google for `openid`, `email`, and `profile`; only a verified email may create a session. Session cookies are HTTP-only and same-site by default.

The local fallback is `data/ringside.json`, created at runtime and ignored by Git. It is for local development only. Uploaded temporary files are removed after extraction; account and invoice identifiers are masked before reaching the UI or report. Define retention and deletion processes before handling production customer data.

## Tests

Run the focused checks:

```bash
npm run test:guardrails
npm run preflight
npm run test:negotiate
npm run test:tts
npm run build
```

`test:guardrails` covers config bounds, prompt injection rejection, offer ceilings, sanitization, and unknown-action blocking. `preflight` checks the production security wiring, Google-only authentication, and owner-scoped persistence. `test:negotiate` may report provider fallback when the configured Anthropic key is absent or invalid; that is expected for the local deterministic path.

## Production follow-up

This implementation is not a claim of perfect security. The next production gates are rate and cost quotas, idempotent Twilio event storage, a real OCR/embedding/research provider, streaming STT/TTS, human takeover signaling, formal extraction schema validation, deletion workflows, and end-to-end testing against live providers.
