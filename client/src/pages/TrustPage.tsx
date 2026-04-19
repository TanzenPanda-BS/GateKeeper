import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Award, AlertCircle, ArrowUpRight, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrustMetrics } from "@shared/schema";

function fmt(n: number, d = 1) { return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }

const quadrantInfo: Record<string, { title: string; desc: string; color: string; action: string }> = {
  HIGH_TRUST_POS: {
    title: "Platform is working",
    desc: "You and GateKeeper AI are aligned and producing results above market. This is the optimal state.",
    color: "text-green-400",
    action: "Consider upgrading for deeper research signals.",
  },
  HIGH_TRUST_NEG: {
    title: "You're following us — we're not delivering",
    desc: "High engagement, below-market results. The AI's calibration needs adjustment for current market conditions.",
    color: "text-red-400",
    action: "Stay at reduced rate during recalibration. 60-day performance guarantee in effect.",
  },
  LOW_TRUST_POS: {
    title: "You're winning — but not because of us",
    desc: "Strong results driven by your own instincts, not GateKeeper AI signals. The platform may be underutilized.",
    color: "text-yellow-400",
    action: "Consider downgrading to research-only tier. Use AI as a second opinion on blind spots.",
  },
  LOW_TRUST_NEG: {
    title: "Neither of us is working right now",
    desc: "Low engagement, below-market returns. A trust deficit is likely the root cause — not platform failure.",
    color: "text-red-400",
    action: "Trust Building Program available: 30-day guided re-engagement with small positions.",
  },
};

