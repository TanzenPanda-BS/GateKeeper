/**
 * GateKeeper Live Engine
 * Runs at market close each day (or on demand).
 * 1. Resolves all decided-but-unresolved recommendations with closing prices
 * 2. Generates the daily After Action Report from real data
 * 3. Recalculates Trust Score, ROI Delta, behavioral flags
 * 4. Snapshots daily metrics
 */

import { storage } from "./storage";
import { getLatestBars, getAccount } from "./alpaca";

// ── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number) { return Math.round(n * 100) / 100; }

function calcDaysActive(startDate: string): number {
  const start = new Date(startDate);
  const now = new Date();
  return Math.max(1, Math.floor((now.getTime() - start.getTime()) / 86400000) + 1);
}

// Determine if a recommendation's AI call was correct
// For BUY: AI correct if price moved up from recommendation price
// For SELL: AI correct if price moved down from recommendation price
function wasAiCorrect(action: string, entryPrice: number, closePrice: number): boolean {
  if (action === "BUY") return closePrice > entryPrice;
  if (action === "SELL") return closePrice < entryPrice;
  return false;
}

// Was the user's decision correct?
// For APPROVED/MODIFIED: correct if AI was correct (they followed and it worked)
// For REJECTED: correct if AI was WRONG (they skipped a bad call)
function wasUserCorrect(userDecision: string, aiCorrect: boolean): boolean {
  if (userDecision === "APPROVED" || userDecision === "MODIFIED") return aiCorrect;
  if (userDecision === "REJECTED") return !aiCorrect; // rejecting a wrong signal is correct
  return false;
}

// Build a natural-language narrative summary from real data
function buildNarrative(data: {
  period: string;
  total: number;
  aiCorrect: number;
  userCorrect: number;
  aiPct: number;
  userPct: number;
  actualPnl: number;
  phantomPnl: number;
  roiDelta: number;
  trustScore: number;
  biggestMiss: any;
  biggestWin: any;
  flags: string[];
}): string {
  const parts: string[] = [];

  parts.push(`The AI was right on ${data.aiCorrect} of ${data.total} call${data.total !== 1 ? "s" : ""} ${data.period} (${data.aiPct.toFixed(1)}%).`);

  if (data.total === 0) {
    parts.push("No recommendations were made or decided in this period. Generate signals and make decisions to start building your record.");
    return parts.join(" ");
  }

  if (data.actualPnl > 0) {
    parts.push(`Your approved trades returned +$${data.actualPnl.toFixed(2)}.`);
  } else if (data.actualPnl < 0) {
    parts.push(`Your approved trades lost $${Math.abs(data.actualPnl).toFixed(2)}.`);
  }

  if (data.biggestMiss && data.biggestMiss.phantomPnl > 20) {
    parts.push(`Your rejection of ${data.biggestMiss.ticker} was the costliest miss ($${data.biggestMiss.phantomPnl.toFixed(0)} phantom).`);
  }

  if (data.biggestWin && data.biggestWin.actualPnl > 0) {
    parts.push(`Best trade: ${data.biggestWin.ticker} returned +$${data.biggestWin.actualPnl.toFixed(0)}.`);
  }

  if (data.roiDelta > 0) {
    parts.push(`You are outperforming the S&P 500 by ${data.roiDelta.toFixed(1)}% since Day 1.`);
  } else if (data.roiDelta < -1) {
    parts.push(`You are underperforming the S&P 500 by ${Math.abs(data.roiDelta).toFixed(1)}% since Day 1.`);
  }

  if (data.trustScore < 40) {
    parts.push("Trust Score is low — consider engaging more with High-confidence signals to build your record.");
  } else if (data.trustScore > 70) {
    parts.push(`Trust Score of ${data.trustScore.toFixed(0)} reflects strong engagement with the platform.`);
  } else {
    parts.push(`Trust Score of ${data.trustScore.toFixed(0)} is developing. More decisions will sharpen the picture.`);
  }

  return parts.join(" ");
}

