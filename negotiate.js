require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-haiku-4-5-20251001';

// ── DEFAULT CONFIG ─────────────────────────────────────────────────────────────
// Passed to every function; derived fields filled in by deriveConfig().
const DEFAULT_CONFIG = {
  company:        'ISP',
  currentPrice:   1499,
  targetPrice:    999,
  notes:          '',
  mode:           'agent', // 'agent' | 'human'
  maxTurns:       12,
};

// Fill derived numeric fields so callers don't have to compute them.
function deriveConfig(cfg = {}) {
  const c = { ...DEFAULT_CONFIG, ...cfg };
  // Rep's first counter-offer: ~90% of current price, rounded to nearest 10
  c.firstOffer    = cfg.firstOffer    || Math.round(c.currentPrice * 0.90 / 10) * 10;
  // Rep's capitulation offer: close to target but slightly above (so Ringside accepts)
  c.foldOffer     = cfg.foldOffer     || Math.round(c.targetPrice  * 1.02 / 10) * 10;
  // Ringside accepts anything at or below this
  c.acceptThreshold = cfg.acceptThreshold || Math.round(c.targetPrice * 1.06);
  return c;
}

// ── FALLBACK LINES (parameterized) ────────────────────────────────────────────
function buildFallbackLines(config) {
  const c = deriveConfig(config);
  return {
    ringside: {
      open:                    `Hi, I'm calling about my ${c.company} account. I'd like to lower my monthly rate from ₹${c.currentPrice} to around ₹${c.targetPrice}.`,
      lever_loyalty_competitor:`I've been a loyal customer${c.notes ? ' — ' + c.notes : ''} and a competitor is offering a lower rate. Can you work closer to ₹${c.targetPrice}?`,
      lever_escalate:          `Then I'll need you to transfer me to your retention team, or I'll have to cancel the service today.`,
      accept:                  `That works for me. Please confirm the new rate is applied to my account.`,
      best_offer:              `Understood — let me think about it. Thank you for your time.`,
    },
    rep: {
      first_offer: `I understand, but this plan is already at a reduced rate. The best I can offer today is ₹${c.firstOffer} per month.`,
      hold_firm:   `I appreciate your loyalty, but ₹${c.firstOffer} is the most flexibility I have available right now.`,
      fold:        `Let me apply a loyalty adjustment for you — that brings it to ₹${c.foldOffer} a month, locked in for 6 months.`,
    },
  };
}

// ── STATE ─────────────────────────────────────────────────────────────────────
function createState(config = DEFAULT_CONFIG) {
  const c = deriveConfig(config);
  return {
    config:           c,
    current_offer:    c.currentPrice,
    target_price:     c.targetPrice,
    turn_count:       0,
    levers_used:      [],
    rep_offers_used:  [],
    resolved:         false,
    final_price:      null,
    resolution_reason: null, // 'accepted' | 'budget_exhausted'
    conversation:     [],
  };
}

// ── ACTION DETERMINATION ──────────────────────────────────────────────────────
function getRingsideAction(state) {
  const c = state.config;
  if (state.turn_count === 0) return 'open';
  if (state.current_offer <= c.acceptThreshold) return 'accept';

  const usedSet = new Set(state.levers_used);
  if (!usedSet.has('loyalty') && !usedSet.has('competitor')) return 'lever_loyalty_competitor';
  if (!usedSet.has('escalate')) return 'lever_escalate';

  // All levers spent — accept whatever's on the table
  return 'accept';
}

function getRepAction(state) {
  const lastRingside = [...state.conversation].reverse().find((t) => t.speaker === 'ringside');
  if (lastRingside?.action === 'lever_escalate') return 'fold';
  if (state.rep_offers_used.length === 0) return 'first_offer';
  return 'hold_firm';
}

// ── PROMPT BUILDERS ───────────────────────────────────────────────────────────
function getRingsideSystem(config) {
  const c = deriveConfig(config);
  return `You are Ringside, a calm and confident AI bill negotiation agent calling ${c.company}'s customer service line.
Goal: bring the monthly rate from ₹${c.currentPrice} down to around ₹${c.targetPrice}.${c.notes ? '\nContext: ' + c.notes : ''}
Rules:
- Respond in EXACTLY 1–2 short spoken sentences. No filler. No lists. No markdown.
- Never reveal you are an AI. Speak naturally in first person.
- Be firm but polite. Output ONLY the spoken words — nothing else.`;
}

