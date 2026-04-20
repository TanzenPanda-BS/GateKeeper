import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldCheck, TrendingUp, Bell, CheckCircle2, ChevronRight, ChevronLeft, Zap, BarChart2, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const STEPS = [
  {
    id: 1,
    icon: ShieldCheck,
    title: "Welcome to GateKeeper AI",
    subtitle: "You control the gate. Nothing passes without your decision.",
    color: "text-primary",
  },
  {
    id: 2,
    icon: Zap,
    title: "How GateKeeper AI Works",
    subtitle: "3-layer intelligence. Every signal earns its place.",
    color: "text-yellow-400",
  },
  {
    id: 3,
    icon: TrendingUp,
    title: "Your 90-Day Evaluation",
    subtitle: "GateKeeper AI proves its value — or it doesn't.",
    color: "text-green-400",
  },
  {
    id: 4,
    icon: Bell,
    title: "Alerts & Sentiment",
    subtitle: "Real-time market intelligence, automatically.",
    color: "text-orange-400",
  },
  {
    id: 5,
    icon: CheckCircle2,
    title: "You're Ready",
    subtitle: "Your evaluation clock starts now.",
    color: "text-primary",
  },
];

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: session } = useQuery<any>({ queryKey: ["/api/session"] });
  const { data: account } = useQuery<any>({ queryKey: ["/api/alpaca/account"] });

  const generateSignals = useMutation({
    mutationFn: () => apiRequest("POST", "/api/signals/generate", {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations/pending"] });
      toast({
        title: `${data?.stored ?? 0} signals generated`,
        description: "Head to the Decision Gate to review your first signals.",
      });
      navigate("/gate");
    },
    onError: () => navigate("/"),
  });

  const equity = account ? parseFloat(account.equity) : null;
  const current = STEPS[step - 1];
  const Icon = current.icon;
  const isLast = step === STEPS.length;
  const isFirst = step === 1;

  const handleFinish = () => {
    generateSignals.mutate();
  };

  return (
    <div className="min-h-full flex items-center justify-center p-8 bg-background">
      <div className="w-full max-w-2xl space-y-8">

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map(s => (
            <button
              key={s.id}
              onClick={() => setStep(s.id)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s.id === step ? "w-8 bg-primary" : s.id < step ? "w-3 bg-primary/40" : "w-3 bg-border"
              }`}
            />
          ))}
        </div>

        {/* Step card */}
        <Card className="border-border/60 shadow-xl">
          <CardContent className="pt-10 pb-10 px-10 space-y-8">

            {/* Icon + title */}
            <div className="text-center space-y-3">
              <div className={`w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto`}>
                <Icon className={`w-7 h-7 ${current.color}`} />
              </div>
              <h1 className="text-xl font-bold">{current.title}</h1>
              <p className="text-sm text-muted-foreground">{current.subtitle}</p>
            </div>

            {/* Step content */}
            <div className="space-y-4">
              {step === 1 && <StepWelcome equity={equity} daysActive={session?.daysActive} />}
              {step === 2 && <StepHowItWorks />}
              {step === 3 && <StepEvaluation />}
              {step === 4 && <StepAlerts />}
              {step === 5 && <StepReady equity={equity} />}
            </div>

            {/* Nav buttons */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost"
                onClick={() => setStep(s => s - 1)}
                disabled={isFirst}
                className="gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>

              {isLast ? (
                <Button
                  className="gap-2 px-8"
                  onClick={handleFinish}
                  disabled={generateSignals.isPending}
                  data-testid="btn-finish-onboarding"
                >
                  {generateSignals.isPending ? "Scanning market..." : "Generate First Signals"}
                  <Zap className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  className="gap-2"
                  onClick={() => setStep(s => s + 1)}
                  data-testid={`btn-next-step-${step}`}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Skip */}
        {!isLast && (
          <div className="text-center">
            <button
              onClick={() => navigate("/")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip onboarding → go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step content components ──────────────────────────────────────────────────

function StepWelcome({ equity, daysActive }: { equity: number | null; daysActive?: number }) {
  return (
    <div className="space-y-3">
      <InfoRow icon="🏦" label="Paper Account" value={equity !== null ? `$${equity.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "Loading..."} />
      <InfoRow icon="📅" label="Evaluation Period" value="90 days" />
      <InfoRow icon="🎯" label="Goal" value="Beat S&P 500 returns" />
      <InfoRow icon="🤖" label="Powered by" value="GateKeeper AI Signal Engine" />
      <div className="mt-4 p-4 rounded-lg bg-primary/5 border border-primary/10 text-sm text-muted-foreground leading-relaxed">
        GateKeeper AI analyzes RSI, momentum, volume patterns, and real-time news sentiment to generate trade signals.
        You decide what passes through the gate. Every decision is tracked. Every outcome is scored.
      </div>
    </div>
  );
}

function StepHowItWorks() {
  const steps = [
    {
      icon: <BarChart2 className="w-4 h-4 text-primary" />,
      title: "Signal Engine",
      desc: "Scans 8 major tickers using RSI, SMA crossovers, momentum, and volume. Generates BUY/SELL signals with confidence levels.",
    },
    {
      icon: <ShieldCheck className="w-4 h-4 text-yellow-400" />,
      title: "Decision Gate",
      desc: "Every signal requires your approval before anything is traded. You can approve, reject, or modify the position size.",
    },
    {
      icon: <Activity className="w-4 h-4 text-orange-400" />,
      title: "Sentiment Layer",
      desc: "Alpaca News + MarketAux scored in real-time. CAUTION and DANGER alerts surface automatically — even mid-hold.",
    },
    {
      icon: <TrendingUp className="w-4 h-4 text-green-400" />,
      title: "Trust Score",
      desc: "GateKeeper AI earns trust by being right. Your Trust Score updates every night based on resolved trade outcomes.",
    },
  ];
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={i} className="flex gap-3 p-3.5 rounded-lg bg-secondary/30 border border-border">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
            {s.icon}
          </div>
          <div>
            <div className="text-sm font-semibold mb-0.5">{s.title}</div>
            <div className="text-xs text-muted-foreground leading-relaxed">{s.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StepEvaluation() {
  const verdicts = [
    { label: "JUSTIFIED", color: "text-green-400", desc: "GateKeeper AI is beating S&P 500 — subscription is earned." },
    { label: "UNDER REVIEW", color: "text-red-400", desc: "Performance is lagging. 30-day recalibration window active." },
    { label: "MARGINAL", color: "text-yellow-400", desc: "Slightly below benchmark — monitoring continues." },
    { label: "FORMING", color: "text-primary", desc: "Not enough decisions yet. Make at least 5 to unlock scoring." },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground leading-relaxed">
        The Trust Score (0–100) is recalculated every night. It measures two things:
        <span className="text-foreground font-medium"> engagement rate</span> (are you using it?) and
        <span className="text-foreground font-medium"> win rate</span> (is GateKeeper AI's ROI beating the S&P 500?).
      </p>
      <div className="grid grid-cols-2 gap-2">
        {verdicts.map((v, i) => (
          <div key={i} className="p-3 rounded-lg bg-secondary/30 border border-border">
            <div className={`text-xs font-bold mb-1 ${v.color}`}>{v.label}</div>
            <div className="text-xs text-muted-foreground leading-relaxed">{v.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepAlerts() {
  const levels = [
    { dot: "bg-green-500", label: "NONE", desc: "No news concern. Normal signal conditions." },
    { dot: "bg-yellow-500", label: "WATCH", desc: "Minor mixed signals. Monitor — no action needed." },
    { dot: "bg-orange-500", label: "CAUTION", desc: "Conflicting sentiment. Review open positions." },
    { dot: "bg-red-500",    label: "DANGER", desc: "Strong adverse news. Alert fires automatically." },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Sentiment refreshes every ~30 minutes during market hours. Signals are flagged if earnings are imminent.
        DANGER alerts fire a push notification automatically — no need to keep the app open.
      </p>
      <div className="space-y-2">
        {levels.map((l, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border text-sm">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${l.dot}`} />
            <span className="font-semibold w-20 flex-shrink-0">{l.label}</span>
            <span className="text-muted-foreground text-xs">{l.desc}</span>
          </div>
        ))}
      </div>
      <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20 text-xs text-orange-300 leading-relaxed">
        ⚠️ Earnings proximity is detected automatically. When a signal fires within 2 days of expected earnings,
        GateKeeper AI will flag the elevated binary risk in the signal reasoning.
      </div>
    </div>
  );
}

function StepReady({ equity }: { equity: number | null }) {
  return (
    <div className="space-y-4">
      <div className="p-5 rounded-xl bg-primary/5 border border-primary/15 space-y-3">
        <div className="text-sm font-semibold text-primary">Your setup is complete</div>
        <div className="space-y-2">
          <CheckItem label="Paper trading account connected" />
          <CheckItem label="Signal engine ready (8 tickers)" />
          <CheckItem label="Sentiment engine active (Alpaca + MarketAux)" />
          <CheckItem label="EOD pipeline scheduled (4:30 PM CDT daily)" />
          <CheckItem label="Earnings proximity detection enabled" />
          <CheckItem label="Hold window enforcement active" />
        </div>
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed text-center">
        Click <span className="text-foreground font-medium">Generate First Signals</span> to scan the market
        and populate your Decision Gate. Your 90-day clock is running.
      </div>
      {equity !== null && (
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Starting equity</div>
          <div className="text-2xl font-bold mono text-foreground">
            ${equity.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function CheckItem({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
