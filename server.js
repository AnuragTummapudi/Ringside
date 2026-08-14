require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const twilio  = require('twilio');
const path    = require('path');
const crypto  = require('crypto');
const fs      = require('fs');
const { v4: uuid } = require('uuid');
const multer  = require('multer');
const cookieParser = require('cookie-parser');

const {
  DEFAULT_CONFIG,
  deriveConfig,
  createState,
  runRingsideTurn,
  runNegotiation,
  extractOfferFromSpeech,
  ingestHumanSpeech,
} = require('./negotiate');

const policy = require('./policy');
const { generateAudio, generateFallbackCache, ensureAudioDir, cleanupAudioFiles } = require('./tts');
const persistence = require('./persistence');
const { attachUser, requireUser, registerAuthRoutes, configured: googleAuthConfigured } = require('./auth');
const { extractTextFromFile, extractBillData, sanitizeBillForClient } = require('./bill');
const { buildResearchContext, ingestDocument, searchKnowledge } = require('./rag');
const { buildReport, verifyFinalOffer } = require('./report');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.set('trust proxy', true);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (!isProduction && !allowedOrigins.length) return cb(null, true);
    if (isProduction && !allowedOrigins.length && publicBaseUrl() === origin) return cb(null, true);
    return cb(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '128kb' }));
app.use(express.urlencoded({ extended: true, limit: '128kb' }));
app.use(cookieParser());
// This deliberately remains unauthenticated so Twilio's public reachability can be checked before a call is placed.
app.get('/healthz', (_req, res) => res.status(200).type('text/plain').send('ok'));
app.use(express.static('public'));
app.use(attachUser);
registerAuthRoutes(app);

const uploadDir = path.join(__dirname, 'data', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'text/markdown', 'application/json']);
    cb(null, allowed.has(file.mimetype) || /\.(pdf|png|jpe?g|txt|md|json)$/i.test(file.originalname));
  },
});

// ── IN-MEMORY STATE ────────────────────────────────────────────────────────────
const activeCalls  = {};   // callId → call object
const callSidToId  = {};   // Twilio CallSid → callId

// ── SSE ────────────────────────────────────────────────────────────────────────
const sseClients = new Map();