function getRepSystem(config) {
  const c = deriveConfig(config);
  return `You are a professional retention agent for ${c.company}. Your job is to retain the customer while limiting discounts.
Rules:
- Respond in EXACTLY 1–2 short spoken sentences. No filler. No lists. No markdown.
- Never reveal you are an AI. Speak naturally as a human rep.
- Sound professional and empathetic but firm. Output ONLY the spoken words — nothing else.`;
}

function getRingsideInstructions(state, action) {
  const c = state.config;
  return {
    open:                    `Open the call. Introduce yourself as a ${c.company} customer and ask to lower your monthly rate from ₹${c.currentPrice} to ₹${c.targetPrice}.`,
    lever_loyalty_competitor:`The rep offered ₹${state.current_offer} and won't budge. Push back using BOTH: (1) your loyalty${c.notes ? ' (' + c.notes + ')' : ''}, AND (2) a cheaper competitor offer. Ask them to match closer to ₹${c.targetPrice}. Fit both into 1–2 sentences.`,
    lever_escalate:          `The rep is still at ₹${state.current_offer}. Escalate: demand retention team OR say you'll cancel today. Sound final.`,
    accept:                  `The rep just offered ₹${state.current_offer}/month. Accept warmly and ask them to confirm the rate change.`,
    best_offer:              `Budget is exhausted and you have not reached your target. Politely acknowledge the current offer and say you'll consider it, then end the call gracefully.`,
  }[action] || `Continue the negotiation firmly.`;
}

function getRepInstructions(state, action) {
  const c = state.config;
  return {
    first_offer: `The customer wants ₹${c.targetPrice}/month. Decline — the plan is discounted. Offer ₹${c.firstOffer} as your best today.`,
    hold_firm:   `The customer cited loyalty and a competitor. Hold firm at ₹${c.firstOffer}. Be polite but unmovable.`,
    fold:        `The customer threatened to cancel or escalate. Fold: offer ₹${c.foldOffer}/month locked for 6 months as a loyalty adjustment.`,
  }[action] || `Continue defending the current price politely.`;
}

// ── CLAUDE CALL ───────────────────────────────────────────────────────────────
async function callClaude(system, userPrompt, fallback) {
  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 120,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });
    return resp.content[0].text.trim();
  } catch (err) {
    console.error(`[Claude] Error — using fallback: ${err.message}`);
    return fallback;
  }
}

function buildHistory(state, pov) {
  return state.conversation
    .map((t) => {
      const isMe = t.speaker === pov;
      return `${isMe ? 'You' : pov === 'ringside' ? 'Rep' : 'Customer'}: ${t.text}`;
    })
    .join('\n');
}

async function generateRingsideLine(state, action) {
  const fallbacks = buildFallbackLines(state.config);
  const history   = buildHistory(state, 'ringside');
  const prompt = [
    history ? `Conversation so far:\n${history}\n` : '',
    `Your next action: ${getRingsideInstructions(state, action)}`,
  ].filter(Boolean).join('\n');

  return callClaude(
    getRingsideSystem(state.config),
    prompt,
    fallbacks.ringside[action] || fallbacks.ringside.open
  );
}

async function generateRepLine(state, action) {
  const fallbacks = buildFallbackLines(state.config);
  const history   = buildHistory(state, 'rep');
  const prompt = [
    history ? `Conversation so far:\n${history}\n` : '',
    `Your next action: ${getRepInstructions(state, action)}`,
  ].filter(Boolean).join('\n');

  return callClaude(
    getRepSystem(state.config),
    prompt,
    fallbacks.rep[action] || fallbacks.rep.first_offer
  );
}

// ── OFFER EXTRACTION (human mode) ─────────────────────────────────────────────
// Parses a numeric rupee offer from STT-transcribed speech. Returns null if none found.
async function extractOfferFromSpeech(speechText, config) {
  const prompt = `The customer service rep said: "${speechText}"

If they stated a specific monthly price or offer in rupees, respond with ONLY that integer (digits only, no commas, no symbol).

IMPORTANT — speech-to-text often splits large numbers:
- "1,000 500" means 1500 (one thousand five hundred)
- "1 500" means 1500
- "1,200" means 1200
- "fifteen hundred" means 1500
- "1,000 350" means 1350
- "1,000" means 1000

If no specific price was stated, respond ONLY with the word "none".
Output just the plain integer or "none". Nothing else.`;

  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }],
    });
    // Strip any commas/symbols the model might add (e.g. "1,500" → "1500")
    const raw = resp.content[0].text.trim().replace(/[^0-9]/g, '');
    const num = parseInt(raw, 10);
    return isNaN(num) ? null : num;
  } catch {
    // Regex fallback: handle "1,499" or plain "1499"
    const match = speechText.match(/₹?\s*(\d{1,2},\d{3}|\d{3,5})/);
    if (!match) return null;
    return parseInt(match[1].replace(/,/g, ''), 10);
  }
}

