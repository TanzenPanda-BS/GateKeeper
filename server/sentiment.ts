/**
 * GateKeeper Sentiment Engine
 *
 * Three data layers (all free / already-connected):
 * 1. Alpaca News API — real headlines from Benzinga for our watchlist tickers
 * 2. Keyword Sentiment Scoring — fast NLP-free scoring on headlines using
 *    curated financial vocabulary (bullish / bearish / neutral word lists)
 * 3. MarketAux API (optional) — returns a pre-calculated -1 to +1 entity-level
 *    sentiment score per ticker. Free tier: 100 req/day. No credit card required.
 *    Set MARKETAUX_KEY env var to activate. Falls back gracefully if absent.
 *
 * Why NOT Twitter/X: API access requires $42k+/month enterprise contract.
 * Why NOT Reddit/WSB: 1–4 week signal window, coin-flip for day trades.
 * Why NOT Finnhub sentiment: premium paywall (weekly aggregate, not real-time).
 * Why NOT StockTwits Firestream: commercial-only, unlisted pricing.
 *
 * Best signal for 1–3 day trades (per academic research):
 *   #1 Financial news headline sentiment (what we're building)
 *   #2 Options flow unusual activity (Alpaca doesn't expose this, skip for now)
 *   #3 Analyst upgrades/downgrades (retail can't capture day-of move)
 */

const ALPACA_KEY    = process.env.ALPACA_KEY;
const ALPACA_SECRET = process.env.ALPACA_SECRET;
// Key presence validated in alpaca.ts at startup
const DATA_BASE     = "https://data.alpaca.markets";
// MarketAux is optional — sentiment degrades gracefully without it
const MARKETAUX_KEY = process.env.MARKETAUX_KEY ?? null;

// ── Keyword sentiment vocabulary ──────────────────────────────────────────────
// Curated for financial/market context. Weighted: strong words score ±2, normal ±1.

const BULLISH_STRONG = new Set([
  "surges","surge","soars","soar","jumps","jump","rockets","rocket","explodes",
  "breakout","breakthrough","blowout","crushes","smashes","record","beats","beat",
  "outperforms","upgrades","upgraded","upgrade","buy","strong buy","bullish",
  "rally","rallies","moon","skyrockets","accelerates","boom","dominates",
]);
const BULLISH_NORMAL = new Set([
  "gains","gain","rises","rise","climbs","climb","grows","growth","advances",
  "positive","upbeat","optimistic","confidence","strong","momentum","expanding",
  "partnership","deal","contract","investment","wins","win","approval","approved",
  "increases","higher","better","outperform","overweight","revenue","profit",
  "exceeds","tops","above","ahead","recovery","recovering","improving",
]);
const BEARISH_STRONG = new Set([
  "crashes","crash","plunges","plunge","collapses","collapse","tanks","tank",
  "downgrade","downgrades","downgraded","sell","strong sell","bearish","warning",
  "disaster","catastrophe","fraud","investigation","recall","ban","blocked",
  "layoffs","bankruptcy","bankrupt","default","scandal","lawsuit","fine","penalty",
]);
const BEARISH_NORMAL = new Set([
  "falls","fall","drops","drop","declines","decline","misses","miss","disappoints",
  "disappointing","weak","concern","concerns","risk","risks","uncertainty",
  "lower","worse","underperform","underweight","below","behind","slowdown",
  "slowing","pressured","pressure","headwinds","loss","losses","deficit",
  "cut","cuts","reduced","reduces","warns","warning","caution","volatile",
]);

function keywordSentiment(text: string): { score: number; signals: string[] } {
  const words = text.toLowerCase().split(/\W+/);
  let score = 0;
  const signals: string[] = [];

  for (const word of words) {
    if (BULLISH_STRONG.has(word)) { score += 2; signals.push(`+${word}`); }
    else if (BULLISH_NORMAL.has(word)) { score += 1; }
    else if (BEARISH_STRONG.has(word)) { score -= 2; signals.push(`-${word}`); }
    else if (BEARISH_NORMAL.has(word)) { score -= 1; }
  }

  // Clamp to [-1, +1] scale
  const maxPossible = Math.max(10, words.length * 0.3);
  return {
    score: Math.max(-1, Math.min(1, score / maxPossible)),
    signals: signals.slice(0, 5),
  };
}

// ── Alpaca news fetcher ───────────────────────────────────────────────────────

interface AlpacaArticle {
  headline: string;
  summary:  string;
  source:   string;
  url:      string;
  created_at: string;
  symbols:  string[];
}