// Build behavioral flags from real decision history
function buildBehavioralFlags(recs: any[], daysActive: number): string[] {
  const flags: string[] = [];
  const decided = recs.filter(r => r.userDecision);
  if (decided.length === 0) return ["No decisions made yet. Generate signals and start making decisions to see behavioral analysis."];

  const highConf = recs.filter(r => r.confidence === "HIGH" && r.userDecision);
  const highApproved = highConf.filter(r => r.userDecision === "APPROVED" || r.userDecision === "MODIFIED");
  const highApprovalRate = highConf.length > 0 ? (highApproved.length / highConf.length) * 100 : null;

  if (highApprovalRate !== null && highConf.length >= 3) {
    if (highApprovalRate < 50) {
      flags.push(`Hesitation bias: You've approved only ${highApprovalRate.toFixed(0)}% of HIGH confidence signals. Historical win rate on these is typically higher — consider trusting strong signals more.`);
    } else if (highApprovalRate > 85) {
      flags.push(`Strong engagement: You approve ${highApprovalRate.toFixed(0)}% of HIGH confidence signals — good alignment with strong conviction calls.`);
    }
  }

  // Rejection accuracy
  const resolved = recs.filter(r => r.resolvedAt && r.userDecision);
  if (resolved.length >= 3) {
    const rejections = resolved.filter(r => r.userDecision === "REJECTED");
    const rejCorrect = rejections.filter(r => r.userWasCorrect === 1);
    if (rejections.length >= 2) {
      const rejAcc = (rejCorrect.length / rejections.length) * 100;
      if (rejAcc < 40) {
        flags.push(`Rejection accuracy: ${rejAcc.toFixed(0)}% of your rejections turned out to be wrong calls — you're leaving money on the table by skipping good signals.`);
      } else if (rejAcc > 65) {
        flags.push(`Strong rejection instinct: ${rejAcc.toFixed(0)}% of your rejections avoided bad trades — your filter is working.`);
      }
    }
  }

  // Modification pattern
  const modifications = resolved.filter(r => r.userDecision === "MODIFIED");
  if (modifications.length >= 2) {
    const modCorrect = modifications.filter(r => r.userWasCorrect === 1);
    const modAcc = (modCorrect.length / modifications.length) * 100;
    if (modAcc > 60) {
      flags.push(`Modification instinct: ${modAcc.toFixed(0)}% of your size modifications were correct — your position sizing adjustments are adding value.`);
    }
  }

  // Day count context
  if (daysActive < 7) {
    flags.push(`Day ${daysActive} of 90. Your behavioral profile is still forming — patterns will become clearer after 14+ days and 20+ decisions.`);
  }

  if (flags.length === 0) {
    flags.push("No significant behavioral patterns detected yet. Continue making decisions to build your profile.");
  }

  return flags;
}

// ── Main resolution function ──────────────────────────────────────────────────
export async function runEODResolution(): Promise<{ resolved: number; errors: string[] }> {
  const errors: string[] = [];
  let resolved = 0;

  const unresolved = storage.getUnresolvedDecided();
  if (unresolved.length === 0) return { resolved: 0, errors: [] };

  // Fetch closing prices for all tickers at once
  const tickers = [...new Set(unresolved.map(r => r.ticker))];
  let bars: Record<string, any> = {};
  try {
    bars = await getLatestBars(tickers);
  } catch (e: any) {
    errors.push(`Price fetch failed: ${e.message}`);
    return { resolved, errors };
  }

  for (const rec of unresolved) {
    const bar = bars[rec.ticker];
    if (!bar) { errors.push(`No price data for ${rec.ticker}`); continue; }

    const closePrice = bar.c;
    const entryPrice = rec.priceAtRecommendation;
    const aiCorrect = wasAiCorrect(rec.action, entryPrice, closePrice) ? 1 : 0;
    const userCorrect = wasUserCorrect(rec.userDecision!, aiCorrect === 1) ? 1 : 0;

    const outcomePct = ((closePrice - entryPrice) / entryPrice) * 100 * (rec.action === "SELL" ? -1 : 1);
    const actualShares = rec.modifiedShares ?? rec.shares;

    // Actual P&L: only for approved/modified trades
    let outcomePnl = 0;
    if (rec.userDecision === "APPROVED" || rec.userDecision === "MODIFIED") {
      outcomePnl = round2((closePrice - entryPrice) * actualShares * (rec.action === "SELL" ? -1 : 1));
    }

    // Phantom P&L: what the AI's recommended trade WOULD have made
    const phantomPnl = round2((closePrice - entryPrice) * rec.shares * (rec.action === "SELL" ? -1 : 1));

    storage.resolveRecommendation(rec.id, closePrice, outcomePct, outcomePnl, phantomPnl, aiCorrect, userCorrect);
    resolved++;
  }

  return { resolved, errors };
}