export default function TrustPage() {
  const { data: trust, isLoading } = useQuery<TrustMetrics>({ queryKey: ["/api/trust-metrics"] });

  const qInfo = trust ? quadrantInfo[trust.quadrant] ?? quadrantInfo.LOW_TRUST_POS : null;

  // Trust score color
  const trustColor = !trust ? "" : trust.trustScore >= 70 ? "text-green-400" : trust.trustScore >= 50 ? "text-yellow-400" : "text-red-400";
  const roiColor = !trust ? "" : trust.roiDelta >= 0 ? "gain" : "loss";

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Trust & ROI Analysis</h1>
        <p className="text-sm text-muted-foreground mt-0.5">90-day rolling evaluation of the platform and your subscription value</p>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading...</div>}

      {trust && qInfo && (
        <>
          {/* Quadrant verdict */}
          <Card className="border-primary/20">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-start gap-5">
                {/* Trust ring */}
                <div className="flex-shrink-0 relative">
                  <svg viewBox="0 0 80 80" className="w-20 h-20 trust-ring">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
                    <circle
                      cx="40" cy="40" r="34" fill="none"
                      stroke={trust.trustScore >= 70 ? "hsl(142 60% 45%)" : trust.trustScore >= 50 ? "hsl(38 88% 52%)" : "hsl(4 72% 56%)"}
                      strokeWidth="6"
                      strokeDasharray={`${(trust.trustScore / 100) * 213.6} 213.6`}
                      strokeDashoffset="53.4"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-xl font-bold mono leading-none ${trustColor}`}>{trust.trustScore}</span>
                    <span className="text-xs text-muted-foreground">trust</span>
                  </div>
                </div>

                <div className="flex-1">
                  <div className={`text-lg font-semibold mb-1 ${qInfo.color}`}>{qInfo.title}</div>
                  <p className="text-sm text-muted-foreground mb-3">{qInfo.desc}</p>
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/60 border border-border">
                    <ArrowUpRight className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-sm text-foreground">{qInfo.action}</span>
                  </div>
                </div>

                <div className="flex-shrink-0 text-right">
                  <div className="text-xs text-muted-foreground mb-1">ROI vs S&P 500</div>
                  <div className={`text-2xl font-bold mono ${roiColor}`}>
                    {trust.roiDelta >= 0 ? "+" : ""}{fmt(trust.roiDelta)}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Day {trust.daysActive} of 90</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Subscription status */}
          <Card className={trust.subscriptionVerdict === "JUSTIFIED" ? "border-green-500/20" : trust.subscriptionVerdict === "UNDER_REVIEW" ? "border-red-500/20" : "border-yellow-500/20"}>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Subscription Verdict</div>
                  <div className={`text-lg font-semibold mb-2 ${
                    trust.subscriptionVerdict === "JUSTIFIED" ? "text-green-400" :
                    trust.subscriptionVerdict === "UNDER_REVIEW" ? "text-red-400" : "text-yellow-400"
                  }`}>
                    {trust.subscriptionVerdict === "JUSTIFIED" ? "Justified" : trust.subscriptionVerdict === "UNDER_REVIEW" ? "Under Review" : "Marginal"}
                  </div>
                  <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">{trust.subscriptionRecommendation}</p>
                </div>
                <div className="flex-shrink-0">
                  {trust.subscriptionVerdict === "JUSTIFIED" ? (
                    <Award className="w-8 h-8 text-green-400/40" />
                  ) : (
                    <AlertCircle className="w-8 h-8 text-yellow-400/40" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Auto-trade ROI */}
          <Card className="border-yellow-500/15">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                Auto-Trade Performance (Exception Engine)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(trust as any).autoTradeCount > 0 ? (
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: "Auto Trades", value: `${(trust as any).autoTradeCount}`, sub: "Exception engine executions" },
                    { label: "Win Rate", value: `${fmt((trust as any).autoTradeWinRate)}%`, sub: "Closed auto-trades correct", colored: true, gain: (trust as any).autoTradeWinRate >= 50 },
                    { label: "Total P&L", value: `${(trust as any).autoTradeRoi >= 0 ? "+" : ""}$${fmt(Math.abs((trust as any).autoTradeRoi))}`, sub: "Realized from auto-trades", colored: true, gain: (trust as any).autoTradeRoi >= 0 },
                    { label: "Win Count", value: `${(trust as any).autoTradeWins}/${(trust as any).autoTradeCount}`, sub: "Trades that hit target" },
                  ].map((kpi, i) => (
                    <div key={i}>
                      <div className="text-xs text-muted-foreground mb-0.5">{kpi.label}</div>
                      <div className={`text-lg font-semibold mono ${(kpi as any).colored ? ((kpi as any).gain ? "gain" : "loss") : ""}`}>{kpi.value}</div>
                      <div className="text-xs text-muted-foreground">{kpi.sub}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground py-2">
                  No auto-executed trades yet. Auto-trades are triggered by the Exception Engine for highly volatile positions that need immediate action — no decision gate required.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Accuracy Comparison</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "GateKeeper AI Win Rate", value: trust.aiWinRate, color: "bg-primary" },
                  { label: "Your Win Rate", value: trust.userWinRate, color: "bg-yellow-500" },
                  { label: "Approval Rate", value: trust.approvalRate, color: "bg-secondary-foreground/30" },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium mono">{fmt(value)}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* 2x2 quadrant map */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Quadrant Map</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {[
                    { key: "HIGH_TRUST_POS", label: "High Trust\n+ ROI", color: "bg-green-500/15 text-green-400 border-green-500/30" },
                    { key: "LOW_TRUST_POS", label: "Low Trust\n+ ROI", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
                    { key: "HIGH_TRUST_NEG", label: "High Trust\n- ROI", color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
                    { key: "LOW_TRUST_NEG", label: "Low Trust\n- ROI", color: "bg-red-500/15 text-red-400 border-red-500/30" },
                  ].map(q => (
                    <div key={q.key} className={`p-2.5 rounded border ${q.color} ${trust.quadrant === q.key ? "ring-2 ring-offset-1 ring-offset-background ring-primary" : ""} text-center`}>
                      <div className="whitespace-pre-line font-medium leading-tight">{q.label}</div>
                      {trust.quadrant === q.key && <div className="text-xs mt-1 opacity-60">← You are here</div>}
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-muted-foreground">Next review: Day 90 ({90 - trust.daysActive} days)</div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