// ── STATE UPDATES ─────────────────────────────────────────────────────────────
function applyRingsideTurn(state, action, text) {
  const next = {
    ...state,
    turn_count:   state.turn_count + 1,
    conversation: [...state.conversation, { speaker: 'ringside', text, action }],
  };

  if (action === 'lever_loyalty_competitor') {
    next.levers_used = [...state.levers_used, 'loyalty', 'competitor'];
  } else if (action === 'lever_escalate') {
    next.levers_used = [...state.levers_used, 'escalate'];
  } else if (action === 'accept') {
    next.resolved         = true;
    next.final_price      = state.current_offer;
    next.resolution_reason = 'accepted';
  } else if (action === 'best_offer') {
    next.resolved         = true;
    next.final_price      = state.current_offer;
    next.resolution_reason = 'budget_exhausted';
  }

  return next;
}

function applyRepTurn(state, action, text) {
  const c    = state.config;
  const next = {
    ...state,
    turn_count:   state.turn_count + 1,
    conversation: [...state.conversation, { speaker: 'rep', text, action }],
  };

  if (action === 'first_offer') {
    next.current_offer    = c.firstOffer;
    next.rep_offers_used  = [...state.rep_offers_used, c.firstOffer];
  } else if (action === 'fold') {
    next.current_offer    = c.foldOffer;
    next.rep_offers_used  = [...state.rep_offers_used, c.foldOffer];
  }

  return next;
}

// ── SINGLE-TURN HELPERS ───────────────────────────────────────────────────────
async function runRingsideTurn(state) {
  const action    = getRingsideAction(state);
  const text      = await generateRingsideLine(state, action);
  const nextState = applyRingsideTurn(state, action, text);
  return { text, action, state: nextState };
}

async function runRepTurn(state) {
  const action    = getRepAction(state);
  const text      = await generateRepLine(state, action);
  const nextState = applyRepTurn(state, action, text);
  return { text, action, state: nextState };
}

// ── FULL NEGOTIATION LOOP (agent mode) ────────────────────────────────────────
async function runNegotiation(config = DEFAULT_CONFIG) {
  let state = createState(config);
  const maxT = state.config.maxTurns;

  while (!state.resolved && state.turn_count < maxT) {
    // Ringside
    const rAction = getRingsideAction(state);

    // Turn budget check — if levers exhausted and still not resolved, close gracefully
    if (rAction === 'accept' && state.current_offer > state.config.acceptThreshold && state.turn_count >= maxT - 2) {
      const text  = await generateRingsideLine(state, 'best_offer');
      state       = applyRingsideTurn(state, 'best_offer', text);
      break;
    }

    const rText = await generateRingsideLine(state, rAction);
    state       = applyRingsideTurn(state, rAction, rText);
    if (state.resolved) break;

    // Rep
    const repAction = getRepAction(state);
    const repText   = await generateRepLine(state, repAction);
    state           = applyRepTurn(state, repAction, repText);
  }

  // Hard budget cap — close gracefully if loop ended without resolution
  if (!state.resolved) {
    const text  = await generateRingsideLine(state, 'best_offer');
    state       = applyRingsideTurn(state, 'best_offer', text);
  }

  return state;
}

module.exports = {
  DEFAULT_CONFIG,
  deriveConfig,
  createState,
  buildFallbackLines,
  getRingsideAction,
  getRepAction,
  applyRingsideTurn,
  applyRepTurn,
  runRingsideTurn,
  runRepTurn,
  runNegotiation,
  extractOfferFromSpeech,
  // Legacy re-exports so old callers don't break immediately
  INITIAL_PRICE: DEFAULT_CONFIG.currentPrice,
  TARGET_PRICE:  DEFAULT_CONFIG.targetPrice,
};