// ── Trust Score calculator ────────────────────────────────────────────────────
export async function recalculateTrustScore(): Promise<void> {
  const session = storage.getBetaSession();
  if (!session) return;

  const daysActive = calcDaysActive(session.startDate);
  storage.updateDaysActive(daysActive);

  const allRecs = storage.getRecommendations(500);
  const decided = allRecs.filter(r => r.userDecision);
  const resolved = allRecs.filter(r => r.resolvedAt);

  const totalDecisions = decided.length;
  const approved = decided.filter(r => r.userDecision === "APPROVED" || r.userDecision === "MODIFIED");
  const approvalRate = totalDecisions > 0 ? (approved.length / totalDecisions) * 100 : 0;

  // Win rates (only from resolved)
  const resolvedDecided = resolved.filter(r => r.userDecision);
  const aiWins = resolvedDecided.filter(r => r.aiWasCorrect === 1);
  const userWins = resolvedDecided.filter(r => r.userWasCorrect === 1);
  const aiWinRate = resolvedDecided.length > 0 ? (aiWins.length / resolvedDecided.length) * 100 : 0;
  const userWinRate = resolvedDecided.length > 0 ? (userWins.length / resolvedDecided.length) * 100 : 0;

  // Trust score: composite of engagement quality + performance relative to AI
  // Scale: 0–100. Components:
  //   40pts: engagement — approval rate (capped at 70% to avoid blind-approval gaming)
  //           + decision volume (up to 10pts for 10+ decisions)
  //           + win-rate quality gate (up to 10pts)
  //   60pts: performance (user win rate relative to AI, once 5+ resolved decisions)
  const engagementScore = Math.min(40,
    (Math.min(approvalRate, 70) / 70) * 20 +                           // 20pts: 0–70% approval
    Math.min(10, totalDecisions) +                                       // 10pts: 1pt per decision up to 10
    (resolvedDecided.length >= 5 ? Math.min(10, (userWinRate / 60) * 10) : 0) // 10pts: win rate quality
  );
  const performanceScore = resolvedDecided.length >= 5
    ? Math.min(60, (userWinRate / 100) * 60)
    : 30; // neutral 30 until enough data
  const trustScore = round2(engagementScore + performanceScore);

  // ROI delta vs SPY
  let portfolioReturn = 0;
  let benchmarkReturn = 0;
  let roiDelta = 0;

  try {
    const account = await getAccount();
    const currentEquity = parseFloat(account.equity);
    portfolioReturn = round2(((currentEquity - session.startEquity) / session.startEquity) * 100);

    const spyBars = await getLatestBars(["SPY"]);
    const spyNow = spyBars["SPY"]?.c ?? session.benchmarkStartPrice;
    benchmarkReturn = round2(((spyNow - session.benchmarkStartPrice) / session.benchmarkStartPrice) * 100);
    roiDelta = round2(portfolioReturn - benchmarkReturn);
  } catch (e) {
    console.error("ROI calc error:", e);
  }

  // Quadrant logic
  const highTrust = trustScore >= 55;
  const positiveRoi = roiDelta >= 0;
  let quadrant = "";
  if (highTrust && positiveRoi) quadrant = "HIGH_TRUST_POS";
  else if (highTrust && !positiveRoi) quadrant = "HIGH_TRUST_NEG";
  else if (!highTrust && positiveRoi) quadrant = "LOW_TRUST_POS";
  else quadrant = "LOW_TRUST_NEG";

  // Subscription verdict
  let verdict = "";
  let recommendation = "";
  if (quadrant === "HIGH_TRUST_POS") {
    verdict = "JUSTIFIED";
    recommendation = `Strong alignment with AI signals and positive ROI delta of +${Math.abs(roiDelta).toFixed(1)}%. The platform is delivering value. Consider upgrading to access deeper research signals.`;
  } else if (quadrant === "HIGH_TRUST_NEG") {
    verdict = "UNDER_REVIEW";
    recommendation = `You're following AI signals but ROI is ${roiDelta.toFixed(1)}% vs S&P 500. The AI's signals need recalibration for current market conditions. Subscription held at current rate — 30-day recalibration window in effect.`;
  } else if (quadrant === "LOW_TRUST_POS") {
    verdict = "MARGINAL";
    recommendation = `Your results are positive (+${Math.abs(roiDelta).toFixed(1)}% vs benchmark) but driven largely by your own instincts (${approvalRate.toFixed(0)}% approval rate). Consider using AI as a blind-spot checker — downgrade to research-only tier or increase engagement with high-confidence signals.`;
  } else {
    verdict = "UNDER_REVIEW";
    recommendation = `Both engagement (${approvalRate.toFixed(0)}% approval) and results (${roiDelta.toFixed(1)}% vs S&P) need improvement. The Trust Building Program is available: focus on High-confidence signals only for the next 14 days.`;
  }

  // Not enough data yet — be honest
  if (totalDecisions < 5) {
    verdict = "FORMING";
    recommendation = `Day ${daysActive} of 90 — ${totalDecisions} decision${totalDecisions !== 1 ? "s" : ""} recorded so far. Generate signals and make decisions to start building your Trust Score. Patterns emerge after 10+ decisions.`;
  }

  // Auto-trade ROI (exception engine trades — isAutoTrade === 1)
  const autoTrades = resolved.filter(r => r.isAutoTrade === 1);
  const autoTradeCount = autoTrades.length;
  const autoTradeWins = autoTrades.filter(r => r.aiWasCorrect === 1).length;
  const autoTradeWinRate = autoTradeCount > 0 ? round2((autoTradeWins / autoTradeCount) * 100) : 0;
  const autoTradeRoi = autoTradeCount > 0
    ? round2(autoTrades.reduce((s, r) => s + (r.outcomePnl ?? r.phantomPnl ?? 0), 0))
    : 0;

  storage.upsertTrustMetrics({
    trustScore,
    roiDelta,
    portfolioReturn,
    benchmarkReturn,
    quadrant,
    subscriptionVerdict: verdict,
    subscriptionRecommendation: recommendation,
    approvalRate: round2(approvalRate),
    aiWinRate: round2(aiWinRate),
    userWinRate: round2(userWinRate),
    totalDecisions,
    daysActive,
    autoTradeCount,
    autoTradeWins,
    autoTradeRoi,
    autoTradeWinRate,
    updatedAt: new Date().toISOString(),
  });
}

