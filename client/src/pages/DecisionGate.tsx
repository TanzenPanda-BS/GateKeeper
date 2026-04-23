import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  ShieldCheck, CheckCircle, XCircle, Edit3, Clock,
  TrendingUp, TrendingDown, Target, Zap, CalendarClock,
  BarChart2, Timer, Newspaper, AlertTriangle, Activity,
  RefreshCw, ShieldAlert, HelpCircle, ChevronDown, ChevronUp,
  Calculator,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { Recommendation } from "@shared/schema";

function fmt(n: number, d = 2) { return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }

// ── Confidence label → numeric % mapping ────────────────────────────────────
const confidencePct: Record<string, number> = { HIGH: 82, MEDIUM: 61, LOW: 38, SPECULATIVE: 24 };
const confidenceClass: Record<string, string> = {
  HIGH: "badge-high", MEDIUM: "badge-medium", LOW: "badge-speculative", SPECULATIVE: "badge-speculative",
};

// Trade style config
const tradeStyleConfig: Record<string, { label: string; color: string; bg: string; desc: string; icon: any }> = {
  DAY:      { label: "Day Trade",       color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", desc: "Execute and close within 1–3 sessions", icon: Timer },
  SWING:    { label: "Swing Trade",     color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20",   desc: "Hold 3–14 days — wait for the move to develop", icon: CalendarClock },
  POSITION: { label: "Position Trade",  color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20", desc: "Hold 10–30 days — trend continuation play", icon: BarChart2 },
};

// ── Live countdown hook ───────────────────────────────────────────────────────
function useCountdown(expiresAt: string) {
  const getRemaining = () => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const [secs, setSecs] = useState(getRemaining);
  useEffect(() => {
    setSecs(getRemaining());
    const t = setInterval(() => setSecs(getRemaining()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const label = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${String(s).padStart(2,"0")}s` : `${s}s`;
  const isUrgent = secs < 1800; // < 30 min
  return { label, isUrgent, secs };
}

// ── ELI5 generator ───────────────────────────────────────────────────────────
function generateELI5(rec: Recommendation): string {
  const action = rec.action === "BUY" ? "buy" : "sell";
  const conf = (rec.confidence ?? "MEDIUM").toLowerCase();
  const style = rec.tradeStyle ?? "SWING";
  const upPct = rec.upsidePercent ?? 0;
  const downPct = rec.downsidePercent ?? 0;
  const horizon = rec.timeHorizon ?? "1–2 weeks";
  const catalysts: string[] = (() => { try { return JSON.parse(rec.catalysts || "[]"); } catch { return []; } })();
  const topCatalyst = catalysts[0] ?? "multiple technical signals aligning";

  const styleDesc: Record<string, string> = {
    DAY: "ideally within today's session",
    SWING: `over the next ${horizon}`,
    POSITION: `over the coming ${horizon}`,
  };

  const confDesc: Record<string, string> = {
    high: "GateKeeper AI is highly confident — multiple indicators are all pointing the same direction.",
    medium: "GateKeeper AI sees a reasonable setup — conditions are favorable but not perfect.",
    low: "GateKeeper AI sees a potential opportunity but conditions are mixed — size conservatively.",
    speculative: "This is a speculative call. The setup has merit but carries elevated risk.",
  };

  return [
    `GateKeeper AI recommends you ${action} ${rec.shares} shares of ${rec.ticker} ${styleDesc[style]}.`,
    `The main reason: ${topCatalyst}.`,
    `If correct, you could gain up to ${upPct.toFixed(1)}% ($${fmt(rec.shares * rec.priceAtRecommendation * upPct / 100, 0)}).`,
    `If it goes wrong, the stop loss limits your loss to roughly ${downPct.toFixed(1)}% ($${fmt(rec.shares * rec.priceAtRecommendation * downPct / 100, 0)}).`,
    confDesc[conf] ?? confDesc.medium,
  ].join(" ");
}

// ── Signal Strength Bar ───────────────────────────────────────────────────────
function SignalStrengthBar({ strength, tradeStyle }: { strength: number; tradeStyle: string | null }) {
  const config = tradeStyle ? tradeStyleConfig[tradeStyle] : tradeStyleConfig.SWING;
  const color = strength >= 70 ? "bg-green-500" : strength >= 40 ? "bg-yellow-500" : "bg-orange-500";
  const label = strength >= 70 ? "Strong conviction" : strength >= 40 ? "Moderate conviction" : "Near threshold — monitor closely";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground font-medium">Signal Conviction</span>
        <span className={`font-semibold ${config.color}`}>{strength ?? 0}/100 — {label}</span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${strength ?? 0}%` }} />
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Conviction measures how far this signal is from the trigger threshold. A score above 70 means conditions are deeply confirmed.
      </p>
    </div>
  );
}

// ── Hold Window Panel ─────────────────────────────────────────────────────────
function HoldWindowPanel({ rec }: { rec: Recommendation }) {
  const config = rec.tradeStyle ? tradeStyleConfig[rec.tradeStyle] : tradeStyleConfig.SWING;
  const Icon = config.icon;
  const holdUntil = rec.holdUntilDate ? new Date(rec.holdUntilDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  const today = new Date().toISOString().split("T")[0];
  const canReeval = !rec.holdUntilDate || today >= rec.holdUntilDate;

  return (
    <div className={`p-3 rounded-lg border ${config.bg} space-y-1.5`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${config.color}`} />
        <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
      </div>
      <p className="text-xs text-muted-foreground">{config.desc}</p>
      <div className="flex items-center gap-4 pt-0.5">
        <div>
          <div className="text-xs text-muted-foreground">Hold Window</div>
          <div className="text-sm font-medium mono">{rec.holdDaysMin ?? "–"} – {rec.holdDaysMax ?? "–"} days</div>
        </div>
        {holdUntil && (
          <div>
            <div className="text-xs text-muted-foreground">Re-evaluate after</div>
            <div className={`text-sm font-medium mono ${canReeval ? "gain" : config.color}`}>{holdUntil}</div>
          </div>
        )}
      </div>
      {!canReeval && (
        <p className="text-xs text-yellow-400 pt-0.5">
          Generating signals again before {holdUntil} may produce the same signal — conditions haven't had time to resolve.
        </p>
      )}
    </div>
  );
}

// ── ELI5 Panel ───────────────────────────────────────────────────────────────
function ELI5Panel({ rec }: { rec: Recommendation }) {
  const [open, setOpen] = useState(false);
  const explanation = generateELI5(rec);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        data-testid="btn-eli5-toggle"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-primary" />
          Explain this in plain English
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0 bg-primary/5 border-t border-border">
          <p className="text-xs text-foreground leading-relaxed pt-2">{explanation}</p>
        </div>
      )}
    </div>
  );
}

// ── What-If Scenario Panel ────────────────────────────────────────────────────
function WhatIfPanel({ rec }: { rec: Recommendation }) {
  const [shares, setShares] = useState(String(rec.shares));
  const [scenario, setScenario] = useState<"target" | "stop" | "custom">("target");
  const [customPct, setCustomPct] = useState("5");
  const [open, setOpen] = useState(false);

  const entryPrice = rec.priceAtRecommendation;
  const numShares = parseFloat(shares) || rec.shares;
  const positionValue = numShares * entryPrice;

  const scenarioPct =
    scenario === "target" ? rec.upsidePercent :
    scenario === "stop"   ? -rec.downsidePercent :
    parseFloat(customPct) || 0;

  const pnl = positionValue * (scenarioPct / 100);
  const exitPrice = entryPrice * (1 + scenarioPct / 100);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        data-testid="btn-whatif-toggle"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Calculator className="w-3.5 h-3.5 text-primary" />
          What-If Scenario Calculator
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-2 border-t border-border bg-secondary/20 space-y-3">
          {/* Share count override */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Shares</span>
            <Input
              data-testid="input-whatif-shares"
              type="number"
              min="1"
              value={shares}
              onChange={e => setShares(e.target.value)}
              className="h-7 text-xs mono w-24"
            />
            <span className="text-xs text-muted-foreground">× ${fmt(entryPrice)} = <span className="text-foreground mono">${fmt(numShares * entryPrice, 0)}</span></span>
          </div>

          {/* Scenario selector */}
          <div className="flex gap-1.5">
            {([
              ["target", `Hit Target (+${fmt(rec.upsidePercent, 1)}%)`, "text-green-400 border-green-500/40 bg-green-500/10"],
              ["stop",   `Stop Loss (-${fmt(rec.downsidePercent, 1)}%)`, "text-red-400 border-red-500/40 bg-red-500/10"],
              ["custom", "Custom %", "text-muted-foreground border-border bg-secondary"],
            ] as const).map(([key, label, cls]) => (
              <button
                key={key}
                data-testid={`btn-scenario-${key}`}
                onClick={() => setScenario(key)}
                className={`flex-1 text-xs py-1.5 px-2 rounded border font-medium transition-colors ${scenario === key ? cls : "border-border text-muted-foreground bg-transparent hover:bg-secondary"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {scenario === "custom" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Move %</span>
              <Input
                data-testid="input-whatif-custompct"
                type="number"
                value={customPct}
                onChange={e => setCustomPct(e.target.value)}
                className="h-7 text-xs mono w-20"
                placeholder="e.g. 3.5"
              />
              <span className="text-xs text-muted-foreground">(negative = loss)</span>
            </div>
          )}

          {/* Result */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-border">
            <div>
              <div className="text-xs text-muted-foreground">Exit price</div>
              <div className="text-sm font-semibold mono">${fmt(exitPrice)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">P&L ({scenarioPct >= 0 ? "+" : ""}{fmt(scenarioPct, 1)}%)</div>
              <div className={`text-sm font-bold mono ${pnl >= 0 ? "gain" : "loss"}`}>
                {pnl >= 0 ? "+" : ""}${fmt(Math.abs(pnl), 0)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Expiration Countdown ──────────────────────────────────────────────────────
function ExpirationCountdown({ expiresAt }: { expiresAt: string }) {
  const { label, isUrgent } = useCountdown(expiresAt);
  return (
    <div
      data-testid="signal-expiry-countdown"
      className={`flex items-center gap-1.5 text-xs flex-shrink-0 ${isUrgent ? "text-red-400 animate-pulse" : "text-muted-foreground"}`}
    >
      <Clock className="w-3.5 h-3.5" />
      <span>{label} to expire</span>
    </div>
  );
}

// ── Sentiment Panel ───────────────────────────────────────────────────────────
function SentimentPanel({ ticker }: { ticker: string }) {
  const { data: allSentiment = [], isLoading, isFetching } = useQuery<any[]>({
    queryKey: ["/api/sentiment"],
    refetchInterval: 300000,
  });
  const { toast } = useToast();

  const sentiment = allSentiment.find((s: any) => s.ticker === ticker);

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sentiment/refresh", { tickers: [ticker] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sentiment"] });
      toast({ title: "Sentiment refreshed", description: `Latest news scored for ${ticker}.` });
    },
  });

  const alertColors: Record<string, string> = {
    NONE:    "text-green-400 bg-green-500/10 border-green-500/20",
    WATCH:   "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    CAUTION: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    DANGER:  "text-red-400 bg-red-500/10 border-red-500/20",
  };

  const scoreColor = (score: number) =>
    score > 0.15 ? "text-green-400" : score < -0.15 ? "text-red-400" : "text-yellow-400";

  const scoreBar = (score: number) => {
    const pct = Math.round((score + 1) / 2 * 100);
    const color = score > 0.15 ? "bg-green-500" : score < -0.15 ? "bg-red-500" : "bg-yellow-500";
    return { pct, color };
  };

  if (isLoading) return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />Sentiment — {ticker}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground py-4 text-center">Loading...</CardContent>
    </Card>
  );

  if (!sentiment) return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />Sentiment — {ticker}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">No sentiment data yet.</p>
        <Button size="sm" variant="outline" className="w-full gap-2 text-xs"
          onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}
          data-testid="btn-refresh-sentiment">
          <RefreshCw className={`w-3 h-3 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
          Fetch Sentiment
        </Button>
      </CardContent>
    </Card>
  );

  const { pct, color: barColor } = scoreBar(sentiment.score);
  const alertLevel = sentiment.alertLevel ?? "NONE";
  const keySignals: string[] = Array.isArray(sentiment.keySignals) ? sentiment.keySignals : [];
  const updatedAgo = sentiment.updatedAt ? Math.floor((Date.now() - new Date(sentiment.updatedAt).getTime()) / 60000) : null;

  // Build tagged headlines: prefer taggedHeadlines from server, fall back to plain headlines as NEUTRAL
  interface TaggedHL { text: string; signal: "BULL" | "BEAR" | "NEUTRAL"; reason: string; }
  const taggedHeadlines: TaggedHL[] = Array.isArray(sentiment.taggedHeadlines) && sentiment.taggedHeadlines.length > 0
    ? sentiment.taggedHeadlines
    : (Array.isArray(sentiment.headlines) ? sentiment.headlines : []).map((h: string) => ({
        text: h, signal: "NEUTRAL" as const, reason: "No directional signal"
      }));

  const BullIcon = () => (
    <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-current" aria-label="Bull">
      <path d="M10 2C8.5 2 7.2 2.6 6.3 3.6L4 3a1 1 0 0 0-.9 1.4l1 2.1C3.4 7.4 3 8.7 3 10c0 1 .2 2 .6 2.8L2.3 15a1 1 0 0 0 .9 1.5l2-.3c1 .5 2.1.8 3.3.8h3c1.2 0 2.3-.3 3.3-.8l2 .3a1 1 0 0 0 .9-1.5l-1.3-2.2c.4-.8.6-1.8.6-2.8 0-1.3-.4-2.6-1.1-3.5l1-2.1A1 1 0 0 0 16 3l-2.3.6C12.8 2.6 11.5 2 10 2zm0 2c.8 0 1.5.3 2 .8L10 6 8 4.8C8.5 4.3 9.2 4 10 4zm-3 5a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm4 0a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm-2 3h2c0 .6-.4 1-1 1s-1-.4-1-1z"/>
    </svg>
  );
  const BearIcon = () => (
    <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-current" aria-label="Bear">
      <path d="M5 3a2 2 0 0 0-2 2c0 .7.4 1.4 1 1.7V8C4 11.9 6.7 15 10 15s6-3.1 6-7V6.7c.6-.3 1-1 1-1.7a2 2 0 0 0-2-2c-.8 0-1.5.5-1.8 1.2A7 7 0 0 0 10 4c-.8 0-1.6.1-2.2.2C7.5 3.5 6.8 3 6 3H5zm2 6a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm4 0a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm-3 3h2a1 1 0 0 1-2 0zM6 17a1 1 0 0 1 1-1h6a1 1 0 0 1 0 2H7a1 1 0 0 1-1-1z"/>
    </svg>
  );

  return (
    <Card className={alertLevel === "DANGER" ? "border-red-500/30" : alertLevel === "CAUTION" ? "border-orange-500/30" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />Sentiment — {ticker}
          </span>
          <button onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending || isFetching}
            className="text-muted-foreground hover:text-foreground transition-colors" data-testid="btn-refresh-sentiment">
            <RefreshCw className={`w-3 h-3 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">News Sentiment Score</span>
            <span className={`font-semibold mono ${scoreColor(sentiment.score)}`}>
              {sentiment.score >= 0 ? "+" : ""}{sentiment.score.toFixed(2)}
            </span>
          </div>
          <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border z-10" />
            <div className={`absolute top-0 h-full rounded-full transition-all ${barColor}`}
              style={{ left: sentiment.score < 0 ? `${pct}%` : "50%", width: `${Math.abs(pct - 50)}%` }} />
          </div>
          <div className="flex justify-between text-xs mt-0.5 text-muted-foreground/60">
            <span>Bearish</span>
            <span>{sentiment.articleCount} articles · {updatedAgo !== null ? `${updatedAgo}m ago` : "–"}</span>
            <span>Bullish</span>
          </div>
        </div>

        {alertLevel !== "NONE" && (
          <div className={`p-2.5 rounded-lg border text-xs leading-relaxed ${alertColors[alertLevel]}`}>
            <div className="flex items-center gap-1.5 font-semibold mb-0.5">
              <AlertTriangle className="w-3 h-3" />{alertLevel} ALERT
            </div>
            <p>{sentiment.alertReason}</p>
          </div>
        )}
        {alertLevel === "NONE" && (
          <div className="p-2.5 rounded-lg border bg-green-500/5 border-green-500/15 text-xs text-green-400">
            Sentiment consistent with trade thesis. No contrary news signals detected.
          </div>
        )}
        {keySignals.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1.5 font-medium">Detected Signals</div>
            <div className="flex flex-wrap gap-1">
              {keySignals.map((sig: string, i: number) => (
                <span key={i} className={`text-xs px-1.5 py-0.5 rounded font-mono ${sig.startsWith("+") ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>{sig}</span>
              ))}
            </div>
          </div>
        )}

        {/* Bull/Bear Headline Signal Cards */}
        {taggedHeadlines.length > 0 ? (
          <div>
            <div className="text-xs text-muted-foreground mb-1.5 font-medium flex items-center gap-1.5">
              <Newspaper className="w-3 h-3" />Headline Signal Analysis
            </div>
            <div className="space-y-1.5">
              {taggedHeadlines.slice(0, 5).map((h: TaggedHL, i: number) => {
                const isBull = h.signal === "BULL";
                const isBear = h.signal === "BEAR";
                return (
                  <div key={i} className={`rounded-md border p-2 ${
                    isBull ? "bg-green-500/5 border-green-500/20" :
                    isBear ? "bg-red-500/5 border-red-500/20" :
                    "bg-secondary/20 border-border"
                  }`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-xs font-bold flex items-center gap-1 ${
                        isBull ? "text-green-400" : isBear ? "text-red-400" : "text-muted-foreground"
                      }`}>
                        {isBull ? <BullIcon /> : isBear ? <BearIcon /> : <span className="w-3 h-3 inline-block text-center">–</span>}
                        {h.signal}
                      </span>
                      <span className={`text-xs truncate ${
                        isBull ? "text-green-300/60" : isBear ? "text-red-300/60" : "text-muted-foreground/50"
                      }`}>{h.reason}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{h.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No headlines found in the last 6 hours.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Trailing Stop Modal ────────────────────────────────────────────────────────
function TrailingStopModal({ ticker, entryPrice, onSet, onSkip }: {
  ticker: string; entryPrice: number;
  onSet: (floor: number, trailPct: number) => void; onSkip: () => void;
}) {
  const defaultFloorPct = 10;
  const defaultTrailPct = 5;
  const [floorPct, setFloorPct] = useState(String(defaultFloorPct));
  const [trailPct, setTrailPct] = useState(String(defaultTrailPct));
  const { toast } = useToast();
  const floorPrice = entryPrice * (1 - parseFloat(floorPct || "10") / 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-xl shadow-2xl p-6 w-[420px] space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="font-semibold text-sm">Set Trailing Stop — {ticker}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Optional automated exit if the trade moves against you</div>
          </div>
        </div>
        <div className="p-3 rounded-lg bg-secondary/60 border border-border space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Floor % below entry</label>
              <Input data-testid="input-floor-pct" type="number" min="1" max="50" step="0.5"
                value={floorPct} onChange={e => setFloorPct(e.target.value)} className="h-9 text-sm mono" />
              <div className="text-xs text-muted-foreground mt-1">Floor: <span className="mono text-red-400">${floorPrice.toFixed(2)}</span></div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Trail % as price rises</label>
              <Input data-testid="input-trail-pct" type="number" min="0.5" max="20" step="0.5"
                value={trailPct} onChange={e => setTrailPct(e.target.value)} className="h-9 text-sm mono" />
              <div className="text-xs text-muted-foreground mt-1">Floor rises with price</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-2">
            GateKeeper AI checks every 15 minutes. If the price drops to the floor, it escalates to a <span className="text-red-400 font-medium">DANGER</span> alert with a one-click exit button. The floor rises automatically as your position gains — locking in profits.
          </div>
        </div>
        <div className="flex gap-3">
          <Button data-testid="btn-set-stop"
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
            onClick={() => {
              const f = parseFloat(floorPct);
              const t = parseFloat(trailPct);
              if (isNaN(f) || isNaN(t) || f <= 0 || t <= 0) {
                toast({ title: "Invalid values", description: "Enter valid floor and trail percentages.", variant: "warning" });
                return;
              }
              onSet(entryPrice * (1 - f / 100), t);
            }}>
            <ShieldAlert className="w-4 h-4" />Arm Trailing Stop
          </Button>
          <Button data-testid="btn-skip-stop" variant="outline" className="flex-1" onClick={onSkip}>Skip</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main DecisionGate Page ─────────────────────────────────────────────────────
export default function DecisionGate() {
  const { data: pending = [], isLoading } = useQuery<Recommendation[]>({ queryKey: ["/api/recommendations/pending"] });
  const [activeIdx, setActiveIdx] = useState(0);
  const [modShares, setModShares] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"view" | "modify">("view");
  const [stopModal, setStopModal] = useState<{ ticker: string; entryPrice: number } | null>(null);
  const { toast } = useToast();

  const decideMutation = useMutation({
    mutationFn: async ({ id, decision, modifiedShares, note }: { id: number; decision: string; modifiedShares?: number; note?: string }) => {
      try {
        return await apiRequest("POST", `/api/recommendations/${id}/decide`, { decision, modifiedShares, note });
      } catch (e: any) {
        const is503 = e.message?.includes("503") || e.message?.includes("Service Unavailable") || e.message?.includes("unavailable");
        if (is503) {
          toast({ title: "Server warming up…", description: "Railway is starting — retrying your decision in 4 seconds. Do not close this tab.", variant: "default" });
          await new Promise(r => setTimeout(r, 4000));
          return await apiRequest("POST", `/api/recommendations/${id}/decide`, { decision, modifiedShares, note });
        }
        throw e;
      }
    },
    onSuccess: async (updated: any, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations"] });
      if (vars.decision === "APPROVED" || vars.decision === "MODIFIED") {
        try {
          await apiRequest("POST", "/api/alpaca/execute", { recommendationId: vars.id });
          toast({ title: "Trade submitted to Alpaca", description: `${vars.decision === "MODIFIED" ? `${vars.modifiedShares} shares` : `${updated?.shares} shares`} of ${updated?.ticker} sent as market order.` });
          if (updated?.action === "BUY" || vars.decision === "APPROVED" || vars.decision === "MODIFIED") {
            const entryPrice = updated?.priceAtRecommendation ?? updated?.targetPrice ?? 0;
            if (entryPrice > 0) setStopModal({ ticker: updated?.ticker ?? "", entryPrice });
          }
        } catch (e: any) {
          // 400 = by-design guard (short-sell protection, position rules) — amber, not red
          const is400 = e.message?.startsWith("400");
          toast({
            title: is400 ? "Trade blocked by GateKeeper AI" : "Decision recorded — execution failed",
            description: is400
              ? e.message.replace(/^400:\s*/, "").replace(/^{.*?"error":"/, "").replace(/".*$/, "")
              : e.message,
            variant: is400 ? "warning" : "destructive",
          });
        }
      } else {
        toast({ title: "Recommendation rejected", description: `GateKeeper AI is tracking what this trade would have returned. Check After Action tomorrow.` });
      }
      setMode("view");
      setModShares("");
      setNote("");
      setActiveIdx(0);
    },
    onError: (e: any) => {
      const is503 = e.message?.includes("503") || e.message?.includes("Service Unavailable") || e.message?.includes("unavailable");
      const is400 = e.message?.startsWith("400");
      toast({
        title: is503 ? "Server unavailable — decision NOT recorded" : is400 ? "Trade blocked by GateKeeper AI" : "Decision failed — please try again",
        description: is503
          ? "Railway server is starting up. Wait 10–20 seconds and try again — your signal is still here."
          : is400
          ? e.message.replace(/^400:\s*/, "").replace(/^\{.*?"error":"/, "").replace(/".*$/, "")
          : `Error: ${e.message}. Your signal has not been lost.`,
        variant: is400 ? "warning" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations/pending"] });
    },
  });

  const setStopMutation = useMutation({
    mutationFn: ({ ticker, floor, trailPct }: { ticker: string; floor: number; trailPct: number }) =>
      apiRequest("POST", `/api/positions/${ticker}/stop`, { floor, trailPct }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/positions/stops"] });
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      toast({ title: "Trailing stop armed", description: `${vars.ticker} will alert if price falls to $${vars.floor.toFixed(2)}. Floor rises automatically with gains.` });
      setStopModal(null);
    },
    onError: (e: any) => {
      toast({ title: "Stop not set", description: e.message, variant: "destructive" });
      setStopModal(null);
    },
  });

  const rec = pending[activeIdx];

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Loading...</div>;

  if (!rec) return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
      <ShieldCheck className="w-12 h-12 text-primary/40 mb-3" />
      <h2 className="text-lg font-semibold text-foreground">Gate is clear</h2>
      <p className="text-sm text-muted-foreground mt-1">No pending GateKeeper AI recommendations. Generate signals to scan for new opportunities.</p>
    </div>
  );

  const catalysts: string[] = (() => { try { return JSON.parse(rec.catalysts || "[]"); } catch { return []; } })();
  const signalStrength = rec.signalStrength ?? 50;
  const tradeStyleConf = rec.tradeStyle ? tradeStyleConfig[rec.tradeStyle] : tradeStyleConfig.SWING;
  const confPct = confidencePct[rec.confidence ?? "MEDIUM"] ?? 61;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Decision Gate</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{pending.length} GateKeeper AI recommendation{pending.length !== 1 ? "s" : ""} awaiting your decision</p>
        </div>
        <div className="flex gap-1">
          {pending.map((r, i) => (
            <button key={r.id} data-testid={`queue-tab-${i}`}
              onClick={() => { setActiveIdx(i); setMode("view"); }}
              className={`w-8 h-8 rounded-md text-xs font-medium transition-colors ${i === activeIdx ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        {/* Main card */}
        <div className="md:col-span-2 space-y-4">
          <Card className="border-primary/20">
            <CardContent className="pt-6 pb-6 space-y-5">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${rec.action === "BUY" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                    {rec.action}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-2xl font-bold mono">{rec.ticker}</span>
                      {/* Confidence badge with numeric % */}
                      <span
                        data-testid="badge-confidence"
                        className={`text-xs px-2 py-0.5 rounded font-medium ${confidenceClass[rec.confidence ?? "MEDIUM"] ?? "badge-medium"}`}
                        title={`${confPct}% confidence score`}
                      >
                        {rec.confidence} · {confPct}%
                      </span>
                      {rec.tradeStyle && (
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${tradeStyleConf.bg} ${tradeStyleConf.color}`}>
                          {tradeStyleConf.label}
                        </span>
                      )}
                      {rec.isAutoTrade === 1 && (
                        <span className="text-xs px-2 py-0.5 rounded border bg-yellow-500/10 border-yellow-500/30 text-yellow-400 flex items-center gap-1">
                          <Zap className="w-3 h-3" /> Auto
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {rec.shares} shares at ${fmt(rec.priceAtRecommendation)} · {rec.timeHorizon}
                    </div>
                  </div>
                </div>
                {/* Live expiration countdown */}
                <ExpirationCountdown expiresAt={rec.expiresAt} />
              </div>

              {/* Hold window */}
              <HoldWindowPanel rec={rec} />

              {/* Signal conviction */}
              <SignalStrengthBar strength={signalStrength} tradeStyle={rec.tradeStyle ?? null} />

              {/* Reasoning */}
              <div>
                <div className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Why GateKeeper AI recommends this</div>
                <p className="text-sm text-foreground leading-relaxed">{rec.reasoning}</p>
              </div>

              {/* ELI5 Button */}
              <ELI5Panel rec={rec} />

              {/* Catalysts */}
              <div>
                <div className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Signal Catalysts</div>
                <div className="flex flex-wrap gap-2">
                  {catalysts.map((c, i) => (
                    <span key={i} className="text-xs px-2.5 py-1 bg-secondary rounded-full text-muted-foreground">{c}</span>
                  ))}
                </div>
              </div>

              {/* Price targets */}
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/15">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-green-400" />Target
                  </div>
                  <div className="font-semibold mono text-sm">${fmt(rec.targetPrice)}</div>
                  <div className="text-xs gain">+{fmt(rec.upsidePercent)}%</div>
                </div>
                <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/15">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <TrendingDown className="w-3.5 h-3.5 text-red-400" />Stop Loss
                  </div>
                  <div className="font-semibold mono text-sm">${fmt(rec.stopLoss)}</div>
                  <div className="text-xs loss">-{fmt(rec.downsidePercent)}%</div>
                </div>
                <div className="p-3 rounded-lg bg-secondary border border-border">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Target className="w-3.5 h-3.5" />Horizon
                  </div>
                  <div className="font-semibold text-sm">{rec.timeHorizon}</div>
                  <div className="text-xs text-muted-foreground">expected</div>
                </div>
              </div>

              {/* What-If Scenario Panel */}
              <WhatIfPanel rec={rec} />

              {/* Modify mode */}
              {mode === "modify" && (
                <div className="p-4 rounded-lg bg-secondary/60 border border-border space-y-3">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Modify Position</div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground mb-1 block">Shares (GateKeeper AI suggested: {rec.shares})</label>
                      <Input data-testid="input-modified-shares" type="number" placeholder={String(rec.shares)}
                        value={modShares} onChange={e => setModShares(e.target.value)} className="h-9 text-sm mono" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Your reasoning (optional)</label>
                    <Textarea data-testid="input-decision-note" placeholder="Why are you modifying this trade?"
                      value={note} onChange={e => setNote(e.target.value)} className="text-sm min-h-[60px] resize-none" />
                  </div>
                </div>
              )}

              {/* Decision buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3 pt-1">
                <Button data-testid="btn-approve"
                  className="w-full gap-2 bg-green-600 hover:bg-green-500 text-white"
                  onClick={() => decideMutation.mutate({ id: rec.id, decision: "APPROVED" })}
                  disabled={decideMutation.isPending}>
                  <CheckCircle className="w-4 h-4" />
                  {decideMutation.isPending ? "Submitting…" : "Approve & Execute"}
                </Button>
                {mode === "modify" ? (
                  <Button data-testid="btn-approve-modified" variant="outline"
                    className="w-full gap-2 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
                    onClick={() => decideMutation.mutate({ id: rec.id, decision: "MODIFIED", modifiedShares: Number(modShares) || rec.shares, note })}
                    disabled={decideMutation.isPending}>
                    <Edit3 className="w-4 h-4" />Approve Modified
                  </Button>
                ) : (
                  <Button data-testid="btn-modify" variant="outline"
                    className="w-full gap-2 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
                    onClick={() => setMode("modify")}>
                    <Edit3 className="w-4 h-4" />Modify
                  </Button>
                )}
                <Button data-testid="btn-reject" variant="outline"
                  className="w-full gap-2 border-red-500/40 text-red-400 hover:bg-red-500/10"
                  onClick={() => decideMutation.mutate({ id: rec.id, decision: "REJECTED", note })}
                  disabled={decideMutation.isPending}>
                  <XCircle className="w-4 h-4" />
                  {decideMutation.isPending ? "Submitting…" : "Reject"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Every decision is tracked. Rejected signals enter the shadow portfolio and are measured to market close.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <SentimentPanel ticker={rec.ticker} />
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Position Context</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>Recommended shares</span><span className="font-medium text-foreground mono">{rec.shares}</span></div>
              <div className="flex justify-between"><span>Entry price</span><span className="font-medium text-foreground mono">${fmt(rec.priceAtRecommendation)}</span></div>
              <div className="flex justify-between"><span>Position value</span><span className="font-medium text-foreground mono">${fmt(rec.shares * rec.priceAtRecommendation, 0)}</span></div>
              <div className="flex justify-between"><span>Max loss at stop</span><span className="font-medium loss">${fmt(rec.shares * rec.priceAtRecommendation * (rec.downsidePercent / 100), 0)}</span></div>
              <div className="flex justify-between"><span>Target gain</span><span className="font-medium gain">${fmt(rec.shares * rec.priceAtRecommendation * (rec.upsidePercent / 100), 0)}</span></div>
              <p className="pt-1 border-t border-border">Risk is sized to max 5% of account equity. Modify shares to adjust your personal risk tolerance.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Trailing Stop Modal */}
      {stopModal && (
        <TrailingStopModal
          ticker={stopModal.ticker}
          entryPrice={stopModal.entryPrice}
          onSet={(floor, trailPct) => setStopMutation.mutate({ ticker: stopModal.ticker, floor, trailPct })}
          onSkip={() => setStopModal(null)}
        />
      )}
    </div>
  );
}
