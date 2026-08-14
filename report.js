function savingsFor(current, finalPrice) {
  if (!Number.isFinite(finalPrice)) return { monthly: 0, annual: 0 };
  const monthly = Math.max(0, current - finalPrice);
  return { monthly, annual: monthly * 12 };
}

function verifyFinalOffer({ finalPrice, targetPrice, currentPrice, conditions = {} }) {
  const price = Number(finalPrice);
  const validPrice = Number.isFinite(price) && price > 0 && price <= currentPrice;
  const contractClear = conditions.contractStatus !== 'new_contract_required';
  const confidence = validPrice && contractClear ? (price <= targetPrice ? 0.94 : 0.78) : 0.35;
  return {
    status: validPrice ? (contractClear ? 'verified' : 'needs_verification') : 'needs_verification',
    confidence,
    checks: {
      validPrice,
      belowTarget: validPrice && price <= targetPrice,
      contractClear,
    },
  };
}

function buildReport(call, research = null, bill = null) {
  const state = call.negotiationState || {};
  const currentPrice = call.config?.currentPrice || state.config?.currentPrice || 0;
  const targetPrice = call.config?.targetPrice || state.config?.targetPrice || 0;
  const finalPrice = Number.isFinite(state.final_price) ? state.final_price : null;
  const savings = savingsFor(currentPrice, finalPrice);
  const verification = verifyFinalOffer({ finalPrice, targetPrice, currentPrice });
  const policyAccepted = ['accepted', 'verbally_confirmed'].includes(state.resolution_reason) && finalPrice <= (state.config?.acceptThreshold || targetPrice);
  const outcome = verification.status === 'verified' && (verification.checks.belowTarget || policyAccepted) ? 'won' : finalPrice ? 'best_offer' : 'no_deal';
  return {
    outcome,
    startingPrice: currentPrice,
    finalPrice,
    targetPrice,
    monthlySavings: savings.monthly,
    annualSavings: savings.annual,
    turns: state.conversation?.length || 0,
    strategy: state.levers_used || [],
    objections: state.detectedObjections || [],
    verification,
    confidence: verification.confidence,
    summary: finalPrice
      ? `Ringside moved the monthly price from ₹${currentPrice.toLocaleString('en-IN')} to ₹${finalPrice.toLocaleString('en-IN')}${state.resolution_reason === 'verbally_confirmed' ? ', with verbal confirmation from the representative.' : '.'}`
      : 'Ringside did not receive a verifiable lower offer.',
    research: research || { sources: [], provider: 'none', verified: false },
    bill: bill || null,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { savingsFor, verifyFinalOffer, buildReport };