// ── Daily AAR generator ───────────────────────────────────────────────────────
export async function generateDailyAAR(): Promise<AfterActionReport | null> {
  const session = storage.getBetaSession();
  // Use ET date to match when US markets actually trade — prevents UTC-midnight
  // boundary from splitting a trading day across two AAR records.
  const todayET    = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // "YYYY-MM-DD"
  const startOfDay = `${todayET}T00:00:00.000Z`;
  const endOfDay   = `${todayET}T23:59:59.999Z`;

  const allRecs    = storage.getRecommendations(500);
  // Filter by ET date prefix so decisions made after midnight UTC (but same ET day) are included
  const todayRecs  = allRecs.filter(r => r.decidedAt?.startsWith(todayET));
  const todayResolved = todayRecs.filter(r => r.resolvedAt);

  const total    = todayRecs.length;
  const approved = todayRecs.filter(r => r.userDecision === "APPROVED").length;
  const rejected = todayRecs.filter(r => r.userDecision === "REJECTED").length;
  const modified = todayRecs.filter(r => r.userDecision === "MODIFIED").length;
  const aiCorrect   = todayResolved.filter(r => r.aiWasCorrect === 1).length;
  const userCorrect = todayResolved.filter(r => r.userWasCorrect === 1).length;

  // Don't store a fabricated AAR if there's nothing to report today
  if (total === 0 && todayResolved.length === 0) {
    console.log("[AAR] No decisions or resolutions today — skipping daily AAR");
    return null;
  }

  const resolvedCount = todayResolved.length; // intentionally 0 when none resolved
  const aiPct   = resolvedCount > 0 ? round2((aiCorrect   / resolvedCount) * 100) : 0;
  const userPct = resolvedCount > 0 ? round2((userCorrect / resolvedCount) * 100) : 0;

  const actualPnl  = round2(todayResolved.reduce((s, r) => s + (r.outcomePnl ?? 0), 0));
  const phantomPnl = round2(todayResolved.reduce((s, r) => s + (r.phantomPnl ?? 0), 0));

  // Biggest win/miss from today
  const resolvedApproved = todayResolved.filter(r => r.userDecision !== "REJECTED" && (r.outcomePnl ?? 0) > 0);
  const resolvedMisses = todayResolved.filter(r => r.userDecision === "REJECTED" && (r.phantomPnl ?? 0) > 0);
  const biggestWin = resolvedApproved.sort((a, b) => (b.outcomePnl ?? 0) - (a.outcomePnl ?? 0))[0] ?? null;
  const biggestMiss = resolvedMisses.sort((a, b) => (b.phantomPnl ?? 0) - (a.phantomPnl ?? 0))[0] ?? null;

  const trust = storage.getTrustMetrics();
  const trustScore = trust?.trustScore ?? 0;
  const roiDelta = trust?.roiDelta ?? 0;

  const daysActive = session ? calcDaysActive(session.startDate) : 1;
  const flags = buildBehavioralFlags(allRecs, daysActive);

  const narrative = buildNarrative({
    period: "today",
    total,
    aiCorrect,
    userCorrect,
    aiPct,
    userPct,
    actualPnl,
    phantomPnl,
    roiDelta,
    trustScore,
    biggestMiss: biggestMiss ? { ticker: biggestMiss.ticker, phantomPnl: biggestMiss.phantomPnl } : null,
    biggestWin: biggestWin ? { ticker: biggestWin.ticker, actualPnl: biggestWin.outcomePnl } : null,
    flags,
  });

  const aar = storage.createAAR({
    reportType: "DAILY",
    periodStart: startOfDay,
    periodEnd: endOfDay,
    dayNumberStart: daysActive,
    dayNumberEnd: daysActive,
    totalRecommendations: total,
    approvedCount: approved,
    rejectedCount: rejected,
    modifiedCount: modified,
    autoExecutedCount: 0,
    aiCorrectCount: aiCorrect,
    userCorrectCount: userCorrect,
    aiAccuracyPct: aiPct,
    userAccuracyPct: userPct,
    actualPnl,
    phantomPnl,
    roiDelta,
    trustScore,
    behavioralFlags: JSON.stringify(flags),
    biggestMiss: biggestMiss ? JSON.stringify({ ticker: biggestMiss.ticker, phantomPnl: biggestMiss.phantomPnl, reason: biggestMiss.reasoning?.slice(0, 80) }) : null,
    biggestWin: biggestWin ? JSON.stringify({ ticker: biggestWin.ticker, actualPnl: biggestWin.outcomePnl, reason: biggestWin.reasoning?.slice(0, 80) }) : null,
    subscriptionVerdict: trust?.subscriptionVerdict ?? "FORMING",
    narrativeSummary: narrative,
    createdAt: new Date().toISOString(),
  });

  // Also update daily metrics snapshot
  storage.upsertTodayMetrics({
    dayNumber: daysActive,
    totalRecommendations: total,
    approvedCount: approved,
    rejectedCount: rejected,
    modifiedCount: modified,
    aiCorrectToday: aiCorrect,
    userCorrectToday: userCorrect,
    actualPnlToday: actualPnl,
    phantomPnlToday: phantomPnl,
  });

  return aar;
}

