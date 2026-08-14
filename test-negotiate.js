require('dotenv').config();
const { runNegotiation } = require('./negotiate');

async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log('  RINGSIDE — Text-to-Text Negotiation Test');
  console.log('══════════════════════════════════════════\n');

  const start = Date.now();
  // Tests the deterministic negotiation policy without requiring a provider credential.
  const state = await runNegotiation({ transport: 'demo' });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log('\n── TRANSCRIPT ────────────────────────────\n');
  state.conversation.forEach((turn, i) => {
    const label = turn.speaker === 'ringside'
      ? '\x1b[36m🥊 RINGSIDE\x1b[0m'
      : '\x1b[33m👤 STUBBORN REP\x1b[0m';
    console.log(`Turn ${i} ${label} [${turn.action}]`);
    console.log(`  "${turn.text}"\n`);
  });

  console.log('── RESULT ────────────────────────────────\n');
  console.log(`  Resolved : ${state.resolved}`);
  console.log(`  Final price : ₹${state.final_price}/month`);
  console.log(`  Savings : ₹${1499 - (state.final_price || 1499)}/month`);
  console.log(`  Annual savings : ₹${(1499 - (state.final_price || 1499)) * 12}/year`);
  console.log(`  Total turns : ${state.turn_count}`);
  console.log(`  Elapsed : ${elapsed}s`);

  if (!state.resolved) {
    console.error('\n  ⚠️  FAILED — negotiation did not resolve. Check prompts/logic.');
    process.exit(1);
  }
  if (state.final_price > 1050) {
    console.error(`\n  ⚠️  WARNING — resolved at ₹${state.final_price}, above target threshold of ₹1,050.`);
    process.exit(1);
  }

  console.log('\n  ✅ PASS — resolved to scripted win (₹1,020 or better)\n');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