app.get('/api/events', (req, res) => {
  const callId = String(req.query.callId || '');
  const apiAuthorized = hasApiAccess(req);
  const call = activeCalls[callId];

  if (!apiAuthorized && (!req.user || !callId || !ownsCall(req, call))) {
    return res.status(403).json({ error: 'Unauthorized event stream' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const hb = setInterval(() => res.write(': heartbeat\n\n'), 15000);
  sseClients.set(res, { callId, userId: req.user?.id || null, apiAuthorized });
  req.on('close', () => { clearInterval(hb); sseClients.delete(res); });
});

function emit(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [client, scope] of sseClients) {
    if (
      scope.apiAuthorized ||
      (data.callId && data.callId === scope.callId && activeCalls[data.callId]?.userId === scope.userId)
    ) {
      client.write(msg);
    }
  }
}

// ── HELPERS ────────────────────────────────────────────────────────────────────
function makeToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function escapeXml(str) {
  return String(str).replace(/[<>&"]/g, (c) => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;' }[c]));
}

function publicBaseUrl() {
  return String(process.env.NGROK_URL || '').replace(/\/+$/, '');
}

function browserTakeoverConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_API_KEY_SID &&
    process.env.TWILIO_API_KEY_SECRET &&
    process.env.TWILIO_TWIML_APP_SID &&
    publicBaseUrl()
  );
}

async function browserTakeoverApplicationMatchesBackend() {
  const expected = new URL(`${publicBaseUrl()}/twiml/browser-takeover`);
  const application = await twilioClient().applications(process.env.TWILIO_TWIML_APP_SID).fetch();
  const configured = new URL(application.voiceUrl || '');
  return (
    configured.origin === expected.origin &&
    configured.pathname === expected.pathname &&
    String(application.voiceMethod || '').toUpperCase() === 'POST'
  );
}

function publicTakeoverState(call) {
  const available = call?.config?.mode === 'human' && browserTakeoverConfigured();
  const takeover = call?.takeover;
  return {
    available,
    phase: takeover?.phase || 'idle',
    browserConnected: Boolean(takeover?.browserCallSid),
    canTakeOver: available && Boolean(call?.twilioCallSid) && ['idle', 'cancelled', 'failed'].includes(takeover?.phase || 'idle') && !call?.endedAt,
  };
}

function emitTakeoverState(call) {
  emit('takeover_state', { callId: call.callId, takeover: publicTakeoverState(call) });
}

function conferenceName(call) {
  return `ringside-${call.callId}`;
}

function twilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

function createBrowserVoiceToken(call) {
  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;
  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_API_KEY_SID,
    process.env.TWILIO_API_KEY_SECRET,
    { identity: call.takeover.identity, ttl: 300 }
  );
  token.addGrant(new VoiceGrant({ outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID }));
  return token.toJwt();
}

function conferenceTwiml(call, label) {
  const callback = `${publicBaseUrl()}/api/conference-status?callId=${encodeURIComponent(call.callId)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="false"
      participantLabel="${label}" statusCallback="${callback}" statusCallbackMethod="POST"
      statusCallbackEvent="start end join leave">${conferenceName(call)}</Conference>
  </Dial>
</Response>`;
}

async function assertPublicWebhookReachable(baseUrl) {
  try {
    await axios.get(`${baseUrl}/healthz`, {
      timeout: 5_000,
      maxRedirects: 0,
      validateStatus: (status) => status === 200,
    });
  } catch (error) {
    const host = (() => {
      try { return new URL(baseUrl).host; } catch { return 'the configured public URL'; }
    })();
    const detail = error.response
      ? `returned HTTP ${error.response.status}`
      : 'could not be reached';
    throw new Error(`Twilio webhook at ${host} ${detail}. Start or update the public tunnel before calling.`);
  }
}

function hasApiAccess(req) {
  const configured = process.env.RINGSIDE_API_TOKEN;
  if (!configured) return false;

  const bearer = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const header = String(req.get('x-ringside-token') || '');
  return bearer === configured || header === configured;
}

function ownsCall(req, call) {
  return Boolean(call && req.user && call.userId && req.user.id === call.userId);
}

async function canAccessCall(req, callId) {
  const call = activeCalls[callId];
  const persisted = call || await persistence.getNegotiation(callId, req.user?.id);
  return Boolean(persisted && (hasApiAccess(req) || ownsCall(req, persisted)));
}

function requireApiAccess(req, res, next) {
  if (hasApiAccess(req)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function validateStartBody(body = {}) {
  const company = policy.truncate(body.company || DEFAULT_CONFIG.company, 80);
  const notes = policy.truncate(body.notes || '', 240);
  const mode = body.mode === 'human' ? 'human' : 'agent';
  const currentPrice = parseInt(body.currentPrice, 10);
  const targetPrice = parseInt(body.targetPrice, 10);
  const maxTurns = body.maxTurns == null ? DEFAULT_CONFIG.maxTurns : parseInt(body.maxTurns, 10);
  const phone = body.phone ? String(body.phone).replace(/[^\d+]/g, '') : null;

  if (!company) return { error: 'Company name is required' };
  if (!Number.isInteger(currentPrice) || currentPrice < 1 || currentPrice > 1_000_000) {
    return { error: 'Current price must be between 1 and 1000000' };
  }
  if (!Number.isInteger(targetPrice) || targetPrice < 1 || targetPrice > 1_000_000) {
    return { error: 'Target price must be between 1 and 1000000' };
  }
  if (targetPrice >= currentPrice) return { error: 'Target price must be less than current price' };
  if (!Number.isInteger(maxTurns) || maxTurns < 4 || maxTurns > 12) {
    return { error: 'Max turns must be between 4 and 12' };
  }
  if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) {
    return { error: 'Phone number must be E.164 format, for example +14155552671' };
  }
  if (mode === 'human' && !phone) return { error: 'Phone number is required for human mode' };

  const transport = mode === 'human' || body.transport === 'twilio' ? 'twilio' : 'demo';
  return { config: deriveConfig({ company, currentPrice, targetPrice, notes, mode, maxTurns, phone, transport }) };
}

function productionOutboundAllowed(req) {
  if (process.env.PUBLIC_OUTBOUND_CALLS_ENABLED === 'true') return true;
  if (hasApiAccess(req)) return true;
  return !isProduction;
}

function requireTwilioSignature(req, res, next) {
  const required = isProduction || process.env.REQUIRE_TWILIO_SIGNATURES === 'true';
  if (!required) return next();

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.get('x-twilio-signature');
  const base = publicBaseUrl();
  if (!authToken || !signature || !base) {
    return res.status(403).type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
  }

  const url = `${base}${req.originalUrl}`;
  const valid = twilio.validateRequest(authToken, signature, url, req.body || {});
  if (!valid) {
    console.warn(`[SECURITY] Rejected Twilio request for ${req.originalUrl}: invalid signature`);
    return res.status(403).type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
  }
  return next();
}

function verifyCallSid(req, call) {
  const sid = req.body?.CallSid;
  return !call.twilioCallSid || !sid || sid === call.twilioCallSid;
}

function callAudioUrl(call, file) {
  if (!file) return null;
  return `${publicBaseUrl()}/audio/${encodeURIComponent(file)}?token=${encodeURIComponent(call.audioToken)}`;
}

function enqueueCallWork(call, work) {
  call.queue = (call.queue || Promise.resolve())
    .catch(() => {})
    .then(work);
  return call.queue;
}

function finalizeCall(callId, status) {
  const call = activeCalls[callId];
  if (!call) return;
  call.status = status || call.status || 'ended';
  call.endedAt = call.endedAt || new Date().toISOString();
  call.report = buildReport(call, call.research, call.bill);
  void persistCall(call).catch((error) => console.error(`[PERSIST] ${callId}:`, error.message));
  const retentionMs = parseInt(process.env.AUDIO_RETENTION_MS || String(15 * 60 * 1000), 10);
  if (!call.audioCleanupScheduled) {
    call.audioCleanupScheduled = true;
    setTimeout(() => cleanupAudioFiles(call.audioFiles || []), Math.max(0, retentionMs)).unref?.();
  }
}

async function persistCall(call) {
  if (!call || !call.userId) return;
  await persistence.upsertNegotiation({
    callId: call.callId,
    userId: call.userId,
    config: {
      company: call.config?.company,
      currentPrice: call.config?.currentPrice,
      targetPrice: call.config?.targetPrice,
      mode: call.config?.mode,
      transport: call.config?.transport || 'twilio',
      notes: call.config?.notes,
    },
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    status: call.status,
    currentTurn: call.currentTurn,
    negotiationState: call.negotiationState,
    report: call.report || buildReport(call, call.research, call.bill),
    research: call.research || { sources: [], provider: 'none', verified: false },
    bill: call.bill ? sanitizeBillForClient(call.bill) : null,
  });
}

function ttsConcurrency() {
  const n = parseInt(process.env.TTS_CONCURRENCY || '3', 10);
  return Number.isInteger(n) ? Math.min(4, Math.max(1, n)) : 3;
}

async function mapLimit(items, limit, iterator) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const i = nextIndex;
      nextIndex += 1;
      results[i] = await iterator(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

app.get('/audio/:file', (req, res) => {
  const { file } = req.params;
  if (!/^[A-Za-z0-9_.-]+$/.test(file) || file.includes('..')) return res.sendStatus(400);
  const token = String(req.query.token || '');
  const call = Object.values(activeCalls).find((c) =>
    c.audioToken === token &&
    (c.audioFiles || []).some((a) => a.file === file)
  );
  if (!call && !hasApiAccess(req)) return res.sendStatus(403);
  return res.sendFile(path.join(__dirname, 'audio', file));
});

function offerStateAtTurn(conversation, upTo, config) {
  const c = deriveConfig(config);
  let currentOffer = null;
  conversation.slice(0, upTo + 1).forEach((t) => {
    if (t.speaker === 'rep') {
      if (t.action === 'first_offer') currentOffer = c.firstOffer;
      if (t.action === 'fold') currentOffer = c.foldOffer;
      if (t.offerDetected && typeof t.currentOffer === 'number') currentOffer = t.currentOffer;
      // Older human-call records did not carry offerDetected. Preserve only a
      // genuine lower counteroffer, never the unchanged starting bill.
      if (t.action === 'human_speech' && typeof t.currentOffer === 'number' && t.currentOffer < c.currentPrice) {
        currentOffer = t.currentOffer;
      }
    }
  });
  return { currentOffer, offerDetected: currentOffer !== null };
}

function offerAtTurn(conversation, upTo, config) {
  return offerStateAtTurn(conversation, upTo, config).currentOffer;
}

function offerStateForNegotiation(state) {
  const hasOffer = Array.isArray(state?.rep_offers_used) && state.rep_offers_used.length > 0;
  return {
    currentOffer: hasOffer ? state.current_offer : null,
    offerDetected: hasOffer,
  };
}

function enrichConversation(conversation, config) {
  const turns = Array.isArray(conversation) ? conversation : [];
  return turns.map((turn, index) => ({
    ...turn,
    ...offerStateAtTurn(turns, index, config),
  }));
}

function twimlPlay(audioUrl, nextUrl, speakerText) {
  const mediaVerb = audioUrl
    ? `<Play>${audioUrl}</Play>`
    : `<Say>${escapeXml(speakerText)}</Say>`;

  const nextVerb = nextUrl
    ? `<Redirect method="POST">${nextUrl.replace(/&/g, '&amp;')}</Redirect>`
    : '<Pause length="2"/><Hangup/>';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  ${mediaVerb}
  ${nextVerb}
</Response>`;
}

// ── START CALL ─────────────────────────────────────────────────────────────────
async function startCall(req, res) {
  if (!productionOutboundAllowed(req)) {
    return res.status(403).json({
      error: 'Outbound calling is disabled until RINGSIDE_API_TOKEN or PUBLIC_OUTBOUND_CALLS_ENABLED is configured',
    });
  }

  const parsed = validateStartBody(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { config } = parsed;

  const ngrok = publicBaseUrl();
  const toNumber = config.mode === 'human' ? config.phone : (config.phone || process.env.TWILIO_REP_NUMBER);
  if (config.transport === 'twilio') {
    if (!ngrok) return res.status(500).json({ error: 'NGROK_URL not set' });
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_RINGSIDE_NUMBER) {
      return res.status(500).json({ error: 'Twilio environment variables are not fully configured' });
    }
    if (!toNumber) return res.status(500).json({ error: 'No phone number to call' });
    try {
      await assertPublicWebhookReachable(ngrok);
    } catch (error) {
      return res.status(503).json({ error: error.message });
    }
  }

  const callId = uuid();
  const audioToken = makeToken();
  console.log(`\n[CALL ${callId}] Starting — mode=${config.mode}, company=${config.company}`);

  activeCalls[callId] = {
    callId, config, audioToken,
    userId: req.user.id,
    startedAt: new Date().toISOString(),
    negotiationState: createState(config),
    audioFiles: [],
    currentTurn: -1,
    twilioCallSid: null,
    takeover: null,
    status: 'preparing',
    queue: Promise.resolve(),
    bill: req.body.bill || null,
    research: req.body.research || buildResearchContext({ company: config.company, notes: config.notes, targetPrice: config.targetPrice }),
  };
  try {
    await persistCall(activeCalls[callId]);
  } catch (error) {
    delete activeCalls[callId];
    return res.status(503).json({ error: 'Could not save this negotiation. Please try again.' });
  }

  res.status(202).json({ success: true, callId, mode: config.mode, status: 'preparing' });

  if (config.mode === 'human') {
    handleHumanCall(callId, config).catch((err) => handleAsyncCallError(callId, err));
    return;
  }
  if (config.transport === 'demo') {
    handleDemoCall(callId, config).catch((err) => handleAsyncCallError(callId, err));
    return;
  }
  handleAgentCall(callId, config).catch((err) => handleAsyncCallError(callId, err));
}

app.post('/api/call/start', requireUser, startCall);

function handleAsyncCallError(callId, err) {
  console.error(`[CALL ${callId}] Error:`, err.message);
  const call = activeCalls[callId];
  if (call) call.status = 'error';
  emit('call_error', { callId, error: err.message });
  finalizeCall(callId, 'error');
}

// ── AGENT MODE ─────────────────────────────────────────────────────────────────
async function handleAgentCall(callId, config) {
  const callState = activeCalls[callId];
  const ngrok = publicBaseUrl();
  const toNumber = config.phone || process.env.TWILIO_REP_NUMBER;
  emit('call_preparing', { callId, message: 'Generating negotiation script...' });

  // Full text negotiation is sequential for context, but turns are emitted as soon as they are ready.
  const negotiationState = await runNegotiation(config, {
    onTurn({ speaker, action, text, index, state }) {
      emit('turn_text', {
        callId, turn: index,
        speaker, text, action,
        ...offerStateForNegotiation(state),
      });
    },
  });
  console.log(`[CALL ${callId}] Negotiation: ${negotiationState.turn_count} turns → ₹${negotiationState.final_price} (${negotiationState.resolution_reason})`);

  emit('call_preparing', { callId, message: 'Generating voice audio...' });
  const audioResults = await mapLimit(
    negotiationState.conversation,
    ttsConcurrency(),
    (t, i) => generateAudio(t.text, t.speaker, i, callId, t.action)
  );

  callState.negotiationState = negotiationState;
  callState.audioFiles = negotiationState.conversation.map((t, i) => ({
    turn: i, speaker: t.speaker, text: t.text, action: t.action,
    file: audioResults[i],
  }));

  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const placedCall = await twilioClient.calls.create({
    to: toNumber,
    from: process.env.TWILIO_RINGSIDE_NUMBER,
    url: `${ngrok}/twiml/start?callId=${callId}`,
    method: 'POST',
    statusCallback: `${ngrok}/api/call-status?callId=${callId}`,
    statusCallbackMethod: 'POST',
    timeout: 30,
  });

  callState.twilioCallSid = placedCall.sid;
  callState.status = 'ringing';
  callSidToId[placedCall.sid] = callId;
  emit('call_placed', { callId, callSid: placedCall.sid });
  console.log(`[CALL ${callId}] Twilio call placed: ${placedCall.sid}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleDemoCall(callId, config) {
  const callState = activeCalls[callId];
  callState.status = 'connecting';
  emit('call_preparing', { callId, message: 'Starting local demo negotiation' });
  await wait(220);
  callState.status = 'live';
  emit('call_answered', { callId, transport: 'demo' });
  const result = await runNegotiation(config, {
    onTurn: async ({ speaker, action, text, index, state }) => {
      callState.currentTurn = index;
      callState.negotiationState = state;
      await persistCall(callState);
      emit('turn_playing', { callId, turn: index, speaker, text, action, ...offerStateForNegotiation(state) });
      await wait(260);
    },
  });
  callState.negotiationState = result;
  callState.currentTurn = result.conversation.length - 1;
  callState.status = result.resolved ? 'resolved' : 'complete';
  emit('call_resolved', {
    callId,
    finalPrice: result.final_price,
    savings: config.currentPrice - (result.final_price || config.currentPrice),
    savingsAnnual: (config.currentPrice - (result.final_price || config.currentPrice)) * 12,
    resolutionReason: result.resolution_reason,
    report: buildReport(callState, callState.research, callState.bill),
  });
  finalizeCall(callId, 'resolved');
}

// ── HUMAN MODE ─────────────────────────────────────────────────────────────────
async function handleHumanCall(callId, config) {
  const ngrok = publicBaseUrl();
  const callState = activeCalls[callId];
  emit('call_preparing', { callId, message: 'Placing call...' });

  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const placedCall = await twilioClient.calls.create({
    to: config.phone,
    from: process.env.TWILIO_RINGSIDE_NUMBER,
    url: `${ngrok}/twiml/human-start?callId=${callId}`,
    method: 'POST',
    statusCallback: `${ngrok}/api/call-status?callId=${callId}`,
    statusCallbackMethod: 'POST',
    timeout: 30,
  });

  callState.twilioCallSid = placedCall.sid;
  callState.status = 'ringing';
  callSidToId[placedCall.sid] = callId;
  emit('call_placed', { callId, callSid: placedCall.sid });
  emitTakeoverState(callState);
  console.log(`[CALL ${callId}] Human call placed: ${placedCall.sid}`);
}

function ownedHumanCall(req, res) {
  const call = activeCalls[req.params.callId];
  if (!call || !ownsCall(req, call)) {
    res.status(404).json({ error: 'Active human call not found' });
    return null;
  }
  if (call.config.mode !== 'human' || !call.twilioCallSid) {
    res.status(409).json({ error: 'Browser takeover is only available during an active real call' });
    return null;
  }
  if (call.endedAt) {
    res.status(409).json({ error: 'The phone call has already ended, so browser takeover is no longer available.' });
    return null;
  }
  return call;
}

async function resumeAgentAfterTakeover(call, reason) {
  if (!call?.takeover || !['active', 'activating'].includes(call.takeover.phase)) return;
  call.takeover.phase = 'returning';
  call.status = 'resuming_agent';
  emitTakeoverState(call);
  console.log(`[TAKEOVER ${call.callId}] Returning control to Ringside (${reason})`);
  await twilioClient().calls(call.twilioCallSid).update({
    url: `${publicBaseUrl()}/twiml/human-resume?callId=${encodeURIComponent(call.callId)}`,
    method: 'POST',
  });
}

// ── TWIML: AGENT — CALL START ──────────────────────────────────────────────────
app.post('/twiml/start', requireTwilioSignature, (req, res) => {
  const { callId } = req.query;
  const call = activeCalls[callId];
  if (!call) return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response><Say>System error. Goodbye.</Say><Hangup/></Response>`);
  if (!verifyCallSid(req, call)) return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`);

  emit('call_answered', { callId });
  console.log(`[TWIML] ${callId} answered — starting agent turn loop`);

  const ngrok = publicBaseUrl();
  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${ngrok}/twiml/turn?callId=${callId}&amp;n=0</Redirect>
</Response>`);
});

// ── TWIML: AGENT — TURN LOOP ───────────────────────────────────────────────────
app.post('/twiml/turn', requireTwilioSignature, (req, res) => {
  const { callId } = req.query;
  const n    = parseInt(req.query.n, 10);
  const call = activeCalls[callId];
  if (!call) return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`);
  if (!verifyCallSid(req, call)) return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`);
  if (!Number.isInteger(n) || n < 0 || n > 30) {
    return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`);
  }

  const audioFile = call.audioFiles[n];

  if (!audioFile) {
    // All turns done
    emit('call_resolved', {
      callId,
      finalPrice:    call.negotiationState.final_price,
      savings:       call.config.currentPrice - (call.negotiationState.final_price || call.config.currentPrice),
      savingsAnnual: (call.config.currentPrice - (call.negotiationState.final_price || call.config.currentPrice)) * 12,
      resolutionReason: call.negotiationState.resolution_reason,
    });
    finalizeCall(callId, 'resolved');
    return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="2"/>
  <Hangup/>
</Response>`);
  }

  call.currentTurn = n;
  const isLast   = n === call.audioFiles.length - 1;
  const audioUrl = callAudioUrl(call, audioFile.file);
  const nextUrl  = isLast ? null : `${publicBaseUrl()}/twiml/turn?callId=${callId}&n=${n + 1}`;

  emit('turn_playing', {
    callId, turn: n,
    speaker: audioFile.speaker, text: audioFile.text, action: audioFile.action,
    currentOffer: offerAtTurn(call.negotiationState.conversation, n, call.config),
    offerDetected: offerStateAtTurn(call.negotiationState.conversation, n, call.config).offerDetected,
  });

  console.log(`[TWIML] Turn ${n} (${audioFile.speaker}): ${audioFile.text.substring(0, 60)}…`);
  res.type('text/xml').send(twimlPlay(audioUrl, nextUrl, audioFile.text));
});

// ── TWIML: AGENT — REP AUTO-ANSWER ────────────────────────────────────────────
app.post('/twiml/rep-answer', requireTwilioSignature, (req, res) => {
  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="120"/>
</Response>`);
});

