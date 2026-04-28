import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/queryClient";
import { Shield, Radio, CheckCircle2, Clock } from "lucide-react";

interface ScanEntry {
  id: number;
  scannedAt: string;
  generated: number;
  stored: number;
  tickersEvaluated: string[];
  topCandidate: string | null;
  topCandidateStrength: number | null;
  scanType: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "America/Chicago",
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric",
    timeZone: "America/Chicago",
  });
}

export function ScanActivityFeed() {
  const { data: log = [], isLoading } = useQuery<ScanEntry[]>({
    queryKey: ["scan-log"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/scan-log`, { credentials: "omit" });
      return r.json();
    },
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">GateKeeper AI Activity</span>
        </div>
        <span className="text-xs text-muted-foreground">Last 10 scans</span>
      </div>

      {isLoading && (
        <div className="text-xs text-muted-foreground py-4 text-center">Loading activity…</div>
      )}

      {!isLoading && log.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Shield className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No scans recorded yet.</p>
          <p className="text-xs text-muted-foreground">Click "Generate Signals" to run the first scan.</p>
        </div>
      )}

      {!isLoading && log.length > 0 && (
        <div className="space-y-0 divide-y divide-border/50">
          {log.map((entry, i) => {
            const signalPassed = entry.stored > 0;
            const nothingFound = entry.generated === 0;

            return (
              <div key={entry.id} className={`py-3 flex gap-3 ${i === 0 ? "" : ""}`}>
                {/* Icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {signalPassed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Shield className="w-4 h-4 text-muted-foreground/50" />
                  )}
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    {/* Main message */}
                    <p className="text-xs font-medium leading-snug">
                      {signalPassed ? (
                        <span className="text-emerald-400">
                          {entry.stored} signal{entry.stored !== 1 ? "s" : ""} sent to Decision Gate
                        </span>
                      ) : nothingFound ? (
                        <span className="text-muted-foreground">Market quiet — no candidates found</span>
                      ) : (
                        <span className="text-muted-foreground">
                          {entry.generated} candidate{entry.generated !== 1 ? "s" : ""} evaluated — none met thresholds
                        </span>
                      )}
                    </p>
                    {/* Timestamp */}
                    <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {timeAgo(entry.scannedAt)}
                    </span>
                  </div>

                  {/* Sub-row: tickers + date */}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {/* Date + time */}
                    <span className="text-[10px] text-muted-foreground/50">
                      {fmtDate(entry.scannedAt)} · {fmtTime(entry.scannedAt)} CT
                    </span>

                    {/* Tickers evaluated */}
                    {entry.tickersEvaluated.length > 0 && (
                      <span className="text-[10px] text-muted-foreground/50">
                        · Watched: {entry.tickersEvaluated.slice(0, 6).join(", ")}
                        {entry.tickersEvaluated.length > 6 ? ` +${entry.tickersEvaluated.length - 6}` : ""}
                      </span>
                    )}
                  </div>

                  {/* Top candidate badge (only when nothing stored but there was a near-miss) */}
                  {!signalPassed && entry.topCandidate && entry.topCandidateStrength != null && (
                    <div className="mt-1.5 inline-flex items-center gap-1 bg-muted/40 rounded-full px-2 py-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        Closest: <span className="font-medium text-foreground">{entry.topCandidate}</span>
                        {" "}·{" "}
                        <span className="text-amber-400">{Math.round(entry.topCandidateStrength * 100)}% of threshold</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer pulse */}
      <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary/80" />
        </span>
        <span className="text-[10px] text-muted-foreground">GateKeeper AI is actively monitoring markets</span>
      </div>
    </div>
  );
}
