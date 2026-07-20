import { createFileRoute, Link } from "@tanstack/react-router";
import {
  PiggyBank,
  XCircle,
  BookMarked,
  ArrowRight,
  Wallet,
  MoonStar,
  Archive,
  Lock,
  Repeat,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/mzizi/Card";
import { listSavingsAccounts, listPassbookStock } from "@/lib/savings.functions";
import { markSavingsDormant, transferSavingsToUnclaimed } from "@/lib/lifecycle.functions";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/savings/")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData({
      queryKey: ["savings-accounts", "all"],
      queryFn: () => listSavingsAccounts({ data: { status: "all" } }),
    });
    context.queryClient.ensureQueryData({
      queryKey: ["passbook-stock"],
      queryFn: () => listPassbookStock(),
    });
  },
  component: SavingsIndex,
});

const CARDS = [
  {
    to: "/savings/new",
    icon: PiggyBank,
    title: "New Savings",
    desc: "Open a savings account with opening deposit",
    accent: "from-emerald-500/15 to-emerald-500/0 text-emerald-600",
  },
  {
    to: "/savings/close",
    icon: XCircle,
    title: "Close the Account",
    desc: "Payout balance and close a savings account",
    accent: "from-rose-500/15 to-rose-500/0 text-rose-600",
  },
  {
    to: "/savings/passbook",
    icon: BookMarked,
    title: "Passbook Stock",
    desc: "Manage stock, distribute serials, and issue passbooks",
    accent: "from-amber-500/15 to-amber-500/0 text-amber-600",
  },
  {
    to: "/savings/holds",
    icon: Lock,
    title: "Holds & Blocks",
    desc: "Place liens/blocks and route releases through workflow approval",
    accent: "from-indigo-500/15 to-indigo-500/0 text-indigo-600",
  },
] as const;

function SavingsIndex() {
  const qc = useQueryClient();
  const acctFn = useServerFn(listSavingsAccounts);
  const stockFn = useServerFn(listPassbookStock);
  const dormantFn = useServerFn(markSavingsDormant);
  const unclaimedFn = useServerFn(transferSavingsToUnclaimed);
  const { data: accounts } = useQuery({
    queryKey: ["savings-accounts", "all"],
    queryFn: () => acctFn({ data: { status: "all" } }),
  });
  const { data: stock } = useQuery({ queryKey: ["passbook-stock"], queryFn: () => stockFn() });

  const dormantM = useMutation({
    mutationFn: (id: string) => dormantFn({ data: { account_id: id } }),
    onSuccess: () => {
      toast.success("Account marked dormant");
      qc.invalidateQueries({ queryKey: ["savings-accounts", "all"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const unclaimedM = useMutation({
    mutationFn: (id: string) =>
      unclaimedFn({ data: { account_id: id, idempotency_key: `savings:unclaimed:${id}` } }),
    onSuccess: () => {
      toast.success("Balance transferred to unclaimed liability");
      qc.invalidateQueries({ queryKey: ["savings-accounts", "all"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const active = (accounts ?? []).filter((a: any) => a.status === "active");
  const totalBalance = active.reduce((s: number, a: any) => s + Number(a.balance ?? 0), 0);
  const remaining = (stock ?? []).reduce(
    (s: number, r: any) =>
      s + (Number(r.quantity_received) - Number(r.quantity_issued) - Number(r.quantity_void ?? 0)),
    0,
  );

  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-3.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500/15 to-emerald-500/0 flex items-center justify-center text-emerald-600">
              <Wallet size={18} />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">
                Active accounts
              </div>
              <div className="text-lg font-semibold">{active.length}</div>
            </div>
          </div>
        </Card>
        <Card className="p-3.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-500/15 to-sky-500/0 flex items-center justify-center text-sky-600">
              <PiggyBank size={18} />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">
                Total deposits
              </div>
              <div className="text-lg font-semibold">{money(totalBalance)}</div>
            </div>
          </div>
        </Card>
        <Card className="p-3.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/15 to-amber-500/0 flex items-center justify-center text-amber-600">
              <BookMarked size={18} />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">
                Passbooks remaining
              </div>
              <div className="text-lg font-semibold">{remaining}</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.to} to={c.to} className="group">
              <Card className="p-3.5 hover:border-primary/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0 ${c.accent}`}
                  >
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[14px] truncate">{c.title}</div>
                    <div className="text-[11.5px] text-muted-foreground truncate">{c.desc}</div>
                  </div>
                  <ArrowRight
                    size={16}
                    className="text-primary shrink-0 group-hover:translate-x-0.5 transition-transform"
                  />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <div className="mb-3 text-sm font-semibold">Recent accounts</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">Customer</th>
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3">Branch</th>
                <th className="py-2 pr-3 text-right">Balance</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(accounts ?? []).slice(0, 12).map((a: any) => {
                const status = String(a.status);
                const canDormant = status === "active";
                const canUnclaimed = status === "dormant" || status === "closed";
                const busy = dormantM.isPending || unclaimedM.isPending;
                return (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{a.account_no}</td>
                    <td className="py-2 pr-3">{a.client?.full_name}</td>
                    <td className="py-2 pr-3">{a.product?.name}</td>
                    <td className="py-2 pr-3">{a.branch?.name}</td>
                    <td className="py-2 pr-3 text-right font-mono">{money(a.balance, true)}</td>
                    <td className="py-2 pr-3 capitalize text-xs">{status}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {canDormant && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (confirm(`Mark account ${a.account_no} as dormant?`))
                                dormantM.mutate(a.id);
                            }}
                            className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] border border-input hover:bg-muted disabled:opacity-40"
                            title="Mark dormant"
                          >
                            <MoonStar size={11} /> Dormant
                          </button>
                        )}
                        {canUnclaimed && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (
                                confirm(
                                  `Transfer balance of ${a.account_no} to unclaimed liability?`,
                                )
                              )
                                unclaimedM.mutate(a.id);
                            }}
                            className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] border border-amber-500/40 text-amber-700 hover:bg-amber-500/10 disabled:opacity-40"
                            title="Transfer to unclaimed"
                          >
                            <Archive size={11} /> Unclaimed
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!accounts?.length && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground text-sm">
                    No savings accounts yet — open one from "New Savings".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
