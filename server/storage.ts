import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, gte, lte, isNull, isNotNull } from "drizzle-orm";
import {
  betaSession, recommendations, positions, exceptionRules,
  dailyMetrics, afterActionReports, trustMetrics,
  type BetaSession, type Recommendation, type InsertRecommendation,
  type Position, type InsertPosition, type ExceptionRule, type InsertExceptionRule,
  type DailyMetrics, type AfterActionReport, type InsertAAR,
  type TrustMetrics, type InsertTrustMetrics,
  type DismissedAlert, type SentimentHistory,
} from "@shared/schema";

// Use DATABASE_URL env var for cloud deployments (e.g. Railway volume at /data/gatekeeper.db)
// Falls back to local file for development
const DB_PATH = process.env.DATABASE_URL || "gatekeeper.db";
const sqlite = new Database(DB_PATH);
export const db = drizzle(sqlite);
console.log(`[DB] SQLite opened at: ${DB_PATH}`);

// ── Safety pragmas ────────────────────────────────────────────────────────────
// WAL mode: allows concurrent reads during writes, survives crashes mid-write.
// synchronous=NORMAL: safe on Railway volumes (fsync on WAL checkpoints).
// busy_timeout: wait up to 5s on a write lock instead of throwing SQLITE_BUSY.
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS beta_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_date TEXT NOT NULL,
    start_equity REAL NOT NULL,
    benchmark_start_price REAL NOT NULL,
    days_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL, action TEXT NOT NULL, shares REAL NOT NULL,
    price_at_recommendation REAL NOT NULL, target_price REAL NOT NULL,
    stop_loss REAL NOT NULL, confidence TEXT NOT NULL, reasoning TEXT NOT NULL,
    catalysts TEXT NOT NULL, upside_percent REAL NOT NULL, downside_percent REAL NOT NULL,
    time_horizon TEXT NOT NULL,
    trade_style TEXT, hold_days_min INTEGER, hold_days_max INTEGER,
    hold_until_date TEXT, signal_strength REAL, signal_age INTEGER DEFAULT 0,
    is_auto_trade INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    user_decision TEXT, modified_shares REAL, decision_note TEXT, decided_at TEXT,
    expires_at TEXT NOT NULL, created_at TEXT NOT NULL,
    outcome_price REAL, outcome_percent REAL, outcome_pnl REAL, phantom_pnl REAL,
    ai_was_correct INTEGER, user_was_correct INTEGER,
    resolved_at TEXT, resolved_price REAL, alpaca_order_id TEXT
  );
  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ticker TEXT NOT NULL,
    shares REAL NOT NULL, avg_cost REAL NOT NULL, current_price REAL NOT NULL,
    market_value REAL NOT NULL, unrealized_pnl REAL NOT NULL,
    unrealized_pct REAL NOT NULL, is_auto_managed INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS exception_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ticker TEXT NOT NULL,
    volatility_threshold REAL NOT NULL DEFAULT 5,
    max_auto_trade_percent REAL NOT NULL DEFAULT 15,
    stop_loss_percent REAL NOT NULL DEFAULT 3,
    accepted_loss_percent REAL NOT NULL DEFAULT 8,
    profit_lock_percent REAL NOT NULL DEFAULT 15,
    profit_lock_sell_percent REAL NOT NULL DEFAULT 50,
    is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS daily_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL,
    day_number INTEGER NOT NULL, portfolio_value REAL, equity_change REAL,
    spy_close REAL, total_recommendations INTEGER NOT NULL DEFAULT 0,
    approved_count INTEGER NOT NULL DEFAULT 0, rejected_count INTEGER NOT NULL DEFAULT 0,
    modified_count INTEGER NOT NULL DEFAULT 0,
    ai_correct_today INTEGER NOT NULL DEFAULT 0,
    user_correct_today INTEGER NOT NULL DEFAULT 0,
    actual_pnl_today REAL NOT NULL DEFAULT 0,
    phantom_pnl_today REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS after_action_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, report_type TEXT NOT NULL,
    period_start TEXT NOT NULL, period_end TEXT NOT NULL,
    day_number_start INTEGER, day_number_end INTEGER,
    total_recommendations INTEGER NOT NULL, approved_count INTEGER NOT NULL,
    rejected_count INTEGER NOT NULL, modified_count INTEGER NOT NULL,
    auto_executed_count INTEGER NOT NULL DEFAULT 0,
    ai_correct_count INTEGER NOT NULL, user_correct_count INTEGER NOT NULL,
    ai_accuracy_pct REAL NOT NULL, user_accuracy_pct REAL NOT NULL,
    actual_pnl REAL NOT NULL, phantom_pnl REAL NOT NULL,
    roi_delta REAL NOT NULL, trust_score REAL NOT NULL,
    behavioral_flags TEXT NOT NULL, biggest_miss TEXT, biggest_win TEXT,
    subscription_verdict TEXT, narrative_summary TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS trust_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT, trust_score REAL NOT NULL,
    roi_delta REAL NOT NULL, portfolio_return REAL, benchmark_return REAL,
    quadrant TEXT NOT NULL, subscription_verdict TEXT NOT NULL,
    subscription_recommendation TEXT NOT NULL,
    approval_rate REAL NOT NULL, ai_win_rate REAL NOT NULL,
    user_win_rate REAL NOT NULL, total_decisions INTEGER NOT NULL DEFAULT 0,
    days_active INTEGER NOT NULL,
    auto_trade_count INTEGER NOT NULL DEFAULT 0,
    auto_trade_wins INTEGER NOT NULL DEFAULT 0,
    auto_trade_roi REAL NOT NULL DEFAULT 0,
    auto_trade_win_rate REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
