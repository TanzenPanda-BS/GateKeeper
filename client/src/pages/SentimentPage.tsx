import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus, Newspaper } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ── Types ────────────────────────────────────────────────────────────────────
interface TaggedHeadline {
  text: string;
  signal: "BULL" | "BEAR" | "NEUTRAL";
  reason: string;
}

interface SentimentRow {
  ticker: string;
  score: number;
  label: string;
  alertLevel: string;
  alertReason: string;
  articleCount: number;
  headlines: string[];
  taggedHeadlines: TaggedHeadline[];
  keySignals: string[];
  marketAuxScore: number | null;
  updatedAt: string;
}

interface HistoryRow {
  id: number;
  ticker: string;
  score: number;
  alertLevel: string;
  snapshotDate: string;
  snapshotHour: number;
  createdAt: string;
}

// ── Constants ────────────────────────────────────────────────────────────────
const WATCHLIST = ["NVDA", "TSLA", "MSFT", "AMD", "AAPL", "META", "AMZN", "GOOGL"];

const ALERT_CONFIG = {
  NONE:    { label: "Clear",   color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/20",  dot: "bg-green-500"  },
  WATCH:   { label: "Watch",   color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20", dot: "bg-yellow-500" },
  CAUTION: { label: "Caution", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20", dot: "bg-orange-500" },
  DANGER:  { label: "Danger",  color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/20",    dot: "bg-red-500"   },
};

function fmt2(n: number) { return (n >= 0 ? "+" : "") + n.toFixed(2); }
function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch { return "—"; }
}

// ── Mini sparkline using SVG ─────────────────────────────────────────────────
function Sparkline({ data, width = 120, height = 36 }: { data: number[]; width?: number; height?: number }) {
  if (!data || data.length < 2) {
    return <div className="text-xs text-muted-foreground italic">Not enough data</div>;
  }
  const min = Math.min(...data, -0.1);
  const max = Math.max(...data, 0.1);
  const range = max - min || 0.2;
  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * w;
    const y = pad + h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const zeroY = pad + h - ((0 - min) / range) * h;
  const last = data[data.length - 1];
  const color = last > 0.1 ? "#22c55e" : last < -0.1 ? "#ef4444" : "#eab308";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {/* Zero line */}
      <line x1={pad} y1={zeroY} x2={pad + w} y2={zeroY} stroke="#ffffff15" strokeWidth="1" strokeDasharray="3,3" />
      {/* Sparkline */}
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={pts} />
      {/* End dot */}
      {data.length > 0 && (() => {
        const lastX = pad + w;
        const lastY = pad + h - ((last - min) / range) * h;
        return <circle cx={lastX} cy={lastY} r="3" fill={color} />;
      })()}
    </svg>
  );
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  // score: -1 to +1 → bar centered at 50%
  const pct = ((score + 1) / 2) * 100;
  const color = score > 0.15 ? "bg-green-500" : score < -0.15 ? "bg-red-500" : "bg-yellow-500";
  return (
    <div className="relative h-2 bg-secondary rounded-full overflow-hidden w-full">
      {/* Center marker */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border z-10" />
      {/* Fill from center */}
      {score >= 0 ? (
        <div className={`absolute h-full ${color} rounded-r`} style={{ left: "50%", width: `${Math.min(50, pct - 50)}%` }} />
      ) : (
        <div className={`absolute h-full ${color} rounded-l`} style={{ right: `${100 - pct}%`, width: `${50 - pct}%` }} />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SentimentPage() {
  const { toast } = useToast();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const { data: sentiments = [], isLoading } = useQuery<SentimentRow[]>({
    queryKey: ["/api/sentiment"],
    refetchInterval: 120000,
  });

  const { data: history = [] } = useQuery<HistoryRow[]>({
    queryKey: ["/api/sentiment/history", selectedTicker],
    queryFn: async () => {
      if (!selectedTicker) return [];
      const res = await apiRequest("GET", `/api/sentiment/history?ticker=${selectedTicker}&days=7`);
      return res.json() as Promise<HistoryRow[]>;
    },
    enabled: !!selectedTicker,
    refetchInterval: 0,
  });

  const refreshAll = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sentiment/refresh", { tickers: WATCHLIST }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sentiment"] });
      toast({ title: `Sentiment refreshed`, description: `Updated ${data?.refreshed ?? 0} tickers with latest news.` });
    },
    onError: (e: any) => toast({ title: "Refresh failed", description: e.message, variant: "destructive" }),
  });

  // Sort: DANGER first, then by score ascending (most bearish first)
  const sorted = [...sentiments].sort((a, b) => {
    const levelOrder: Record<string, number> = { DANGER: 0, CAUTION: 1, WATCH: 2, NONE: 3 };
    const lo = (levelOrder[a.alertLevel] ?? 4) - (levelOrder[b.alertLevel] ?? 4);
    if (lo !== 0) return lo;
    return a.score - b.score;
  });

  const dangerAlerts = sorted.filter(s => s.alertLevel === "DANGER" || s.alertLevel === "CAUTION");
  const selected = sentiments.find(s => s.ticker === selectedTicker);

  // Build sparkline data for selected ticker
  const sparkData = history.map(h => h.score);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Market Sentiment
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            3-layer sentiment engine · Alpaca News + MarketAux · Updated hourly during market hours
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => refreshAll.mutate()}
          disabled={refreshAll.isPending}
          data-testid="btn-refresh-all-sentiment"
        >
          <RefreshCw className={`w-4 h-4 ${refreshAll.isPending ? "animate-spin" : ""}`} />
          {refreshAll.isPending ? "Refreshing..." : "Refresh All"}
        </Button>
      </div>

      {/* Alert event log */}
      {dangerAlerts.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Alerts</div>
          {dangerAlerts.map(s => {
            const cfg = ALERT_CONFIG[s.alertLevel as keyof typeof ALERT_CONFIG] ?? ALERT_CONFIG.NONE;
            return (
              <div
                key={s.ticker}
                className={`flex items-start gap-3 p-3.5 rounded-lg border text-sm ${cfg.bg} ${cfg.border} ${cfg.color}`}
                data-testid={`sentiment-alert-${s.ticker}`}
              >
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold">{s.ticker}</span>
                  <span className="mx-2 opacity-60">·</span>
                  <span className="font-medium">{cfg.label}</span>
                  <span className="mx-2 opacity-60">·</span>
                  <span className="opacity-90">{s.alertReason}</span>
                </div>
                <div className="flex-shrink-0 mono text-xs">{fmt2(s.score)}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Two-column layout: score grid + detail panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Score grid */}
        <div className="md:col-span-2 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">All Tickers</div>

          {isLoading && (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading sentiment data...</div>
          )}

          {!isLoading && sorted.length === 0 && (
            <Card>
              <CardContent className="pt-8 pb-8 text-center">
                <Activity className="w-10 h-10 mx-auto opacity-20 mb-3" />
                <div className="text-sm text-muted-foreground">No sentiment data yet</div>
                <div className="text-xs text-muted-foreground mt-1">Click "Refresh All" to fetch the latest news scores</div>
              </CardContent>
            </Card>
          )}

          {sorted.map(s => {
            const cfg = ALERT_CONFIG[s.alertLevel as keyof typeof ALERT_CONFIG] ?? ALERT_CONFIG.NONE;
            const isSelected = selectedTicker === s.ticker;
            return (
              <button
                key={s.ticker}
                className={`w-full text-left p-4 rounded-lg border transition-colors ${
                  isSelected
                    ? "bg-primary/10 border-primary/40"
                    : "bg-secondary/20 border-border hover:border-primary/20 hover:bg-secondary/40"
                }`}
                onClick={() => setSelectedTicker(isSelected ? null : s.ticker)}
                data-testid={`sentiment-row-${s.ticker}`}
              >
                <div className="flex items-center gap-3">
                  {/* Alert dot */}
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />

                  {/* Ticker + badge */}
                  <div className="flex items-center gap-2 w-28 flex-shrink-0">
                    <span className="mono font-semibold text-sm">{s.ticker}</span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${cfg.color} border-current`}>
                      {cfg.label}
                    </Badge>
                  </div>

                  {/* Score bar */}
                  <div className="flex-1 min-w-0">
                    <ScoreBar score={s.score} />
                  </div>

                  {/* Numeric score */}
                  <div className={`w-14 text-right mono text-sm font-semibold flex-shrink-0 ${
                    s.score > 0.15 ? "text-green-400" : s.score < -0.15 ? "text-red-400" : "text-yellow-400"
                  }`}>
                    {fmt2(s.score)}
                  </div>

                  {/* Trend icon */}
                  <div className="flex-shrink-0 w-5">
                    {s.score > 0.15
                      ? <TrendingUp className="w-4 h-4 text-green-400" />
                      : s.score < -0.15
                        ? <TrendingDown className="w-4 h-4 text-red-400" />
                        : <Minus className="w-4 h-4 text-yellow-400" />
                    }
                  </div>

                  {/* Article count */}
                  <div className="flex-shrink-0 w-20 text-right">
                    <span className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                      <Newspaper className="w-3 h-3" />
                      {s.articleCount} articles
                    </span>
                  </div>
                </div>

                {/* Expanded: alert reason + time */}
                {s.alertLevel !== "NONE" && (
                  <div className={`mt-2 ml-5 text-xs ${cfg.color} opacity-80`}>
                    {s.alertReason}
                  </div>
                )}
                <div className="mt-1 ml-5 text-xs text-muted-foreground/50">
                  Updated {fmtTime(s.updatedAt)}
                  {s.marketAuxScore !== null && s.marketAuxScore !== undefined && (
                    <span className="ml-2">· MarketAux: {fmt2(s.marketAuxScore)}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail panel */}
        <div className="space-y-4">
          {!selectedTicker && (
            <Card>
              <CardContent className="pt-8 pb-8 text-center">
                <Activity className="w-8 h-8 mx-auto opacity-20 mb-3" />
                <div className="text-sm text-muted-foreground">Select a ticker</div>
                <div className="text-xs text-muted-foreground mt-1">Click any row to see headlines, signals, and 7-day history</div>
              </CardContent>
            </Card>
          )}

          {selected && (
            <>
              {/* Ticker header card */}
              <Card className={`border ${(ALERT_CONFIG[selected.alertLevel as keyof typeof ALERT_CONFIG] ?? ALERT_CONFIG.NONE).border}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="mono font-bold text-base">{selected.ticker}</span>
                    <Badge
                      variant="outline"
                      className={`${(ALERT_CONFIG[selected.alertLevel as keyof typeof ALERT_CONFIG] ?? ALERT_CONFIG.NONE).color} border-current`}
                    >
                      {(ALERT_CONFIG[selected.alertLevel as keyof typeof ALERT_CONFIG] ?? ALERT_CONFIG.NONE).label}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1.5">Composite Score</div>
                    <ScoreBar score={selected.score} />
                    <div className="flex justify-between text-xs mt-1">
                      <span className="text-muted-foreground">Bearish −1.0</span>
                      <span className={`font-semibold mono ${
                        selected.score > 0.15 ? "text-green-400" : selected.score < -0.15 ? "text-red-400" : "text-yellow-400"
                      }`}>{fmt2(selected.score)}</span>
                      <span className="text-muted-foreground">+1.0 Bullish</span>
                    </div>
                  </div>
                  {selected.alertReason && (
                    <p className={`text-xs leading-relaxed ${(ALERT_CONFIG[selected.alertLevel as keyof typeof ALERT_CONFIG] ?? ALERT_CONFIG.NONE).color}`}>
                      {selected.alertReason}
                    </p>
                  )}
                  {selected.marketAuxScore !== null && selected.marketAuxScore !== undefined && (
                    <div className="text-xs text-muted-foreground">
                      MarketAux score: <span className={`font-semibold ${selected.marketAuxScore > 0 ? "text-green-400" : selected.marketAuxScore < 0 ? "text-red-400" : "text-yellow-400"}`}>{fmt2(selected.marketAuxScore)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 7-day sparkline */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">7-Day Score History</CardTitle>
                </CardHeader>
                <CardContent>
                  {sparkData.length < 2 ? (
                    <div className="text-xs text-muted-foreground py-2">
                      Collecting data — history builds as sentiment refreshes over time.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Sparkline data={sparkData} width={220} height={56} />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{history[0]?.snapshotDate ?? ""}</span>
                        <span>Today</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Key signals */}
              {selected.keySignals && selected.keySignals.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Key Signals</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {selected.keySignals.map((sig: any, i: number) => {
                      const signal = typeof sig === "string" ? sig : JSON.stringify(sig);
                      const isBull = signal.toLowerCase().includes("bull") || signal.toLowerCase().includes("positive") || signal.toLowerCase().includes("upgrad");
                      const isBear = signal.toLowerCase().includes("bear") || signal.toLowerCase().includes("negative") || signal.toLowerCase().includes("downgrad") || signal.toLowerCase().includes("concern");
                      return (
                        <div key={i} className={`flex items-start gap-2 text-xs ${isBull ? "text-green-400" : isBear ? "text-red-400" : "text-muted-foreground"}`}>
                          <span className="flex-shrink-0 mt-0.5">{isBull ? "▲" : isBear ? "▼" : "–"}</span>
                          <span className="leading-relaxed">{signal}</span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {/* Headlines — Bull/Bear Signal Cards */}
              {(() => {
                const tagged: TaggedHeadline[] = Array.isArray(selected.taggedHeadlines) && selected.taggedHeadlines.length > 0
                  ? selected.taggedHeadlines
                  : (selected.headlines ?? []).map((h: string) => ({ text: h, signal: "NEUTRAL" as const, reason: "No directional signal" }));
                if (tagged.length === 0) return null;
                return (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Newspaper className="w-4 h-4" />
                        Headline Signal Analysis
                        <span className="text-xs font-normal text-muted-foreground ml-auto">{tagged.length} headlines</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {tagged.slice(0, 6).map((h: TaggedHeadline, i: number) => {
                        const isBull = h.signal === "BULL";
                        const isBear = h.signal === "BEAR";
                        return (
                          <div key={i} className={`rounded-lg border p-2.5 ${
                            isBull ? "bg-green-500/5 border-green-500/20" :
                            isBear ? "bg-red-500/5 border-red-500/20" :
                            "bg-secondary/30 border-border"
                          }`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-bold flex items-center gap-1 ${
                                isBull ? "text-green-400" : isBear ? "text-red-400" : "text-muted-foreground"
                              }`}>
                                {isBull ? (
                                  <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-current" aria-label="Bull">
                                    <path d="M10 2C8.5 2 7.2 2.6 6.3 3.6L4 3a1 1 0 0 0-.9 1.4l1 2.1C3.4 7.4 3 8.7 3 10c0 1 .2 2 .6 2.8L2.3 15a1 1 0 0 0 .9 1.5l2-.3c1 .5 2.1.8 3.3.8h3c1.2 0 2.3-.3 3.3-.8l2 .3a1 1 0 0 0 .9-1.5l-1.3-2.2c.4-.8.6-1.8.6-2.8 0-1.3-.4-2.6-1.1-3.5l1-2.1A1 1 0 0 0 16 3l-2.3.6C12.8 2.6 11.5 2 10 2zm0 2c.8 0 1.5.3 2 .8L10 6 8 4.8C8.5 4.3 9.2 4 10 4zm-3 5a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm4 0a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm-2 3h2c0 .6-.4 1-1 1s-1-.4-1-1z"/>
                                  </svg>
                                ) : isBear ? (
                                  <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-current" aria-label="Bear">
                                    <path d="M5 3a2 2 0 0 0-2 2c0 .7.4 1.4 1 1.7V8C4 11.9 6.7 15 10 15s6-3.1 6-7V6.7c.6-.3 1-1 1-1.7a2 2 0 0 0-2-2c-.8 0-1.5.5-1.8 1.2A7 7 0 0 0 10 4c-.8 0-1.6.1-2.2.2C7.5 3.5 6.8 3 6 3H5zm2 6a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm4 0a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm-3 3h2a1 1 0 0 1-2 0zM6 17a1 1 0 0 1 1-1h6a1 1 0 0 1 0 2H7a1 1 0 0 1-1-1z"/>
                                  </svg>
                                ) : (
                                  <Minus className="w-3 h-3" />
                                )}
                                {h.signal}
                              </span>
                              <span className={`text-xs ${
                                isBull ? "text-green-300/70" : isBear ? "text-red-300/70" : "text-muted-foreground/60"
                              }`}>{h.reason}</span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{h.text}</p>
                          </div>
                        );
                      })}
                      {selected.articleCount > 6 && (
                        <div className="text-xs text-muted-foreground/50 text-center pt-1">
                          +{selected.articleCount - 6} more articles analyzed
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