// ── TWIML: HUMAN — CALL START ─────────────────────────────────────────────────
app.post('/twiml/browser-takeover', requireTwilioSignature, (req, res) => {
  const callId = String(req.body?.callId || req.query?.callId || '');
  const call = activeCalls[callId];
  const identity = String(req.body?.Caller || req.body?.From || '').replace(/^client:/i, '').trim();
  const takeover = call?.takeover;
  const identityPrefix = call ? `ringside-${call.callId.replace(/-/g, '')}-` : '';
  const identityMatchesCall = Boolean(takeover && (identity === takeover.identity || identity.startsWith(identityPrefix)));

  const rejection = !call
    ? 'active call was not found'
    : !takeover
      ? 'takeover was not prepared'
      : !identityMatchesCall
        ? 'browser identity did not match the short-lived token'
        : !['prepared', 'browser_joined'].includes(takeover.phase)
          ? `takeover was already ${takeover.phase}`
          : null;
  if (rejection) {
    console.warn(`[TAKEOVER ${callId || 'unknown'}] Browser join rejected: ${rejection}`);
    return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="rejected"/></Response>`);
  }

  takeover.browserCallSid = String(req.body?.CallSid || '');
  takeover.phase = 'browser_joined';
  emitTakeoverState(call);
  console.log(`[TAKEOVER ${callId}] Browser audio joined`);
  return res.type('text/xml').send(conferenceTwiml(call, 'customer-browser'));
});

app.post('/twiml/human-conference', requireTwilioSignature, (req, res) => {
  const { callId } = req.query;
  const call = activeCalls[callId];
  if (!call || !verifyCallSid(req, call) || !call.takeover?.browserCallSid) {
    return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
  }

  call.takeover.phase = 'active';
  call.status = 'human_takeover';
  emitTakeoverState(call);
  console.log(`[TAKEOVER ${callId}] Provider joined browser takeover conference`);
  return res.type('text/xml').send(conferenceTwiml(call, 'provider-phone'));
});

app.post('/twiml/human-resume', requireTwilioSignature, async (req, res) => {
  const { callId } = req.query;
  const call = activeCalls[callId];
  if (!call || !verifyCallSid(req, call)) {
    return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
  }

  try {
    const result = await runRingsideTurn(call.negotiationState, 'resume');
    call.negotiationState = result.state;
    const turn = call.audioFiles.length;
    call.audioFiles.push({ turn, speaker: 'ringside', text: result.text, action: result.action, file: null });
    call.currentTurn = turn;
    call.takeover = { phase: 'idle' };
    call.status = 'live';
    emit('turn_playing', { callId, turn, speaker: 'ringside', text: result.text, action: result.action, ...offerStateForNegotiation(call.negotiationState) });
    emitTakeoverState(call);

    const ngrok = publicBaseUrl();
    return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${escapeXml(result.text)}</Say>
  <Gather input="speech" timeout="10" speechTimeout="auto"
    action="${ngrok}/twiml/human-gather?callId=${callId}" method="POST">
    <Pause length="1"/>
  </Gather>
  <Redirect method="POST">${ngrok}/twiml/human-gather?callId=${callId}&amp;SpeechResult=</Redirect>
</Response>`);
  } catch (error) {
    console.error(`[TAKEOVER ${callId}] Could not resume agent:`, error.message);
    return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you for your time.</Say><Hangup/></Response>`);
  }
});

app.post('/twiml/human-start', requireTwilioSignature, async (req, res) => {
  const { callId } = req.query;
  const call = activeCalls[callId];
  if (!call) return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`);
  if (!verifyCallSid(req, call)) return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`);

  emit('call_answered', { callId });
  console.log(`[TWIML] ${callId} human call answered — generating opening`);

  try {
    const result = await runRingsideTurn(call.negotiationState);
    call.negotiationState = result.state;

    const n         = call.audioFiles.length;
    const audioFile = await generateAudio(result.text, 'ringside', n, callId, result.action);
    call.audioFiles.push({ turn: n, speaker: 'ringside', text: result.text, action: result.action, file: audioFile });
    call.currentTurn = n;

    emit('turn_playing', {
      callId, turn: n, speaker: 'ringside',
      text: result.text, action: result.action,
      ...offerStateForNegotiation(call.negotiationState),
    });

    const ngrok    = publicBaseUrl();
    const audioUrl = callAudioUrl(call, audioFile);
    const media    = audioUrl ? `<Play>${audioUrl}</Play>` : `<Say>${escapeXml(result.text)}</Say>`;

    res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  ${media}
  <Gather input="speech" timeout="10" speechTimeout="auto"
    action="${ngrok}/twiml/human-gather?callId=${callId}" method="POST">
    <Pause length="1"/>
  </Gather>
  <Redirect method="POST">${ngrok}/twiml/human-gather?callId=${callId}&amp;SpeechResult=</Redirect>
</Response>`);
  } catch (err) {
    console.error(`[TWIML] human-start error:`, err.message);
    res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say>I'm sorry, I could not connect. Goodbye.</Say><Hangup/></Response>`);
  }
});

