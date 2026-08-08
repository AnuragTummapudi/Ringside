require('dotenv').config();
const axios  = require('axios');
const fs     = require('fs').promises;
const path   = require('path');
const { spawn } = require('child_process');

const MAYA_TTS_URL = 'https://tts.mayaresearch.ai/v1/tts';
const AUDIO_DIR    = path.join(__dirname, 'audio');

// Maya /v1/tts returns raw PCM:
//   16-bit signed little-endian, mono, 24 000 Hz, no file header.
// Twilio <Play> and phone lines expect 8 000 Hz (PSTN/G.711 standard).
//
// pcmToWav() pipes Maya's raw bytes through ffmpeg:
//   -f s16le -ar 24000 -ac 1 (declare the input format)  →
//   -ar 8000 -acodec pcm_s16le -f wav (resample + wrap)
//
// The result is a valid 8 kHz 16-bit mono WAV — zero guesswork on headers.
function pcmToWav(pcmBuffer) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-f',      's16le',
      '-ar',     '24000',
      '-ac',     '1',
      '-i',      'pipe:0',   // read raw PCM from stdin
      '-ar',     '8000',     // resample to 8 kHz (PSTN standard)
      '-acodec', 'pcm_s16le',
      '-f',      'wav',
      'pipe:1',              // write WAV to stdout
    ]);

    const out = [];
    ff.stdout.on('data', (chunk) => out.push(chunk));
    ff.stderr.on('data',  () => {});           // suppress ffmpeg banner
    ff.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    ff.on('error', (err) => reject(new Error(`ffmpeg spawn failed: ${err.message}`)));

    ff.stdin.end(pcmBuffer);
  });
}

async function ensureAudioDir() {
  await fs.mkdir(AUDIO_DIR, { recursive: true });
}

// ── MAIN AUDIO GENERATOR ──────────────────────────────────────────────────────
// Returns the filename (relative to AUDIO_DIR) on success, null on total failure.
async function generateAudio(text, speaker, turnNum, callId, action) {
  await ensureAudioDir();

  const voiceId = speaker === 'ringside'
    ? process.env.RINGSIDE_VOICE_ID
    : process.env.REP_VOICE_ID;

  if (process.env.MAYA_API_KEY && voiceId) {
    try {
      const resp = await axios.post(
        MAYA_TTS_URL,
        { text, voice_id: voiceId },
        {
          headers: {
            Authorization: `Bearer ${process.env.MAYA_API_KEY}`,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 12000,
        }
      );

      // Maya always returns raw PCM — convert + resample via ffmpeg
      const raw   = Buffer.from(resp.data);
      const audio = await pcmToWav(raw);

      const liveFile = `${callId}_turn${turnNum}_${speaker}.wav`;
      await fs.writeFile(path.join(AUDIO_DIR, liveFile), audio);
      console.log(`[TTS] Generated (8kHz WAV, ${Math.round(audio.length / 1024)}KB): ${liveFile}`);
      return liveFile;
    } catch (err) {
      console.error(`[TTS] Maya/ffmpeg failed for turn ${turnNum} (${speaker}): ${err.message}`);
    }
  }

  // Fallback: find any cached file for this action
  for (const ext of ['wav', 'mp3']) {
    const cacheFile = `cache_${speaker}_${action}.${ext}`;
    const cachePath = path.join(AUDIO_DIR, cacheFile);
    try {
      await fs.access(cachePath);
      const liveFile = `${callId}_turn${turnNum}_${speaker}.${ext}`;
      await fs.copyFile(cachePath, path.join(AUDIO_DIR, liveFile));
      console.log(`[TTS] Using cached fallback: ${cacheFile} → ${liveFile}`);
      return liveFile;
    } catch { /* continue */ }
  }

  console.error(`[TTS] No cache for ${speaker}/${action} — will use <Say> in TwiML`);
  return null;
}

// ── FALLBACK CACHE ─────────────────────────────────────────────────────────────
async function generateFallbackCache() {
  await ensureAudioDir();

  const { DEFAULT_CONFIG, buildFallbackLines } = require('./negotiate');
  const lines = buildFallbackLines(DEFAULT_CONFIG);

  const entries = [
    ...Object.entries(lines.ringside).map(([action, text]) => ({ speaker: 'ringside', action, text })),
    ...Object.entries(lines.rep).map(([action, text])      => ({ speaker: 'rep',      action, text })),
  ];

  const results = await Promise.allSettled(
    entries.map(({ speaker, action, text }) => cacheLine(speaker, action, text))
  );

  const ok = results.filter((r) => r.status === 'fulfilled').length;
  console.log(`[TTS] Fallback cache: ${ok}/${entries.length} lines ready`);
}

async function cacheLine(speaker, action, text) {
  const voiceId = speaker === 'ringside'
    ? process.env.RINGSIDE_VOICE_ID
    : process.env.REP_VOICE_ID;

  if (!process.env.MAYA_API_KEY || !voiceId) {
    console.warn(`[TTS] Skipping cache for ${speaker}/${action} — MAYA_API_KEY or voice_id not set`);
    return;
  }

  // Skip if a correct (newly-generated) cache file already exists
  const cacheFile = `cache_${speaker}_${action}.wav`;
  const cachePath = path.join(AUDIO_DIR, cacheFile);
  try {
    await fs.access(cachePath);
    console.log(`[TTS] Cache hit: ${cacheFile}`);
    return;
  } catch { /* generate */ }

  const resp = await axios.post(
    MAYA_TTS_URL,
    { text, voice_id: voiceId },
    {
      headers: {
        Authorization: `Bearer ${process.env.MAYA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
      timeout: 12000,
    }
  );

  const raw   = Buffer.from(resp.data);
  const audio = await pcmToWav(raw);

  await fs.writeFile(cachePath, audio);
  console.log(`[TTS] Cached (8kHz WAV): ${cacheFile}`);
}

module.exports = { generateAudio, generateFallbackCache, ensureAudioDir };