async function fetchAlpacaNews(tickers: string[], hoursBack = 6): Promise<AlpacaArticle[]> {
  const syms  = tickers.join(",");
  const since = new Date(Date.now() - hoursBack * 3600000).toISOString();
  const url   = `${DATA_BASE}/v1beta1/news?symbols=${syms}&start=${since}&limit=50&sort=desc`;
  try {
    const res = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID":     ALPACA_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET,
      },
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data.news || []) as AlpacaArticle[];
  } catch {
    return [];
  }
}

// ── MarketAux sentiment (optional) ────────────────────────────────────────────
// Free tier: 100 req/day. Sign up at marketaux.com for a free API key.
// Set MARKETAUX_KEY env var to enable. Gracefully disabled if not set.

async function fetchMarketAux(tickers: string[]): Promise<Record<string, number>> {
  if (!MARKETAUX_KEY) return {};
  const syms = tickers.join(",");
  const url  = `https://api.marketaux.com/v1/news/all?symbols=${syms}&filter_entities=true&language=en&api_token=${MARKETAUX_KEY}&limit=10`;
  try {
    const res  = await fetch(url);
    if (!res.ok) return {};
    const data: any = await res.json();
    const scores: Record<string, number[]> = {};
    for (const article of data.data || []) {
      for (const entity of article.entities || []) {
        const sym = entity.symbol?.toUpperCase();
        if (!sym || !tickers.includes(sym)) continue;
        if (typeof entity.sentiment_score !== "number") continue;
        if (!scores[sym]) scores[sym] = [];
        scores[sym].push(entity.sentiment_score);
      }
    }
    const result: Record<string, number> = {};
    for (const [sym, arr] of Object.entries(scores)) {
      result[sym] = arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    return result;
  } catch {
    return {};
  }
}

// ── Main sentiment analysis function ─────────────────────────────────────────

// ── Headline classifier ───────────────────────────────────────────────────────
// Classifies a single headline as BULL / BEAR / NEUTRAL and returns a short
// human-readable reason phrase summarising WHY it was classified that way.
// Uses the existing keyword vocabulary so no extra API calls are needed.

const BULL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /beat|beats|topped?|crushes?|smashes?|blowout/i,      reason: "Earnings/revenue beat expectations" },
  { pattern: /upgrad(e|ed|es)/i,                                    reason: "Analyst upgrade" },
  { pattern: /strong buy|buy rating|overweight|outperform/i,        reason: "Bullish analyst rating" },
  { pattern: /record (high|revenue|profit|earn)/i,                  reason: "Record performance" },
  { pattern: /breakout|breakthrough/i,                              reason: "Technical or product breakout" },
  { pattern: /partner(ship)?|deal|contract|agreement/i,             reason: "Partnership or contract news" },
  { pattern: /FDA approv|approv(al|ed)/i,                           reason: "Regulatory approval" },
  { pattern: /buyback|share repurchase/i,                           reason: "Buyback signals confidence" },
  { pattern: /raised? guidance|raise(d|s)? (outlook|forecast)/i,    reason: "Guidance raised" },
  { pattern: /surges?|soars?|rockets?|jumps?|rallies?|rally/i,      reason: "Sharp price momentum upward" },
  { pattern: /profit|revenue|earn(ing|ings) (rise|grow|jump|beat)/i,reason: "Strong financials" },
  { pattern: /invests?|investment|expands?|expansion|launch(es)?/i, reason: "Growth investment or launch" },
  { pattern: /AI|artificial intelligence.*(partner|deal|invest)/i,  reason: "AI partnership or deal" },
];

const BEAR_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /misses?|missed|disappoints?|falls? short/i,           reason: "Missed earnings or guidance" },
  { pattern: /downgrad(e|ed|es)/i,                                  reason: "Analyst downgrade" },
  { pattern: /sell rating|underperform|underweight/i,               reason: "Bearish analyst rating" },
  { pattern: /lawsuit|sued|litigation|legal action/i,               reason: "Legal or litigation risk" },
  { pattern: /investigation|probe|SEC|DOJ|regulat/i,                reason: "Regulatory investigation" },
  { pattern: /recall|safety concern|defect/i,                       reason: "Product recall or safety issue" },
  { pattern: /layoff|lay off|job cut|workforce reduction/i,         reason: "Layoffs or cost cuts" },
  { pattern: /bankrupt|default|insolvency/i,                        reason: "Financial distress" },
  { pattern: /fraud|scandal|mislead/i,                              reason: "Fraud or misconduct allegation" },
  { pattern: /cut(s)? guidance|lower(s|ed)? (outlook|forecast)/i,   reason: "Guidance cut" },
  { pattern: /crashes?|plunges?|collapses?|tanks?|drops? sharply/i, reason: "Sharp price decline" },
  { pattern: /tariff|sanction|trade war|ban|blocked/i,              reason: "Trade or regulatory headwind" },
  { pattern: /loss(es)?|deficit|write.?down|impairment/i,           reason: "Reported losses or writedowns" },
  { pattern: /warning|caution|risk(s)?|headwind/i,                  reason: "Management warning or risk flagged" },
];

