import { useQuery } from "@tanstack/react-query";
import {
  Award, TrendingUp, Brain, Target, BarChart2,
  CheckCircle, XCircle, RefreshCw, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface ScorecardData {
  growthScore: number;
  decisionQuality: number;  // 40 pts
  learningVelocity: number; // 30 pts
  aiAlignment: number;      // 30 pts
  grade: string;
  gradeLabel: string;
  totalDecisions: number;
  approvalRate: number;
  aiWinRate: number;
  userWinRate: number;
  roiDelta: number;
  trustScore: number;
  subscriptionVerdict: string;
  daysActive: number;
  decisionQualityBreakdown: {
    winRateScore: number;
    riskRewardScore: number;
    consistencyScore: number;
  };
  learningVelocityBreakdown: {
    improvementScore: number;
    adaptationScore: number;
    streakScore: number;
  };
  aiAlignmentBreakdown: {
    approvalAlignmentScore: number;
    outcomeAlignmentScore: number;
    calibrationScore: number;
  };
}

function ScorePill({ score, max }: { score: number; max: number }) {
  const pct = Math.min(100, (score / max) * 100);
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-orange-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold mono w-12 text-right">{fmt(score, 1)} / {max}</span>
    </div>
  );
}

function GradeCircle({ grade, score }: { grade: string; score: number }) {
  const colors: Record<string, string> = {
    "A+": "text-green-400 border-green-400", A: "text-green-400 border-green-400",
    "B+": "text-blue-400 border-blue-400", B: "text-blue-400 border-blue-400",
    "C+": "text-yellow-400 border-yellow-400", C: "text-yellow-400 border-yellow-400",
    D: "text-orange-400 border-orange-400", F: "text-red-400 border-red-400",
  };
  const cls = colors[grade] ?? "text-muted-foreground border-muted";
  return (
    <div className={`w-20 h-20 rounded-full border-2 flex flex-col items-center justify-center ${cls}`}>
      <span className="text-2xl font-bold">{grade}</span>
      <span className="text-xs font-medium mono">{fmt(score, 0)}</span>
    </div>
  );
}

