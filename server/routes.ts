import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import {
  getAccount, getClock, getPositions, getLatestBars,
  generateSignals, placeOrder, getOrders, closePosition
} from "./alpaca";
import {
  runEODPipeline, recalculateTrustScore, generateDailyAAR, checkAnomalyRecalibrate
} from "./engine";
import { detectEarningsProximity } from "./earnings";
import { analyzeSentiment, evaluateSafetyNet } from "./sentiment";
import { checkAllStops } from "./trailingStop";

// ── Bootstrap: initialize beta session on first run ──────────────────────────
async function initBetaSession() {
  const existing = storage.getBetaSession();
  if (existing) return existing;

  console.log("[INIT] Starting Day 1 — initializing beta session...");
  try {
    const account = await getAccount();
    const equity = parseFloat(account.equity);
    const spyBars = await getLatestBars(["SPY"]);
    const spyPrice = spyBars["SPY"]?.c ?? 500;

    const session = storage.createBetaSession(equity, spyPrice);
    console.log(`[INIT] Beta session created. Day 1. Equity: $${equity}. SPY: $${spyPrice}`);

    // Initialize trust metrics with Day 1 state
    storage.upsertTrustMetrics({
      trustScore: 0,
      roiDelta: 0,
      portfolioReturn: 0,
      benchmarkReturn: 0,
      quadrant: "LOW_TRUST_POS",
      subscriptionVerdict: "FORMING",
      subscriptionRecommendation: "Day 1 of 90 — your 90-day evaluation has started. Generate signals and make decisions to begin building your Trust Score. The platform will track every recommendation, whether you approve or reject it.",
      approvalRate: 0,
      aiWinRate: 0,
      userWinRate: 0,
      totalDecisions: 0,
      daysActive: 1,
      updatedAt: new Date().toISOString(),
    });

    return session;
  } catch (e) {
    console.error("[INIT] Failed to initialize beta session:", e);
    return null;
  }
}

