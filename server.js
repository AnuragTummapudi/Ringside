require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const twilio  = require('twilio');
const path    = require('path');
const { v4: uuid } = require('uuid');

const {
  DEFAULT_CONFIG,
  deriveConfig,
  createState,
  buildFallbackLines,
  getRingsideAction,
  applyRingsideTurn,
  applyRepTurn,
  runRingsideTurn,
  runRepTurn,
  runNegotiation,
  extractOfferFromSpeech,
  INITIAL_PRICE,
} = require('./negotiate');

const { generateAudio, generateFallbackCache, ensureAudioDir } = require('./tts');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/audio', express.static(path.join(__dirname, 'audio')));

// ── IN-MEMORY STATE ────────────────────────────────────────────────────────────
const activeCalls  = {};   // callId → call object
const callSidToId  = {};   // Twilio CallSid → callId

// ── SSE ────────────────────────────────────────────────────────────────────────
const sseClients = new Set();

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const hb = setInterval(() => res.write(': heartbeat\n\n'), 15000);
  sseClients.add(res);
  req.on('close', () => { clearInterval(hb); sseClients.delete(res); });
});

function emit(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) client.write(msg);
}

// ── HELPERS ────────────────────────────────────────────────────────────────────
function escapeXml(str) {
  return String(str).replace(/[<>&"]/g, (c) => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;' }[c]));
}

function offerAtTurn(conversation, upTo, config) {
  const c = deriveConfig(config);
  let offer = c.currentPrice;
  conversation.slice(0, upTo + 1).forEach((t) => {
    if (t.speaker === 'rep') {
      if (t.action === 'first_offer') offer = c.firstOffer;
      if (t.action === 'fold')        offer = c.foldOffer;
      // Human mode: use stored offer if present
      if (typeof t.currentOffer === 'number') offer = t.currentOffer;
    }
  });
  return offer;
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
app.post('/api/call/start', async (req, res) => {
  const body = req.body || {};

  // Build config from request body; fall back to defaults
  const rawConfig = {
    company:     body.company     || DEFAULT_CONFIG.company,
    currentPrice: parseInt(body.currentPrice, 10) || DEFAULT_CONFIG.currentPrice,
    targetPrice:  parseInt(body.targetPrice,  10) || DEFAULT_CONFIG.targetPrice,
    notes:       body.notes       || '',
    mode:        body.mode        || 'agent',
    maxTurns:    parseInt(body.maxTurns, 10) || DEFAULT_CONFIG.maxTurns,
    phone:       body.phone       || null,
  };

  const config = deriveConfig(rawConfig);

  // Validation
  if (config.targetPrice >= config.currentPrice) {
    return res.status(400).json({ error: 'Target price must be less than current price' });
  }
  if (config.mode === 'human' && !config.phone) {
    return res.status(400).json({ error: 'Phone number is required for human mode' });
  }

  const callId = uuid();
  console.log(`\n[CALL ${callId}] Starting — mode=${config.mode}, company=${config.company}`);

  if (config.mode === 'human') {
    return handleHumanCall(callId, config, res);
  }
  return handleAgentCall(callId, config, res);
});

// ── AGENT MODE ─────────────────────────────────────────────────────────────────
async function handleAgentCall(callId, config, res) {
  // 0. Validate prerequisites before any work
  const ngrok    = process.env.NGROK_URL;
  const toNumber = config.phone || process.env.TWILIO_REP_NUMBER;
  if (!ngrok)    return res.status(500).json({ error: 'NGROK_URL not set — run ngrok and update .env' });
  if (!toNumber) return res.status(500).json({ error: 'No phone number to call — set TWILIO_REP_NUMBER in .env or pass phone in request' });

  emit('call_preparing', { callId, message: 'Generating negotiation script...' });

  try {
    // 1. Full text negotiation (sequential for context)
    const negotiationState = await runNegotiation(config);
    console.log(`[CALL ${callId}] Negotiation: ${negotiationState.turn_count} turns → ₹${negotiationState.final_price} (${negotiationState.resolution_reason})`);

    // Emit text turns for dashboard preview
    negotiationState.conversation.forEach((t, i) => {
      emit('turn_text', {
        callId, turn: i,
        speaker: t.speaker, text: t.text, action: t.action,
        currentOffer: offerAtTurn(negotiationState.conversation, i, config),
      });
    });

    // 2. Generate all audio in parallel
    emit('call_preparing', { callId, message: 'Generating voice audio...' });
    const audioResults = await Promise.all(
      negotiationState.conversation.map((t, i) =>
        generateAudio(t.text, t.speaker, i, callId, t.action)
      )
    );

    const audioFiles = negotiationState.conversation.map((t, i) => ({
      turn: i, speaker: t.speaker, text: t.text, action: t.action,
      file: audioResults[i],
    }));

    // 3. Store state
    activeCalls[callId] = {
      callId, config,
      startedAt: new Date().toISOString(),
      negotiationState,
      audioFiles,
      currentTurn: -1,
      twilioCallSid: null,
    };

    // 4. Place Twilio call
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    const call = await twilioClient.calls.create({
      to: toNumber,
      from: process.env.TWILIO_RINGSIDE_NUMBER,
      url: `${ngrok}/twiml/start?callId=${callId}`,
      method: 'POST',
      statusCallback: `${ngrok}/api/call-status?callId=${callId}`,
      statusCallbackMethod: 'POST',
      timeout: 30,
    });

    activeCalls[callId].twilioCallSid = call.sid;
    callSidToId[call.sid] = callId;
    emit('call_placed', { callId, callSid: call.sid });
    console.log(`[CALL ${callId}] Twilio call placed: ${call.sid}`);

    res.json({ success: true, callId, callSid: call.sid, mode: 'agent' });
  } catch (err) {
    console.error(`[CALL ${callId}] Error:`, err.message);
    emit('call_error', { callId, error: err.message });
    res.status(500).json({ error: err.message });
  }
}

// ── HUMAN MODE ─────────────────────────────────────────────────────────────────
async function handleHumanCall(callId, config, res) {
  const ngrok = process.env.NGROK_URL;
  if (!ngrok) return res.status(500).json({ error: 'NGROK_URL not set' });

  // No pre-generation — negotiation happens live on the call
  activeCalls[callId] = {
    callId, config,
    startedAt: new Date().toISOString(),
    negotiationState: createState(config),
    audioFiles: [],
    currentTurn: -1,
    twilioCallSid: null,
  };

  emit('call_preparing', { callId, message: 'Placing call...' });

  try {
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const call = await twilioClient.calls.create({
      to: config.phone,
      from: process.env.TWILIO_RINGSIDE_NUMBER,
      url: `${ngrok}/twiml/human-start?callId=${callId}`,
      method: 'POST',
      statusCallback: `${ngrok}/api/call-status?callId=${callId}`,
      statusCallbackMethod: 'POST',
      timeout: 30,
    });

    activeCalls[callId].twilioCallSid = call.sid;
    callSidToId[call.sid] = callId;
    emit('call_placed', { callId, callSid: call.sid });
    console.log(`[CALL ${callId}] Human call placed: ${call.sid}`);

    res.json({ success: true, callId, callSid: call.sid, mode: 'human' });
  } catch (err) {
    console.error(`[CALL ${callId}] Human mode error:`, err.message);
    emit('call_error', { callId, error: err.message });
    res.status(500).json({ error: err.message });
  }
}

// ── TWIML: AGENT — CALL START ──────────────────────────────────────────────────
app.post('/twiml/start', (req, res) => {
  const { callId } = req.query;
  const call = activeCalls[callId];
  if (!call) return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response><Say>System error. Goodbye.</Say><Hangup/></Response>`);

  emit('call_answered', { callId });
  console.log(`[TWIML] ${callId} answered — starting agent turn loop`);

  const ngrok = process.env.NGROK_URL;
  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${ngrok}/twiml/turn?callId=${callId}&amp;n=0</Redirect>
</Response>`);
});

// ── TWIML: AGENT — TURN LOOP ───────────────────────────────────────────────────
app.post('/twiml/turn', (req, res) => {
  const { callId } = req.query;
  const n    = parseInt(req.query.n, 10);
  const call = activeCalls[callId];
  if (!call) return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`);

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
    return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="2"/>
  <Hangup/>
</Response>`);
  }

  call.currentTurn = n;
  const ngrok    = process.env.NGROK_URL;
  const isLast   = n === call.audioFiles.length - 1;
  const audioUrl = audioFile.file ? `${ngrok}/audio/${audioFile.file}` : null;
  const nextUrl  = isLast ? null : `${ngrok}/twiml/turn?callId=${callId}&n=${n + 1}`;

  emit('turn_playing', {
    callId, turn: n,
    speaker: audioFile.speaker, text: audioFile.text, action: audioFile.action,
    currentOffer: offerAtTurn(call.negotiationState.conversation, n, call.config),
  });

  console.log(`[TWIML] Turn ${n} (${audioFile.speaker}): ${audioFile.text.substring(0, 60)}…`);
  res.type('text/xml').send(twimlPlay(audioUrl, nextUrl, audioFile.text));
});

