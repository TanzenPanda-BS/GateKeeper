import { useQuery } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Position } from "@shared/schema";

function fmt(n: number, d = 2) { return Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }

export default function Portfolio() {
  const { data: positions = [], isLoading } = useQuery<Position[]>({ queryKey: ["/api/positions"], refetchInterval: 60000 });

  const longPositions = positions.filter(p => p.shares >= 0);
  const shortPositions = positions.filter(p => p.shares < 0);

  const longValue = longPositions.reduce((s, p) => s + p.marketValue, 0);
  const shortExposure = shortPositions.reduce((s, p) => s + Math.abs(p.marketValue), 0);
  const totalPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Portfolio</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Current holdings and performance — synced live from Alpaca every 60s</p>
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
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="text-xs text-muted-foreground mb-1">Total Positions</div>
            <div className="text-xl font-semibold">{positions.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {positions.filter(p => p.isAutoManaged === 1).length} auto-managed
            </div>
          </CardContent>
        </Card>
      </div>

      {longPositions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Long Positions</CardTitle>
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

function PositionTable({ positions, isLoading, isShort = false }: { positions: Position[]; isLoading: boolean; isShort?: boolean }) {
  function fmt(n: number, d = 2) { return Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }

  return (
    <div className="space-y-0">
      <div className="grid grid-cols-7 text-xs text-muted-foreground pb-2 border-b border-border px-1">
        <span>Ticker</span>
        <span className="text-right">Shares</span>
        <span className="text-right">Avg Cost</span>
        <span className="text-right">Current</span>
        <span className="text-right">Exposure</span>
        <span className="text-right">P&L</span>
        <span className="text-right">Type</span>
      </div>
      {isLoading && (
        <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
      )}
      {positions.map(p => (
        <div key={p.ticker} data-testid={`row-position-${p.ticker}`} className="grid grid-cols-7 text-sm py-3 border-b border-border/50 px-1 hover:bg-secondary/30 transition-colors">
          <div className="flex items-center gap-2">
            <span className="mono font-semibold">{p.ticker}</span>
            {p.isAutoManaged === 1 && <Zap className="w-3 h-3 text-yellow-400" />}
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
            ) : p.isAutoManaged === 1 ? (
              <Badge variant="outline" className="text-xs border-yellow-500/30 text-yellow-400">Auto</Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">Long</Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
