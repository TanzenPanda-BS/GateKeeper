/**
 * P7 — Earnings Proximity Detection
 *
 * Uses Alpaca News headlines as a heuristic signal.
 * Scans the last 5 days of news for earnings-related keywords.
 * No extra API key required — leverages the existing Alpaca News feed.
 *
 * Returns a map of ticker → EarningsFlag when earnings are detected nearby.
 */

const ALPACA_KEY    = process.env.ALPACA_KEY    || "";
const ALPACA_SECRET = process.env.ALPACA_SECRET || "";
const DATA_BASE     = "https://data.alpaca.markets";

export interface EarningsFlag {
  ticker:  string;
  daysOut: number;   // estimated days until earnings (0 = today/imminent, 1–3 = very soon)
  note:    string;   // human-readable description for the signal reasoning
}

// Keywords that strongly indicate earnings are happening soon or now
const EARNINGS_IMMINENT = [
  "earnings today", "reports earnings today", "reporting earnings today",
  "earnings after close", "earnings before open", "earnings after market",
  "reports after the bell", "reports before the bell",
  "q1 earnings", "q2 earnings", "q3 earnings", "q4 earnings",
  "quarterly results today", "quarterly earnings today",
];

// Keywords that indicate earnings are coming in the near future (days out)
const EARNINGS_SOON = [
  "earnings next week", "reports next week", "earnings this week",
  "ahead of earnings", "before earnings", "earnings preview",
  "earnings estimate", "earnings expectations", "earnings call",
  "earnings whisper", "earnings season", "earnings date",
  "set to report", "scheduled to report", "due to report",
  "will report earnings", "expected to report",
];

// Keywords that indicate earnings just passed
const EARNINGS_RECENT = [
  "earnings beat", "earnings miss", "earnings topped",
  "beat estimates", "missed estimates", "topped expectations",
  "below expectations", "above expectations", "earnings per share",
  "eps beat", "eps miss", "reported earnings",
  "posted earnings", "quarterly profit", "quarterly revenue",
];

function scoreHeadline(headline: string): { proximity: "IMMINENT" | "SOON" | "RECENT" | null; matched: string } {
  const h = headline.toLowerCase();
  for (const kw of EARNINGS_IMMINENT) {
    if (h.includes(kw)) return { proximity: "IMMINENT", matched: kw };
  }
  for (const kw of EARNINGS_SOON) {
    if (h.includes(kw)) return { proximity: "SOON", matched: kw };
  }
  for (const kw of EARNINGS_RECENT) {
    if (h.includes(kw)) return { proximity: "RECENT", matched: kw };
  }
  return { proximity: null, matched: "" };
}

async function fetchRecentNews(tickers: string[]): Promise<Record<string, string[]>> {
  const syms  = tickers.join(",");
  const since = new Date(Date.now() - 5 * 24 * 3600000).toISOString(); // last 5 days
  const url   = `${DATA_BASE}/v1beta1/news?symbols=${syms}&start=${since}&limit=100&sort=desc`;
  try {
    const res = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID":     ALPACA_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET,
      },
    });
    if (!res.ok) return {};
    const data: any = await res.json();
    const articles: any[] = data.news || [];

    // Group headlines by ticker
    const result: Record<string, string[]> = {};
    for (const article of articles) {
      for (const sym of (article.symbols || [])) {
        if (!result[sym]) result[sym] = [];
        result[sym].push(article.headline || "");
        if (article.summary) result[sym].push(article.summary);
      }
    }
    return result;
  } catch {
    return {};
  }
}

export async function detectEarningsProximity(
  tickers: string[]
): Promise<Record<string, EarningsFlag>> {
  const flags: Record<string, EarningsFlag> = {};
  if (!tickers.length || !ALPACA_KEY) return flags;

  const newsByTicker = await fetchRecentNews(tickers);

  for (const ticker of tickers) {
    const headlines = newsByTicker[ticker] || [];
    if (!headlines.length) continue;

    let bestProximity: "IMMINENT" | "SOON" | "RECENT" | null = null;
    let bestMatch = "";

    for (const headline of headlines) {
      const { proximity, matched } = scoreHeadline(headline);
      if (!proximity) continue;
      // Prioritize: IMMINENT > SOON > RECENT
      if (proximity === "IMMINENT") {
        bestProximity = "IMMINENT";
        bestMatch = matched;
        break;
      }
      if (proximity === "SOON" && bestProximity !== "IMMINENT") {
        bestProximity = "SOON";
        bestMatch = matched;
      }
      if (proximity === "RECENT" && !bestProximity) {
        bestProximity = "RECENT";
        bestMatch = matched;
      }
    }

    if (!bestProximity) continue;

    const daysOut = bestProximity === "IMMINENT" ? 0 : bestProximity === "SOON" ? 2 : -1;
    const note =
      bestProximity === "IMMINENT"
        ? `Earnings appear imminent (detected: "${bestMatch}"). Signal risk is elevated — results could gap significantly.`
        : bestProximity === "SOON"
        ? `Earnings likely within days (detected: "${bestMatch}"). Hold-window trade may bridge earnings — binary event risk.`
        : `Earnings recently reported (detected: "${bestMatch}"). Post-earnings drift is common — signal may reflect reaction, not new setup.`;

    if (daysOut >= 0) {
      // Only flag IMMINENT and SOON — RECENT is informational only, skip for now
      flags[ticker] = { ticker, daysOut, note };
    }
  }

  return flags;
}