// ── Position sync from Alpaca ─────────────────────────────────────────────────
// IMPORTANT: We do NOT call clearPositions() here. Instead we upsert each live
// position while preserving trailing stop columns (stopLossFloor, trailPct,
// trailHighWaterMark, stopActive). Positions that disappear from Alpaca are
// deleted individually so we never wipe stop data on every 60-second poll.
async function syncPositions() {
  try {
    const live = await getPositions();
    const liveTickers = new Set(live.map(p => p.symbol));

    // Upsert each live position — preserve stop columns on existing rows
    for (const p of live) {
      storage.upsertPositionPreserveStop({
        ticker: p.symbol,
        shares: parseFloat(p.qty),
        avgCost: parseFloat(p.avg_entry_price),
        currentPrice: parseFloat(p.current_price),
        marketValue: parseFloat(p.market_value),
        unrealizedPnl: parseFloat(p.unrealized_pl),
        unrealizedPct: parseFloat(p.unrealized_plpc) * 100,
        isAutoManaged: 0,
        updatedAt: new Date().toISOString(),
      });
    }

    // Remove positions that are no longer open at Alpaca
    const stored = storage.getPositions();
    for (const sp of stored) {
      if (!liveTickers.has(sp.ticker)) {
        storage.deletePosition(sp.ticker);
      }
    }

    return live.length;
  } catch (e) {
    console.error("[syncPositions] Failed to sync positions from Alpaca:", e);
    return 0;
  }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Initialize on startup
  await initBetaSession().then(session => {
    if (!session) {
      console.error("[INIT] Beta session failed on startup — scheduling retry in 30s");
      setTimeout(async () => {
        const retry = await initBetaSession();
        if (!retry) console.error("[INIT] Retry also failed — check Alpaca connectivity and env vars");
        else console.log("[INIT] Beta session created on retry.");
      }, 30000);
    }
  });
  await syncPositions();

  // Auto-sync positions every 60 seconds
  setInterval(syncPositions, 60000);

  // Auto-expire stale recommendations every 5 minutes
  setInterval(() => storage.expireOldRecommendations(), 300000);

  // Auto-recalculate trust score every 15 minutes
  setInterval(async () => {
    try { await recalculateTrustScore(); } catch {}
  }, 900000);

  // Auto-refresh sentiment every 30 minutes
  setInterval(async () => {
    try {
      const pending = storage.getPendingRecommendations();
      const positions = storage.getPositions();
      const tickers = [...new Set([
        ...pending.map(r => r.ticker),
        ...positions.map(p => p.ticker),
        "NVDA", "TSLA", "MSFT", "AMD", "AAPL", "META", "AMZN", "GOOGL",
      ])];
      const results = await analyzeSentiment(tickers);
      for (const s of results) {
        storage.upsertSentiment({
          ticker: s.ticker, score: s.score, label: s.label, alertLevel: s.alertLevel,
          alertReason: s.alertReason, articleCount: s.articleCount,
          headlines: s.headlines, taggedHeadlines: s.taggedHeadlines ?? [],
          keySignals: s.keySignals, marketAuxScore: s.marketAuxScore ?? null, updatedAt: s.updatedAt,
        });
      }
      console.log(`[SENTIMENT] Refreshed ${results.length} tickers`);
    } catch (e) {
      console.error("[SENTIMENT] Auto-refresh error:", e);
    }
  }, 1800000); // 30 minutes

  // ── Beta session & status ────────────────────────────────────────────────
  app.get("/api/session", (_req, res) => {
    const session = storage.getBetaSession();
    if (!session) return res.json({ day: 1, startDate: null, initialized: false });
    const daysActive = Math.max(1, Math.floor((Date.now() - new Date(session.startDate).getTime()) / 86400000) + 1);
    res.json({
      ...session,
      daysActive,
      daysRemaining: Math.max(0, 90 - daysActive),
      progressPct: Math.min(100, (daysActive / 90) * 100),
      initialized: true,
    });
  });

  // ── Alpaca account & market ──────────────────────────────────────────────
  app.get("/api/alpaca/account", async (_req, res) => {
    try { res.json(await getAccount()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/alpaca/clock", async (_req, res) => {
    try { res.json(await getClock()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/alpaca/orders", async (_req, res) => {
    try { res.json(await getOrders()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Live positions ────────────────────────────────────────────────────────
  app.get("/api/positions", (_req, res) => {
    res.json(storage.getPositions());
  });

  app.post("/api/positions/sync", async (_req, res) => {
    const count = await syncPositions();
    res.json({ synced: count });
  });

  // ── Live market prices ────────────────────────────────────────────────────
  app.get("/api/market/prices", async (req, res) => {
    try {
      const symbols = (req.query.symbols as string)?.split(",") || undefined;
      res.json(await getLatestBars(symbols));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Signal generation ─────────────────────────────────────────────────────
  app.post("/api/signals/generate", async (_req, res) => {
    try {
      const account = await getAccount();
      const equity = parseFloat(account.equity);
      const signals = await generateSignals(equity);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 4 * 3600000).toISOString();
      const created: any[] = [];

      // P7: fetch earnings proximity flags for all tickers at once
      const earningsFlags = await detectEarningsProximity(signals.map(s => s.ticker));

      for (const sig of signals) {
        // P6: Skip if ticker is within an active approved hold window
        const activeHold = storage.getActiveHoldForTicker(sig.ticker);
        if (activeHold) {
          console.log(`[P6] Skipping ${sig.ticker} signal — within hold window until ${activeHold.holdUntilDate}`);
          continue;
        }

        const existing = storage.getPendingRecommendations().find(r => r.ticker === sig.ticker);
        if (existing) continue;

        // P7: Attach earnings flag to signal reasoning if detected
        const earningsFlag = earningsFlags[sig.ticker];
        let reasoning = sig.reasoning;
        let catalysts = sig.catalysts;
        if (earningsFlag) {
          reasoning = `⚠️ EARNINGS PROXIMITY (${earningsFlag.daysOut === 0 ? 'today' : `~${earningsFlag.daysOut}d`}): ${earningsFlag.note} | ` + reasoning;
          catalysts = [`Earnings alert: ${earningsFlag.note}`, ...catalysts];
        }

        const rec = storage.createRecommendation({
          ticker: sig.ticker, action: sig.action, shares: sig.shares,
          priceAtRecommendation: sig.priceAtRecommendation,
          targetPrice: sig.targetPrice, stopLoss: sig.stopLoss,
          confidence: sig.confidence, reasoning,
          catalysts: JSON.stringify(catalysts),
          upsidePercent: sig.upsidePercent, downsidePercent: sig.downsidePercent,
          timeHorizon: sig.timeHorizon,
          tradeStyle: sig.tradeStyle,
          holdDaysMin: sig.holdDaysMin,
          holdDaysMax: sig.holdDaysMax,
          holdUntilDate: sig.holdUntilDate,
          signalStrength: sig.signalStrength,
          signalAge: 0,
          isAutoTrade: 0,
          status: "PENDING",
          expiresAt, createdAt: now.toISOString(),
        });
        created.push(rec);
      }

      const result = { generated: signals.length, stored: created.length, signals: created, scannedAt: new Date().toISOString() };
      // Persist last scan metadata so the UI can show cooldown across page refreshes
      storage.setMeta("last_scan", JSON.stringify({ scannedAt: result.scannedAt, generated: signals.length, stored: created.length }));
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/signals/last-scan — returns metadata from the most recent scan
  app.get("/api/signals/last-scan", (_req, res) => {
    try {
      const raw = storage.getMeta("last_scan");
      if (!raw) return res.json({ scannedAt: null, generated: 0, stored: 0 });
      res.json(JSON.parse(raw));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Execute trade on Alpaca ───────────────────────────────────────────────
  app.post("/api/alpaca/execute", async (req, res) => {
    try {
      const { recommendationId } = req.body;
      const rec = storage.getRecommendationById(recommendationId);
      if (!rec) return res.status(404).json({ error: "Not found" });
      if (rec.status !== "APPROVED" && rec.status !== "MODIFIED") {
        return res.status(400).json({ error: "Not approved" });
      }
      const qty = rec.modifiedShares ?? rec.shares;
      const side = rec.action === "BUY" ? "buy" : "sell";
      const order = await placeOrder({
        symbol: rec.ticker, qty, side,
        type: "market", time_in_force: "day",
        client_order_id: `gk-rec-${rec.id}-${Date.now()}`,
      });
      // Store the order ID so we can track it
      if (order?.id) storage.setAlpacaOrderId(rec.id, order.id);
      res.json({ order, recommendation: rec });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Recommendations ───────────────────────────────────────────────────────
  app.get("/api/recommendations", (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    res.json(storage.getRecommendations(limit));
  });

  app.get("/api/recommendations/pending", (_req, res) => {
    res.json(storage.getPendingRecommendations());
  });

  app.post("/api/recommendations/:id/decide", async (req, res) => {
    const id = parseInt(req.params.id);
    const { decision, modifiedShares, note } = req.body;
    const updated = storage.updateRecommendationDecision(id, decision, modifiedShares, note);
    if (!updated) return res.status(404).json({ error: "Not found" });

    // If approved/modified, place the Alpaca order atomically.
    // On failure, roll back to PENDING so the user can retry —
    // prevents "APPROVED but never traded" from corrupting the trust score.
    let order = null;
    if (decision === "APPROVED" || decision === "MODIFIED") {
      try {
        const qty  = updated.modifiedShares ?? updated.shares;
        const side = updated.action === "BUY" ? "buy" : "sell";

        // Guard: don’t create an unintended short on a SELL decision
        if (side === "sell") {
          const livePositions = await getPositions();
          const hasPosition   = livePositions.some(
            p => p.symbol === updated.ticker && parseFloat(p.qty) > 0
          );
          if (!hasPosition) {
            storage.updateRecommendationDecision(id, "PENDING");
            return res.status(400).json({
              error: `No long position in ${updated.ticker}. Executing would create an unintended short. Decision rolled back to PENDING.`,
            });
          }
        }

        order = await placeOrder({
          symbol: updated.ticker, qty, side,
          type: "market", time_in_force: "day",
          client_order_id: `gk-rec-${updated.id}-${Date.now()}`,
        });
        if (order?.id) storage.setAlpacaOrderId(updated.id, order.id);
      } catch (e: any) {
        console.error(`[execute] Order failed for rec ${id}:`, e.message);
        // Roll back — let the user retry rather than recording a phantom trade
        storage.updateRecommendationDecision(id, "PENDING");
        return res.status(502).json({
          error: `Decision recorded but Alpaca order failed: ${e.message}. Decision rolled back to PENDING — please try again.`,
        });
      }
    }

    // Recalculate trust score after every decision
    try { await recalculateTrustScore(); } catch {}

    res.json({ updated, order });
  });

  // ── End-of-day pipeline (manual trigger + auto at 4:30pm ET) ────────────
  app.post("/api/engine/eod", async (_req, res) => {
    try {
      const result = await runEODPipeline();
      await recalculateTrustScore();
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/engine/recalculate", async (_req, res) => {
    try {
      await recalculateTrustScore();
      res.json({ ok: true, trust: storage.getTrustMetrics() });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/engine/recalibrate — manually run the anomaly check
  app.post("/api/engine/recalibrate", async (_req, res) => {
    try {
      const result = await checkAnomalyRecalibrate();
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Exception Rules ───────────────────────────────────────────────────────
  app.get("/api/exception-rules", (_req, res) => {
    res.json(storage.getExceptionRules());
  });
  app.post("/api/exception-rules", (req, res) => {
    res.json(storage.createExceptionRule({ ...req.body, createdAt: new Date().toISOString() }));
  });
  app.patch("/api/exception-rules/:id", (req, res) => {
    const updated = storage.updateExceptionRule(parseInt(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });
  app.delete("/api/exception-rules/:id", (req, res) => {
    storage.deleteExceptionRule(parseInt(req.params.id));
    res.json({ ok: true });
  });

  // ── Daily metrics ─────────────────────────────────────────────────────────
  app.get("/api/metrics/daily", (_req, res) => {
    res.json(storage.getDailyMetrics());
  });

  // ── After Action Reports ──────────────────────────────────────────────────
  app.get("/api/reports", (req, res) => {
    const type = req.query.type as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 30;
    res.json(storage.getAfterActionReports(type, limit));
  });

  app.post("/api/reports/generate", async (_req, res) => {
    try {
      await recalculateTrustScore();
      const aar = await generateDailyAAR();
      res.json(aar);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Trust Metrics ─────────────────────────────────────────────────────────
  app.get("/api/trust-metrics", (_req, res) => {
    res.json(storage.getTrustMetrics());
  });

  // ── Sentiment engine ─────────────────────────────────────────────────────
  app.get("/api/sentiment", (req, res) => {
    const ticker = req.query.ticker as string | undefined;
    try {
      if (ticker) {
        const s = storage.getSentiment(ticker.toUpperCase());
        return res.json(s ?? null);
      }
      // Return all cached tickers
      const cached = storage.getAllSentiment();
      res.json(cached);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/sentiment/refresh", async (req, res) => {
    try {
      const reqTickers = req.body?.tickers as string[] | undefined;
      const pending = storage.getPendingRecommendations();
      const positions = storage.getPositions();
      const tickers = reqTickers ?? [...new Set([
        ...pending.map(r => r.ticker),
        ...positions.map(p => p.ticker),
        "NVDA", "TSLA", "MSFT", "AMD", "AAPL", "META", "AMZN", "GOOGL",
      ])];
      const results = await analyzeSentiment(tickers);
      for (const s of results) {
        storage.upsertSentiment({
          ticker: s.ticker, score: s.score, label: s.label, alertLevel: s.alertLevel,
          alertReason: s.alertReason, articleCount: s.articleCount,
          headlines: s.headlines, taggedHeadlines: s.taggedHeadlines ?? [],
          keySignals: s.keySignals, marketAuxScore: s.marketAuxScore ?? null, updatedAt: s.updatedAt,
        });
        // Snapshot to history for the 7-day chart (P4)
        storage.addSentimentSnapshot(s.ticker, s.score, s.alertLevel);
      }
      res.json({ refreshed: results.length, tickers: results.map(r => r.ticker), results });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── P2: Dismissed alerts (DB-backed) ────────────────────────────────────────────────
  // GET /api/dismissed-alerts — list all dismissed alert keys
  app.get("/api/dismissed-alerts", (_req, res) => {
    try {
      const rows = storage.getDismissedAlerts();
      res.json(rows.map(r => ({ alertKey: r.alertKey, alertLevel: r.alertLevel, dismissedAt: r.dismissedAt })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/dismissed-alerts { alertKey, alertLevel } — dismiss an alert
  app.post("/api/dismissed-alerts", (req, res) => {
    try {
      const { alertKey, alertLevel } = req.body;
      if (!alertKey || !alertLevel) return res.status(400).json({ error: "alertKey and alertLevel required" });
      storage.dismissAlert(alertKey, alertLevel);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /api/dismissed-alerts/:alertKey — restore (un-dismiss) an alert
  app.delete("/api/dismissed-alerts/:alertKey", (req, res) => {
    try {
      storage.restoreAlert(decodeURIComponent(req.params.alertKey));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── P4: Sentiment history ───────────────────────────────────────────────────────────
  // GET /api/sentiment/history?ticker=NVDA&days=7
  app.get("/api/sentiment/history", (req, res) => {
    try {
      const ticker = (req.query.ticker as string || "").toUpperCase();
      const days = parseInt(req.query.days as string || "7", 10);
      if (!ticker) return res.status(400).json({ error: "ticker param required" });
      const rows = storage.getSentimentHistory(ticker, days);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── P3: Auto-exit (close position via Alpaca) ───────────────────────────────────────────
  // POST /api/positions/:ticker/exit — market sell entire position
  app.post("/api/positions/:ticker/exit", async (req, res) => {
    try {
      const ticker = req.params.ticker.toUpperCase();
      // Liquidate entire position at market via Alpaca
      const result = await closePosition(ticker);
      res.json({ ok: true, order: result });
    } catch (e: any) {
      // Alpaca returns 422 if position doesn't exist
      res.status(422).json({ error: e.message });
    }
  });

  app.get("/api/alerts", async (_req, res) => {
    try {
      const positions = storage.getPositions();
      const pending = storage.getPendingRecommendations();
      // Combine active positions + pending DAY trades for safety-net evaluation
      const evalSet: { ticker: string; tradeStyle: string; currentPrice: number; entryPrice: number; stopLoss: number; targetPrice: number }[] = [];

      for (const pos of positions) {
        // For positions, approximate stop (-5%) and target (+8%) from avg cost
        evalSet.push({
          ticker: pos.ticker,
          tradeStyle: "SWING", // default; override below if we have a matching rec
          currentPrice: pos.currentPrice,
          entryPrice: pos.avgCost,
          stopLoss: pos.avgCost * 0.95,
          targetPrice: pos.avgCost * 1.08,
        });
      }

      // Override with actual stop/target from active recommendations where available
      for (const rec of pending) {
        const existing = evalSet.find(e => e.ticker === rec.ticker);
        if (existing) {
          existing.tradeStyle = rec.tradeStyle ?? "SWING";
          existing.stopLoss   = rec.stopLoss;
          existing.targetPrice = rec.targetPrice;
        } else if (rec.tradeStyle === "DAY") {
          // Include pending DAY trades even without an open position
          evalSet.push({
            ticker: rec.ticker,
            tradeStyle: rec.tradeStyle ?? "DAY",
            currentPrice: rec.priceAtRecommendation,
            entryPrice: rec.priceAtRecommendation,
            stopLoss: rec.stopLoss,
            targetPrice: rec.targetPrice,
          });
        }
      }

      if (evalSet.length === 0) return res.json([]);

      // Fetch sentiment for all relevant tickers (use cache first)
      const tickerSet = evalSet.map(e => e.ticker);
      const cachedSentiments = storage.getAllSentiment();
      const sentMap: Record<string, any> = {};
      for (const s of cachedSentiments) {
        sentMap[s.ticker] = {
          ticker: s.ticker,
          score: s.score,
          label: s.label,
          articleCount: s.articleCount,
          headlines: JSON.parse(s.headlines || "[]"),
          keySignals: JSON.parse(s.keySignals || "[]"),
          marketAuxScore: s.marketAuxScore,
          alertLevel: s.alertLevel,
          alertReason: s.alertReason,
          updatedAt: s.updatedAt,
        };
      }

      const alerts = evalSet.map(e => {
        const sentiment = sentMap[e.ticker] ?? null;
        return evaluateSafetyNet(e, sentiment);
      });

      // Sort by urgency: HIGH first
      const urgencyOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      alerts.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

      res.json(alerts);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Trailing Stop Monitor ────────────────────────────────────────────────

  // GET /api/positions/stops — list all active stops
  app.get("/api/positions/stops", (_req, res) => {
    try {
      res.json(storage.getActiveStops());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/positions/stops/check — manually trigger a stop check
  // MUST be registered BEFORE /:ticker/stop to prevent "stops" matching as :ticker
  app.post("/api/positions/stops/check", async (_req, res) => {
    try {
      const result = await checkAllStops();
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/positions/:ticker/stop — set or update a trailing stop
  // body: { floor: number, trailPct: number }
  app.post("/api/positions/:ticker/stop", (req, res) => {
    try {
      const ticker = req.params.ticker.toUpperCase();
      const { floor, trailPct } = req.body;
      if (floor == null || trailPct == null) {
        return res.status(400).json({ error: "floor and trailPct are required" });
      }
      // Get current position price to seed the high-water mark
      const positions = storage.getPositions();
      const pos = positions.find(p => p.ticker === ticker);
      if (!pos) return res.status(404).json({ error: "Position not found" });

      const currentPrice = pos.currentPrice;
      storage.setStop(ticker, parseFloat(floor), parseFloat(trailPct), currentPrice);
      res.json({ ok: true, ticker, floor: parseFloat(floor), trailPct: parseFloat(trailPct), highWaterMark: currentPrice });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /api/positions/:ticker/stop — cancel a trailing stop
  app.delete("/api/positions/:ticker/stop", (req, res) => {
    try {
      const ticker = req.params.ticker.toUpperCase();
      storage.clearStop(ticker);
      res.json({ ok: true, ticker });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Shadow Portfolio ─────────────────────────────────────────────────────
  // GET /api/shadow — all rejected/expired recs with phantom P&L data
  app.get("/api/shadow", (_req, res) => {
    try {
      const all = storage.getRecommendations(200);
      // Shadow = rejected, expired, or decided but tracking phantom P&L
      const shadow = all.filter(r =>
        r.status === "REJECTED" ||
        r.status === "EXPIRED" ||
        (r.userDecision === "REJECTED" && r.phantomPnl !== null)
      );

      const resolved = shadow.filter(r => r.resolvedAt !== null);
      const totalPhantomPnl = resolved.reduce((sum, r) => sum + (r.phantomPnl ?? 0), 0);
      const aiWins = resolved.filter(r => r.aiWasCorrect === 1).length;
      const aiLosses = resolved.filter(r => r.aiWasCorrect === 0).length;
      const aiAccuracy = (aiWins + aiLosses) > 0 ? (aiWins / (aiWins + aiLosses)) * 100 : 0;

      res.json({
        entries: shadow,
        totalPhantomPnl,
        totalEntries: shadow.length,
        aiWins,
        aiLosses,
        aiAccuracy,
        pendingCount: shadow.filter(r => !r.resolvedAt).length,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Scorecard ─────────────────────────────────────────────────────────────
  // GET /api/scorecard — Growth Score composite
  app.get("/api/scorecard", (_req, res) => {
    try {
      const trust = storage.getTrustMetrics();
      const session = storage.getBetaSession();
      if (!trust || (trust.totalDecisions ?? 0) < 1) {
        return res.status(200).json(null);
      }

      const daysActive = session
        ? Math.max(1, Math.floor((Date.now() - new Date(session.startDate).getTime()) / 86400000) + 1)
        : 1;

      const aiWinRate = trust.aiWinRate ?? 0;
      const userWinRate = trust.userWinRate ?? 0;
      const approvalRate = trust.approvalRate ?? 0;
      const totalDecisions = trust.totalDecisions ?? 0;
      const roiDelta = trust.roiDelta ?? 0;

      // ── Decision Quality (40 pts) ──────────────────────────────────────────
      // Win rate score (0–16): scales from 0% win rate → 0 pts, 60%+ → 16 pts
      const winRateScore = Math.min(16, (userWinRate / 60) * 16);
      // Risk/reward score (0–14): positive ROI delta rewards good sizing
      const riskRewardScore = roiDelta >= 0
        ? Math.min(14, 7 + (roiDelta / 5) * 7)   // above S&P: 7–14
        : Math.max(0, 7 + (roiDelta / 10) * 7);  // below S&P: 0–7
      // Consistency (0–10): based on total decisions made (more data = more confidence)
      const consistencyScore = Math.min(10, (totalDecisions / 30) * 10);
      const decisionQuality = winRateScore + riskRewardScore + consistencyScore;

      // ── Learning Velocity (30 pts) ─────────────────────────────────────────
      // Improvement (0–12): week-over-week win rate trend (use roiDelta as proxy until more history)
      const improvementScore = Math.min(12, Math.max(0, 6 + roiDelta * 1.2));
      // Adaptation (0–10): how much approval rate deviates from extremes (50–60% is ideal)
      const adaptPct = Math.abs(approvalRate - 55);
      const adaptationScore = Math.max(0, 10 - (adaptPct / 5.5) * 10);
      // Streak (0–8): trust score as proxy for consistent correct calls
      const streakScore = Math.min(8, (trust.trustScore / 100) * 8);
      const learningVelocity = improvementScore + adaptationScore + streakScore;

      // ── AI Alignment (30 pts) ──────────────────────────────────────────────
      // Approval alignment (0–12): aligning with GK when GK is right
      const approvalAlignmentScore = Math.min(12, (approvalRate / 100) * 12);
      // Outcome alignment (0–10): user win rate vs AI win rate convergence
      const diffPct = Math.abs(userWinRate - aiWinRate);
      const outcomeAlignmentScore = Math.max(0, 10 - (diffPct / 10) * 10);
      // Calibration (0–8): based on trust score movement direction
      const calibrationScore = Math.min(8, (trust.trustScore / 100) * 8);
      const aiAlignment = approvalAlignmentScore + outcomeAlignmentScore + calibrationScore;

      const growthScore = Math.min(100, decisionQuality + learningVelocity + aiAlignment);

      const grade = growthScore >= 93 ? "A+" : growthScore >= 83 ? "A" :
        growthScore >= 73 ? "B+" : growthScore >= 63 ? "B" :
        growthScore >= 53 ? "C+" : growthScore >= 43 ? "C" :
        growthScore >= 33 ? "D" : "F";

      const gradeLabel = grade.startsWith("A") ? "Excellent — GateKeeper AI alignment is strong" :
        grade.startsWith("B") ? "Good — above average decision quality" :
        grade.startsWith("C") ? "Developing — early stage, improving" :
        "Needs work — focus on following higher-confidence signals";

      res.json({
        growthScore, decisionQuality, learningVelocity, aiAlignment,
        grade, gradeLabel, totalDecisions, approvalRate,
        aiWinRate, userWinRate, roiDelta,
        trustScore: trust.trustScore,
        subscriptionVerdict: trust.subscriptionVerdict,
        daysActive,
        decisionQualityBreakdown: { winRateScore, riskRewardScore, consistencyScore },
        learningVelocityBreakdown: { improvementScore, adaptationScore, streakScore },
        aiAlignmentBreakdown: { approvalAlignmentScore, outcomeAlignmentScore, calibrationScore },
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  return httpServer;
}
