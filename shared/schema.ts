import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Beta session (Day 1 anchor + config) ────────────────────────────────────
export const betaSession = sqliteTable("beta_session", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startDate: text("start_date").notNull(),       // ISO date string — Day 1
  startEquity: real("start_equity").notNull(),   // account equity on Day 1
  benchmarkStartPrice: real("benchmark_start_price").notNull(), // SPY price on Day 1
  daysActive: integer("days_active").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

// ── Trade recommendations from AI ───────────────────────────────────────────
export const recommendations = sqliteTable("recommendations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  action: text("action").notNull(),              // BUY | SELL | HOLD
  shares: real("shares").notNull(),
  priceAtRecommendation: real("price_at_recommendation").notNull(),
  targetPrice: real("target_price").notNull(),
  stopLoss: real("stop_loss").notNull(),
  confidence: text("confidence").notNull(),      // HIGH | MEDIUM | SPECULATIVE
  reasoning: text("reasoning").notNull(),
  catalysts: text("catalysts").notNull(),        // JSON array
  upsidePercent: real("upside_percent").notNull(),
  downsidePercent: real("downside_percent").notNull(),
  timeHorizon: text("time_horizon").notNull(),
  // Trade classification
  tradeStyle: text("trade_style"),               // DAY | SWING | POSITION
  holdDaysMin: integer("hold_days_min"),          // min days to hold before re-evaluating
  holdDaysMax: integer("hold_days_max"),          // max days to hold (exit window)
  holdUntilDate: text("hold_until_date"),         // ISO date — don't re-evaluate before this
  signalStrength: real("signal_strength"),        // 0–100: how far into conviction zone (stability)
  signalAge: integer("signal_age"),               // hours this signal has been consistent
  isAutoTrade: integer("is_auto_trade").default(0), // 1 = exception engine auto-executed
  status: text("status").notNull().default("PENDING"),
  userDecision: text("user_decision"),
  modifiedShares: real("modified_shares"),
  decisionNote: text("decision_note"),
  decidedAt: text("decided_at"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  // Outcome tracking (shadow portfolio)
  outcomePrice: real("outcome_price"),
  outcomePercent: real("outcome_percent"),
  outcomePnl: real("outcome_pnl"),              // actual P&L (approved trades)
  phantomPnl: real("phantom_pnl"),              // phantom P&L (rejected trades)
  aiWasCorrect: integer("ai_was_correct"),       // 1=yes 0=no (resolved after close)
  userWasCorrect: integer("user_was_correct"),   // 1=yes 0=no
  resolvedAt: text("resolved_at"),
  resolvedPrice: real("resolved_price"),
  alpacaOrderId: text("alpaca_order_id"),
});

// ── Portfolio positions (cached from Alpaca) ────────────────────────────────
export const positions = sqliteTable("positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  shares: real("shares").notNull(),
  avgCost: real("avg_cost").notNull(),
  currentPrice: real("current_price").notNull(),
  marketValue: real("market_value").notNull(),
  unrealizedPnl: real("unrealized_pnl").notNull(),
  unrealizedPct: real("unrealized_pct").notNull(),
  isAutoManaged: integer("is_auto_managed").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

// ── Exception engine rules ───────────────────────────────────────────────────
export const exceptionRules = sqliteTable("exception_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  volatilityThreshold: real("volatility_threshold").notNull().default(5),
  maxAutoTradePercent: real("max_auto_trade_percent").notNull().default(15),
  stopLossPercent: real("stop_loss_percent").notNull().default(3),
  acceptedLossPercent: real("accepted_loss_percent").notNull().default(8),
  profitLockPercent: real("profit_lock_percent").notNull().default(15),
  profitLockSellPercent: real("profit_lock_sell_percent").notNull().default(50),
  isActive: integer("is_active").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

// ── Daily metrics snapshot (one row per calendar day) ───────────────────────
export const dailyMetrics = sqliteTable("daily_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),                  // YYYY-MM-DD
  dayNumber: integer("day_number").notNull(),    // 1–90
  portfolioValue: real("portfolio_value"),
  equityChange: real("equity_change"),           // $ vs previous day
  spyClose: real("spy_close"),                   // SPY close for ROI delta
  totalRecommendations: integer("total_recommendations").notNull().default(0),
  approvedCount: integer("approved_count").notNull().default(0),
  rejectedCount: integer("rejected_count").notNull().default(0),
  modifiedCount: integer("modified_count").notNull().default(0),
  aiCorrectToday: integer("ai_correct_today").notNull().default(0),
  userCorrectToday: integer("user_correct_today").notNull().default(0),
  actualPnlToday: real("actual_pnl_today").notNull().default(0),
  phantomPnlToday: real("phantom_pnl_today").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

// ── After Action Reports ─────────────────────────────────────────────────────
export const afterActionReports = sqliteTable("after_action_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reportType: text("report_type").notNull(),     // DAILY | WEEKLY | MONTHLY
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  dayNumberStart: integer("day_number_start"),
  dayNumberEnd: integer("day_number_end"),
  totalRecommendations: integer("total_recommendations").notNull(),
  approvedCount: integer("approved_count").notNull(),
  rejectedCount: integer("rejected_count").notNull(),
  modifiedCount: integer("modified_count").notNull(),
  autoExecutedCount: integer("auto_executed_count").notNull().default(0),
  aiCorrectCount: integer("ai_correct_count").notNull(),
  userCorrectCount: integer("user_correct_count").notNull(),
  aiAccuracyPct: real("ai_accuracy_pct").notNull(),
  userAccuracyPct: real("user_accuracy_pct").notNull(),
  actualPnl: real("actual_pnl").notNull(),
  phantomPnl: real("phantom_pnl").notNull(),
  roiDelta: real("roi_delta").notNull(),
  trustScore: real("trust_score").notNull(),
  behavioralFlags: text("behavioral_flags").notNull(),  // JSON array
  biggestMiss: text("biggest_miss"),            // JSON object
  biggestWin: text("biggest_win"),              // JSON object
  subscriptionVerdict: text("subscription_verdict"),
  narrativeSummary: text("narrative_summary").notNull(),
  createdAt: text("created_at").notNull(),
});

// ── Trust & subscription metrics (live rolling calculation) ─────────────────
export const trustMetrics = sqliteTable("trust_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  trustScore: real("trust_score").notNull(),
  roiDelta: real("roi_delta").notNull(),         // % vs SPY since Day 1
  portfolioReturn: real("portfolio_return"),     // % return since Day 1
  benchmarkReturn: real("benchmark_return"),     // SPY % return since Day 1
  quadrant: text("quadrant").notNull(),
  subscriptionVerdict: text("subscription_verdict").notNull(),
  subscriptionRecommendation: text("subscription_recommendation").notNull(),
  approvalRate: real("approval_rate").notNull(),
  aiWinRate: real("ai_win_rate").notNull(),
  userWinRate: real("user_win_rate").notNull(),
  totalDecisions: integer("total_decisions").notNull().default(0),
  daysActive: integer("days_active").notNull(),
  // Auto-trade ROI (exception engine trades only)
  autoTradeCount: integer("auto_trade_count").notNull().default(0),
  autoTradeWins: integer("auto_trade_wins").notNull().default(0),
  autoTradeRoi: real("auto_trade_roi").notNull().default(0),  // % P&L from auto trades
  autoTradeWinRate: real("auto_trade_win_rate").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

// ── Sentiment cache (updated every 30 min during market hours) ──────────────
export const sentimentCache = sqliteTable("sentiment_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  score: real("score").notNull(),           // -1 to +1
  label: text("label").notNull(),           // BULLISH | NEUTRAL | BEARISH
  alertLevel: text("alert_level").notNull(), // NONE | WATCH | CAUTION | DANGER
  alertReason: text("alert_reason").notNull(),
  articleCount: integer("article_count").notNull().default(0),
  headlines: text("headlines").notNull(),   // JSON array of strings
  keySignals: text("key_signals").notNull(), // JSON array
  marketAuxScore: real("market_aux_score"),
  updatedAt: text("updated_at").notNull(),
});

// Insert schemas
export const insertBetaSessionSchema = createInsertSchema(betaSession).omit({ id: true });
export const insertRecommendationSchema = createInsertSchema(recommendations).omit({ id: true });
export const insertPositionSchema = createInsertSchema(positions).omit({ id: true });
export const insertExceptionRuleSchema = createInsertSchema(exceptionRules).omit({ id: true });
export const insertDailyMetricsSchema = createInsertSchema(dailyMetrics).omit({ id: true });
export const insertAARSchema = createInsertSchema(afterActionReports).omit({ id: true });
export const insertTrustMetricsSchema = createInsertSchema(trustMetrics).omit({ id: true });

// Types
export type BetaSession = typeof betaSession.$inferSelect;
export type Recommendation = typeof recommendations.$inferSelect;
export type InsertRecommendation = z.infer<typeof insertRecommendationSchema>;
export type Position = typeof positions.$inferSelect;
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type ExceptionRule = typeof exceptionRules.$inferSelect;
export type InsertExceptionRule = z.infer<typeof insertExceptionRuleSchema>;
export type DailyMetrics = typeof dailyMetrics.$inferSelect;
export type AfterActionReport = typeof afterActionReports.$inferSelect;
export type TrustMetrics = typeof trustMetrics.$inferSelect;
export type InsertTrustMetrics = z.infer<typeof insertTrustMetricsSchema>;

// ── Dismissed alerts (DB-backed so dismissals survive refresh) ─────────────
export const dismissedAlerts = sqliteTable("dismissed_alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  alertKey: text("alert_key").notNull(),       // "{ticker}-{recommendation}" e.g. "AAPL-EXIT_POSITION"
  alertLevel: text("alert_level").notNull(),   // DANGER | HIGH | MEDIUM — re-show if level escalates
  dismissedAt: text("dismissed_at").notNull(),
});

// ── Sentiment history (7-day snapshot for the /sentiment page chart) ────────
export const sentimentHistory = sqliteTable("sentiment_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  score: real("score").notNull(),
  alertLevel: text("alert_level").notNull(),
  snapshotDate: text("snapshot_date").notNull(), // YYYY-MM-DD
  snapshotHour: integer("snapshot_hour").notNull(), // 0–23
  createdAt: text("created_at").notNull(),
});

export const insertDismissedAlertSchema = createInsertSchema(dismissedAlerts).omit({ id: true });
export const insertSentimentHistorySchema = createInsertSchema(sentimentHistory).omit({ id: true });

export type DismissedAlert = typeof dismissedAlerts.$inferSelect;
export type SentimentHistory = typeof sentimentHistory.$inferSelect;
