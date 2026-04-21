/**
 * GateKeeper — Trailing Stop Engine
 *
 * Every 15 minutes during market hours:
 * 1. Fetch live prices for all positions with an active stop
 * 2. If price > high-water mark → raise floor by trailPct (lock in gains)
 * 3. If price <= floor → escalate that ticker to DANGER in sentiment cache
 *    and return it as a breached ticker (triggers notification)
 */

import { getLatestBars } from "./alpaca";
import { storage } from "./storage";

export interface StopCheckResult {
  breached: string[];       // tickers that fell through their floor
  raised: string[];         // tickers whose floor was raised (trailing up)
  checked: number;          // total stops evaluated
}

export async function checkAllStops(): Promise<StopCheckResult> {
  const result: StopCheckResult = { breached: [], raised: [], checked: 0 };

  const activeStops = storage.getActiveStops();
  if (!activeStops.length) return result;

  const tickers = activeStops.map(p => p.ticker);
  let bars: Record<string, any> = {};
  try {
    bars = await getLatestBars(tickers);
  } catch (e) {
    console.error("[TrailingStop] Failed to fetch prices:", e);
    return result;
  }

  for (const pos of activeStops) {
    const bar = bars[pos.ticker];
    if (pos.stopLossFloor == null || pos.trailPct == null || pos.trailHighWaterMark == null) continue;
    // Use live bar price if available, fall back to last synced position price
    const livePrice: number = bar?.c ?? pos.currentPrice;
    if (!livePrice) { console.warn(`[TrailingStop] No price available for ${pos.ticker} — skipping`); continue; }
    const floor = pos.stopLossFloor;
    const hwm = pos.trailHighWaterMark;
    const trailPct = pos.trailPct;
    const isShort = pos.shares < 0;

    result.checked++;

    if (isShort) {
      // SHORT position logic:
      // HWM = lowest price seen (best for short). Breach = price rises above ceiling.
      // Trail: as price drops (profit), lower the ceiling to lock in gains.
      if (livePrice < hwm) {
        // New low (profit for short) — lower the ceiling
        const newCeiling = livePrice * (1 + trailPct / 100);
        storage.updateHighWaterMark(pos.ticker, livePrice, newCeiling);
        result.raised.push(pos.ticker);
        console.log(`[TrailingStop] SHORT ${pos.ticker} new low $${livePrice.toFixed(2)} → ceiling lowered to $${newCeiling.toFixed(2)}`);
      } else if (livePrice >= floor) {
        // Price rose above ceiling — breach for short
        result.breached.push(pos.ticker);
        console.warn(`[TrailingStop] BREACH (SHORT): ${pos.ticker} price $${livePrice.toFixed(2)} >= ceiling $${floor.toFixed(2)}`);
        const existing = storage.getSentiment(pos.ticker);
        storage.upsertSentiment({
          ticker: pos.ticker,
          score: existing?.score ?? -0.8,
          label: existing?.label ?? "BEARISH",
          alertLevel: "DANGER",
          alertReason: `Short trailing stop breached — price $${livePrice.toFixed(2)} rose above ceiling $${floor.toFixed(2)}. Consider covering position.`,
          articleCount: existing?.articleCount ?? 0,
          headlines: existing?.headlines ?? [],
          taggedHeadlines: existing?.taggedHeadlines ?? [],
          keySignals: existing?.keySignals ?? [`Stop ceiling breached at $${floor.toFixed(2)}`],
          marketAuxScore: existing?.marketAuxScore ?? null,
          updatedAt: new Date().toISOString(),
        });
      }
    } else {
      // LONG position logic:
      // HWM = highest price seen (best for long). Breach = price drops below floor.
      // Trail: as price rises (profit), raise the floor to lock in gains.
      if (livePrice > hwm) {
        // New high — raise the floor
        const newFloor = livePrice * (1 - trailPct / 100);
        storage.updateHighWaterMark(pos.ticker, livePrice, newFloor);
        result.raised.push(pos.ticker);
        console.log(`[TrailingStop] LONG ${pos.ticker} new HWM $${livePrice.toFixed(2)} → floor raised to $${newFloor.toFixed(2)}`);
      } else if (livePrice <= floor) {
        // Price dropped below floor — breach for long
        result.breached.push(pos.ticker);
        console.warn(`[TrailingStop] BREACH (LONG): ${pos.ticker} price $${livePrice.toFixed(2)} <= floor $${floor.toFixed(2)}`);
        const existing = storage.getSentiment(pos.ticker);
        storage.upsertSentiment({
          ticker: pos.ticker,
          score: existing?.score ?? -0.8,
          label: existing?.label ?? "BEARISH",
          alertLevel: "DANGER",
          alertReason: `Trailing stop breached — price $${livePrice.toFixed(2)} fell below floor $${floor.toFixed(2)}. Consider exiting position.`,
          articleCount: existing?.articleCount ?? 0,
          headlines: existing?.headlines ?? [],
          taggedHeadlines: existing?.taggedHeadlines ?? [],
          keySignals: existing?.keySignals ?? [`Stop floor breached at $${floor.toFixed(2)}`],
          marketAuxScore: existing?.marketAuxScore ?? null,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  return result;
}