`);

// Sentiment cache table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS sentiment_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL UNIQUE,
    score REAL NOT NULL,
    label TEXT NOT NULL,
    alert_level TEXT NOT NULL DEFAULT 'NONE',
    alert_reason TEXT NOT NULL DEFAULT '',
    article_count INTEGER NOT NULL DEFAULT 0,
    headlines TEXT NOT NULL DEFAULT '[]',
    tagged_headlines TEXT NOT NULL DEFAULT '[]',
    key_signals TEXT NOT NULL DEFAULT '[]',
    market_aux_score REAL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS dismissed_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_key TEXT NOT NULL UNIQUE,
    alert_level TEXT NOT NULL,
    dismissed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sentiment_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    score REAL NOT NULL,
    alert_level TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    snapshot_hour INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Live migrations — add new columns to existing tables if they don't exist
try {
  sqlite.exec(`ALTER TABLE recommendations ADD COLUMN trade_style TEXT`);
} catch {}
try {
  sqlite.exec(`ALTER TABLE recommendations ADD COLUMN hold_days_min INTEGER`);
} catch {}
try {
  sqlite.exec(`ALTER TABLE recommendations ADD COLUMN hold_days_max INTEGER`);
} catch {}
try {
  sqlite.exec(`ALTER TABLE recommendations ADD COLUMN hold_until_date TEXT`);
} catch {}
try {
  sqlite.exec(`ALTER TABLE recommendations ADD COLUMN signal_strength REAL`);
} catch {}
try {
  sqlite.exec(`ALTER TABLE recommendations ADD COLUMN signal_age INTEGER DEFAULT 0`);
} catch {}
try {
  sqlite.exec(`ALTER TABLE recommendations ADD COLUMN is_auto_trade INTEGER DEFAULT 0`);
} catch {}
try {
  sqlite.exec(`ALTER TABLE trust_metrics ADD COLUMN auto_trade_count INTEGER NOT NULL DEFAULT 0`);
} catch {}
try {
  sqlite.exec(`ALTER TABLE trust_metrics ADD COLUMN auto_trade_wins INTEGER NOT NULL DEFAULT 0`);
} catch {}
try {
  sqlite.exec(`ALTER TABLE trust_metrics ADD COLUMN auto_trade_roi REAL NOT NULL DEFAULT 0`);
} catch {}
try {
  sqlite.exec(`ALTER TABLE trust_metrics ADD COLUMN auto_trade_win_rate REAL NOT NULL DEFAULT 0`);
} catch {}
// tagged_headlines column on sentiment_cache (added in Bull/Bear feature)
try { sqlite.exec(`ALTER TABLE sentiment_cache ADD COLUMN tagged_headlines TEXT NOT NULL DEFAULT '[]'`); } catch {}

// Trailing stop columns on positions
try { sqlite.exec(`ALTER TABLE positions ADD COLUMN stop_loss_floor REAL`); } catch {}
try { sqlite.exec(`ALTER TABLE positions ADD COLUMN trail_pct REAL`); } catch {}
try { sqlite.exec(`ALTER TABLE positions ADD COLUMN trail_high_water_mark REAL`); } catch {}
try { sqlite.exec(`ALTER TABLE positions ADD COLUMN stop_active INTEGER NOT NULL DEFAULT 0`); } catch {}

// Deduplicate any existing duplicate ticker rows (keep the most recently updated)
// then create a unique index. Wrapped in try/catch so it's a no-op on clean DBs.
try {
  sqlite.exec(`
    DELETE FROM positions
    WHERE id NOT IN (
      SELECT MAX(id) FROM positions GROUP BY ticker
    )
  `);
} catch {}
try { sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_ticker ON positions(ticker)`); } catch {}

