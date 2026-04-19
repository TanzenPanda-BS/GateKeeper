import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Zap, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { ExceptionRule } from "@shared/schema";

function fmt(n: number, d = 1) { return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }

export default function ExceptionRules() {
  const { data: rules = [], isLoading } = useQuery<ExceptionRule[]>({ queryKey: ["/api/exception-rules"] });
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/exception-rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exception-rules"] });
      toast({ title: "Rule deleted" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: number }) =>
      apiRequest("PATCH", `/api/exception-rules/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/exception-rules"] }),
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Exception Rules</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Pre-approved auto-trade parameters for volatile positions. You set these when calm — the system executes under pressure.</p>
        </div>
        <Button data-testid="btn-add-rule" className="gap-2" size="sm">
          <Plus className="w-4 h-4" />
          Add Rule
        </Button>
      </div>

      {/* How it works */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4">
          <div className="text-xs font-medium text-primary mb-1.5">How Exception Rules Work</div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            When a ticker's price moves beyond your volatility threshold within 10 minutes, the exception engine activates.
            It can only trade within your pre-set position limits and stop-loss floors. <strong className="text-foreground">It cannot open new positions autonomously</strong> — only manage existing holdings.
            Every auto-execution generates a post-trade report you review at day's end.
          </p>
        </CardContent>
      </Card>

      {isLoading && <div className="text-sm text-muted-foreground">Loading rules...</div>}

      <div className="space-y-3">
        {rules.map(rule => (
          <Card key={rule.id} data-testid={`rule-card-${rule.ticker}`} className={!rule.isActive ? "opacity-50" : ""}>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-yellow-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="mono font-semibold text-base">{rule.ticker}</span>
                    <Badge variant={rule.isActive ? "default" : "outline"} className={rule.isActive ? "bg-green-500/20 text-green-400 border-green-500/30" : "text-muted-foreground"}>
                      {rule.isActive ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-xs">
                    {[
                      { label: "Volatility Trigger", value: `±${fmt(rule.volatilityThreshold)}% in 10min` },
                      { label: "Max Auto-Trade", value: `${fmt(rule.maxAutoTradePercent)}% of position` },
                      { label: "Break-Even Stop", value: `-${fmt(rule.stopLossPercent)}% from entry` },
                      { label: "Accepted Loss Floor", value: `-${fmt(rule.acceptedLossPercent)}% hard stop` },
                      { label: "Profit Lock Trigger", value: `+${fmt(rule.profitLockPercent)}%` },
                      { label: "Profit Lock Sell", value: `${fmt(rule.profitLockSellPercent)}% of position` },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div className="text-muted-foreground mb-0.5">{label}</div>
                        <div className="font-medium text-foreground">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    data-testid={`btn-toggle-rule-${rule.id}`}
                    onClick={() => toggleMutation.mutate({ id: rule.id, isActive: rule.isActive ? 0 : 1 })}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {rule.isActive ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <button
                    data-testid={`btn-delete-rule-${rule.id}`}
                    onClick={() => deleteMutation.mutate(rule.id)}
                    className="text-muted-foreground hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {rules.length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <Zap className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <div className="text-sm">No exception rules configured</div>
          <div className="text-xs mt-1">Add rules for positions you want protected from volatile swings</div>
        </div>
      )}
    </div>
  );
}