// ── Weekly AAR ────────────────────────────────────────────────────────────────
export async function generateWeeklyAAR(): Promise<void> {
  const session = storage.getBetaSession();
  const daysActive = session ? calcDaysActive(session.startDate) : 1;

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const allRecs = storage.getRecommendations(500);
  const weekRecs = allRecs.filter(r => r.decidedAt && r.decidedAt >= weekAgo);
  const weekResolved = weekRecs.filter(r => r.resolvedAt);

  const total = weekRecs.length;
  if (total === 0) return;

  const approved = weekRecs.filter(r => r.userDecision === "APPROVED").length;
  const rejected = weekRecs.filter(r => r.userDecision === "REJECTED").length;
  const modified = weekRecs.filter(r => r.userDecision === "MODIFIED").length;
  const aiCorrect = weekResolved.filter(r => r.aiWasCorrect === 1).length;
  const userCorrect = weekResolved.filter(r => r.userWasCorrect === 1).length;
  const resolvedCount = weekResolved.length || 1;

  const actualPnl = round2(weekResolved.reduce((s, r) => s + (r.outcomePnl ?? 0), 0));
  const phantomPnl = round2(weekResolved.reduce((s, r) => s + (r.phantomPnl ?? 0), 0));
  const aiPct = round2((aiCorrect / resolvedCount) * 100);
  const userPct = round2((userCorrect / resolvedCount) * 100);

  const trust = storage.getTrustMetrics();
  const trustScore = trust?.trustScore ?? 0;
  const roiDelta = trust?.roiDelta ?? 0;

  const resolvedApproved = weekResolved.filter(r => r.userDecision !== "REJECTED" && (r.outcomePnl ?? 0) > 0);
  const resolvedMisses = weekResolved.filter(r => r.userDecision === "REJECTED" && (r.phantomPnl ?? 0) > 0);
  const biggestWin = resolvedApproved.sort((a, b) => (b.outcomePnl ?? 0) - (a.outcomePnl ?? 0))[0] ?? null;
  const biggestMiss = resolvedMisses.sort((a, b) => (b.phantomPnl ?? 0) - (a.phantomPnl ?? 0))[0] ?? null;

  const flags = buildBehavioralFlags(allRecs, daysActive);
  const narrative = buildNarrative({
    period: "this week",
    total, aiCorrect, userCorrect, aiPct, userPct,
    actualPnl, phantomPnl, roiDelta, trustScore,
    biggestMiss: biggestMiss ? { ticker: biggestMiss.ticker, phantomPnl: biggestMiss.phantomPnl } : null,
    biggestWin: biggestWin ? { ticker: biggestWin.ticker, actualPnl: biggestWin.outcomePnl } : null,
    flags,
  });

  storage.createAAR({
    reportType: "WEEKLY",
    periodStart: weekAgo,
    periodEnd: new Date().toISOString(),
    dayNumberStart: Math.max(1, daysActive - 7),
    dayNumberEnd: daysActive,
    totalRecommendations: total,
    approvedCount: approved, rejectedCount: rejected, modifiedCount: modified,
    autoExecutedCount: 0,
    aiCorrectCount: aiCorrect, userCorrectCount: userCorrect,
    aiAccuracyPct: aiPct, userAccuracyPct: userPct,
    actualPnl, phantomPnl, roiDelta, trustScore,
    behavioralFlags: JSON.stringify(flags),
    biggestMiss: biggestMiss ? JSON.stringify({ ticker: biggestMiss.ticker, phantomPnl: biggestMiss.phantomPnl, reason: biggestMiss.reasoning?.slice(0, 80) }) : null,
    biggestWin: biggestWin ? JSON.stringify({ ticker: biggestWin.ticker, actualPnl: biggestWin.outcomePnl, reason: biggestWin.reasoning?.slice(0, 80) }) : null,
    subscriptionVerdict: trust?.subscriptionVerdict ?? "FORMING",
    narrativeSummary: narrative,
    createdAt: new Date().toISOString(),
  });
}