export interface IStorage {
  // Beta session
  getBetaSession(): BetaSession | undefined;
  createBetaSession(startEquity: number, spyPrice: number): BetaSession;
  updateDaysActive(days: number): void;
  // Recommendations
  getRecommendations(limit?: number): Recommendation[];
  getPendingRecommendations(): Recommendation[];
  getRecommendationById(id: number): Recommendation | undefined;
  // P6: hold window — returns active hold entries (APPROVED/RESOLVED) for ticker
  getActiveHoldForTicker(ticker: string): Recommendation | undefined;
  getUnresolvedDecided(): Recommendation[];
  createRecommendation(data: InsertRecommendation): Recommendation;
  updateRecommendationDecision(id: number, decision: string, modifiedShares?: number, note?: string): Recommendation | undefined;
  resolveRecommendation(id: number, resolvedPrice: number, outcomePct: number, outcomePnl: number, phantomPnl: number, aiCorrect: number, userCorrect: number): Recommendation | undefined;
  setAlpacaOrderId(id: number, orderId: string): void;
  expireOldRecommendations(): number;
  // Positions
  getPositions(): Position[];
  upsertPosition(data: InsertPosition): Position;
  // Preserve trailing stop columns on existing rows (use during Alpaca sync)
  upsertPositionPreserveStop(data: InsertPosition): Position;
  deletePosition(ticker: string): void;
  clearPositions(): void;
  // Exception Rules
  getExceptionRules(): ExceptionRule[];
  createExceptionRule(data: InsertExceptionRule): ExceptionRule;
  updateExceptionRule(id: number, data: Partial<InsertExceptionRule>): ExceptionRule | undefined;
  deleteExceptionRule(id: number): void;
  // Daily metrics
  getDailyMetrics(limit?: number): DailyMetrics[];
  upsertTodayMetrics(data: Partial<DailyMetrics>): void;
  // AAR
  getAfterActionReports(type?: string, limit?: number): AfterActionReport[];
  createAAR(data: InsertAAR): AfterActionReport;
  // Trust
  getTrustMetrics(): TrustMetrics | undefined;
  upsertTrustMetrics(data: InsertTrustMetrics): TrustMetrics;
  // Sentiment
  getSentiment(ticker: string): any | undefined;
  getAllSentiment(): any[];
  upsertSentiment(data: any): void;
  // Dismissed alerts (P2 — DB-backed)
  getDismissedAlerts(): DismissedAlert[];
  dismissAlert(alertKey: string, alertLevel: string): void;
  restoreAlert(alertKey: string): void;
  isDismissed(alertKey: string, alertLevel: string): boolean;
  // Sentiment history (P4 — 7-day chart)
  addSentimentSnapshot(ticker: string, score: number, alertLevel: string): void;
  getSentimentHistory(ticker: string, days?: number): SentimentHistory[];
  // Trailing stop monitor
  setStop(ticker: string, floor: number, trailPct: number, currentPrice: number): void;
  updateHighWaterMark(ticker: string, newPrice: number, newFloor: number): void;
  clearStop(ticker: string): void;
  getActiveStops(): Position[];
  // Key-value metadata store
  setMeta(key: string, value: string): void;
  getMeta(key: string): string | null;
}