// ── TWIML: HUMAN — GATHER (each rep response) ─────────────────────────────────
app.post('/twiml/human-gather', requireTwilioSignature, async (req, res) => {
  const { callId } = req.query;
  const call = activeCalls[callId];
  if (!call) return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`);
  if (!verifyCallSid(req, call)) return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`);

  const speechText = policy.truncate(req.body.SpeechResult || req.query.SpeechResult || '', 400);
  const ngrok      = publicBaseUrl();
  console.log(`[TWIML] human-gather: "${speechText.substring(0, 80)}"`);

  try {
    const response = await enqueueCallWork(call, async () => {
      const repTurnN = call.audioFiles.length;

      if (speechText) {
        const repOffer = await extractOfferFromSpeech(speechText, call.config);
        call.negotiationState = ingestHumanSpeech(call.negotiationState, speechText, repOffer);

        const lastRepTurn = call.negotiationState.conversation[call.negotiationState.conversation.length - 1];
        emit('turn_playing', {
          callId, turn: repTurnN, speaker: 'rep',
          text: lastRepTurn.redacted ? '[Filtered non-negotiation content]' : speechText,
          action: 'human_speech',
          currentOffer: lastRepTurn.offerDetected ? lastRepTurn.currentOffer : null,
          offerDetected: Boolean(lastRepTurn.offerDetected),
        });
      }

      const budgetHit = call.negotiationState.turn_count >= call.config.maxTurns;
      const hasCounterOffer = call.negotiationState.current_offer < call.config.currentPrice;
      const forcedAction = budgetHit && !call.negotiationState.resolved && !call.negotiationState.awaiting_confirmation && !call.negotiationState.confirmation_received
        ? (hasCounterOffer ? 'confirm_offer' : 'best_offer')
        : null;
      const result = await runRingsideTurn(call.negotiationState, forcedAction);
      call.negotiationState = result.state;

      const rTurnN = call.audioFiles.length;
      // A Gather webhook has a tight response window. Dynamic TTS can add several
      // seconds, so follow-up turns use Twilio's immediate speech synthesis.
      call.audioFiles.push({ turn: rTurnN, speaker: 'ringside', text: result.text, action: result.action, file: null });
      call.currentTurn = rTurnN;

      emit('turn_playing', {
        callId, turn: rTurnN, speaker: 'ringside',
        text: result.text, action: result.action,
        ...offerStateForNegotiation(call.negotiationState),
      });

      const media = `<Say>${escapeXml(result.text)}</Say>`;

      if (call.negotiationState.resolved) {
        emit('call_resolved', {
          callId,
          finalPrice:    call.negotiationState.final_price,
          savings:       call.config.currentPrice - (call.negotiationState.final_price || call.config.currentPrice),
          savingsAnnual: (call.config.currentPrice - (call.negotiationState.final_price || call.config.currentPrice)) * 12,
          resolutionReason: call.negotiationState.resolution_reason,
        });
        finalizeCall(callId, 'resolved');
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  ${media}
  <Pause length="2"/>
  <Hangup/>
</Response>`;
      }

      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  ${media}
  <Gather input="speech" timeout="10" speechTimeout="auto"
    action="${ngrok}/twiml/human-gather?callId=${callId}" method="POST">
    <Pause length="1"/>
  </Gather>
  <Redirect method="POST">${ngrok}/twiml/human-gather?callId=${callId}&amp;SpeechResult=</Redirect>
</Response>`;
    });
    return res.type('text/xml').send(response);
  } catch (err) {
    console.error(`[TWIML] human-gather error:`, err.message);
    res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say>Thank you for your time.</Say><Hangup/></Response>`);
  }
});

// ── STATUS CALLBACK ────────────────────────────────────────────────────────────
app.post('/api/conference-status', requireTwilioSignature, (req, res) => {
  const { callId } = req.query;
  const call = activeCalls[callId];
  if (!call?.takeover) return res.sendStatus(204);

  const event = String(req.body?.StatusCallbackEvent || '').toLowerCase();
  const label = String(req.body?.ParticipantLabel || '');
  if (event === 'participant-join' && label === 'provider-phone' && call.takeover.phase === 'activating') {
    call.takeover.phase = 'active';
    call.status = 'human_takeover';
    emitTakeoverState(call);
  }

  if (event === 'participant-leave' && label === 'customer-browser') {
    const wasActive = ['active', 'activating'].includes(call.takeover.phase);
    call.takeover.browserCallSid = null;
    if (wasActive) {
      void resumeAgentAfterTakeover(call, 'browser disconnected').catch((error) => {
        call.takeover.phase = 'failed';
        emitTakeoverState(call);
        console.error(`[TAKEOVER ${callId}] Automatic resume failed:`, error.message);
      });
    } else if (call.takeover.phase === 'browser_joined') {
      call.takeover = { phase: 'cancelled' };
      emitTakeoverState(call);
    }
  }
  return res.sendStatus(204);
});

app.post('/api/call-status', requireTwilioSignature, (req, res) => {
  const { CallStatus, CallSid } = req.body;
  const callId = req.query.callId || callSidToId[CallSid];
  console.log(`[STATUS] ${CallSid} → ${CallStatus}`);
  const call = activeCalls[callId];
  if (call && !verifyCallSid(req, call)) return res.sendStatus(403);

  if (['completed', 'failed', 'no-answer', 'busy', 'canceled'].includes(CallStatus)) {
    if (call) {
      emit('call_ended', {
        callId, status: CallStatus,
        finalPrice: call.negotiationState?.final_price,
        savings: call.config.currentPrice - (call.negotiationState?.final_price || call.config.currentPrice),
      });
      finalizeCall(callId, CallStatus);
    }
  }
  res.sendStatus(200);
});

// ── DATA ENDPOINTS ─────────────────────────────────────────────────────────────
app.post('/api/bills/upload', upload.single('bill'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Upload a PDF, PNG, JPG, JPEG, TXT, or Markdown bill' });
  try {
    const text = extractTextFromFile(req.file.path, req.file.originalname);
    const bill = extractBillData(text, req.file.originalname);
    bill.billId = uuid();
    if (req.user) await persistence.upsertBill({ ...bill, userId: req.user.id, extractedText: text });
    fs.unlink(req.file.path, () => {});
    return res.status(text ? 200 : 422).json({
      success: Boolean(text),
      bill: sanitizeBillForClient(bill),
      message: text ? 'Bill analyzed' : 'We could not read this document. Enter the bill manually or retry with a clearer file.',
    });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    return res.status(422).json({ error: 'Bill processing failed', detail: isProduction ? undefined : err.message });
  }
});

app.post('/api/bills/extract', async (req, res) => {
  const text = policy.truncate(req.body?.text || '', 20_000);
  if (!text) return res.status(400).json({ error: 'Bill text is required' });
  const bill = extractBillData(text, req.body.filename || 'manual.txt');
  if (req.user) await persistence.upsertBill({ ...bill, userId: req.user.id, extractedText: text });
  res.json({ success: true, bill: sanitizeBillForClient(bill) });
});

app.post('/api/research', (req, res) => {
  const { company, notes, bill, targetPrice } = req.body || {};
  res.json({ success: true, research: buildResearchContext({ company, notes, bill, targetPrice }) });
});

app.post('/api/rag/search', (req, res) => {
  const query = policy.truncate(req.body?.query || '', 500);
  if (!query) return res.status(400).json({ error: 'Search query is required' });
  res.json({ results: searchKnowledge(query, req.body?.filters || {}, req.body?.limit || 6) });
});

app.post('/api/negotiations', requireUser, (req, res) => {
  req.body = { ...req.body, mode: req.body?.mode || 'agent', transport: 'demo' };
  return startCall(req, res);
});

app.post('/api/negotiate', requireApiAccess, async (req, res) => {
  try {
    const parsed = validateStartBody({ ...req.body, mode: 'agent' });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const config = parsed.config;
    const state  = await runNegotiation(config);
    res.json({ success: true, state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/call/:callId/takeover/token', requireUser, async (req, res) => {
  const call = ownedHumanCall(req, res);
  if (!call) return;
  if (!browserTakeoverConfigured()) {
    return res.status(503).json({ error: 'Browser takeover requires Twilio Voice SDK credentials and a TwiML App.' });
  }
  try {
    if (!await browserTakeoverApplicationMatchesBackend()) {
      return res.status(409).json({ error: 'The TwiML App must point to this server\'s current public /twiml/browser-takeover URL before browser takeover can start.' });
    }
  } catch (error) {
    return res.status(502).json({ error: `Could not verify the browser takeover TwiML App: ${error.message}` });
  }
  if (!['idle', 'cancelled', 'failed'].includes(call.takeover?.phase || 'idle')) {
    return res.status(409).json({ error: 'A browser takeover is already being prepared for this call.' });
  }

  call.takeover = {
    phase: 'prepared',
    identity: `ringside-${call.callId.replace(/-/g, '')}-${crypto.randomBytes(6).toString('hex')}`,
    conference: conferenceName(call),
    browserCallSid: null,
    preparedAt: new Date().toISOString(),
  };
  emitTakeoverState(call);
  return res.json({
    token: createBrowserVoiceToken(call),
    expiresIn: 300,
    callId: call.callId,
  });
});

app.post('/api/call/:callId/takeover/activate', requireUser, async (req, res) => {
  const call = ownedHumanCall(req, res);
  if (!call) return;
  if (!call.takeover?.browserCallSid || call.takeover.phase !== 'browser_joined') {
    return res.status(409).json({ error: 'Browser microphone is still connecting. Try again in a moment.' });
  }

  try {
    call.takeover.phase = 'activating';
    call.status = 'takeover_connecting';
    emitTakeoverState(call);
    await twilioClient().calls(call.twilioCallSid).update({
      url: `${publicBaseUrl()}/twiml/human-conference?callId=${encodeURIComponent(call.callId)}`,
      method: 'POST',
    });
    return res.json({ success: true, takeover: publicTakeoverState(call) });
  } catch (error) {
    call.takeover.phase = 'failed';
    call.status = 'live';
    emitTakeoverState(call);
    return res.status(502).json({ error: `Could not connect the phone call to browser takeover: ${error.message}` });
  }
});

app.post('/api/call/:callId/takeover/cancel', requireUser, async (req, res) => {
  const call = ownedHumanCall(req, res);
  if (!call) return;
  if (call.takeover?.browserCallSid) {
    await twilioClient().calls(call.takeover.browserCallSid).update({ status: 'completed' }).catch(() => {});
  }
  call.takeover = { phase: 'cancelled' };
  emitTakeoverState(call);
  return res.json({ success: true, takeover: publicTakeoverState(call) });
});

app.post('/api/call/:callId/takeover/return', requireUser, async (req, res) => {
  const call = ownedHumanCall(req, res);
  if (!call) return;
  if (!['active', 'activating'].includes(call.takeover?.phase)) {
    return res.status(409).json({ error: 'Browser takeover is not active.' });
  }

  try {
    const browserCallSid = call.takeover.browserCallSid;
    call.takeover.phase = 'returning';
    call.status = 'resuming_agent';
    emitTakeoverState(call);
    if (browserCallSid) await twilioClient().calls(browserCallSid).update({ status: 'completed' }).catch(() => {});
    await twilioClient().calls(call.twilioCallSid).update({
      url: `${publicBaseUrl()}/twiml/human-resume?callId=${encodeURIComponent(call.callId)}`,
      method: 'POST',
    });
    return res.json({ success: true, takeover: publicTakeoverState(call) });
  } catch (error) {
    call.takeover.phase = 'failed';
    emitTakeoverState(call);
    return res.status(502).json({ error: `Could not return control to Ringside: ${error.message}` });
  }
});

app.get('/api/state/:callId', requireUser, async (req, res) => {
  const call = activeCalls[req.params.callId];
  if (!call) {
    const persisted = await persistence.getNegotiation(req.params.callId, req.user.id);
    if (!persisted) return res.status(404).json({ error: 'Call not found' });
    const state = persisted.negotiationState || {};
    return res.json({
      callId: persisted.callId,
      config: persisted.config,
      mode: persisted.config?.mode,
      startedAt: persisted.startedAt,
      endedAt: persisted.endedAt,
      status: persisted.status,
      currentTurn: persisted.currentTurn,
      totalTurns: state.conversation?.length || 0,
      resolved: state.resolved,
      finalPrice: state.final_price,
      resolutionReason: state.resolution_reason,
      takeover: { available: false, phase: 'unavailable', browserConnected: false, canTakeOver: false },
      conversation: enrichConversation(state.conversation, persisted.config),
      report: persisted.report,
      research: persisted.research,
      bill: persisted.bill,
    });
  }
  if (!hasApiAccess(req) && !ownsCall(req, call)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const fullConvo = call.negotiationState?.conversation || [];
  const resolved  = call.negotiationState?.resolved;
  // For in-progress calls only expose turns that have been played so far
  const visibleConvo = resolved
    ? fullConvo
    : fullConvo.slice(0, Math.max(0, call.currentTurn + 1));
  // Enrich each visible turn with current offer at that point
  const enrichedConvo = enrichConversation(visibleConvo, call.config);

  res.json({
    callId:      call.callId,
    config:      {
      company: call.config.company,
      currentPrice: call.config.currentPrice,
      targetPrice: call.config.targetPrice,
      mode: call.config.mode,
    },
    mode:        call.config.mode,
    startedAt:   call.startedAt,
    endedAt:     call.endedAt,
    status:      call.status,
    currentTurn: call.currentTurn,
      totalTurns:  call.audioFiles.length || fullConvo.length,
    resolved,
    finalPrice:  call.negotiationState?.final_price,
    resolutionReason: call.negotiationState?.resolution_reason,
    takeover: publicTakeoverState(call),
    conversation: enrichedConvo,
    report: call.report || (call.endedAt ? buildReport(call, call.research, call.bill) : null),
    research: call.research,
    bill: call.bill ? sanitizeBillForClient(call.bill) : null,
  });
});

app.get('/api/calls', requireUser, async (req, res) => {
  const active = Object.values(activeCalls)
    .filter((c) => hasApiAccess(req) || ownsCall(req, c))
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .map((c) => ({
      callId:       c.callId,
      company:      c.config?.company,
      mode:         c.config?.mode,
      currentPrice: c.config?.currentPrice,
      targetPrice:  c.config?.targetPrice,
      startedAt:    c.startedAt,
      currentTurn:  c.currentTurn,
      totalTurns:   c.audioFiles?.length || c.negotiationState?.conversation?.length || 0,
      resolved:     c.negotiationState?.resolved,
      finalPrice:   c.negotiationState?.final_price,
      resolutionReason: c.negotiationState?.resolution_reason,
      report: c.report,
    }));
  const activeIds = new Set(active.map((call) => call.callId));
  const persisted = (await persistence.listNegotiations(req.user.id))
    .filter((c) => !activeIds.has(c.callId))
    .map((c) => ({
      callId: c.callId,
      company: c.config?.company,
      mode: c.config?.mode,
      currentPrice: c.config?.currentPrice,
      targetPrice: c.config?.targetPrice,
      startedAt: c.startedAt,
      currentTurn: c.currentTurn,
      totalTurns: c.negotiationState?.conversation?.length || 0,
      resolved: c.negotiationState?.resolved,
      finalPrice: c.negotiationState?.final_price,
      resolutionReason: c.negotiationState?.resolution_reason,
      report: c.report,
    }));
  res.json([...active, ...persisted].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)));
});

app.get('/api/negotiations/:callId', requireUser, async (req, res) => {
  const persisted = activeCalls[req.params.callId] || await persistence.getNegotiation(req.params.callId, req.user.id);
  if (!persisted) return res.status(404).json({ error: 'Negotiation not found' });
  if (!hasApiAccess(req) && !ownsCall(req, persisted)) return res.status(403).json({ error: 'Unauthorized' });
  if (activeCalls[req.params.callId]) return res.redirect(307, `/api/state/${req.params.callId}`);
  const { userId, clientToken, audioToken, ...safeRecord } = persisted;
  res.json(safeRecord);
});

app.post('/api/verify-offer', requireUser, (req, res) => {
  const { finalPrice, targetPrice, currentPrice, conditions } = req.body || {};
  res.json({ verification: verifyFinalOffer({ finalPrice, targetPrice, currentPrice, conditions }) });
});

app.post('/api/call/:callId/pause', requireUser, async (req, res) => {
  if (!await canAccessCall(req, req.params.callId)) return res.status(403).json({ error: 'Unauthorized' });
  const call = activeCalls[req.params.callId];
  if (!call) return res.status(409).json({ error: 'Call is no longer active' });
  call.status = 'paused';
  emit('call_paused', { callId: call.callId });
  res.json({ success: true, status: call.status });
});

app.post('/api/call/:callId/resume', requireUser, async (req, res) => {
  if (!await canAccessCall(req, req.params.callId)) return res.status(403).json({ error: 'Unauthorized' });
  const call = activeCalls[req.params.callId];
  if (!call) return res.status(409).json({ error: 'Call is no longer active' });
  call.status = 'live';
  emit('call_resumed', { callId: call.callId });
  res.json({ success: true, status: call.status });
});

app.post('/api/call/:callId/end', requireUser, async (req, res) => {
  if (!await canAccessCall(req, req.params.callId)) return res.status(403).json({ error: 'Unauthorized' });
  const call = activeCalls[req.params.callId];
  if (!call) return res.json({ success: true, status: 'ended' });
  finalizeCall(call.callId, 'ended');
  emit('call_ended', { callId: call.callId, status: 'ended' });
  res.json({ success: true, status: call.status });
});

// ── PAGE ROUTES ────────────────────────────────────────────────────────────────
app.get('/dashboard', (_req, res) => {
  res.redirect(302, '/history');
});

// SPA catch-all — serve React index for all client-side routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/twiml') || req.path.includes('.')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('[HTTP]', error.message);
  return res.status(error.status || 500).json({ error: 'Request could not be completed' });
});

// ── BOOT ───────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
async function boot() {
  if (isProduction && !persistence.usingNeon()) {
    throw new Error('DATABASE_URL (Neon Postgres) is required in production');
  }
  if (isProduction && !googleAuthConfigured()) {
    throw new Error('Google OAuth configuration is required in production');
  }
  await persistence.init();
  await ensureAudioDir();

  app.listen(PORT, () => {
  console.log(`\nRingside server on http://localhost:${PORT}`);
  console.log(`   NGROK_URL:  ${process.env.NGROK_URL || '(not set)'}`);
  console.log(`   From:       ${process.env.TWILIO_RINGSIDE_NUMBER || '(not set)'}`);
  console.log(`   Rep number: ${process.env.TWILIO_REP_NUMBER || '(not set, pass phone in request)'}\n`);

  if (process.env.MAYA_API_KEY && process.env.RINGSIDE_VOICE_ID && process.env.REP_VOICE_ID) {
    generateFallbackCache().catch((err) =>
      console.error('[TTS] Fallback cache error:', err.message)
    );
  } else {
    console.warn('[TTS] MAYA_API_KEY or voice IDs not set — skipping cache generation');
  }
  });
}

boot().catch((error) => {
  console.error(`[BOOT] ${error.message}`);
  process.exit(1);
});