export interface TaggedHeadline {
  text:    string;
  signal:  "BULL" | "BEAR" | "NEUTRAL";
  reason:  string;
}

export function classifyHeadline(headline: string): TaggedHeadline {
  for (const { pattern, reason } of BULL_PATTERNS) {
    if (pattern.test(headline)) {
      return { text: headline, signal: "BULL", reason };
    }
  }
  for (const { pattern, reason } of BEAR_PATTERNS) {
    if (pattern.test(headline)) {
      return { text: headline, signal: "BEAR", reason };
    }
  }
  // Fall back to keyword score for borderline cases
  const { score } = keywordSentiment(headline);
  if (score >= 0.15)  return { text: headline, signal: "BULL",    reason: "Positive keyword signals detected" };
  if (score <= -0.15) return { text: headline, signal: "BEAR",    reason: "Negative keyword signals detected" };
  return               { text: headline, signal: "NEUTRAL", reason: "No strong directional signal" };
}

export interface TickerSentiment {
  ticker:           string;
  score:            number;        // -1 to +1 (negative = bearish)
  label:            "BULLISH" | "NEUTRAL" | "BEARISH";
  articleCount:     number;
  headlines:        string[];          // kept as string[] for DB storage (JSON)
  taggedHeadlines:  TaggedHeadline[];  // classified headlines for display
  keySignals:       string[];      // top bullish/bearish keywords found
  marketAuxScore:   number | null; // MarketAux score if available
  hoursScanned:     number;
  updatedAt:        string;
  // Short-trade alert fields
  alertLevel:       "NONE" | "WATCH" | "CAUTION" | "DANGER";
  alertReason:      string;
}

const TICKERS = ["NVDA", "MSFT", "TSLA", "AMD", "AAPL", "META", "AMZN", "GOOGL"];

export async function analyzeSentiment(tickers: string[] = TICKERS): Promise<TickerSentiment[]> {
  const [articles, mauxScores] = await Promise.all([
    fetchAlpacaNews(tickers, 6),
    fetchMarketAux(tickers),
  ]);

  // Group articles by ticker
  const byTicker: Record<string, AlpacaArticle[]> = {};
  for (const t of tickers) byTicker[t] = [];
  for (const article of articles) {
    for (const sym of article.symbols) {
      const t = sym.toUpperCase();
      if (byTicker[t]) byTicker[t].push(article);
    }
  }

  const results: TickerSentiment[] = [];

  for (const ticker of tickers) {
    const tickerArticles = byTicker[ticker] || [];
    const scores: number[] = [];
    const allSignals: string[] = [];
    const headlines: string[] = [];

    const taggedHeadlines: TaggedHeadline[] = [];

    for (const article of tickerArticles.slice(0, 10)) {
      const text  = `${article.headline} ${article.summary}`;
      const { score, signals } = keywordSentiment(text);
      scores.push(score);
      allSignals.push(...signals);
      if (headlines.length < 5) {
        headlines.push(article.headline);
        taggedHeadlines.push(classifyHeadline(article.headline));
      }
    }

    // Weighted average: MarketAux score (if available) gets 40% weight
    const keywordAvg = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;

    const mauxScore    = mauxScores[ticker] ?? null;
    let   finalScore   = keywordAvg;
    if (mauxScore !== null) {
      finalScore = keywordAvg * 0.6 + mauxScore * 0.4;
    }

    // Label
    const label: TickerSentiment["label"] =
      finalScore > 0.15  ? "BULLISH" :
      finalScore < -0.15 ? "BEARISH" : "NEUTRAL";

    // De-duplicate signals and take top 5
    const uniqueSignals = [...new Set(allSignals)].slice(0, 5);

    // ── Short-trade alert level ───────────────────────────────────────────────
    // Alert logic for DAY / SWING positions. Escalates based on sentiment shift.
    // NONE:    sentiment consistent with trade thesis
    // WATCH:   mild contrary signal — monitor
    // CAUTION: moderate contrary signal — consider tightening stop
    // DANGER:  strong contrary signal — manual intervention or auto-exit recommended
    let alertLevel: TickerSentiment["alertLevel"] = "NONE";
    let alertReason = "";

    if (finalScore < -0.4) {
      alertLevel  = "DANGER";
      alertReason = `Strong bearish news flow (score: ${finalScore.toFixed(2)}). ${tickerArticles.length} negative articles in last 6h. SELL positions at risk of reversal — consider closing or tightening stop.`;
    } else if (finalScore < -0.2) {
      alertLevel  = "CAUTION";
      alertReason = `Moderate bearish sentiment (score: ${finalScore.toFixed(2)}). Tighten stop loss on active SELL positions. Re-evaluate if score drops below -0.4.`;
    } else if (finalScore > 0.35) {
      alertLevel  = "CAUTION";
      alertReason = `Bullish news flow countering SELL signal (score: ${finalScore.toFixed(2)}). ${tickerArticles.length} positive articles. Monitor — positive sentiment may delay expected pullback.`;
    } else if (finalScore > 0.5) {
      alertLevel  = "DANGER";
      alertReason = `Strong bullish news countering SELL thesis (score: ${finalScore.toFixed(2)}). Active short/SELL positions face momentum headwinds. Consider closing.`;
    } else if (tickerArticles.length === 0) {
      alertLevel  = "WATCH";
      alertReason = "No news in last 6 hours. Sentiment unknown — monitor manually before exit.";
    }

    results.push({
      ticker,
      score:          Math.round(finalScore * 100) / 100,
      label,
      articleCount:   tickerArticles.length,
      headlines,
      taggedHeadlines,
      keySignals:     uniqueSignals,
      marketAuxScore: mauxScore,
      hoursScanned:   6,
      updatedAt:      new Date().toISOString(),
      alertLevel,
      alertReason,
    });
  }

  return results;
}