// ── TWIML: AGENT — REP AUTO-ANSWER ────────────────────────────────────────────
app.post('/twiml/rep-answer', (req, res) => {
  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="120"/>
</Response>`);
});

// ── TWIML: HUMAN — CALL START ─────────────────────────────────────────────────
app.post('/twiml/human-start', async (req, res) => {
  const { callId } = req.query;
  const call = activeCalls[callId];
  if (!call) return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`);

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
      currentOffer: call.negotiationState.current_offer,
    });

    const ngrok    = process.env.NGROK_URL;
    const audioUrl = audioFile ? `${ngrok}/audio/${audioFile}` : null;
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
app.post('/twiml/human-gather', async (req, res) => {
  const { callId } = req.query;
  const call = activeCalls[callId];
  if (!call) return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`);

  const speechText = (req.body.SpeechResult || '').trim();
  const ngrok      = process.env.NGROK_URL;
  console.log(`[TWIML] human-gather: "${speechText.substring(0, 80)}"`);

  // Record rep's human speech
  const repTurnN = call.audioFiles.length;
  let repOffer   = null;

  if (speechText) {
    repOffer = await extractOfferFromSpeech(speechText, call.config);
    if (repOffer !== null) {
      call.negotiationState.current_offer = repOffer;
      call.negotiationState.rep_offers_used = [...call.negotiationState.rep_offers_used, repOffer];
    }
    call.negotiationState.conversation.push({
      speaker: 'rep', text: speechText, action: 'human_speech',
      currentOffer: repOffer || call.negotiationState.current_offer,
    });
    call.negotiationState.turn_count++;

    emit('turn_playing', {
      callId, turn: repTurnN, speaker: 'rep',
      text: speechText, action: 'human_speech',
      currentOffer: call.negotiationState.current_offer,
    });
  }

  // Should Ringside accept?
  const cfg = call.config;
  if (repOffer !== null && repOffer <= cfg.acceptThreshold) {
    call.negotiationState.resolved         = true;
    call.negotiationState.final_price      = repOffer;
    call.negotiationState.resolution_reason = 'accepted';
  }

  const budgetHit = call.negotiationState.turn_count >= cfg.maxTurns;
  const shouldClose = call.negotiationState.resolved || budgetHit;

  // Generate Ringside's response
  const nextAction = shouldClose
    ? (call.negotiationState.resolved ? 'accept' : 'best_offer')
    : null; // let runRingsideTurn determine it

  try {
    const result = await runRingsideTurn(call.negotiationState);
    call.negotiationState = result.state;

    const rTurnN    = call.audioFiles.length;
    const audioFile = await generateAudio(result.text, 'ringside', rTurnN, callId, result.action);
    call.audioFiles.push({ turn: rTurnN, speaker: 'ringside', text: result.text, action: result.action, file: audioFile });
    call.currentTurn = rTurnN;

    emit('turn_playing', {
      callId, turn: rTurnN, speaker: 'ringside',
      text: result.text, action: result.action,
      currentOffer: call.negotiationState.current_offer,
    });

    const audioUrl = audioFile ? `${ngrok}/audio/${audioFile}` : null;
    const media    = audioUrl ? `<Play>${audioUrl}</Play>` : `<Say>${escapeXml(result.text)}</Say>`;

    if (call.negotiationState.resolved) {
      emit('call_resolved', {
        callId,
        finalPrice:    call.negotiationState.final_price,
        savings:       cfg.currentPrice - (call.negotiationState.final_price || cfg.currentPrice),
        savingsAnnual: (cfg.currentPrice - (call.negotiationState.final_price || cfg.currentPrice)) * 12,
        resolutionReason: call.negotiationState.resolution_reason,
      });
      return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  ${media}
  <Pause length="2"/>
  <Hangup/>
</Response>`);
    }

    // Continue negotiation
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
    console.error(`[TWIML] human-gather error:`, err.message);
    res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say>Thank you for your time.</Say><Hangup/></Response>`);
  }
});

// ── STATUS CALLBACK ────────────────────────────────────────────────────────────
app.post('/api/call-status', (req, res) => {
  const { CallStatus, CallSid } = req.body;
  const callId = req.query.callId || callSidToId[CallSid];
  console.log(`[STATUS] ${CallSid} → ${CallStatus}`);

  if (['completed', 'failed', 'no-answer', 'busy', 'canceled'].includes(CallStatus)) {
    const call = activeCalls[callId];
    if (call) {
      emit('call_ended', {
        callId, status: CallStatus,
        finalPrice: call.negotiationState?.final_price,
        savings: call.config.currentPrice - (call.negotiationState?.final_price || call.config.currentPrice),
      });
    }
  }
  res.sendStatus(200);
});

// ── DATA ENDPOINTS ─────────────────────────────────────────────────────────────
app.post('/api/negotiate', async (req, res) => {
  try {
    const config = deriveConfig({ ...DEFAULT_CONFIG, ...req.body });
    const state  = await runNegotiation(config);
    res.json({ success: true, state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/state/:callId', (req, res) => {
  const call = activeCalls[req.params.callId];
  if (!call) return res.status(404).json({ error: 'Call not found' });

  const fullConvo = call.negotiationState?.conversation || [];
  const resolved  = call.negotiationState?.resolved;
  // For in-progress calls only expose turns that have been played so far
  const visibleConvo = resolved
    ? fullConvo
    : fullConvo.slice(0, Math.max(0, call.currentTurn + 1));
  // Enrich each visible turn with current offer at that point
  const enrichedConvo = visibleConvo.map((t, i) => ({
    ...t,
    currentOffer: offerAtTurn(visibleConvo, i, call.config),
  }));

  res.json({
    callId:      call.callId,
    config:      call.config,
    mode:        call.config.mode,
    startedAt:   call.startedAt,
    currentTurn: call.currentTurn,
    totalTurns:  call.audioFiles.length,
    resolved,
    finalPrice:  call.negotiationState?.final_price,
    resolutionReason: call.negotiationState?.resolution_reason,
    conversation: enrichedConvo,
  });
});

app.get('/api/calls', (req, res) => {
  const calls = Object.values(activeCalls)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .map((c) => ({
      callId:       c.callId,
      company:      c.config?.company,
      mode:         c.config?.mode,
      currentPrice: c.config?.currentPrice,
      targetPrice:  c.config?.targetPrice,
      startedAt:    c.startedAt,
      currentTurn:  c.currentTurn,
      totalTurns:   c.audioFiles?.length,
      resolved:     c.negotiationState?.resolved,
      finalPrice:   c.negotiationState?.final_price,
      resolutionReason: c.negotiationState?.resolution_reason,
    }));
  res.json(calls);
});

// ── PAGE ROUTES ────────────────────────────────────────────────────────────────
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// SPA catch-all — serve React index for all client-side routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/twiml') || req.path.includes('.')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── BOOT ───────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`\n🥊 Ringside server on http://localhost:${PORT}`);
  console.log(`   NGROK_URL:  ${process.env.NGROK_URL || '(not set)'}`);
  console.log(`   From:       ${process.env.TWILIO_RINGSIDE_NUMBER || '(not set)'}`);
  console.log(`   Rep number: ${process.env.TWILIO_REP_NUMBER || '(not set, pass phone in request)'}\n`);

  await ensureAudioDir();

  if (process.env.MAYA_API_KEY && process.env.RINGSIDE_VOICE_ID && process.env.REP_VOICE_ID) {
    generateFallbackCache().catch((err) =>
      console.error('[TTS] Fallback cache error:', err.message)
    );
  } else {
    console.warn('[TTS] MAYA_API_KEY or voice IDs not set — skipping cache generation');
  }
});
