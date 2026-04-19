import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  ShieldCheck, CheckCircle, XCircle, Edit3, Clock,
  TrendingUp, TrendingDown, Target, Zap, CalendarClock,
  BarChart2, Timer, Newspaper, AlertTriangle, Activity,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { Recommendation } from "@shared/schema";

function fmt(n: number, d = 2) { return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }

// Trade style config
const tradeStyleConfig: Record<string, { label: string; color: string; bg: string; desc: string; icon: any }> = {
  DAY:      { label: "Day Trade",       color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", desc: "Execute and close within 1–3 sessions", icon: Timer },
  SWING:    { label: "Swing Trade",     color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20",   desc: "Hold 3–14 days — wait for the move to develop", icon: CalendarClock },
  POSITION: { label: "Position Trade",  color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20", desc: "Hold 10–30 days — trend continuation play", icon: BarChart2 },
};

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

// ── Sentiment panel for the side rail ────────────────────────────────────────
function SentimentPanel({ ticker }: { ticker: string }) {
  const { data: allSentiment = [], isLoading, refetch, isFetching } = useQuery<any[]>({
    queryKey: ["/api/sentiment"],
    refetchInterval: 300000, // 5 min passive refresh
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
    // Map -1..+1 to 0..100%
    const pct = Math.round((score + 1) / 2 * 100);
    const color = score > 0.15 ? "bg-green-500" : score < -0.15 ? "bg-red-500" : "bg-yellow-500";
    return { pct, color };
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Sentiment — {ticker}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground py-4 text-center">Loading...</CardContent>
      </Card>
    );
  }

  if (!sentiment) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Sentiment — {ticker}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">No sentiment data yet. Refresh to fetch the latest news.</p>
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-2 text-xs"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            data-testid="btn-refresh-sentiment"
          >
            <RefreshCw className={`w-3 h-3 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            Fetch Sentiment
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { pct, color: barColor } = scoreBar(sentiment.score);
  const alertLevel = sentiment.alertLevel ?? "NONE";
  const headlines: string[] = Array.isArray(sentiment.headlines) ? sentiment.headlines : [];
  const keySignals: string[] = Array.isArray(sentiment.keySignals) ? sentiment.keySignals : [];

  const updatedAgo = sentiment.updatedAt
    ? Math.floor((Date.now() - new Date(sentiment.updatedAt).getTime()) / 60000)
    : null;

  return (
    <Card className={alertLevel === "DANGER" ? "border-red-500/30" : alertLevel === "CAUTION" ? "border-orange-500/30" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Sentiment — {ticker}
          </span>
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending || isFetching}
            className="text-muted-foreground hover:text-foreground transition-colors"
            data-testid="btn-refresh-sentiment"
          >
            <RefreshCw className={`w-3 h-3 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Score bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">News Sentiment Score</span>
            <span className={`font-semibold mono ${scoreColor(sentiment.score)}`}>
              {sentiment.score >= 0 ? "+" : ""}{sentiment.score.toFixed(2)}
            </span>
          </div>
          <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
            {/* Center tick */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border z-10" />
            <div
              className={`absolute top-0 h-full rounded-full transition-all ${barColor}`}
              style={{ left: sentiment.score < 0 ? `${pct}%` : "50%", width: `${Math.abs(pct - 50)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs mt-0.5 text-muted-foreground/60">
            <span>Bearish</span>
            <span>{sentiment.articleCount} articles · {updatedAgo !== null ? `${updatedAgo}m ago` : "–"}</span>
            <span>Bullish</span>
          </div>
        </div>

        {/* Alert badge */}
        {alertLevel !== "NONE" && (
          <div className={`p-2.5 rounded-lg border text-xs leading-relaxed ${alertColors[alertLevel]}`}>
            <div className="flex items-center gap-1.5 font-semibold mb-0.5">
              <AlertTriangle className="w-3 h-3" />
              {alertLevel} ALERT
            </div>
            <p>{sentiment.alertReason}</p>
          </div>
        )}

        {alertLevel === "NONE" && (
          <div className="p-2.5 rounded-lg border bg-green-500/5 border-green-500/15 text-xs text-green-400">
            Sentiment consistent with trade thesis. No contrary news signals detected.
          </div>
        )}

        {/* Key signals */}
        {keySignals.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1.5 font-medium">Detected Signals</div>
            <div className="flex flex-wrap gap-1">
              {keySignals.map((sig: string, i: number) => (
                <span
                  key={i}
                  className={`text-xs px-1.5 py-0.5 rounded font-mono ${sig.startsWith("+") ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}
                >
                  {sig}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Headlines */}
        {headlines.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1.5 font-medium flex items-center gap-1.5">
              <Newspaper className="w-3 h-3" />
              Recent Headlines
            </div>
            <div className="space-y-1.5">
              {headlines.map((h: string, i: number) => (
                <p key={i} className="text-xs text-muted-foreground leading-relaxed line-clamp-2 border-l-2 border-border pl-2">{h}</p>
              ))}
            </div>
          </div>
        )}

        {headlines.length === 0 && keySignals.length === 0 && (
          <p className="text-xs text-muted-foreground">No headlines found in the last 6 hours.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DecisionGate() {
  const { data: pending = [], isLoading } = useQuery<Recommendation[]>({ queryKey: ["/api/recommendations/pending"] });
  const [activeIdx, setActiveIdx] = useState(0);
  const [modShares, setModShares] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"view" | "modify">("view");
  const { toast } = useToast();

  const decideMutation = useMutation({
    mutationFn: ({ id, decision, modifiedShares, note }: { id: number; decision: string; modifiedShares?: number; note?: string }) =>
      apiRequest("POST", `/api/recommendations/${id}/decide`, { decision, modifiedShares, note }),
    onSuccess: async (updated: any, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations"] });
      if (vars.decision === "APPROVED" || vars.decision === "MODIFIED") {
        try {
          await apiRequest("POST", "/api/alpaca/execute", { recommendationId: vars.id });
          toast({ title: "Trade submitted to Alpaca", description: `${vars.decision === "MODIFIED" ? `${vars.modifiedShares} shares` : `${updated?.shares} shares`} of ${updated?.ticker} sent as market order.` });
        } catch (e: any) {
          toast({ title: "Decision recorded — execution failed", description: e.message, variant: "destructive" });
        }
      } else {
        toast({ title: "Recommendation rejected", description: `GateKeeper AI is tracking what this trade would have returned. Check After Action tomorrow.` });
      }
      setMode("view");
      setModShares("");
      setNote("");
      setActiveIdx(0);
    },
  });

  const rec = pending[activeIdx];

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Loading...</div>;

  if (!rec) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <ShieldCheck className="w-12 h-12 text-primary/40 mb-3" />
        <h2 className="text-lg font-semibold text-foreground">Gate is clear</h2>
        <p className="text-sm text-muted-foreground mt-1">No pending GateKeeper AI recommendations. Generate signals to scan for new opportunities.</p>
      </div>
    );
  }

  const expiresIn = Math.max(0, Math.floor((new Date(rec.expiresAt).getTime() - Date.now()) / 60000));
  const catalysts: string[] = JSON.parse(rec.catalysts || "[]");
  const signalStrength = rec.signalStrength ?? 50;
  const tradeStyleConf = rec.tradeStyle ? tradeStyleConfig[rec.tradeStyle] : tradeStyleConfig.SWING;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Decision Gate</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{pending.length} GateKeeper AI recommendation{pending.length !== 1 ? "s" : ""} awaiting your decision</p>
        </div>
        <div className="flex gap-1">
          {pending.map((r, i) => (
            <button
              key={r.id}
              data-testid={`queue-tab-${i}`}
              onClick={() => { setActiveIdx(i); setMode("view"); }}
              className={`w-8 h-8 rounded-md text-xs font-medium transition-colors ${i === activeIdx ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Main card */}
        <div className="col-span-2 space-y-4">
          <Card className="border-primary/20">
            <CardContent className="pt-6 pb-6 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${rec.action === "BUY" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                    {rec.action}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-2xl font-bold mono">{rec.ticker}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${rec.confidence === "HIGH" ? "badge-high" : rec.confidence === "MEDIUM" ? "badge-medium" : "badge-speculative"}`}>
                        {rec.confidence}
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
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                  <span className={expiresIn < 30 ? "text-yellow-400" : ""}>{expiresIn > 60 ? `${Math.floor(expiresIn / 60)}h` : `${expiresIn}m`} to expire</span>
                </div>
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
              <div className="grid grid-cols-3 gap-3">
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

              {/* Modify mode */}
              {mode === "modify" && (
                <div className="p-4 rounded-lg bg-secondary/60 border border-border space-y-3">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Modify Position</div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground mb-1 block">Shares (GateKeeper AI suggested: {rec.shares})</label>
                      <Input
                        data-testid="input-modified-shares"
                        type="number"
                        placeholder={String(rec.shares)}
                        value={modShares}
                        onChange={e => setModShares(e.target.value)}
                        className="h-9 text-sm mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Your reasoning (optional)</label>
                    <Textarea
                      data-testid="input-decision-note"
                      placeholder="Why are you modifying this trade?"
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      className="text-sm min-h-[60px] resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Decision buttons */}
              <div className="flex items-center gap-3 pt-1">
                <Button
                  data-testid="btn-approve"
                  className="flex-1 gap-2 bg-green-600 hover:bg-green-500 text-white"
                  onClick={() => decideMutation.mutate({ id: rec.id, decision: "APPROVED" })}
                  disabled={decideMutation.isPending}
                >
                  <CheckCircle className="w-4 h-4" />Approve & Execute
                </Button>
                {mode === "modify" ? (
                  <Button
                    data-testid="btn-approve-modified"
                    variant="outline"
                    className="flex-1 gap-2 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
                    onClick={() => decideMutation.mutate({ id: rec.id, decision: "MODIFIED", modifiedShares: Number(modShares) || rec.shares, note })}
                    disabled={decideMutation.isPending}
                  >
                    <Edit3 className="w-4 h-4" />Approve Modified
                  </Button>
                ) : (
                  <Button
                    data-testid="btn-modify"
                    variant="outline"
                    className="flex-1 gap-2 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
                    onClick={() => setMode("modify")}
                  >
                    <Edit3 className="w-4 h-4" />Modify
                  </Button>
                )}
                <Button
                  data-testid="btn-reject"
                  variant="outline"
                  className="flex-1 gap-2 border-red-500/40 text-red-400 hover:bg-red-500/10"
                  onClick={() => decideMutation.mutate({ id: rec.id, decision: "REJECTED", note })}
                  disabled={decideMutation.isPending}
                >
                  <XCircle className="w-4 h-4" />Reject
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
          {/* Live sentiment for this ticker */}
          <SentimentPanel ticker={rec.ticker} />

          {/* Position sizing note */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Position Context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Recommended shares</span>
                <span className="font-medium text-foreground mono">{rec.shares}</span>
              </div>
              <div className="flex justify-between">
                <span>Entry price</span>
                <span className="font-medium text-foreground mono">${fmt(rec.priceAtRecommendation)}</span>
              </div>
              <div className="flex justify-between">
                <span>Position value</span>
                <span className="font-medium text-foreground mono">${fmt(rec.shares * rec.priceAtRecommendation, 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Max loss at stop</span>
                <span className="font-medium loss">${fmt(rec.shares * rec.priceAtRecommendation * (rec.downsidePercent / 100), 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Target gain</span>
                <span className="font-medium gain">${fmt(rec.shares * rec.priceAtRecommendation * (rec.upsidePercent / 100), 0)}</span>
              </div>
              <p className="pt-1 border-t border-border">Risk is sized to max 5% of account equity. Modify shares to adjust your personal risk tolerance.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
