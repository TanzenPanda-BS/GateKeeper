import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, ShieldCheck, BriefcaseBusiness, FileText, TrendingUp, Zap, ChevronRight, Activity, Ghost, Award, AlertCircle } from "lucide-react";
import type { Recommendation } from "@shared/schema";

export default function Sidebar() {
  const [location] = useLocation();
  const { data: pending = [] } = useQuery<Recommendation[]>({ queryKey: ["/api/recommendations/pending"], refetchInterval: 30000 });
  const { data: session } = useQuery<any>({ queryKey: ["/api/session"], refetchInterval: 60000 });
  const { data: clock } = useQuery<any>({ queryKey: ["/api/alpaca/clock"], refetchInterval: 60000 });
  const { data: sentimentData = [] } = useQuery<any[]>({ queryKey: ["/api/sentiment"], refetchInterval: 300000 });
  const dangerCount = sentimentData.filter((s: any) => s.alertLevel === "DANGER" || s.alertLevel === "CAUTION").length;

  const daysActive = session?.daysActive ?? 1;
  const progressPct = session?.progressPct ?? 1.11;
  const isOpen = clock?.is_open ?? false;

  const nav = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/gate", label: "Decision Gate", icon: ShieldCheck, badge: pending.length > 0 ? String(pending.length) : undefined },
    { href: "/portfolio", label: "Portfolio", icon: BriefcaseBusiness },
    { href: "/reports", label: "After Action", icon: FileText },
    { href: "/trust", label: "Trust & ROI", icon: TrendingUp },
    { href: "/rules", label: "Exception Rules", icon: Zap },
    { href: "/sentiment", label: "Sentiment", icon: Activity, badge: dangerCount > 0 ? String(dangerCount) : undefined },
    { href: "/shadow", label: "Shadow Portfolio", icon: Ghost },
    { href: "/scorecard", label: "Scorecard", icon: Award },
  ];

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col border-r border-border bg-card h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8 flex-shrink-0" aria-label="GateKeeper logo">
            <rect width="32" height="32" rx="8" fill="hsl(199 90% 48% / 0.15)" />
            <path d="M16 6L8 10V16C8 20.418 11.582 24.418 16 26C20.418 24.418 24 20.418 24 16V10L16 6Z" stroke="hsl(199, 90%, 48%)" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
            <path d="M12 16L15 19L20 13" stroke="hsl(199, 90%, 48%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <div className="font-semibold text-sm text-foreground leading-none">GateKeeper</div>
            <div className="text-xs text-muted-foreground mt-0.5">Trading Intelligence</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, label, icon: Icon, badge }) => {
          const active = location === href || (href !== "/" && location.startsWith(href));
          return (
            <Link key={href} href={href}>
              <a
                data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors cursor-pointer ${
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {badge && (
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold pending-dot">
                    {badge}
                  </span>
                )}
                {active && !badge && <ChevronRight className="w-3 h-3 opacity-40" />}
              </a>
            </Link>
          );
        })}
      </nav>

      {/* Secondary links */}
      <div className="px-3 pb-2 space-y-0.5">
        <Link href="/onboarding">
          <a className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <ShieldCheck className="w-3.5 h-3.5" />
            Setup Guide
          </a>
        </Link>
        <Link href="/disclaimer">
          <a className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <AlertCircle className="w-3.5 h-3.5" />
            Legal Disclaimer
          </a>
        </Link>
      </div>

      {/* Bottom status */}
      <div className="px-4 py-4 border-t border-border">
        <div className="flex items-center gap-2 mb-1">
          <span className={`w-2 h-2 rounded-full ${isOpen ? "bg-green-500" : "bg-muted-foreground"}`}></span>
          <span className="text-xs text-muted-foreground">{isOpen ? "Market Open" : "Market Closed"}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Day {daysActive} of 90-day evaluation
        </div>
        <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${Math.min(progressPct, 100)}%` }} />
        </div>
      </div>
    </aside>
  );
}
