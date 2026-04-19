import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { ShieldCheck, RefreshCw, AlertTriangle, ChevronRight, TrendingUp, TrendingDown, Timer, CalendarClock, BarChart2, Activity, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Position, Recommendation, TrustMetrics } from "@shared/schema";
import { useState } from "react";

function fmt(n: number, d = 2) { return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }

export default function Dashboard() {
  const { toast } = useToast();
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const { data: positions = [] } = useQuery<Position[]>({ queryKey: ["/api/positions"], refetchInterval: 60000 });
  const { data: pending = [] } = useQuery<Recommendation[]>({ queryKey: ["/api/recommendations/pending"], refetchInterval: 30000 });
  const { data: trust } = useQuery<TrustMetrics>({ queryKey: ["/api/trust-metrics"], refetchInterval: 60000 });
  const { data: account } = useQuery<any>({ queryKey: ["/api/alpaca/account"], refetchInterval: 60000 });
  const { data: clock } = useQuery<any>({ queryKey: ["/api/alpaca/clock"], refetchInterval: 60000 });
  const { data: session } = useQuery<any>({ queryKey: ["/api/session"], refetchInterval: 60000 });
  const { data: alerts = [] } = useQuery<any[]>({ queryKey: ["/api/alerts"], refetchInterval: 300000 });
  const { data: allSentiment = [] } = useQuery<any[]>({ queryKey: ["/api/sentiment"], refetchInterval: 300000 });

  const generateSignals = useMutation({
    mutationFn: () => apiRequest("POST", "/api/signals/generate", {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations/pending"] });
      const stored = data?.stored ?? 0;
      if (stored > 0) toast({ title: `${stored} new signal${stored !== 1 ? "s" : ""} generated`, description: "Review them in the Decision Gate." });
      else toast({ title: "No new signals right now", description: "Market conditions don't meet signal thresholds at this moment." });
    },
    onError: (e: any) => toast({ title: "Signal generation failed", description: e.message, variant: "destructive" }),
  });

  const equity = account ? parseFloat(account.equity) : null;
  const buyingPower = account ? parseFloat(account.buying_power) : null;
  const isOpen = clock?.is_open ?? false;
  const daysActive = session?.daysActive ?? 1;
  const daysRemaining = session?.daysRemaining ?? 89;
  const progressPct = session?.progressPct ?? 1;

  const totalPositionValue = positions.reduce((s, p) => s + Math.abs(p.marketValue), 0);
  const totalPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);

  // Active HIGH/MEDIUM urgency alerts, not yet dismissed
  const activeAlerts = alerts.filter((a: any) =>
    (a.urgency === "HIGH" || a.urgency === "MEDIUM") &&
    a.recommendation !== "HOLD" &&
    !dismissedAlerts.includes(`${a.ticker}-${a.recommendation}`)
  );

  const dismissAlert = (ticker: string, rec: string) =>
    setDismissedAlerts(prev => [...prev, `${ticker}-${rec}`]);

  return (
    <div className="p-6 space-y-6">
      {/* Safety-net alert banner */}
      {activeAlerts.length > 0 && (
        <div className="space-y-2">
          {activeAlerts.map((alert: any) => (
            <div
              key={`${alert.ticker}-${alert.recommendation}`}
              className={`flex items-start gap-3 p-3.5 rounded-lg border text-sm ${
                alert.urgency === "HIGH"
                  ? "bg-red-500/10 border-red-500/30 text-red-300"
                  : "bg-orange-500/10 border-orange-500/30 text-orange-300"
              }`}
              data-testid={`alert-${alert.ticker}`}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="font-semibold">{alert.ticker} — {alert.recommendation.replace("_", " ")}:</span>{" "}
                <span className="text-sm opacity-90">{alert.reason}</span>
              </div>
              <button
                onClick={() => dismissAlert(alert.ticker, alert.recommendation)}
                className="flex-shrink-0 opacity-60 hover:opacity-100"
                data-testid={`dismiss-alert-${alert.ticker}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            {" · "}
            <span className={isOpen ? "text-green-400" : "text-yellow-400"}>Market {isOpen ? "open" : "closed"}</span>
            {session?.startDate && (
              <span className="ml-2 text-muted-foreground/60">· Beta Day {daysActive} of 90</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => generateSignals.mutate()} disabled={generateSignals.isPending} data-testid="btn-generate-signals">
            <RefreshCw className={`w-4 h-4 ${generateSignals.isPending ? "animate-spin" : ""}`} />
            {generateSignals.isPending ? "Analyzing..." : "Generate Signals"}
          </Button>
          <Link href="/gate">
            <Button className="gap-2" data-testid="btn-goto-gate">
              <ShieldCheck className="w-4 h-4" />
              Review {pending.length} Pending
            </Button>
          </Link>
        </div>
      </div>

      {/* 90-day progress bar */}
      {session?.startDate && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Day {daysActive}/90</span>
          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary/70 rounded-full transition-all duration-1000" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground w-20 text-right flex-shrink-0">{daysRemaining} days left</span>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <Card data-testid="kpi-equity">
          <CardContent className="pt-5 pb-5">
            <div className="text-xs text-muted-foreground mb-1">Account Equity</div>
            <div className="text-xl font-semibold mono">{equity !== null ? `$${fmt(equity, 0)}` : "—"}</div>
            <div className="text-xs text-muted-foreground mt-1">BP: {buyingPower !== null ? `$${fmt(buyingPower, 0)}` : "—"}</div>
          </CardContent>
        </Card>
        <Card data-testid="kpi-roi">
          <CardContent className="pt-5 pb-5">
            <div className="text-xs text-muted-foreground mb-1">ROI vs S&P 500</div>
            <div className={`text-xl font-semibold mono ${(trust?.roiDelta ?? 0) >= 0 ? "gain" : "loss"}`}>
              {trust ? `${trust.roiDelta >= 0 ? "+" : ""}${fmt(trust.roiDelta)}%` : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {trust?.portfolioReturn !== null && trust?.portfolioReturn !== undefined ? `Portfolio: ${trust.portfolioReturn >= 0 ? "+" : ""}${fmt(trust.portfolioReturn)}%` : "Since Day 1"}
            </div>
          </CardContent>
        </Card>
        <Card data-testid="kpi-trust-score">
          <CardContent className="pt-5 pb-5">
            <div className="text-xs text-muted-foreground mb-1">Trust Score</div>
            <div className="text-xl font-semibold mono">
              {trust ? <>{fmt(trust.trustScore, 0)}<span className="text-sm text-muted-foreground">/100</span></> : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{trust?.totalDecisions ?? 0} decisions made</div>
          </CardContent>
        </Card>
        <Card data-testid="kpi-win-rates">
          <CardContent className="pt-5 pb-5">
            <div className="text-xs text-muted-foreground mb-1">AI vs You</div>
            <div className="text-xl font-semibold mono">
              {trust && trust.totalDecisions > 0 ? `${fmt(trust.aiWinRate, 0)}%` : "N/A"}
              {trust && trust.totalDecisions > 0 && <span className="text-sm text-muted-foreground ml-1">GK AI</span>}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {trust && trust.totalDecisions > 0 ? `You: ${fmt(trust.userWinRate, 0)}%` : "Make decisions to see stats"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Pending decisions */}
        <div className="col-span-2">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Pending Decisions</CardTitle>
              <Link href="/gate"><a className="text-xs text-primary flex items-center gap-1 hover:underline">View all <ChevronRight className="w-3 h-3" /></a></Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {pending.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm space-y-2">
                  <ShieldCheck className="w-8 h-8 mx-auto opacity-20" />
                  <div>Gate is clear</div>
                  <div className="text-xs">Click "Generate Signals" to scan the market</div>
                </div>
              )}
              {pending.map(rec => {
                const expiresIn = Math.max(0, Math.floor((new Date(rec.expiresAt).getTime() - Date.now()) / 60000));
                const tsMap: Record<string, { label: string; color: string; Icon: any }> = {
                  DAY:      { label: "Day",      color: "text-orange-400", Icon: Timer },
                  SWING:    { label: "Swing",    color: "text-blue-400",   Icon: CalendarClock },
                  POSITION: { label: "Position", color: "text-purple-400", Icon: BarChart2 },
                };
                const ts = rec.tradeStyle ? tsMap[rec.tradeStyle] : null;
                const strength = rec.signalStrength ?? 50;
                return (
                  <div key={rec.id} data-testid={`rec-card-${rec.id}`} className="rec-card p-3 rounded-lg bg-secondary/40 border border-border hover:border-primary/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${rec.action === "BUY" ? "badge-buy" : "badge-sell"}`}>{rec.action}</span>
                        <span className="font-semibold mono text-sm">{rec.ticker}</span>
                        {ts && (
                          <span className={`text-xs font-medium flex items-center gap-1 ${ts.color}`}>
                            <ts.Icon className="w-3 h-3" />{ts.label}
                          </span>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 ${rec.confidence === "HIGH" ? "badge-high" : rec.confidence === "MEDIUM" ? "badge-medium" : "badge-speculative"}`}>{rec.confidence}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{rec.reasoning}</p>
                    {/* Signal conviction mini bar */}
                    <div className="mt-2">
                      <div className="h-1 bg-secondary rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${strength >= 70 ? "bg-green-500" : strength >= 40 ? "bg-yellow-500" : "bg-orange-500"}`} style={{ width: `${strength}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex gap-3 text-xs">
                        <span className="gain">▲ +{fmt(rec.upsidePercent)}%</span>
                        <span className="loss">▼ -{fmt(rec.downsidePercent)}%</span>
                        {rec.holdDaysMin && <span className="text-muted-foreground">Hold {rec.holdDaysMin}–{rec.holdDaysMax}d</span>}
                      </div>
                      <span className={`text-xs ${expiresIn < 60 ? "text-yellow-400" : "text-muted-foreground"}`}>
                        {expiresIn > 60 ? `${Math.floor(expiresIn / 60)}h` : `${expiresIn}m`} left
                      </span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          {/* Subscription verdict */}
          {trust && (
            <Card className={trust.subscriptionVerdict === "JUSTIFIED" ? "border-green-500/20" : trust.subscriptionVerdict === "UNDER_REVIEW" ? "border-red-500/20" : "border-yellow-500/20"}>
              <CardContent className="pt-5 pb-5">
                <div className="text-xs text-muted-foreground mb-2">Subscription Status</div>
                <div className={`text-sm font-semibold mb-1 ${trust.subscriptionVerdict === "JUSTIFIED" ? "gain" : trust.subscriptionVerdict === "UNDER_REVIEW" ? "loss" : trust.subscriptionVerdict === "FORMING" ? "text-primary" : "text-yellow-400"}`}>
                  {trust.subscriptionVerdict === "FORMING" ? "Building Profile" : trust.subscriptionVerdict === "JUSTIFIED" ? "Justified" : trust.subscriptionVerdict === "UNDER_REVIEW" ? "Under Review" : "Marginal"}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{trust.subscriptionRecommendation}</p>
                <Link href="/trust"><a className="text-xs text-primary mt-2 block hover:underline">Full analysis →</a></Link>
              </CardContent>
            </Card>
          )}

          {/* Live positions */}
          {positions.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  Positions
                  <span className="text-xs text-muted-foreground font-normal">${fmt(totalPositionValue, 0)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {positions.map(p => (
                  <div key={p.ticker} className="flex items-center justify-between text-xs">
                    <span className="mono font-medium">{p.ticker}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{p.shares < 0 ? "SHORT " : "LONG "}${fmt(Math.abs(p.marketValue), 0)}</span>
                      <span className={p.unrealizedPnl >= 0 ? "gain" : "loss"}>
                        {p.unrealizedPnl >= 0 ? <TrendingUp className="w-3 h-3 inline" /> : <TrendingDown className="w-3 h-3 inline" />}
                        {" "}{fmt(Math.abs(p.unrealizedPct))}%
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <div className="text-xs text-muted-foreground">No positions yet</div>
                <div className="text-xs text-muted-foreground mt-1">Approve a signal to open your first trade</div>
              </CardContent>
            </Card>
          )}

          {/* Live prices */}
          <LivePrices />

          {/* Sentiment mini-widget */}
          <SentimentWidget sentiments={allSentiment} />
        </div>
      </div>
    </div>
  );
}

function LivePrices() {
  const { data: bars } = useQuery<Record<string, any>>({ queryKey: ["/api/market/prices"], refetchInterval: 30000 });
  const tickers = ["NVDA", "TSLA", "MSFT", "AMD", "AAPL", "META"];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          Live Prices
          <span className="text-xs text-green-400 font-normal">● Live</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!bars && <div className="text-xs text-muted-foreground py-1">Loading...</div>}
        {bars && tickers.map(t => bars[t] ? (
          <div key={t} data-testid={`price-${t}`} className="flex justify-between text-xs">
            <span className="mono font-medium">{t}</span>
            <span className="mono">${bars[t].c?.toFixed(2)}</span>
          </div>
        ) : null)}
      </CardContent>
    </Card>
  );
}

function SentimentWidget({ sentiments }: { sentiments: any[] }) {
  if (!sentiments || sentiments.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Market Sentiment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No sentiment data yet. Go to Decision Gate to trigger a refresh.</p>
        </CardContent>
      </Card>
    );
  }

  const alertDot: Record<string, string> = {
    NONE:    "bg-green-500",
    WATCH:   "bg-yellow-500",
    CAUTION: "bg-orange-500",
    DANGER:  "bg-red-500",
  };
  const scoreColor = (score: number) =>
    score > 0.15 ? "gain" : score < -0.15 ? "loss" : "text-yellow-400";

  const shown = sentiments.slice(0, 8);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Market Sentiment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {shown.map((s: any) => (
          <div key={s.ticker} data-testid={`sentiment-${s.ticker}`} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${alertDot[s.alertLevel] ?? "bg-muted"}`} />
              <span className="mono font-medium">{s.ticker}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{s.label}</span>
              <span className={`mono font-medium ${scoreColor(s.score)}`}>
                {s.score >= 0 ? "+" : ""}{s.score.toFixed(2)}
              </span>
            </div>
          </div>
        ))}
        <div className="pt-1 border-t border-border flex items-center gap-3 text-xs text-muted-foreground/60">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />OK</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />Watch</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" />Caution</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Danger</span>
        </div>
      </CardContent>
    </Card>
  );
}
