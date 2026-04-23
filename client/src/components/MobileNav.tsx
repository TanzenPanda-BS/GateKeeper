import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, ShieldCheck, BriefcaseBusiness, Activity, MoreHorizontal, Award, FileText, TrendingUp, Zap, Ghost } from "lucide-react";
import type { Recommendation } from "@shared/schema";
import { useState } from "react";

export default function MobileNav() {
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: pending = [] } = useQuery<Recommendation[]>({ queryKey: ["/api/recommendations/pending"], refetchInterval: 30000 });
  const { data: sentimentData = [] } = useQuery<any[]>({ queryKey: ["/api/sentiment"], refetchInterval: 300000 });
  const dangerCount = sentimentData.filter((s: any) => s.alertLevel === "DANGER" || s.alertLevel === "CAUTION").length;

  const primary = [
    { href: "/",          label: "Dashboard",  icon: LayoutDashboard },
    { href: "/gate",      label: "Gate",        icon: ShieldCheck,    badge: pending.length > 0 ? String(pending.length) : undefined },
    { href: "/portfolio", label: "Portfolio",   icon: BriefcaseBusiness },
    { href: "/sentiment", label: "Sentiment",   icon: Activity,       badge: dangerCount > 0 ? String(dangerCount) : undefined },
  ];

  const more = [
    { href: "/reports",   label: "After Action",      icon: FileText },
    { href: "/trust",     label: "Trust & ROI",        icon: TrendingUp },
    { href: "/rules",     label: "Exception Rules",    icon: Zap },
    { href: "/shadow",    label: "Shadow Portfolio",   icon: Ghost },
    { href: "/scorecard", label: "Scorecard",          icon: Award },
  ];

  return (
    <>
      {/* "More" drawer — slides up from bottom */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="absolute bottom-16 left-0 right-0 bg-card border-t border-border rounded-t-xl px-4 py-4 space-y-1"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-3" />
            {more.map(({ href, label, icon: Icon }) => {
              const active = location === href || (href !== "/" && location.startsWith(href));
              return (
                <Link key={href} href={href}>
                  <a
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                      active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                    onClick={() => setMoreOpen(false)}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </a>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card border-t border-border">
        <div className="flex items-stretch h-16">
          {primary.map(({ href, label, icon: Icon, badge }) => {
            const active = location === href || (href !== "/" && location.startsWith(href));
            return (
              <Link key={href} href={href}>
                <a className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}>
                  <div className="relative">
                    <Icon className="w-5 h-5" />
                    {badge && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                        {badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-medium">{label}</span>
                  {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />}
                </a>
              </Link>
            );
          })}
          {/* More button */}
          <button
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              moreOpen ? "text-primary" : "text-muted-foreground"
            }`}
            onClick={() => setMoreOpen(v => !v)}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
        {/* Safe area spacer for iOS home indicator */}
        <div className="h-safe-bottom bg-card" style={{ height: "env(safe-area-inset-bottom)" }} />
      </nav>
    </>
  );
}