// ── Full EOD pipeline ─────────────────────────────────────────────────────────
export async function runEODPipeline(): Promise<{ resolved: number; errors: string[] }> {
  console.log("[EOD] Starting end-of-day pipeline...");

  // 1. Expire pending recs past their window
  const expired = storage.expireOldRecommendations();
  console.log(`[EOD] Expired ${expired} stale recommendations`);

  // 2. Resolve all decided recs with today's closing prices
  const { resolved, errors } = await runEODResolution();
  console.log(`[EOD] Resolved ${resolved} recommendations`);

  // 3. Recalculate Trust Score + ROI delta
  await recalculateTrustScore();
  console.log("[EOD] Trust Score recalculated");

  // 4. Generate daily AAR
  await generateDailyAAR();
  console.log("[EOD] Daily AAR generated");

  // 5. Generate weekly AAR on Fridays (day 5 of week = Friday)
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek === 5) {
    await generateWeeklyAAR();
    console.log("[EOD] Weekly AAR generated");
  }

  // 6. Anomaly RECALIBRATE check (7-day rolling win rate)
  const recalResult = await checkAnomalyRecalibrate();
  if (recalResult.triggered) {
    console.warn(`[EOD] ⚠️ RECALIBRATE triggered: ${recalResult.reason}`);
  } else {
    console.log(`[EOD] RECALIBRATE check: ${recalResult.reason}`);
  }

  console.log("[EOD] Pipeline complete");
  return { resolved, errors };
}

