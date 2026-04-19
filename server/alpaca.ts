// Alpaca Paper Trading API integration
const ALPACA_KEY = process.env.ALPACA_KEY || "PKYBFF6MWB5N7PYTLECQMRTKYA";
const ALPACA_SECRET = process.env.ALPACA_SECRET || "9eqijRmKjN8NGX8pNoHXBL2PgdbMEW2LY8EftZ8tvNzw";
const BROKER_BASE = "https://paper-api.alpaca.markets/v2";
const DATA_BASE = "https://data.alpaca.markets/v2";

const headers = {
  "APCA-API-KEY-ID": ALPACA_KEY,
  "APCA-API-SECRET-KEY": ALPACA_SECRET,
  "Content-Type": "application/json",
};

async function alpacaGet(base: string, path: string) {
  const res = await fetch(`${base}${path}`, { headers });
  if (!res.ok) throw new Error(`Alpaca ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function alpacaPost(path: string, body: object) {
  const res = await fetch(`${BROKER_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Alpaca POST ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Account ──────────────────────────────────────────────────────────────────
export async function getAccount() {
  return alpacaGet(BROKER_BASE, "/account");
}

// ── Market clock ─────────────────────────────────────────────────────────────
export async function getClock() {
  return alpacaGet(BROKER_BASE, "/clock");
}

// ── Positions ────────────────────────────────────────────────────────────────
export async function getPositions() {
  return alpacaGet(BROKER_BASE, "/positions") as Promise<AlpacaPosition[]>;
}

// ── Orders ───────────────────────────────────────────────────────────────────
export async function getOrders(status = "all", limit = 20) {
  return alpacaGet(BROKER_BASE, `/orders?status=${status}&limit=${limit}`);
}

export async function placeOrder(params: {
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  type: "market" | "limit";
  time_in_force: "day" | "gtc" | "ioc";
  limit_price?: number;
  client_order_id?: string;
}) {
  return alpacaPost("/orders", params);
}

export async function cancelOrder(orderId: string) {
  const res = await fetch(`${BROKER_BASE}/orders/${orderId}`, {
    method: "DELETE",
    headers,
  });
  return res.status === 204;
}

// Close (liquidate) an entire position at market
export async function closePosition(ticker: string) {
  const res = await fetch(`${BROKER_BASE}/positions/${ticker}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca closePosition ${ticker} → ${res.status}: ${text}`);
  }
  // 200 = order placed, 204 = position already closed
  if (res.status === 204) return { status: "already_flat", ticker };
  return res.json();
}

// ── Market data ──────────────────────────────────────────────────────────────
const WATCHLIST = ["NVDA", "MSFT", "TSLA", "AMD", "AAPL", "META", "AMZN", "GOOGL", "SPY", "QQQ"];

export async function getLatestBars(symbols: string[] = WATCHLIST) {
  const syms = symbols.join(",");
  const data: any = await alpacaGet(DATA_BASE, `/stocks/bars/latest?symbols=${syms}&feed=iex`);
  return data.bars as Record<string, AlpacaBar>;
}

export async function getHistoricalBars(symbol: string, timeframe = "1Day", limit = 60) {
  // Alpaca daily bars require a start date — compute ~limit trading days back
  const start = new Date();
  start.setDate(start.getDate() - Math.round(limit * 1.5)); // buffer for weekends/holidays
  const startStr = start.toISOString().split("T")[0];
  const data: any = await alpacaGet(
    DATA_BASE,
    `/stocks/${symbol}/bars?timeframe=${timeframe}&start=${startStr}&feed=sip&adjustment=raw`
  );
  return (data.bars || []) as AlpacaBar[];
}

// ── Signal engine ─────────────────────────────────────────────────────────────
// Generates real BUY/SELL recommendations from technical analysis on live data.
// This is a rules-based momentum + mean-reversion hybrid signal.

export interface Signal {
  ticker: string;
  action: "BUY" | "SELL";
  shares: number;
  priceAtRecommendation: number;
  targetPrice: number;
  stopLoss: number;
  confidence: "HIGH" | "MEDIUM" | "SPECULATIVE";
  reasoning: string;
  catalysts: string[];
  upsidePercent: number;
  downsidePercent: number;
  timeHorizon: string;
  // Trade classification
  tradeStyle: "DAY" | "SWING" | "POSITION";
  holdDaysMin: number;
  holdDaysMax: number;
  holdUntilDate: string;   // ISO date: don't re-evaluate before this
  signalStrength: number;  // 0–100: how deep into conviction zone
  signalAge: number;       // hours (0 = just generated)
}

// Classify a signal's trade style and hold window based on technical profile
function classifyTrade(action: "BUY" | "SELL", rsiVal: number, fiveDayReturn: number, pctAboveSma20: number, volRatio: number): {
  tradeStyle: "DAY" | "SWING" | "POSITION";
  holdDaysMin: number;
  holdDaysMax: number;
  signalStrength: number;
} {
  // Signal strength: how deep into the conviction zone is this signal?
  // For SELL: RSI threshold is 68. RSI 100 would be 100% strength. Scale 68–100 → 0–100.
  // For BUY: RSI threshold is 40. RSI 0 would be 100% strength. Scale 40–0 → 0–100.
  let signalStrength: number;
  if (action === "SELL") {
    signalStrength = Math.min(100, Math.round(((rsiVal - 68) / 32) * 100));
  } else {
    signalStrength = Math.min(100, Math.round(((40 - rsiVal) / 40) * 100));
  }

  // Trade style classification:
  // DAY: extreme RSI (>85 SELL or <25 BUY) + high volatility (big 5d move) — fast mean reversion expected
  // SWING: moderate RSI + normal extension — pullback over days
  // POSITION: momentum breakout with volume confirmation — trend continuation over weeks
  let tradeStyle: "DAY" | "SWING" | "POSITION";
  let holdDaysMin: number;
  let holdDaysMax: number;

  if (action === "SELL" && rsiVal > 85 && Math.abs(fiveDayReturn) > 10) {
    tradeStyle = "DAY";
    holdDaysMin = 1;
    holdDaysMax = 3;
  } else if (action === "BUY" && rsiVal < 25 && Math.abs(fiveDayReturn) > 10) {
    tradeStyle = "DAY";
    holdDaysMin = 1;
    holdDaysMax = 3;
  } else if (action === "SELL" && rsiVal > 70) {
    tradeStyle = "SWING";
    holdDaysMin = 3;
    holdDaysMax = 14;
  } else if (action === "BUY" && rsiVal < 38) {
    tradeStyle = "SWING";
    holdDaysMin = 5;
    holdDaysMax = 21;
  } else {
    // Momentum breakout — trend continuation
    tradeStyle = "POSITION";
    holdDaysMin = 10;
    holdDaysMax = 30;
  }

  return { tradeStyle, holdDaysMin, holdDaysMax, signalStrength };
}

function sma(bars: AlpacaBar[], period: number): number {
  const slice = bars.slice(-period);
  return slice.reduce((s, b) => s + b.c, 0) / slice.length;
}

function rsi(bars: AlpacaBar[], period = 14): number {
  const closes = bars.slice(-(period + 1)).map(b => b.c);
  let gains = 0, losses = 0;
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function averageVolume(bars: AlpacaBar[], period = 20): number {
  return bars.slice(-period).reduce((s, b) => s + b.v, 0) / period;
}

export async function generateSignals(accountEquity: number): Promise<Signal[]> {
  const signals: Signal[] = [];
  const tickers = ["NVDA", "MSFT", "TSLA", "AMD", "AAPL", "META", "AMZN", "GOOGL"];

  for (const ticker of tickers) {
    try {
      const bars = await getHistoricalBars(ticker, "1Day", 35);
      if (!bars || bars.length < 20) continue;

      const price = bars[bars.length - 1].c;
      const sma20 = sma(bars, 20);
      const sma10 = sma(bars, 10);
      const rsiVal = rsi(bars, 14);
      const avgVol = averageVolume(bars, 20);
      const lastVol = bars[bars.length - 1].v;
      const volRatio = lastVol / avgVol;

      // Price momentum: distance from 20-day MA
      const pctAboveSma20 = ((price - sma20) / sma20) * 100;
      const pctAboveSma10 = ((price - sma10) / sma10) * 100;

      // 5-day return
      const fiveDayReturn = ((price - bars[bars.length - 6].c) / bars[bars.length - 6].c) * 100;

      const catalysts: string[] = [];
      let action: "BUY" | "SELL" | null = null;
      let confidence: "HIGH" | "MEDIUM" | "SPECULATIVE" = "MEDIUM";
      let reasoning = "";
      let upsidePercent = 0;
      let downsidePercent = 0;
      let timeHorizon = "14 days";

      // BUY signal: RSI recovering from oversold + price near/above 20-SMA + volume confirmation
      if (rsiVal < 40 && pctAboveSma20 > -5 && fiveDayReturn > -8) {
        action = "BUY";
        upsidePercent = 8 + Math.abs(pctAboveSma20);
        downsidePercent = 4;
        confidence = rsiVal < 32 ? "HIGH" : "MEDIUM";
        reasoning = `RSI at ${rsiVal.toFixed(1)} indicates oversold conditions with potential reversal. Price within ${Math.abs(pctAboveSma20).toFixed(1)}% of 20-day MA support. Risk/reward favorable.`;
        if (rsiVal < 35) catalysts.push(`RSI oversold: ${rsiVal.toFixed(1)}`);
        if (volRatio > 1.2) catalysts.push(`Volume surge ${(volRatio * 100 - 100).toFixed(0)}% above average`);
        catalysts.push(`5-day return: ${fiveDayReturn.toFixed(1)}%`);
        catalysts.push(`Price vs 20-SMA: ${pctAboveSma20.toFixed(1)}%`);
        timeHorizon = "14–21 days";
      }
      // SELL signal: RSI overbought + price extended above both MAs + volume exhaustion
      else if (rsiVal > 68 && pctAboveSma20 > 8 && pctAboveSma10 > 4) {
        action = "SELL";
        upsidePercent = 6 + pctAboveSma20 / 2;
        downsidePercent = 3;
        confidence = rsiVal > 75 ? "HIGH" : "MEDIUM";
        reasoning = `RSI at ${rsiVal.toFixed(1)} — overbought. Price extended ${pctAboveSma20.toFixed(1)}% above 20-day MA. Momentum exhaustion signals likely pullback.`;
        catalysts.push(`RSI overbought: ${rsiVal.toFixed(1)}`);
        catalysts.push(`Extended ${pctAboveSma20.toFixed(1)}% above 20-SMA`);
        if (volRatio < 0.8) catalysts.push("Volume declining — momentum fading");
        catalysts.push(`5-day return: +${fiveDayReturn.toFixed(1)}%`);
        timeHorizon = "7–14 days";
      }
      // BUY signal: Strong momentum breakout
      else if (fiveDayReturn > 6 && pctAboveSma10 > 3 && rsiVal > 50 && rsiVal < 70 && volRatio > 1.3) {
        action = "BUY";
        upsidePercent = fiveDayReturn * 0.8;
        downsidePercent = fiveDayReturn * 0.4;
        confidence = "SPECULATIVE";
        reasoning = `Strong 5-day momentum of +${fiveDayReturn.toFixed(1)}% with ${(volRatio * 100 - 100).toFixed(0)}% volume surge. Trend continuation signal but elevated entry risk.`;
        catalysts.push(`5-day momentum: +${fiveDayReturn.toFixed(1)}%`);
        catalysts.push(`Volume: +${(volRatio * 100 - 100).toFixed(0)}% above average`);
        catalysts.push(`RSI: ${rsiVal.toFixed(1)} — healthy momentum range`);
        timeHorizon = "5–10 days";
      }

      if (!action || catalysts.length === 0) continue;

      // Position sizing: risk max 5% of equity per trade
      const maxRisk = accountEquity * 0.05;
      const stopLossAmt = price * (downsidePercent / 100);
      const rawShares = Math.floor(maxRisk / stopLossAmt);
      const shares = Math.max(1, Math.min(rawShares, Math.floor(maxRisk / price)));

      const targetPrice = action === "BUY"
        ? price * (1 + upsidePercent / 100)
        : price * (1 - upsidePercent / 100);
      const stopLoss = action === "BUY"
        ? price * (1 - downsidePercent / 100)
        : price * (1 + downsidePercent / 100);

      const { tradeStyle, holdDaysMin, holdDaysMax, signalStrength } = classifyTrade(action, rsiVal, fiveDayReturn, pctAboveSma20, volRatio);

      // holdUntilDate: add holdDaysMin trading days from now
      const holdUntil = new Date();
      holdUntil.setDate(holdUntil.getDate() + holdDaysMin);
      const holdUntilDate = holdUntil.toISOString().split("T")[0];

      signals.push({
        ticker,
        action,
        shares,
        priceAtRecommendation: Math.round(price * 100) / 100,
        targetPrice: Math.round(targetPrice * 100) / 100,
        stopLoss: Math.round(stopLoss * 100) / 100,
        confidence,
        reasoning,
        catalysts,
        upsidePercent: Math.round(upsidePercent * 10) / 10,
        downsidePercent: Math.round(downsidePercent * 10) / 10,
        timeHorizon,
        tradeStyle,
        holdDaysMin,
        holdDaysMax,
        holdUntilDate,
        signalStrength,
        signalAge: 0,
      });
    } catch (e) {
      console.error(`Signal gen error for ${ticker}:`, e);
    }
  }

  return signals;
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  side: "long" | "short";
}

export interface AlpacaBar {
  t: string;  // timestamp
  o: number;  // open
  h: number;  // high
  l: number;  // low
  c: number;  // close
  v: number;  // volume
  vw: number; // vwap
  n: number;  // trade count
}