export class Storage implements IStorage {
  // Beta session
  getBetaSession() {
    return db.select().from(betaSession).get();
  }
  createBetaSession(startEquity: number, spyPrice: number): BetaSession {
    return db.insert(betaSession).values({
      startDate: new Date().toISOString().split("T")[0],
      startEquity,
      benchmarkStartPrice: spyPrice,
      daysActive: 1,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }
  updateDaysActive(days: number) {
    const session = this.getBetaSession();
    if (session) db.update(betaSession).set({ daysActive: days }).where(eq(betaSession.id, session.id)).run();
  }

  // Recommendations
  getRecommendations(limit = 100) {
    return db.select().from(recommendations).orderBy(desc(recommendations.createdAt)).limit(limit).all();
  }
  getPendingRecommendations() {
    return db.select().from(recommendations).where(eq(recommendations.status, "PENDING")).orderBy(desc(recommendations.createdAt)).all();
  }
  getRecommendationById(id: number) {
    return db.select().from(recommendations).where(eq(recommendations.id, id)).get();
  }
  // P6: Check if a ticker is within its approved hold window
  getActiveHoldForTicker(ticker: string): Recommendation | undefined {
    const today = new Date().toISOString().split("T")[0];
    // Find the most recent APPROVED or MODIFIED rec for this ticker that has a holdUntilDate in the future
    const rows = sqlite.prepare(`
      SELECT * FROM recommendations
      WHERE ticker = ?
        AND status IN ('APPROVED', 'MODIFIED')
        AND hold_until_date >= ?
      ORDER BY created_at DESC
      LIMIT 1
    `).all(ticker, today) as any[];
    if (!rows.length) return undefined;
    const r = rows[0];
    // Map snake_case DB columns back to camelCase
    return {
      ...r,
      holdUntilDate: r.hold_until_date,
      priceAtRecommendation: r.price_at_recommendation,
      targetPrice: r.target_price,
      stopLoss: r.stop_loss,
      upsidePercent: r.upside_percent,
      downsidePercent: r.downside_percent,
      timeHorizon: r.time_horizon,
      tradeStyle: r.trade_style,
      holdDaysMin: r.hold_days_min,
      holdDaysMax: r.hold_days_max,
      signalStrength: r.signal_strength,
      signalAge: r.signal_age,
      isAutoTrade: r.is_auto_trade,
      userDecision: r.user_decision,
      resolvedAt: r.resolved_at,
      resolvedPrice: r.resolved_price,
      outcomePct: r.outcome_pct,
      outcomePnl: r.outcome_pnl,
      phantomPnl: r.phantom_pnl,
      aiCorrect: r.ai_correct,
      userCorrect: r.user_correct,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    } as Recommendation;
  }
  getUnresolvedDecided() {
    // Decided (approved/rejected/modified) but not yet resolved at end of day
    return db.select().from(recommendations)
      .where(and(
        isNotNull(recommendations.userDecision),
        isNull(recommendations.resolvedAt)
      ))
      .all();
  }
  createRecommendation(data: InsertRecommendation) {
    return db.insert(recommendations).values(data).returning().get();
  }
  updateRecommendationDecision(id: number, decision: string, modifiedShares?: number, note?: string) {
    const status = decision === "MODIFIED" ? "MODIFIED" : decision === "APPROVED" ? "APPROVED" : "REJECTED";
    return db.update(recommendations).set({
      status, userDecision: decision,
      modifiedShares: modifiedShares ?? null,
      decisionNote: note ?? null,
      decidedAt: new Date().toISOString(),
    }).where(eq(recommendations.id, id)).returning().get();
  }
  resolveRecommendation(id: number, resolvedPrice: number, outcomePct: number, outcomePnl: number, phantomPnl: number, aiCorrect: number, userCorrect: number) {
    return db.update(recommendations).set({
      resolvedPrice, outcomePercent: outcomePct, outcomePnl, phantomPnl,
      aiWasCorrect: aiCorrect, userWasCorrect: userCorrect,
      resolvedAt: new Date().toISOString(),
    }).where(eq(recommendations.id, id)).returning().get();
  }
  setAlpacaOrderId(id: number, orderId: string) {
    db.update(recommendations).set({ alpacaOrderId: orderId }).where(eq(recommendations.id, id)).run();
  }
  expireOldRecommendations() {
    const now = new Date().toISOString();
    const expired = db.select().from(recommendations)
      .where(and(eq(recommendations.status, "PENDING"), lte(recommendations.expiresAt, now)))
      .all();
    for (const r of expired) {
      db.update(recommendations).set({ status: "EXPIRED" }).where(eq(recommendations.id, r.id)).run();
    }
    return expired.length;
  }

  // Positions
  getPositions() { return db.select().from(positions).all(); }
  upsertPosition(data: InsertPosition) {
    const ex = db.select().from(positions).where(eq(positions.ticker, data.ticker)).get();
    if (ex) return db.update(positions).set(data).where(eq(positions.ticker, data.ticker)).returning().get();
    return db.insert(positions).values(data).returning().get();
  }
  // Update market data columns only — NEVER touches stop columns on existing rows.
  // Uses SQLite ON CONFLICT(ticker) DO UPDATE so the operation is atomic —
  // concurrent syncPositions() calls cannot create duplicate rows.
  upsertPositionPreserveStop(data: InsertPosition): Position {
    sqlite.prepare(`
      INSERT INTO positions
        (ticker, shares, avg_cost, current_price, market_value,
         unrealized_pnl, unrealized_pct, is_auto_managed, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ticker) DO UPDATE SET
        shares          = excluded.shares,
        avg_cost        = excluded.avg_cost,
        current_price   = excluded.current_price,
        market_value    = excluded.market_value,
        unrealized_pnl  = excluded.unrealized_pnl,
        unrealized_pct  = excluded.unrealized_pct,
        is_auto_managed = excluded.is_auto_managed,
        updated_at      = excluded.updated_at
        -- stop_loss_floor, trail_pct, trail_high_water_mark, stop_active intentionally excluded
    `).run(
      data.ticker, data.shares, data.avgCost, data.currentPrice, data.marketValue,
      data.unrealizedPnl, data.unrealizedPct, data.isAutoManaged, data.updatedAt,
    );
    return db.select().from(positions).where(eq(positions.ticker, data.ticker)).get()!;
  }
  deletePosition(ticker: string): void {
    db.delete(positions).where(eq(positions.ticker, ticker)).run();
  }
  clearPositions() { db.delete(positions).run(); }

  // Exception rules
  getExceptionRules() { return db.select().from(exceptionRules).all(); }
  createExceptionRule(data: InsertExceptionRule) { return db.insert(exceptionRules).values(data).returning().get(); }
  updateExceptionRule(id: number, data: Partial<InsertExceptionRule>) {
    return db.update(exceptionRules).set(data).where(eq(exceptionRules.id, id)).returning().get();
  }
  deleteExceptionRule(id: number) { db.delete(exceptionRules).where(eq(exceptionRules.id, id)).run(); }

  // Daily metrics
  getDailyMetrics(limit = 90) {
    return db.select().from(dailyMetrics).orderBy(desc(dailyMetrics.date)).limit(limit).all();
  }
  upsertTodayMetrics(data: Partial<DailyMetrics>) {
    const today = new Date().toISOString().split("T")[0];
    const ex = db.select().from(dailyMetrics).where(eq(dailyMetrics.date, today)).get();
    if (ex) {
      db.update(dailyMetrics).set(data).where(eq(dailyMetrics.date, today)).run();
    } else {
      db.insert(dailyMetrics).values({ ...data as any, date: today, createdAt: new Date().toISOString() }).run();
    }
  }

  // AAR
  getAfterActionReports(type?: string, limit = 30) {
    if (type) return db.select().from(afterActionReports).where(eq(afterActionReports.reportType, type)).orderBy(desc(afterActionReports.createdAt)).limit(limit).all();
    return db.select().from(afterActionReports).orderBy(desc(afterActionReports.createdAt)).limit(limit).all();
  }
  createAAR(data: InsertAAR) { return db.insert(afterActionReports).values(data).returning().get(); }

  // Trust
  getTrustMetrics() { return db.select().from(trustMetrics).orderBy(desc(trustMetrics.updatedAt)).get(); }
  upsertTrustMetrics(data: InsertTrustMetrics) {
    const ex = db.select().from(trustMetrics).get();
    if (ex) return db.update(trustMetrics).set(data).where(eq(trustMetrics.id, ex.id)).returning().get();
    return db.insert(trustMetrics).values(data).returning().get();
  }

  // Sentiment — raw SQLite (Drizzle schema not imported here to keep it simple)
  private _parseSentimentRow(r: any) {
    // Safely parse a field that may be a JSON string, double-encoded string, or already an array
    const parseField = (val: any): string[] => {
      if (Array.isArray(val)) return val;
      if (typeof val !== "string" || val === "") return [];
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
        // Double-encoded: JSON.parse again
        if (typeof parsed === "string") {
          const inner = JSON.parse(parsed);
          return Array.isArray(inner) ? inner : [];
        }
        return [];
      } catch { return []; }
    };
    const parseTaggedHeadlines = (val: any): any[] => {
      if (Array.isArray(val)) return val;
      if (typeof val !== "string" || val === "") return [];
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    };
    return {
      ticker: r.ticker,
      score: r.score,
      label: r.label,
      alertLevel: r.alert_level,
      alertReason: r.alert_reason,
      articleCount: r.article_count,
      headlines: parseField(r.headlines),
      taggedHeadlines: parseTaggedHeadlines(r.tagged_headlines),
      keySignals: parseField(r.key_signals),
      marketAuxScore: r.market_aux_score,
      updatedAt: r.updated_at,
    };
  }
  getSentiment(ticker: string): any | undefined {
    const row = sqlite.prepare("SELECT * FROM sentiment_cache WHERE ticker = ?").get(ticker) as any;
    return row ? this._parseSentimentRow(row) : undefined;
  }
  getAllSentiment(): any[] {
    const rows = sqlite.prepare("SELECT * FROM sentiment_cache ORDER BY updated_at DESC").all() as any[];
    return rows.map(r => this._parseSentimentRow(r));
  }
  upsertSentiment(data: any): void {
    const ex = sqlite.prepare("SELECT id FROM sentiment_cache WHERE ticker = ?").get(data.ticker);
    const taggedHeadlinesJson = JSON.stringify(data.taggedHeadlines ?? []);
    if (ex) {
      sqlite.prepare(`UPDATE sentiment_cache SET score=?, label=?, alert_level=?, alert_reason=?,
        article_count=?, headlines=?, tagged_headlines=?, key_signals=?, market_aux_score=?, updated_at=? WHERE ticker=?`
      ).run(
        data.score, data.label, data.alertLevel, data.alertReason,
        data.articleCount, JSON.stringify(data.headlines), taggedHeadlinesJson,
        JSON.stringify(data.keySignals), data.marketAuxScore ?? null, data.updatedAt, data.ticker
      );
    } else {
      sqlite.prepare(`INSERT INTO sentiment_cache
        (ticker, score, label, alert_level, alert_reason, article_count, headlines, tagged_headlines, key_signals, market_aux_score, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        data.ticker, data.score, data.label, data.alertLevel, data.alertReason,
        data.articleCount, JSON.stringify(data.headlines), taggedHeadlinesJson,
        JSON.stringify(data.keySignals), data.marketAuxScore ?? null, data.updatedAt
      );
    }
  }

  // ── Dismissed alerts (P2) ────────────────────────────────────────────────
  getDismissedAlerts(): DismissedAlert[] {
    const rows = sqlite.prepare("SELECT * FROM dismissed_alerts ORDER BY dismissed_at DESC").all() as any[];
    return rows.map(r => ({ id: r.id, alertKey: r.alert_key, alertLevel: r.alert_level, dismissedAt: r.dismissed_at })) as DismissedAlert[];
  }
  dismissAlert(alertKey: string, alertLevel: string): void {
    const existing = sqlite.prepare("SELECT id FROM dismissed_alerts WHERE alert_key = ?").get(alertKey);
    if (existing) {
      sqlite.prepare("UPDATE dismissed_alerts SET alert_level = ?, dismissed_at = ? WHERE alert_key = ?")
        .run(alertLevel, new Date().toISOString(), alertKey);
    } else {
      sqlite.prepare("INSERT INTO dismissed_alerts (alert_key, alert_level, dismissed_at) VALUES (?,?,?)")
        .run(alertKey, alertLevel, new Date().toISOString());
    }
  }
  restoreAlert(alertKey: string): void {
    sqlite.prepare("DELETE FROM dismissed_alerts WHERE alert_key = ?").run(alertKey);
  }
  isDismissed(alertKey: string, currentLevel: string): boolean {
    const row = sqlite.prepare("SELECT alert_level FROM dismissed_alerts WHERE alert_key = ?").get(alertKey) as any;
    if (!row) return false;
    // Re-show if the alert has escalated to a more severe level since dismissal
    const levelOrder: Record<string, number> = { NONE: 0, WATCH: 1, MEDIUM: 1, CAUTION: 2, HIGH: 2, DANGER: 3 };
    const dismissed = levelOrder[row.alert_level] ?? 0;
    const current = levelOrder[currentLevel] ?? 0;
    return current <= dismissed; // still dismissed unless it escalated
  }

  // ── Sentiment history (P4) ────────────────────────────────────────────────
  addSentimentSnapshot(ticker: string, score: number, alertLevel: string): void {
    const now = new Date();
    const date = now.toISOString().split("T")[0];
    const hour = now.getUTCHours();
    // Deduplicate — one snapshot per ticker per hour
    const existing = sqlite.prepare(
      "SELECT id FROM sentiment_history WHERE ticker = ? AND snapshot_date = ? AND snapshot_hour = ?"
    ).get(ticker, date, hour);
    if (!existing) {
      sqlite.prepare(
        "INSERT INTO sentiment_history (ticker, score, alert_level, snapshot_date, snapshot_hour, created_at) VALUES (?,?,?,?,?,?)"
      ).run(ticker, score, alertLevel, date, hour, now.toISOString());
    }
  }
  getSentimentHistory(ticker: string, days = 7): SentimentHistory[] {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceDate = since.toISOString().split("T")[0];
    const rows = sqlite.prepare(
      "SELECT * FROM sentiment_history WHERE ticker = ? AND snapshot_date >= ? ORDER BY snapshot_date ASC, snapshot_hour ASC"
    ).all(ticker, sinceDate) as any[];
    return rows.map(r => ({
      id: r.id, ticker: r.ticker, score: r.score, alertLevel: r.alert_level,
      snapshotDate: r.snapshot_date, snapshotHour: r.snapshot_hour, createdAt: r.created_at
    })) as SentimentHistory[];
  }

  // ── Trailing Stop Monitor ─────────────────────────────────────────────────
  setStop(ticker: string, floor: number, trailPct: number, currentPrice: number): void {
    sqlite.prepare(`
      UPDATE positions
      SET stop_loss_floor = ?, trail_pct = ?, trail_high_water_mark = ?, stop_active = 1
      WHERE ticker = ?
    `).run(floor, trailPct, currentPrice, ticker);
  }
  updateHighWaterMark(ticker: string, newPrice: number, newFloor: number): void {
    sqlite.prepare(`
      UPDATE positions
      SET trail_high_water_mark = ?, stop_loss_floor = ?
      WHERE ticker = ? AND stop_active = 1
    `).run(newPrice, newFloor, ticker);
  }
  clearStop(ticker: string): void {
    sqlite.prepare(`
      UPDATE positions
      SET stop_loss_floor = NULL, trail_pct = NULL, trail_high_water_mark = NULL, stop_active = 0
      WHERE ticker = ?
    `).run(ticker);
  }
  getActiveStops(): Position[] {
    const rows = sqlite.prepare(`
      SELECT * FROM positions WHERE stop_active = 1
    `).all() as any[];
    return rows.map(r => ({
      id: r.id, ticker: r.ticker, shares: r.shares, avgCost: r.avg_cost,
      currentPrice: r.current_price, marketValue: r.market_value,
      unrealizedPnl: r.unrealized_pnl, unrealizedPct: r.unrealized_pct,
      isAutoManaged: r.is_auto_managed, updatedAt: r.updated_at,
      stopLossFloor: r.stop_loss_floor, trailPct: r.trail_pct,
      trailHighWaterMark: r.trail_high_water_mark, stopActive: r.stop_active,
    })) as Position[];
  }

  setMeta(key: string, value: string): void {
    sqlite.prepare(`INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, value, new Date().toISOString());
  }

  getMeta(key: string): string | null {
    const row = sqlite.prepare("SELECT value FROM app_kv WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }
}

export const storage = new Storage();
