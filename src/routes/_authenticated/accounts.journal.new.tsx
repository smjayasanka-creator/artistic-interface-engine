import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  createJournalEntry,
  getSession,
  listCompanyBranches,
  listGlAccounts,
} from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import {
  FormActions,
  FormField,
  FormGrid,
  btnPrimaryCls,
  btnSecondaryCls,
  inputCls,
  selectCls,
} from "@/components/mzizi/FormGrid";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

type Line = { key: string; account_id: string; debit: string; credit: string };

let lineSeq = 0;
const blank = (): Line => ({
  key: `l${++lineSeq}`,
  account_id: "",
  debit: "",
  credit: "",
});

export const Route = createFileRoute("/_authenticated/accounts/journal/new")({
  component: NewJournalEntryPage,
});

function NewJournalEntryPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const sessionFn = useServerFn(getSession);
  const branchesFn = useServerFn(listCompanyBranches);
  const accountsFn = useServerFn(listGlAccounts);

  const { data: session } = useQuery({ queryKey: ["session"], queryFn: () => sessionFn() });
  const { data: branches } = useQuery({ queryKey: ["company-branches"], queryFn: () => branchesFn() });
  const { data: accounts } = useQuery({ queryKey: ["gl-accounts"], queryFn: () => accountsFn() });

  const [branchId, setBranchId] = useState("");
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<Line[]>(() => [blank(), blank()]);

  useEffect(() => {
    if (!branchId && session?.staff?.branch_id) setBranchId(session.staff.branch_id);
  }, [session, branchId]);

  const totals = useMemo(() => {
    const d = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const c = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    return { d, c, diff: d - c };
  }, [lines]);

  const filledLines = lines.filter(
    (l) => l.account_id && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0),
  );

  const balanced = Math.abs(totals.diff) < 0.01;
  const valid = branchId && entryDate && filledLines.length >= 2 && balanced && totals.d > 0;

  const createFn = useServerFn(createJournalEntry);
  const post = useMutation({
    mutationFn: createFn,
    onSuccess: (r: any) => {
      toast.success(`Journal entry posted · ${r.reference}`);
      qc.invalidateQueries();
      navigate({ to: "/accounts/journal" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((l) => l.key !== key)));
  }

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Link to="/accounts/journal" className="text-xs text-primary hover:underline">
        ← Back to journal entries
      </Link>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          post.mutate({
            data: {
              branch_id: branchId,
              entry_date: entryDate,
              reference: reference || undefined,
              description: description || undefined,
              lines: filledLines.map((l) => ({
                account_id: l.account_id,
                debit: Number(l.debit) || 0,
                credit: Number(l.credit) || 0,
              })),
            },
          });
        }}
        className="flex flex-col gap-4"
      >
        <Card className="p-6">
          <FormGrid>
            <FormField label="Branch" required span={5}>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectCls}>
                <option value="">Select branch…</option>
                {(branches ?? []).map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.code ? `${b.code} · ` : ""}
                    {b.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Entry date" required span={3}>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className={inputCls + " font-mono"}
              />
            </FormField>
            <FormField label="Reference" hint="Leave blank to auto-generate (JE-####)" span={4}>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className={`${inputCls} font-mono`}
                maxLength={40}
              />
            </FormField>
            <FormField label="Description" span={12}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={300}
                className={inputCls}
              />
            </FormField>
          </FormGrid>
        </Card>

        <Card padded={false}>
          <div
            className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
            style={{ gridTemplateColumns: "3fr 1fr 1fr 40px" }}
          >
            <div>Account</div>
            <div className="text-right">Debit</div>
            <div className="text-right">Credit</div>
            <div></div>
          </div>

          {lines.map((l) => (
            <div
              key={l.key}
              className="grid items-center gap-2 py-2 px-5 border-b border-row-divider"
              style={{ gridTemplateColumns: "3fr 1fr 1fr 40px" }}
            >
              <select
                value={l.account_id}
                onChange={(e) => updateLine(l.key, { account_id: e.target.value })}
                className={selectCls}
              >
                <option value="">Select account…</option>
                {(accounts ?? []).map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
              <input
                inputMode="decimal"
                value={l.debit}
                onChange={(e) =>
                  updateLine(l.key, {
                    debit: e.target.value.replace(/[^\d.]/g, ""),
                    credit: e.target.value ? "" : l.credit,
                  })
                }
                placeholder="0.00"
                className={`${inputCls} font-mono text-right`}
              />
              <input
                inputMode="decimal"
                value={l.credit}
                onChange={(e) =>
                  updateLine(l.key, {
                    credit: e.target.value.replace(/[^\d.]/g, ""),
                    debit: e.target.value ? "" : l.debit,
                  })
                }
                placeholder="0.00"
                className={`${inputCls} font-mono text-right`}
              />
              <button
                type="button"
                onClick={() => removeLine(l.key)}
                disabled={lines.length <= 2}
                className="text-faint hover:text-destructive disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center"
                aria-label="Remove line"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between px-5 py-3">
            <button
              type="button"
              onClick={() => setLines((p) => [...p, blank()])}
              className="inline-flex items-center gap-1.5 text-[12.5px] text-primary hover:underline"
            >
              <Plus size={13} /> Add line
            </button>
            <div className="flex items-center gap-6 text-[12.5px] font-mono">
              <span className="text-faint">
                DR <span className="text-debit font-semibold">{money(totals.d)}</span>
              </span>
              <span className="text-faint">
                CR <span className="text-primary font-semibold">{money(totals.c)}</span>
              </span>
              <span
                className={cn(
                  "font-semibold",
                  balanced ? "text-primary" : "text-destructive",
                )}
              >
                {balanced ? "Balanced" : `Off by ${money(Math.abs(totals.diff))}`}
              </span>
            </div>
          </div>
        </Card>

        <FormActions>
          <Link to="/accounts/journal" className={btnSecondaryCls}>
            Cancel
          </Link>
          <button type="submit" disabled={!valid || post.isPending} className={btnPrimaryCls}>
            {post.isPending ? "Posting…" : "Post entry"}
          </button>
        </FormActions>
      </form>
    </div>
  );
}
