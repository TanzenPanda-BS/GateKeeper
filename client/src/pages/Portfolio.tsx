import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Zap, ShieldAlert, Pencil, X, TrendingDown, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { Position } from "@shared/schema";

function fmt(n: number, d = 2) { return Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }

// ── Trailing Stop Row ────────────────────────────────────────────────────────
function StopRow({ pos, onEdit, onCancel }: {
  pos: Position & { stopLossFloor?: number | null; trailPct?: number | null; trailHighWaterMark?: number | null; stopActive?: number };
  onEdit: () => void;
  onCancel: () => void;
}) {
  if (!pos.stopActive) return null;
  const floor = pos.stopLossFloor ?? 0;
  const current = pos.currentPrice;
  const hwm = pos.trailHighWaterMark ?? current;
  const distPct = floor > 0 ? ((current - floor) / current) * 100 : null;

  const statusColor =
    distPct === null ? "text-muted-foreground" :
    distPct <= 0  ? "text-red-400" :
    distPct <= 5  ? "text-yellow-400" :
    "text-green-400";
  const statusLabel =
    distPct === null ? "—" :
    distPct <= 0  ? "BREACHED" :
    distPct <= 5  ? `${distPct.toFixed(1)}% to floor` :
    `${distPct.toFixed(1)}% cushion`;

  const barWidth = distPct !== null ? Math.min(100, Math.max(0, distPct * 4)) : 0; // visual scale: 25% = full green
  const barColor = distPct === null ? "bg-muted" : distPct <= 0 ? "bg-red-500" : distPct <= 5 ? "bg-yellow-500" : "bg-green-500";

  return (
    <div className={`mt-2 px-3 py-2 rounded-lg border ${distPct !== null && distPct <= 0 ? "border-red-500/40 bg-red-500/5" : distPct !== null && distPct <= 5 ? "border-yellow-500/40 bg-yellow-500/5" : "border-border bg-secondary/30"}`}>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
          <ShieldAlert className="w-3 h-3" />
          Trailing Stop
        </span>
        <span className={`font-semibold mono ${statusColor}`}>{statusLabel}</span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-2">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${barWidth}%` }} />
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div>Floor <span className="mono text-red-400">${fmt(floor)}</span></div>
        <div>Current <span className="mono text-foreground">${fmt(current)}</span></div>
        <div>HWM <span className="mono text-green-400">${fmt(hwm)}</span></div>
        <div>Trail <span className="mono text-primary">{pos.trailPct ?? 0}%</span></div>
        <div className="ml-auto flex gap-1.5">
          <button
            data-testid={`btn-edit-stop-${pos.ticker}`}
            onClick={onEdit}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            data-testid={`btn-cancel-stop-${pos.ticker}`}
            onClick={onCancel}
            className="text-muted-foreground hover:text-red-400 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Set / Edit Stop Inline Panel ─────────────────────────────────────────────
function StopEditor({ pos, onClose }: {
  pos: Position;
  onClose: () => void;
}) {
  const [floorPct, setFloorPct] = useState("10");
  const [trailPct, setTrailPct] = useState("5");
  const { toast } = useToast();

  const floorPrice = pos.currentPrice * (1 - parseFloat(floorPct || "10") / 100);

  const setStopMut = useMutation({
    mutationFn: ({ floor, trailPct }: { floor: number; trailPct: number }) =>
      apiRequest("POST", `/api/positions/${pos.ticker}/stop`, { floor, trailPct }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/positions/stops"] });
      toast({ title: "Stop armed", description: `${pos.ticker} trailing stop set at $${floorPrice.toFixed(2)}` });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Failed to set stop", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="mt-2 p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-3">
      <div className="text-xs font-medium text-primary">Set Trailing Stop</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Floor % below current</label>
          <Input
            data-testid={`input-floor-pct-${pos.ticker}`}
            type="number" min="1" max="50" step="0.5"
            value={floorPct}
            onChange={e => setFloorPct(e.target.value)}
            className="h-8 text-xs mono"
          />
          <div className="text-xs text-muted-foreground mt-0.5">Floor: <span className="text-red-400 mono">${floorPrice.toFixed(2)}</span></div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Trail % (auto-raise)</label>
          <Input
            data-testid={`input-trail-pct-${pos.ticker}`}
            type="number" min="0.5" max="20" step="0.5"
            value={trailPct}
            onChange={e => setTrailPct(e.target.value)}
            className="h-8 text-xs mono"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1 text-xs h-8 bg-primary hover:bg-primary/90"
          disabled={setStopMut.isPending}
          onClick={() => {
            const f = parseFloat(floorPct);
            const t = parseFloat(trailPct);
            if (!isNaN(f) && !isNaN(t) && f > 0 && t > 0) {
              setStopMut.mutate({ floor: pos.currentPrice * (1 - f / 100), trailPct: t });
            }
          }}
        >
          {setStopMut.isPending ? "Arming…" : "Arm Stop"}
        </Button>
        <Button size="sm" variant="outline" className="text-xs h-8" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Position Table ────────────────────────────────────────────────────────────
function PositionTable({ positions, isLoading, isShort = false }: {
  positions: (Position & { stopLossFloor?: number | null; trailPct?: number | null; trailHighWaterMark?: number | null; stopActive?: number })[];
  isLoading: boolean;
  isShort?: boolean;
}) {
  const [editStop, setEditStop] = useState<string | null>(null);
  const { toast } = useToast();

  const cancelStopMut = useMutation({
    mutationFn: (ticker: string) => apiRequest("DELETE", `/api/positions/${ticker}/stop`),
    onSuccess: (_d, ticker) => {
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/positions/stops"] });
      toast({ title: "Stop removed", description: `${ticker} trailing stop cancelled.` });
    },
    onError: (e: any) => toast({ title: "Failed to remove stop", description: e.message, variant: "destructive" }),
  });

  const exitMut = useMutation({
    mutationFn: (ticker: string) => apiRequest("POST", `/api/positions/${ticker}/exit`, {}),
    onSuccess: (_d, ticker) => {
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      toast({ title: `${ticker} exit submitted`, description: "Market sell order sent to Alpaca." });
    },
    onError: (e: any) => toast({ title: "Exit failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-0">
      <div className={`grid text-xs text-muted-foreground pb-2 border-b border-border px-1 ${isShort ? "grid-cols-7" : "grid-cols-8"}`}>
        <span>Ticker</span>
        <span className="text-right">Shares</span>
        <span className="text-right">Avg Cost</span>
        <span className="text-right">Current</span>
        <span className="text-right">Exposure</span>
        <span className="text-right">P&L</span>
        <span className="text-right">Type</span>
        {!isShort && <span className="text-right">Stop</span>}
      </div>
      {isLoading && <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>}
      {positions.map(p => {
        const hasStop = p.stopActive === 1;
        const isBreached = hasStop && p.stopLossFloor != null && p.currentPrice <= p.stopLossFloor;
        return (
          <div key={p.ticker} className="border-b border-border/50">
            <div
              data-testid={`row-position-${p.ticker}`}
              className={`grid text-sm py-3 px-1 hover:bg-secondary/30 transition-colors ${isShort ? "grid-cols-7" : "grid-cols-8"} ${isBreached ? "bg-red-500/5" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="mono font-semibold">{p.ticker}</span>
                {p.isAutoManaged === 1 && <Zap className="w-3 h-3 text-yellow-400" />}
                {hasStop && !isBreached && <ShieldAlert className="w-3 h-3 text-primary/60" />}
                {isBreached && <AlertTriangle className="w-3 h-3 text-red-400 animate-pulse" />}
              </div>
              <span className="text-right mono text-muted-foreground">{Math.abs(p.shares)}</span>
              <span className="text-right mono text-muted-foreground">${fmt(p.avgCost)}</span>
              <span className="text-right mono">${fmt(p.currentPrice)}</span>
              <span className="text-right mono">${fmt(Math.abs(p.marketValue), 0)}</span>
              <div className="text-right">
                <div className={`text-xs font-medium ${p.unrealizedPnl >= 0 ? "gain" : "loss"}`}>
                  {p.unrealizedPnl >= 0 ? "+" : "-"}${fmt(Math.abs(p.unrealizedPnl), 0)}
                </div>
                <div className={`text-xs ${p.unrealizedPct >= 0 ? "gain" : "loss"}`}>
                  {p.unrealizedPct >= 0 ? "+" : "-"}{fmt(Math.abs(p.unrealizedPct))}%
                </div>
              </div>
              <div className="text-right">
                {isShort ? (
                  <Badge variant="outline" className="text-xs border-yellow-500/30 text-yellow-400">Short</Badge>
                ) : isBreached ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs px-2 border-red-500/40 text-red-400 hover:bg-red-500/10"
                    disabled={exitMut.isPending}
                    onClick={() => exitMut.mutate(p.ticker)}
                    data-testid={`btn-exit-${p.ticker}`}
                  >
                    Exit Now
                  </Button>
                ) : p.isAutoManaged === 1 ? (
                  <Badge variant="outline" className="text-xs border-yellow-500/30 text-yellow-400">Auto</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">Long</Badge>
                )}
              </div>
              {!isShort && (
                <div className="text-right flex items-center justify-end">
                  {hasStop ? (
                    <button
                      onClick={() => setEditStop(editStop === p.ticker ? null : p.ticker)}
                      className="text-xs text-primary/70 hover:text-primary transition-colors font-medium"
                      data-testid={`btn-manage-stop-${p.ticker}`}
                    >
                      Manage
                    </button>
                  ) : (
                    <button
                      onClick={() => setEditStop(editStop === p.ticker ? null : p.ticker)}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors"
                      data-testid={`btn-add-stop-${p.ticker}`}
                    >
                      + Stop
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Expanded stop row / editor */}
            {!isShort && hasStop && editStop !== p.ticker && (
              <div className="px-1 pb-2">
                <StopRow
                  pos={p}
                  onEdit={() => setEditStop(p.ticker)}
                  onCancel={() => cancelStopMut.mutate(p.ticker)}
                />
              </div>
            )}
            {!isShort && editStop === p.ticker && (
              <div className="px-1 pb-2">
                <StopEditor pos={p} onClose={() => setEditStop(null)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Portfolio Page ───────────────────────────────────────────────────────
export default function Portfolio() {
  const { data: positions = [], isLoading } = useQuery<(Position & {
    stopLossFloor?: number | null;
    trailPct?: number | null;
    trailHighWaterMark?: number | null;
    stopActive?: number;
  })[]>({ queryKey: ["/api/positions"], refetchInterval: 60000 });

  const longPositions = positions.filter(p => p.shares >= 0);
  const shortPositions = positions.filter(p => p.shares < 0);

  const longValue = longPositions.reduce((s, p) => s + p.marketValue, 0);
  const shortExposure = shortPositions.reduce((s, p) => s + Math.abs(p.marketValue), 0);
  const totalPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);

  const activeStops = positions.filter(p => p.stopActive === 1);
  const breachedStops = activeStops.filter(p => p.stopLossFloor != null && p.currentPrice <= p.stopLossFloor);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Portfolio</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Current holdings — synced live from Alpaca every 60s</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="text-xs text-muted-foreground mb-1">Long Value</div>
            <div className="text-xl font-semibold mono">${fmt(longValue)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{longPositions.length} position{longPositions.length !== 1 ? "s" : ""}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="text-xs text-muted-foreground mb-1">Short Exposure</div>
            <div className="text-xl font-semibold mono text-yellow-400">${fmt(shortExposure)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{shortPositions.length} short position{shortPositions.length !== 1 ? "s" : ""}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="text-xs text-muted-foreground mb-1">Unrealized P&L</div>
            <div className={`text-xl font-semibold mono ${totalPnl >= 0 ? "gain" : "loss"}`}>
              {totalPnl >= 0 ? "+" : "-"}${fmt(Math.abs(totalPnl))}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">All positions combined</div>
          </CardContent>
        </Card>
        <Card className={breachedStops.length > 0 ? "border-red-500/40" : activeStops.length > 0 ? "border-primary/20" : ""}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <ShieldAlert className={`w-3.5 h-3.5 ${breachedStops.length > 0 ? "text-red-400" : "text-primary"}`} />
              Active Stops
            </div>
            <div className={`text-xl font-semibold ${breachedStops.length > 0 ? "text-red-400" : ""}`}>
              {activeStops.length}
            </div>
            <div className={`text-xs mt-0.5 ${breachedStops.length > 0 ? "text-red-400 font-medium" : "text-muted-foreground"}`}>
              {breachedStops.length > 0 ? `${breachedStops.length} BREACHED` : "monitoring"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stop breach banner */}
      {breachedStops.length > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-red-500/40 bg-red-500/5">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-red-400">
              Trailing Stop Breached — {breachedStops.map(p => p.ticker).join(", ")}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              The price has fallen below the floor you set. Use the Exit Now button in the table to close the position.
            </div>
          </div>
        </div>
      )}

      {longPositions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Long Positions
              <span className="text-xs font-normal text-muted-foreground">
                · Click "+ Stop" on any row to arm a trailing stop
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PositionTable positions={longPositions} isLoading={isLoading} />
          </CardContent>
        </Card>
      )}

      {shortPositions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Short Positions
              <span className="text-xs font-normal text-muted-foreground">(paper account — from prior SELL executions)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PositionTable positions={shortPositions} isLoading={false} isShort />
          </CardContent>
        </Card>
      )}

      {positions.length === 0 && !isLoading && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center text-muted-foreground text-sm">
            No open positions yet. Approve a signal from the Decision Gate to open your first position.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
