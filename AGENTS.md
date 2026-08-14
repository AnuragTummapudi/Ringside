# Ringside Agent Guide

Ringside is an Express backend with a React/Vite frontend. The Express server serves the production frontend from `public/` and owns the API, authentication, persistence, demo runtime, and Twilio webhooks.

## Important commands

```bash
npm install
cd frontend && npm install
cd ..
npm run build
npm run dev
npm run typecheck
npm test
npm run preflight
```

`npm run build` regenerates the committed frontend output in `public/`. Do not edit files under `public/assets/` by hand. `npm run test:tts` is an external smoke test and requires a valid Maya credential.

## Architecture boundaries

- `frontend/src/` owns browser UI and talks to `API_BASE` from `frontend/src/api.ts`.
- `server.js` owns HTTP routes, SSE, call lifecycle, Twilio TwiML, and static serving.
- `negotiate.js` and `policy.js` own negotiation decisions and safety enforcement. Preserve the policy firewall around all untrusted bill, research, and speech text.
- `rag.js` is a local metadata-aware keyword retrieval store. It does not use embeddings or a vector database.
- `bill.js` performs local extraction. It uses `pdftotext` and Tesseract only when those executables are installed.
- `auth.js` and `persistence.js` own Google OAuth, opaque sessions, Neon persistence, and owner scoping.
- `tts.js` owns Maya synthesis, ffmpeg conversion, cached fallbacks, and per-call audio cleanup.

## Safety rules

- Never move provider credentials or database URLs into frontend code, built assets, examples, or documentation.
- Preserve `requireUser`, owner checks, and scoped SSE behavior for user records.
- Production Twilio webhooks must remain signature-validated. Do not test real outbound calls without an explicit request.
- Production requires Google OAuth and Neon. Local JSON storage is a development fallback only.
- Keep generated artifacts, audio, uploads, and local data out of Git.

## Documentation

Keep `README.md` aligned with executable code. Deep implementation notes live in `docs/architecture.md` and `docs/troubleshooting.md`. Mark provider-dependent behavior as unverified unless it was exercised with valid credentials.
