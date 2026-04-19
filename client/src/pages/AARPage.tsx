import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, AlertTriangle, Trophy, XCircle, CheckCircle, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AfterActionReport } from "@shared/schema";

function fmt(n: number, d = 1) { return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }

export default function AARPage() {
  const { data: reports = [], isLoading } = useQuery<AfterActionReport[]>({ queryKey: ["/api/reports"] });
  const report = reports[0];

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold">After Action Report</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Every recommendation tracked to its outcome — approved, rejected, or modified</p>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading reports...</div>}

      {report && (
        <>
          {/* Period banner */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-primary/70 mb-1 font-medium uppercase tracking-wide">Weekly Report</div>
                  <p className="text-sm text-foreground leading-relaxed max-w-xl">{report.narrativeSummary}</p>
                </div>
                <div className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold ${
                  report.subscriptionVerdict === "JUSTIFIED" ? "bg-green-500/15 text-green-400" :
                  report.subscriptionVerdict === "UNDER_REVIEW" ? "bg-red-500/15 text-red-400" :
                  "bg-yellow-500/15 text-yellow-400"
                }`}>
                  {report.subscriptionVerdict}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Scorecard */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "GateKeeper AI Accuracy", value: `${fmt(report.aiAccuracyPct)}%`, sub: `${report.aiCorrectCount}/${report.totalRecommendations} correct` },
              { label: "Your Accuracy", value: `${fmt(report.userAccuracyPct)}%`, sub: `${report.userCorrectCount}/${report.totalRecommendations} correct` },
              { label: "Actual P&L", value: `${report.actualPnl >= 0 ? "+" : ""}$${fmt(report.actualPnl)}`, sub: "Real trades only", gain: report.actualPnl >= 0 },
              { label: "Phantom P&L", value: `${report.phantomPnl >= 0 ? "+" : ""}$${fmt(report.phantomPnl)}`, sub: "If GateKeeper AI followed fully", gain: report.phantomPnl >= 0 },
            ].map((kpi, i) => (
              <Card key={i}>
                <CardContent className="pt-5 pb-5">
                  <div className="text-xs text-muted-foreground mb-1">{kpi.label}</div>
                  <div className={`text-xl font-semibold mono ${kpi.gain === true ? "gain" : kpi.gain === false ? "loss" : ""}`}>{kpi.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{kpi.sub}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Decision breakdown */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Decision Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {[
                  { label: "Approved (full)", count: report.approvedCount, icon: CheckCircle, color: "text-green-400" },
                  { label: "Modified", count: report.modifiedCount, icon: Minus, color: "text-yellow-400" },
                  { label: "Rejected", count: report.rejectedCount, icon: XCircle, color: "text-red-400" },
                  { label: "Auto-executed", count: report.autoExecutedCount, icon: TrendingUp, color: "text-primary" },
                ].map(({ label, count, icon: Icon, color }) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${color}`} />
                      <span className="text-muted-foreground">{label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${color === "text-green-400" ? "bg-green-500" : color === "text-yellow-400" ? "bg-yellow-500" : color === "text-red-400" ? "bg-red-500" : "bg-primary"}`}
                          style={{ width: `${(count / report.totalRecommendations) * 100}%` }} />
                      </div>
                      <span className="mono font-medium w-4 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Wins and misses */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Key Outcomes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.biggestWin && (() => {
                  const win = JSON.parse(report.biggestWin);
                  return (
                    <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/15">
                      <div className="flex items-center gap-2 mb-1">
                        <Trophy className="w-3.5 h-3.5 text-green-400" />
                        <span className="text-xs font-medium text-green-400">Best Win</span>
                        <span className="mono text-xs text-muted-foreground">{win.ticker}</span>
                      </div>
                      <div className="text-sm font-semibold gain">+${fmt(win.actualPnl)}</div>
                      <p className="text-xs text-muted-foreground mt-0.5">{win.reason}</p>
                    </div>
                  );
                })()}
                {report.biggestMiss && (() => {
                  const miss = JSON.parse(report.biggestMiss);
                  return (
                    <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/15">
                      <div className="flex items-center gap-2 mb-1">
                        <XCircle className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-xs font-medium text-red-400">Biggest Miss</span>
                        <span className="mono text-xs text-muted-foreground">{miss.ticker}</span>
                      </div>
                      <div className="text-sm font-semibold loss">-${fmt(miss.phantomPnl)} phantom</div>
                      <p className="text-xs text-muted-foreground mt-0.5">{miss.reason}</p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>

          {/* Behavioral Flags */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                Behavioral Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(JSON.parse(report.behavioralFlags || "[]") as string[]).map((flag, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/15 text-sm">
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{flag}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
