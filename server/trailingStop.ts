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
    if (!bar || !pos.stopLossFloor || !pos.trailPct || !pos.trailHighWaterMark) continue;

    const livePrice = bar.c;           // close price from latest bar
    const floor = pos.stopLossFloor;
    const hwm = pos.trailHighWaterMark;
    const trailPct = pos.trailPct;

    result.checked++;

    if (livePrice > hwm) {
      // Price made a new high — raise the floor
      const newFloor = livePrice * (1 - trailPct / 100);
      storage.updateHighWaterMark(pos.ticker, livePrice, newFloor);
      result.raised.push(pos.ticker);
      console.log(
        `[TrailingStop] ${pos.ticker} new HWM $${livePrice.toFixed(2)} → floor raised to $${newFloor.toFixed(2)}`
      );
    } else if (livePrice <= floor) {
      // Price breached the floor — escalate to DANGER
      result.breached.push(pos.ticker);
      console.warn(
        `[TrailingStop] BREACH: ${pos.ticker} price $${livePrice.toFixed(2)} <= floor $${floor.toFixed(2)}`
      );

      // Escalate in sentiment cache so the Dashboard shows the DANGER alert
      const existing = storage.getSentiment(pos.ticker);
      storage.upsertSentiment({
        ticker: pos.ticker,
        score: existing?.score ?? -0.8,
        label: existing?.label ?? "BEARISH",
        alertLevel: "DANGER",
        alertReason: `Trailing stop breached — price $${livePrice.toFixed(2)} fell below floor $${floor.toFixed(2)}. Consider exiting position.`,
        articleCount: existing?.articleCount ?? 0,
        headlines: existing?.headlines ?? [],
        keySignals: existing?.keySignals ?? [`Stop floor breached at $${floor.toFixed(2)}`],
        marketAuxScore: existing?.marketAuxScore ?? null,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return result;
}
