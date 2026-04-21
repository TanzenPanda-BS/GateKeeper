import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Ghost, TrendingUp, TrendingDown, BarChart2,
  Info, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface ShadowEntry {
  id: number;
  ticker: string;
  action: string;
  shares: number;
  priceAtRecommendation: number;
  targetPrice: number;
  stopLoss: number;
  upsidePercent: number;
  downsidePercent: number;
  confidence: string;
  reasoning: string;
  status: string;
  userDecision: string | null;
  createdAt: string;
  expiresAt: string;
  resolvedAt: string | null;
  resolvedPrice: number | null;
  phantomPnl: number | null;
  outcomePercent: number | null;
  aiWasCorrect: number | null;
}

interface ShadowSummary {
  entries: ShadowEntry[];
  totalPhantomPnl: number;
  totalEntries: number;
  aiWins: number;
  aiLosses: number;
  aiAccuracy: number;
  pendingCount: number;
}

export default function ShadowPortfolio() {
  const { data, isLoading } = useQuery<ShadowSummary>({
    queryKey: ["/api/shadow"],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Ghost className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold">Shadow Portfolio</h1>
        </div>
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />Loading shadow trades…
        </div>
      </div>
    );
  }

  const entries = data?.entries ?? [];
  const pending = entries.filter(e => !e.resolvedAt);
  const resolved = entries.filter(e => e.resolvedAt);
  const totalPhantomPnl = data?.totalPhantomPnl ?? 0;
  const aiAccuracy = data?.aiAccuracy ?? 0;
  const aiWins = data?.aiWins ?? 0;
  const aiLosses = data?.aiLosses ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Ghost className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold">Shadow Portfolio</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Every trade you rejected is tracked here at market prices — this is what GateKeeper AI would have returned without you in the loop.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground mb-1">Ghost P&amp;L (resolved)</div>
            <div className={`text-lg font-bold mono ${totalPhantomPnl >= 0 ? "gain" : "loss"}`}>
              {totalPhantomPnl >= 0 ? "+" : ""}${fmt(Math.abs(totalPhantomPnl), 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">What these rejections would have yielded</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground mb-1">GateKeeper AI Accuracy</div>
            <div className="text-lg font-bold mono">{aiAccuracy.toFixed(0)}%</div>
            <div className="text-xs text-muted-foreground mt-0.5">{aiWins}W / {aiLosses}L on resolved trades</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground mb-1">Active Ghost Trades</div>
            <div className="text-lg font-bold mono">{pending.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Being tracked to resolution</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground mb-1">Total Tracked</div>
            <div className="text-lg font-bold mono">{entries.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{resolved.length} resolved, {pending.length} pending</div>
          </CardContent>
        </Card>
      </div>

      {/* Info callout */}
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
        <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <p>
          <span className="text-foreground font-medium">How shadow tracking works:</span> When you reject or ignore a GateKeeper AI signal,
          the system continues tracking its phantom P&amp;L until market close. At EOD, each trade is resolved at the closing price.
          A positive ghost P&amp;L means GateKeeper AI was right — you left money on the table.
          A negative ghost P&amp;L means your rejection protected you.
        </p>
      </div>

      {/* Active ghost trades */}
      {pending.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            Active Ghost Trades ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map(entry => (
              <ShadowCard key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {/* Resolved ghost trades */}
      {resolved.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 text-muted-foreground">Resolved Ghost Trades ({resolved.length})</h2>
          <div className="space-y-3">
            {resolved.slice(0, 20).map(entry => (
              <ShadowCard key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Ghost className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground font-medium">No ghost trades yet</p>
          <p className="text-xs text-muted-foreground mt-1">Reject or skip a signal from the Decision Gate and it will appear here.</p>
        </div>
      )}
    </div>
  );
}

function ShadowCard({ entry }: { entry: ShadowEntry }) {
  const isResolved = !!entry.resolvedAt;
  const phantomPnl = entry.phantomPnl;
  const resolvedPrice = entry.resolvedPrice;
  const outcomePercent = entry.outcomePercent;
  const aiCorrect = entry.aiWasCorrect;
  const entryDate = new Date(entry.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <Card className={`${isResolved && phantomPnl !== null ? (phantomPnl >= 0 ? "border-green-500/20" : "border-red-500/20") : "border-yellow-500/20"}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold ${entry.action === "BUY" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
              {entry.action}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold mono text-sm">{entry.ticker}</span>
                <span className="text-xs text-muted-foreground">{entry.shares} sh @ ${fmt(entry.priceAtRecommendation)}</span>
                {isResolved ? (
                  aiCorrect === 1
                    ? <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-medium">AI ✓ Correct</span>
                    : aiCorrect === 0
                    ? <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-medium">AI ✗ Wrong</span>
                    : null
                ) : (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 font-medium">Tracking…</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{entry.reasoning}</div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            {isResolved && phantomPnl !== null ? (
              <>
                <div className={`text-sm font-bold mono ${phantomPnl >= 0 ? "gain" : "loss"}`}>
                  {phantomPnl >= 0 ? "+" : ""}${fmt(Math.abs(phantomPnl), 0)}
                </div>
                <div className={`text-xs ${outcomePercent !== null && outcomePercent >= 0 ? "gain" : "loss"}`}>
                  {outcomePercent !== null ? `${outcomePercent >= 0 ? "+" : ""}${fmt(outcomePercent, 1)}%` : "–"}
                </div>
                {resolvedPrice && (
                  <div className="text-xs text-muted-foreground">closed ${fmt(resolvedPrice)}</div>
                )}
              </>
            ) : (
              <div className="text-xs text-muted-foreground">
                Target <span className="gain mono">${fmt(entry.targetPrice)}</span>
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-0.5">{entryDate}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