export default function Scorecard() {
  const { data, isLoading } = useQuery<ScorecardData>({
    queryKey: ["/api/scorecard"],
    refetchInterval: 300000,
  });

  if (isLoading) return (
    <div className="p-6 flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
      <RefreshCw className="w-4 h-4 animate-spin" />Loading scorecard…
    </div>
  );

  if (!data) return (
    <div className="p-6 text-center py-16">
      <Award className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">No scorecard data yet. Make at least 5 decisions to generate your score.</p>
    </div>
  );

  const dqBreakdown = data.decisionQualityBreakdown;
  const lvBreakdown = data.learningVelocityBreakdown;
  const aaBreakdown = data.aiAlignmentBreakdown;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold">Growth Scorecard</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Your composite trading intelligence score — measures decision quality, learning velocity, and GateKeeper AI alignment over Day {data.daysActive} of 90.
        </p>
      </div>

      {/* Hero score */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
        <CardContent className="pt-6 pb-6">
          <div className="flex items-center gap-6">
            <GradeCircle grade={data.grade} score={data.growthScore} />
            <div className="flex-1">
              <div className="text-sm text-muted-foreground mb-1">Overall Growth Score</div>
              <div className="text-4xl font-bold mono">{fmt(data.growthScore, 1)}<span className="text-xl text-muted-foreground"> / 100</span></div>
              <div className="text-sm text-muted-foreground mt-1">{data.gradeLabel}</div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden mt-3">
                <div
                  className={`h-full rounded-full transition-all ${data.growthScore >= 70 ? "bg-green-500" : data.growthScore >= 40 ? "bg-yellow-500" : "bg-orange-500"}`}
                  style={{ width: `${data.growthScore}%` }}
                />
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground mb-0.5">Trust Score</div>
              <div className="text-2xl font-bold mono">{fmt(data.trustScore, 0)}</div>
              <div className="text-xs text-muted-foreground mt-2 mb-0.5">Verdict</div>
              <div className={`text-xs font-semibold px-2 py-0.5 rounded ${
                data.subscriptionVerdict === "SUBSCRIBE" ? "bg-green-500/15 text-green-400" :
                data.subscriptionVerdict === "DO_NOT_SUBSCRIBE" ? "bg-red-500/15 text-red-400" :
                "bg-yellow-500/15 text-yellow-400"
              }`}>{data.subscriptionVerdict.replace(/_/g, " ")}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Three pillars */}
      <div className="grid grid-cols-3 gap-4">
        {/* Decision Quality */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-400" />
              Decision Quality
              <span className="ml-auto text-xs text-muted-foreground font-normal">40 pts</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold mono">{fmt(data.decisionQuality, 1)}<span className="text-sm text-muted-foreground"> / 40</span></div>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Win Rate</span><span className="mono">{fmt(dqBreakdown.winRateScore, 1)}/16</span>
                </div>
                <ScorePill score={dqBreakdown.winRateScore} max={16} />
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Risk/Reward</span><span className="mono">{fmt(dqBreakdown.riskRewardScore, 1)}/14</span>
                </div>
                <ScorePill score={dqBreakdown.riskRewardScore} max={14} />
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Consistency</span><span className="mono">{fmt(dqBreakdown.consistencyScore, 1)}/10</span>
                </div>
                <ScorePill score={dqBreakdown.consistencyScore} max={10} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-2">
              Measures the quality of your approve/reject decisions based on actual trade outcomes.
            </p>
          </CardContent>
        </Card>

        {/* Learning Velocity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              Learning Velocity
              <span className="ml-auto text-xs text-muted-foreground font-normal">30 pts</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold mono">{fmt(data.learningVelocity, 1)}<span className="text-sm text-muted-foreground"> / 30</span></div>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Improvement</span><span className="mono">{fmt(lvBreakdown.improvementScore, 1)}/12</span>
                </div>
                <ScorePill score={lvBreakdown.improvementScore} max={12} />
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Adaptation</span><span className="mono">{fmt(lvBreakdown.adaptationScore, 1)}/10</span>
                </div>
                <ScorePill score={lvBreakdown.adaptationScore} max={10} />
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Win Streaks</span><span className="mono">{fmt(lvBreakdown.streakScore, 1)}/8</span>
                </div>
                <ScorePill score={lvBreakdown.streakScore} max={8} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-2">
              How quickly you're improving over the 90-day window. Early low scores are expected.
            </p>
          </CardContent>
        </Card>

        {/* AI Alignment */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              AI Alignment
              <span className="ml-auto text-xs text-muted-foreground font-normal">30 pts</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold mono">{fmt(data.aiAlignment, 1)}<span className="text-sm text-muted-foreground"> / 30</span></div>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Approval Rate</span><span className="mono">{fmt(aaBreakdown.approvalAlignmentScore, 1)}/12</span>
                </div>
                <ScorePill score={aaBreakdown.approvalAlignmentScore} max={12} />
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Outcome Match</span><span className="mono">{fmt(aaBreakdown.outcomeAlignmentScore, 1)}/10</span>
                </div>
                <ScorePill score={aaBreakdown.outcomeAlignmentScore} max={10} />
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Calibration</span><span className="mono">{fmt(aaBreakdown.calibrationScore, 1)}/8</span>
                </div>
                <ScorePill score={aaBreakdown.calibrationScore} max={8} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-2">
              How well your decisions align with GateKeeper AI signal quality and outcomes.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Raw stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" />Raw Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-6 gap-4 text-center">
            {[
              ["Decisions", data.totalDecisions, ""],
              ["Approval Rate", `${fmt(data.approvalRate, 0)}%`, ""],
              ["AI Win Rate", `${fmt(data.aiWinRate, 0)}%`, data.aiWinRate >= 55 ? "gain" : data.aiWinRate < 40 ? "loss" : ""],
              ["Your Win Rate", `${fmt(data.userWinRate, 0)}%`, data.userWinRate >= 55 ? "gain" : data.userWinRate < 40 ? "loss" : ""],
              ["ROI vs S&P", `${data.roiDelta >= 0 ? "+" : ""}${fmt(data.roiDelta, 2)}%`, data.roiDelta >= 0 ? "gain" : "loss"],
              ["Day", `${data.daysActive} / 90`, ""],
            ].map(([label, value, cls]) => (
              <div key={String(label)}>
                <div className="text-xs text-muted-foreground mb-1">{label}</div>
                <div className={`text-sm font-semibold mono ${cls}`}>{value}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Methodology */}
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
        <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <p>
          <span className="text-foreground font-medium">Score methodology:</span> Decision Quality (40 pts) measures win rate, risk/reward execution, and
          consistency. Learning Velocity (30 pts) rewards week-over-week improvement, adaptation to market conditions, and consecutive correct calls.
          AI Alignment (30 pts) scores how well your decisions track GateKeeper AI signal accuracy. Scores are normalized to your active days — Day 2 and Day 30 are not comparable.
        </p>
      </div>
    </div>
  );
}