// ── Anomaly RECALIBRATE check ─────────────────────────────────────────────────────
// Called at the end of EOD pipeline. If AI win rate over the last 7 days falls
// below 35%, write a RECALIBRATE flag to the trust_metrics record so the
// frontend can surface a warning banner. Resets automatically if win rate recovers.
export async function checkAnomalyRecalibrate(): Promise<{ triggered: boolean; reason: string }> {
  try {
    // Gather all resolved recommendations from the last 7 calendar days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoff = sevenDaysAgo.toISOString();

    const all = storage.getRecommendations(500);
    const recent = all.filter(r =>
      r.resolvedAt && r.resolvedAt >= cutoff && r.aiWasCorrect !== null
    );

    if (recent.length < 5) {
      // Not enough data to make a determination
      return { triggered: false, reason: "Insufficient data (< 5 resolved trades in 7 days)" };
    }

    const aiCorrect = recent.filter(r => r.aiWasCorrect === 1).length;
    const aiWinRate7d = (aiCorrect / recent.length) * 100;

    console.log(`[RECALIBRATE] 7d win rate: ${aiWinRate7d.toFixed(1)}% (${aiCorrect}/${recent.length} trades)`);

    if (aiWinRate7d < 35) {
      // Trigger: AI is performing poorly — write RECALIBRATE flag
      const trust = storage.getTrustMetrics();
      if (trust) {
        const recommendation = `⚠️ RECALIBRATE: GateKeeper AI 7-day win rate has dropped to ${aiWinRate7d.toFixed(0)}%. ` +
          `This is below the 35% anomaly threshold. Consider reducing position sizes and waiting for ` +
          `signal conditions to improve before approving new trades.`;
        storage.upsertTrustMetrics({
          ...trust,
          subscriptionRecommendation: recommendation,
          updatedAt: new Date().toISOString(),
        });
      }
      return { triggered: true, reason: `7d win rate ${aiWinRate7d.toFixed(0)}% < 35% threshold` };
    }

    return { triggered: false, reason: `7d win rate ${aiWinRate7d.toFixed(0)}% is within normal range` };
  } catch (e: any) {
    console.error("[RECALIBRATE] Error:", e.message);
    return { triggered: false, reason: "Error during check" };
  }
}

// ── Import type ───────────────────────────────────────────────────────────────
import type { AfterActionReport } from "@shared/schema";
