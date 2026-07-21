import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listRecentSavingsTransactions, reverseSavingsTransaction } from "@/lib/savings.functions";
import { Card } from "@/components/mzizi/Card";
import { money } from "@/lib/format";
import { Undo2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/savings/reversals")({
  component: SavingsReversalsPage,
});

function SavingsReversalsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listRecentSavingsTransactions);
  const revFn = useServerFn(reverseSavingsTransaction);

  const { data: rows } = useQuery({
    queryKey: ["savings-recent-txns", "reversible"],
    queryFn: () => listFn({ data: { limit: 100, only_reversible: true } }),
  });

  const reverse = useMutation({
    mutationFn: revFn,
    onSuccess: () => {
      toast.success("Transaction reversed");
      qc.invalidateQueries({ queryKey: ["savings-recent-txns"] });
      qc.invalidateQueries({ queryKey: ["savings-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Link to="/savings" className="text-xs text-primary hover:underline">
        ← Back to savings
      </Link>

      <Card>
        <div className="mb-3 text-sm font-semibold">Recent savings transactions</div>
        <div className="text-xs text-muted-foreground mb-3">
          Reversals post a linked opposite transaction and reverse the GL entry. Original records
          are never edited or deleted.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Reference</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3">Narration</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((t: any) => {
                const amt = Number(t.amount);
                return (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 text-xs whitespace-nowrap">
                      {new Date(t.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {t.account?.account_no}
                      <div className="text-[10px] text-muted-foreground">
                        {t.account?.client?.full_name}
                      </div>
                    </td>
                    <td className="py-2 pr-3 capitalize text-xs">{t.txn_type}</td>
                    <td className="py-2 pr-3 font-mono text-[11px]">{t.reference ?? "—"}</td>
                    <td
                      className={`py-2 pr-3 text-right font-mono ${amt < 0 ? "text-rose-700" : "text-emerald-700"}`}
                    >
                      {money(amt, true)}
                    </td>
                    <td
                      className="py-2 pr-3 text-xs truncate max-w-[240px]"
                      title={t.narration ?? ""}
                    >
                      {t.narration ?? "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center justify-end">
                        <button
                          disabled={reverse.isPending}
                          onClick={() => {
                            const reason = prompt("Reversal reason (min 3 chars)");
                            if (!reason || reason.trim().length < 3) return;
                            reverse.mutate({ data: { txn_id: t.id, reason: reason.trim() } });
                          }}
                          className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] border border-rose-400 text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                        >
                          <Undo2 size={11} /> Reverse
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!rows?.length && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground text-sm">
                    No reversible transactions.
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