// ── Short-trade safety-net evaluation ────────────────────────────────────────
// Called for active DAY trade positions. Returns auto-exit recommendation
// based on combined sentiment + price action.

export interface SafetyNetEval {
  ticker:        string;
  tradeStyle:    string;
  currentPrice:  number;
  entryPrice:    number;
  stopLoss:      number;
  targetPrice:   number;
  pctFromStop:   number;    // how close to stop loss (%)
  pctFromTarget: number;    // how close to target (%)
  sentiment:     TickerSentiment | null;
  recommendation: "HOLD" | "TIGHTEN_STOP" | "AUTO_EXIT" | "TAKE_PROFIT";
  reason:        string;
  urgency:       "LOW" | "MEDIUM" | "HIGH";
}

export function evaluateSafetyNet(
  position: { ticker: string; tradeStyle: string; currentPrice: number; entryPrice: number; stopLoss: number; targetPrice: number },
  sentiment: TickerSentiment | null
): SafetyNetEval {
  const { ticker, tradeStyle, currentPrice, entryPrice, stopLoss, targetPrice } = position;

  const pctFromStop   = Math.abs((currentPrice - stopLoss) / stopLoss * 100);
  const pctFromTarget = Math.abs((currentPrice - targetPrice) / targetPrice * 100);

  let recommendation: SafetyNetEval["recommendation"] = "HOLD";
  let reason = "Position within normal parameters.";
  let urgency: SafetyNetEval["urgency"] = "LOW";

  // Price-action triggers (always run, regardless of sentiment)
  if (pctFromStop < 1.0) {
    recommendation = "AUTO_EXIT";
    reason = `Price within 1% of stop loss ($${stopLoss.toFixed(2)}). Auto-exit triggered to limit loss.`;
    urgency = "HIGH";
  } else if (pctFromTarget < 1.5) {
    recommendation = "TAKE_PROFIT";
    reason = `Price within 1.5% of target ($${targetPrice.toFixed(2)}). Consider taking profit — target nearly reached.`;
    urgency = "MEDIUM";
  } else if (pctFromStop < 3.0) {
    // Near stop — check sentiment for conviction
    if (sentiment?.alertLevel === "DANGER") {
      recommendation = "AUTO_EXIT";
      reason = `Price approaching stop loss AND strong contrary sentiment (score: ${sentiment.score}). Double risk — auto-exit recommended.`;
      urgency = "HIGH";
    } else {
      recommendation = "TIGHTEN_STOP";
      reason = `Price within 3% of stop loss. Tighten stop to ${(stopLoss * 1.005).toFixed(2)} to protect position.`;
      urgency = "MEDIUM";
    }
  }

  // Sentiment override for DAY trades (short time window, sentiment matters more)
  if (tradeStyle === "DAY" && recommendation === "HOLD") {
    if (sentiment?.alertLevel === "DANGER") {
      recommendation = "AUTO_EXIT";
      reason = `DAY trade with DANGER sentiment: ${sentiment.alertReason}`;
      urgency = "HIGH";
    } else if (sentiment?.alertLevel === "CAUTION") {
      recommendation = "TIGHTEN_STOP";
      reason = `DAY trade with CAUTION sentiment: ${sentiment.alertReason}`;
      urgency = "MEDIUM";
    }
  }

  return {
    ticker, tradeStyle, currentPrice, entryPrice, stopLoss, targetPrice,
    pctFromStop: Math.round(pctFromStop * 10) / 10,
    pctFromTarget: Math.round(pctFromTarget * 10) / 10,
    sentiment,
    recommendation,
    reason,
    urgency,
  };
}
