import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LayoutDashboard, Users, Wallet, HandCoins, Users2, LineChart, BookOpen, Settings, Search, Circle, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSession, getDashboard } from "@/lib/mzizi.functions";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> };
type NavSection = { section: string; items: NavItem[] };
type NavEntry = NavItem | NavSection;

const NAV: NavEntry[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/loans", label: "Loans", icon: Wallet },
  { to: "/collections", label: "Collections", icon: HandCoins },
  { to: "/groups", label: "Groups", icon: Users2 },
  { to: "/reports", label: "Reports", icon: LineChart },
  { to: "/ledger", label: "Ledger", icon: BookOpen },
  {
    section: "Accounts",
    items: [
      { to: "/accounts/journal", label: "Journal Entries", icon: BookOpen },
      { to: "/accounts/payments", label: "Payments", icon: HandCoins },
    ],
  },
  { to: "/admin", label: "Administration", icon: Settings },
];

function TITLE(pathname: string): { title: string; sub: string } {
  if (pathname.startsWith("/dashboard")) return { title: "Dashboard", sub: "Today's operating view" };
  if (pathname.startsWith("/clients")) return { title: "Clients", sub: "Member directory & KYC" };
  if (pathname.startsWith("/loans/new")) return { title: "New application", sub: "Loan origination wizard" };
  if (pathname.startsWith("/loans")) return { title: "Loans", sub: "Portfolio & receivables" };
  if (pathname.startsWith("/collections")) return { title: "Collections", sub: "Daily repayment tracking" };
  if (pathname.startsWith("/groups")) return { title: "Groups", sub: "Group-lending management" };
  if (pathname.startsWith("/reports")) return { title: "Reports & analytics", sub: "Portfolio performance" };
  if (pathname.startsWith("/ledger")) return { title: "General ledger", sub: "Journal entries & postings" };
  if (pathname.startsWith("/admin")) return { title: "Administration", sub: "Branch & staff" };
  return { title: "Mzizi Core", sub: "" };
}

function ShellInner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { title, sub } = TITLE(pathname);
  const router = useRouter();
  const qc = useQueryClient();
  const sessionFn = useServerFn(getSession);
  const { data: session } = useQuery({ queryKey: ["session"], queryFn: () => sessionFn() });
  const dashFn = useServerFn(getDashboard);
  const { data: dash } = useQuery({ queryKey: ["dashboard"], queryFn: () => dashFn() });
  const approvalsCount = dash?.approvals.length ?? 0;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  function renderNav(n: NavItem) {
    const active = pathname === n.to || (n.to !== "/dashboard" && pathname.startsWith(n.to));
    const Icon = n.icon;
    return (
      <Link
        key={n.to}
        to={n.to}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-[9px] text-[13px]",
          active ? "text-white font-semibold" : "text-rail-foreground/85 font-medium hover:bg-white/5",
        )}
        style={active ? { background: "var(--rail-active)" } : undefined}
      >
        <Icon size={18} className="flex-none" />
        <span className="flex-1">{n.label}</span>
        {n.to === "/loans" && approvalsCount > 0 && (
          <span className="text-[10.5px] font-semibold font-mono px-1.5 py-0.5 rounded-full" style={{ background: "#f59e0b", color: "#3a2606" }}>
            {approvalsCount}
          </span>
        )}
      </Link>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Rail */}
      <aside className="w-[232px] flex-none bg-rail text-rail-foreground flex flex-col">
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <div className="w-9 h-9 rounded-[10px] flex items-center justify-center font-bold text-white text-[17px]" style={{ background: "linear-gradient(140deg,#14b8a6,#0f766e)" }}>
            M
          </div>
          <div>
            <div className="font-bold text-white text-base tracking-tight">Mzizi</div>
            <div className="text-[10.5px] text-rail-muted tracking-wider uppercase">Core Banking</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 flex flex-col gap-0.5">
          {NAV.map((entry) => {
            if ("section" in entry) {
              return (
                <div key={entry.section} className="mt-3 mb-1">
                  <div className="px-3 text-[10px] font-semibold tracking-wider uppercase text-rail-muted mb-1">{entry.section}</div>
                  {entry.items.map((n) => renderNav(n))}
                </div>
              );
            }
            return renderNav(entry);
          })}
        </nav>
        <div className="border-t border-white/5 p-3.5 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-white text-[13px] bg-primary flex-none">
            {(session?.staff?.full_name ?? "?")
              .split(" ")
              .map((s) => s[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-white truncate">{session?.staff?.full_name ?? "…"}</div>
            <div className="text-[10.5px] text-rail-muted capitalize">{(session?.staff?.role ?? "").replace("_", " ")}</div>
          </div>
          <button onClick={signOut} title="Sign out" className="text-rail-muted hover:text-white p-1">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[60px] flex-none bg-card border-b border-border-strong flex items-center gap-4 px-6">
          <div className="min-w-0">
            <div className="font-semibold text-[15px] text-foreground">{title}</div>
            <div className="text-[11.5px] text-faint mt-0.5">{sub}</div>
          </div>
          <div className="ml-3 flex items-center gap-2 px-3 py-2 rounded-[9px] bg-muted text-faint text-[12.5px] w-[260px]">
            <Search size={15} /> Search clients, loans, groups…
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2 px-2.5 py-2 border border-border-strong rounded-[9px] text-[12px] text-secondary-foreground">
              <Circle size={7} className="fill-primary-glow text-primary-glow" />
              {session?.staff?.branch?.name?.replace(" Branch", "") ?? "Branch"}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-7 py-6 pb-16 bg-background">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AppShell() {
  return <ShellInner />;
}
