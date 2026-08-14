// Quick test for Maya TTS API — lists voices and generates one sample audio file.
// Usage: node test-tts.js
// Requires: MAYA_API_KEY in .env
require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const MAYA_BASE = 'https://tts.mayaresearch.ai';

async function listVoices() {
  console.log('\n── Available Maya Voices ──────────────────');
  try {
    // Try common "list characters/voices" endpoint patterns
    for (const endpoint of ['/v1/characters', '/v1/voices', '/v1/tts/voices', '/characters']) {
      try {
        const resp = await axios.get(`${MAYA_BASE}${endpoint}`, {
          headers: { Authorization: `Bearer ${process.env.MAYA_API_KEY}` },
          timeout: 8000,
        });
        console.log(`\nFound at ${endpoint}:`);
        const voices = Array.isArray(resp.data) ? resp.data : (resp.data.voices || resp.data.characters || resp.data);
        if (Array.isArray(voices)) {
          voices.forEach((v) => {
            console.log(`  ID: ${v.voice_id || v.id || v.character_id || JSON.stringify(v).substring(0, 60)}`);
            console.log(`  Name: ${v.name || v.character_name || '—'}`);
            console.log(`  ---`);
          });
        } else {
          console.log(JSON.stringify(resp.data, null, 2).substring(0, 500));
        }
        return voices;
      } catch (e) {
        if (e.response?.status !== 404) console.log(`  ${endpoint}: ${e.message}`);
      }
    }
    console.log('Could not find voice list endpoint — try checking Maya docs.');
  } catch (err) {
    console.error('Error listing voices:', err.message);
  }
}

async function testGenerate(voiceId, text = "Hi, I'm calling about my internet bill. I'd like to bring it down to 999 rupees.") {
  if (!voiceId) {
    console.log('\nSkipping audio generation — no voice_id provided.');
    console.log('Set RINGSIDE_VOICE_ID in .env and re-run.');
    return;
  }

  console.log(`\n── Generating test audio (voice: ${voiceId}) ──`);
  try {
    const resp = await axios.post(
      `${MAYA_BASE}/v1/tts`,
      { text, voice_id: voiceId },
      {
        headers: {
          Authorization: `Bearer ${process.env.MAYA_API_KEY}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: 15000,
      }
    );
    const outPath = path.join(__dirname, 'audio', 'test_sample.mp3');
    await fs.mkdir(path.join(__dirname, 'audio'), { recursive: true });
    await fs.writeFile(outPath, Buffer.from(resp.data));
    console.log(`✅ Audio saved to: ${outPath}`);
    console.log(`   Size: ${resp.data.byteLength} bytes`);
    console.log(`   Content-Type: ${resp.headers['content-type']}`);
    console.log('\nPlay it: open audio/test_sample.mp3');
  } catch (err) {
    if (err.response) {
      console.error(`❌ Maya TTS error ${err.response.status}:`,
        Buffer.from(err.response.data).toString().substring(0, 200));
    } else {
      console.error('❌ Request error:', err.message);
    }
  }
}

async function main() {
  if (!process.env.MAYA_API_KEY) {
    console.error('MAYA_API_KEY not set in .env');
    process.exit(1);
  }
  console.log('Maya API key: set ✓');

  await listVoices();
  await testGenerate(process.env.RINGSIDE_VOICE_ID || process.env.REP_VOICE_ID);
}

main().catch(console.error);
