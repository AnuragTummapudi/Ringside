<div align="center">

# 🥊 Ringside

### The AI that calls, argues, and wins — so you don't have to.

*Built at Push to Prod · Anthropic × Elevation Capital · Bengaluru 2026*

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Anthropic](https://img.shields.io/badge/Claude-Haiku_4.5-D4A017?style=flat-square)](https://www.anthropic.com)
[![Twilio](https://img.shields.io/badge/Twilio-Voice-F22F46?style=flat-square&logo=twilio&logoColor=white)](https://twilio.com)

</div>

---

## What is Ringside?

Ringside is an AI-powered bill negotiation agent that **places real phone calls** on your behalf, argues with customer service reps, and extracts discounts — autonomously.

You tell it your current monthly bill and your target price. Ringside calls the company, works through a multi-turn negotiation using lever-based argumentation (loyalty, competitor offers, escalation threats), and closes at the best achievable rate. The entire conversation plays out live on your screen in real time.

**Two modes:**
- **AI vs AI** — Ringside negotiates against a scripted rep persona (great for demos, instant, repeatable)
- **Real Call** — Ringside calls an actual number and negotiates live using speech-to-text + real-time AI response generation

---

## Demo Flow

```
1. Open /new              → Fill company, current bill, target price
2. Pick mode              → AI Agent (instant) or Real Call (live phone)
3. Hit Start              → Twilio places the call; Claude generates the script
4. Watch /call/:id        → Live transcript + animated offer ticker
5. Call resolves          → Summary: outcome · savings/month · savings/year · call duration
6. Check /history         → All past negotiations, sortable by outcome
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER BROWSER                                   │
│                                                                             │
│   /                     /new                 /call/:id          /history    │
│  Landing Page  →  New Negotiation  →   Live Dashboard  →   History List    │
│                        Form              (SSE-wired)        (5s polling)    │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ HTTP / Server-Sent Events
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXPRESS BACKEND  :3000                              │
│                                                                             │
│  POST /api/call/start    GET /api/events      GET /api/state/:id            │
│  POST /twiml/start       POST /twiml/turn     POST /twiml/human-gather      │
│  POST /api/call-status   GET  /api/calls      POST /twiml/human-start       │
│                                                                             │
│  ┌────────────────┐  ┌─────────────────────┐  ┌──────────────────────────┐ │
│  │  negotiate.js  │  │      tts.js          │  │       server.js          │ │
│  │                │  │                      │  │                          │ │
│  │ deriveConfig() │  │ Maya TTS API call    │  │ activeCalls{} in-memory  │ │
│  │ runNegotiation │  │ pcmToWav() via ffmpeg│  │ SSE broadcast to all     │ │
│  │ Claude Haiku   │  │ 24kHz PCM → 8kHz WAV│  │ clients                  │ │
│  │ lever strategy │  │ fallback cache       │  │ Twilio orchestration     │ │
│  └────────┬───────┘  └──────────┬──────────┘  └──────────────────────────┘ │
└───────────┼─────────────────────┼────────────────────────────────────────────┘
            │                     │
            ▼                     ▼
  ┌──────────────────┐   ┌──────────────────┐
  │  Anthropic API   │   │  Maya Research   │
  │  Claude Haiku    │   │  TTS  /v1/tts    │
  │  (negotiation +  │   │  Ananya / Arjun  │
  │  offer extract)  │   │  voices          │
  └──────────────────┘   └──────────────────┘
                                   │ 8kHz WAV files
                                   ▼
                        ┌──────────────────────┐
                        │   /audio static dir  │
                        │   served by Express  │
                        └──────────┬───────────┘
                                   │ HTTPS via ngrok
                                   ▼
                        ┌──────────────────────┐
                        │    Twilio Voice API  │
                        │   <Play> + <Gather>  │
                        │  outbound calls      │
                        └──────────┬───────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │   Real Phone         │
                        │   +91XXXXXXXXXX      │
                        └──────────────────────┘
```

---

## Agent Mode — Call Flow

```
Browser                  Server                    External
  │                         │                          │
  ├─ POST /api/call/start ──▶│                          │
  │                         ├─ runNegotiation() ───────▶│ Claude Haiku
  │                         │◀─ full 7-turn script ─────┤
  │                         ├─ generateAudio() ×7 ─────▶│ Maya TTS (parallel)
  │                         │◀─ 8kHz WAV files ─────────┤
  │                         ├─ calls.create() ──────────▶│ Twilio API
  │◀── { callId } ──────────┤                           │
  │                         │                           │ Phone rings
  │                         │◀── POST /twiml/start ─────┤ (answered)
  │                         ├── <Redirect /twiml/turn?n=0>
  │  SSE: call_answered     │                           │
  │◀────────────────────────┤                           │
  │                         │◀── POST /twiml/turn?n=0 ──┤
  │  SSE: turn_playing(0)   │── <Play> turn0.wav ──────▶│ Audio plays
  │◀────────────────────────┤── <Redirect /twiml/turn?n=1>
  │        ...              │        ...                 │
  │                         │◀── POST /twiml/turn?n=6 ──┤
  │  SSE: call_resolved     │── <Play> turn6.wav ──────▶│
  │◀────────────────────────┤── <Hangup/>               │
```

## Human Mode — Call Flow

```
Browser                  Server                    Twilio + Human
  │                         │                          │
  ├─ POST /api/call/start ──▶│                          │
  │  { mode: "human",       ├─ calls.create() ─────────▶│ Phone rings
  │    phone: +91XXXX }     │◀── { callId } ────────────┤
  │◀── { callId } ──────────┤                           │
  │                         │◀── POST /twiml/human-start┤ (answered)
  │                         ├─ runRingsideTurn() ───────▶│ Claude Haiku
  │                         ├─ generateAudio() ─────────▶│ Maya TTS
  │  SSE: turn_playing      │── <Play> + <Gather> ──────▶│ Audio plays
  │◀────────────────────────┤                           │
  │                         │                           │ Human speaks
  │                         │◀── POST /twiml/human-gather│ (SpeechResult)
  │                         ├─ extractOfferFromSpeech() ─▶│ Claude Haiku
  │                         ├─ runRingsideTurn() ────────▶│ Claude Haiku
  │                         ├─ generateAudio() ──────────▶│ Maya TTS
  │  SSE: turn_playing      │── <Play> + <Gather> ───────▶│ Audio plays
  │◀────────────────────────┤                           │
  │        ...loop...       │        ...                 │
  │  SSE: call_resolved     │── <Hangup/> ──────────────▶│
  │◀────────────────────────┤                           │
```

---

## Negotiation Engine

The negotiation engine (`negotiate.js`) drives Ringside's strategy using a **lever-based finite state machine** powered by Claude Haiku.

```
Config input
  company, currentPrice, targetPrice, notes, maxTurns
        │
        ▼
  deriveConfig()
  ├── firstOffer   = round(currentPrice × 0.90, nearest 10)
  ├── foldOffer    = round(targetPrice  × 1.02, nearest 10)
  └── acceptThreshold = round(targetPrice × 1.06)
        │
        ▼
  createState()  →  negotiation loop
        │
  ┌─────┴──────────────────────────────────────────┐
  │                                                 │
  │   getRingsideAction()      getRepAction()       │
  │   ├── open                 ├── first_offer       │
  │   ├── lever_loyalty        ├── hold_firm         │
  │   ├── lever_competitor     ├── fold              │
  │   ├── lever_escalate       └── (resolved)        │
  │   ├── best_offer                                 │
  │   └── accept                                     │
  │                                                 │
  │   Each action → Claude Haiku generates          │
  │   contextual speech for that lever              │
  └─────────────────────────────────────────────────┘
        │
        ▼
  resolution_reason:
  ├── "accepted"          (offer ≤ acceptThreshold)
  └── "budget_exhausted"  (turn_count ≥ maxTurns)
```

**Lever strategy:**
| Turn | Ringside action | Rep response |
|------|----------------|-------------|
| 1 | Opens — explains why calling | — |
| 2 | — | Makes first counter-offer (~90% of current) |
| 3 | Loyalty lever — years as customer | — |
| 4 | — | Holds firm |
| 5 | Escalation lever — cancel threat | — |
| 6 | — | Folds to ~102% of target |
| 7 | Accepts | — |

---

## Audio Pipeline

Maya TTS returns **raw PCM** (24 kHz, 16-bit LE, mono) with no file header. Twilio `<Play>` requires a valid WAV at 8 kHz (PSTN telephone standard). Every audio file passes through:

```
Maya /v1/tts
    │ raw PCM (24 000 Hz, 16-bit LE, mono, no header)
    ▼
ffmpeg
  -f s16le -ar 24000 -ac 1 -i pipe:0
  -ar 8000 -acodec pcm_s16le -f wav pipe:1
    │ valid WAV (8 000 Hz, 16-bit, mono, RIFF header)
    ▼
audio/ directory
    │ served as audio/wav by Express
    ▼
Twilio <Play> URL
    │ transmitted over PSTN at 8 kHz
    ▼
Clear speech on phone
```

**Why this matters:** The original 8 kHz header on 24 kHz data caused Twilio to play audio at 3× speed — garbled and unintelligible. The ffmpeg pipeline fixes this and also reduces file size by 3× for faster playback start.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 18 + TypeScript + Vite | Type-safe, fast HMR, single build artifact |
| Styling | Tailwind CSS | Utility-first, design-system consistent |
| Routing | React Router v6 | Client-side SPA routing, 4 pages |
| Backend | Node.js + Express | Lightweight, native SSE support |
| AI — Negotiation | Anthropic Claude Haiku 4.5 | Fast (sub-500ms) for turn-by-turn generation |
| AI — Offer Extract | Anthropic Claude Haiku 4.5 | Parses STT output ("1,000 500" → 1500) |
| TTS | Maya Research `/v1/tts` | Indian-accent voices (Ananya, Arjun) |
| Audio conversion | ffmpeg | PCM 24kHz → WAV 8kHz (PSTN-compatible) |
| Voice calls | Twilio Voice API | Outbound calling, STT via `<Gather>`, TwiML |
| Tunnel | ngrok | Exposes localhost webhooks to Twilio |
| Real-time | Server-Sent Events | Push turn updates to dashboard |
| State | In-memory (Map) | Zero-dependency, demo-appropriate |

---

## Project Structure

```
Ringside/
├── server.js              # Express app — API, TwiML endpoints, SSE
├── negotiate.js           # Negotiation engine — Claude Haiku, lever strategy
├── tts.js                 # Audio pipeline — Maya TTS + ffmpeg WAV conversion
├── package.json
├── .env                   # Secrets (not committed)
│
├── frontend/              # React + Vite SPA
│   └── src/
│       ├── App.tsx        # BrowserRouter + 4 routes
│       ├── pages/
│       │   ├── LandingPage.tsx
│       │   ├── NewNegotiationPage.tsx   # Config form + mode toggle
│       │   ├── CallDashboardPage.tsx    # SSE live transcript + offer ticker
│       │   └── HistoryPage.tsx          # Past negotiations
│       └── components/
│           ├── Navbar.tsx
│           ├── HeroSection.tsx          # Background video + CTA
│           ├── HowItWorksSection.tsx    # 3-step explainer
│           ├── StatsSection.tsx         # ₹479 · <60s · 7 turns · 100%
│           ├── FooterSection.tsx        # CTA band + nav
│           └── LogoIcon.tsx
│
├── audio/                 # Generated WAV files (gitignored)
└── public/                # Built frontend (served by Express)
```

---

## Setup

### Prerequisites
- Node.js 20+
- ffmpeg (`brew install ffmpeg`)
- ngrok account (free tier works)
- Twilio account + phone number
- Anthropic API key
- Maya Research API key

### 1. Install dependencies

```bash
npm install
cd frontend && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Maya Research TTS
MAYA_API_KEY=maya_hk_live_...
RINGSIDE_VOICE_ID=Ananya
REP_VOICE_ID=Arjun

# Twilio
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_RINGSIDE_NUMBER=+1XXXXXXXXXX   # Your Twilio outbound number
TWILIO_REP_NUMBER=+91XXXXXXXXXX       # Number to call in agent mode

# ngrok tunnel URL (no trailing slash)
NGROK_URL=https://your-tunnel.ngrok-free.app

PORT=3000
```

### 3. Start ngrok

```bash
ngrok http 3000
# Copy the https URL → set as NGROK_URL in .env
```

### 4. Build frontend + start server

```bash
npm run build:ui    # builds React → public/
node server.js      # starts Express on :3000
```

Visit `http://localhost:3000`

### 5. (Optional) For Agent Mode — configure rep number

The rep number needs to auto-answer for fully-autonomous AI-vs-AI calls. Set its Twilio Voice webhook to `{NGROK_URL}/twiml/rep-answer`. If it's a real phone, someone picks it up and hears Ringside negotiate.

---

## API Reference

| Method | Endpoint | Description |
|--------|---------|-------------|
| `POST` | `/api/call/start` | Start a negotiation. Body: `{ company, currentPrice, targetPrice, notes, mode, phone? }` |
| `GET` | `/api/events` | SSE stream. Events: `call_preparing`, `call_placed`, `call_answered`, `turn_playing`, `call_resolved`, `call_error`, `call_ended` |
| `GET` | `/api/state/:callId` | Full call state including conversation |
| `GET` | `/api/calls` | All calls, sorted newest first |
| `POST` | `/api/negotiate` | Run negotiation text-only (no Twilio) |
| `POST` | `/twiml/start` | Twilio webhook — agent call start |
| `POST` | `/twiml/turn` | Twilio webhook — agent turn loop |
| `POST` | `/twiml/rep-answer` | Twilio webhook — rep auto-answer (pause 120s) |
| `POST` | `/twiml/human-start` | Twilio webhook — human call opening turn |
| `POST` | `/twiml/human-gather` | Twilio webhook — human STT loop |
| `POST` | `/api/call-status` | Twilio status callback |

### SSE Event Payloads

```jsonc
// turn_playing — fires for every spoken line
{
  "callId": "uuid",
  "turn": 3,
  "speaker": "ringside",      // "ringside" | "rep"
  "text": "I've been a loyal customer for three years...",
  "action": "lever_loyalty_competitor",
  "currentOffer": 1349
}

// call_resolved — fires when negotiation ends
{
  "callId": "uuid",
  "finalPrice": 1020,
  "savings": 479,
  "savingsAnnual": 5748,
  "resolutionReason": "accepted"   // "accepted" | "budget_exhausted"
}
```

---

## Key Design Decisions

**Why Claude Haiku?** Each negotiation turn is a structured generation task with tight latency requirements. Haiku produces contextually appropriate speech in ~300ms — fast enough that Twilio can fetch, play, and redirect without noticeable gaps.

**Why SSE over WebSockets?** The dashboard is read-only (server pushes, client only reads). SSE is simpler, works over HTTP/1.1, and needs no handshake overhead. Each connected browser filters events by `callId` so multiple concurrent demos work correctly.

**Why pre-generate all audio in agent mode?** Generating 7 turns of TTS in parallel (before the call is placed) means Twilio gets sub-100ms responses to every `/twiml/turn` webhook — no stuttering or timeout risk mid-call. Human mode can't pre-generate (speech is live), so it generates one turn at a time.

**Why ffmpeg over a WAV library?** Maya returns raw 24 kHz PCM; Twilio expects 8 kHz WAV. ffmpeg handles both the resampling and the container format in a single stdin→stdout pipe with no temp files. It's 3 lines of configuration vs. a bespoke resampler.

---

## Live Dashboard

The dashboard at `/call/:id` connects to the SSE stream and updates in real time:

- **Offer ticker** — smooth animated counter (cubic ease-out) reflects the current offer price as it changes
- **Transcript feed** — each spoken line appears the moment it plays on the call, attributed to Ringside or the rep
- **Speaking indicators** — avatar ring highlight shows who is currently talking
- **Resolution card** — on completion: outcome (won / best offer / no deal), start → final price, monthly + yearly savings, call duration

---

## Built at Push to Prod

Ringside was built in 24 hours at Push to Prod, the Anthropic × Elevation Capital hackathon in Bengaluru (August 2026).

The core hypothesis: most people overpay on recurring bills not because they can't negotiate, but because negotiating is awkward and time-consuming. An AI agent that calls on your behalf — and actually wins — removes both friction points simultaneously.

---

<div align="center">

*© 2026 Ringside · Anurag Tummapudi · Built at Push to Prod*

</div>
