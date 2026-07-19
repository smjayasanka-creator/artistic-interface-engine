import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Card } from "@/components/mzizi/Card";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import { money, getActiveCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/transactions/close-cashier")({
  component: CloseCashierPage,
});

// Common Kenyan denominations; users can leave irrelevant rows blank.
const DENOMS = [
  { key: "1000", label: "1,000", value: 1000, kind: "note" as const },
  { key: "500", label: "500", value: 500, kind: "note" as const },
  { key: "200", label: "200", value: 200, kind: "note" as const },
  { key: "100", label: "100", value: 100, kind: "note" as const },
  { key: "50", label: "50", value: 50, kind: "note" as const },
  { key: "40", label: "40", value: 40, kind: "coin" as const },
  { key: "20", label: "20", value: 20, kind: "coin" as const },
  { key: "10", label: "10", value: 10, kind: "coin" as const },
  { key: "5", label: "5", value: 5, kind: "coin" as const },
  { key: "1", label: "1", value: 1, kind: "coin" as const },
];

function CloseCashierPage() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [expected, setExpected] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const rows = useMemo(
    () =>
      DENOMS.map((d) => {
        const qty = Number(counts[d.key] || 0);
        return { ...d, qty, subtotal: qty * d.value };
      }),
    [counts],
  );
  const counted = rows.reduce((s, r) => s + r.subtotal, 0);
  const expectedNum = Number(expected || 0);
  const variance = counted - expectedNum;

  function setQty(key: string, v: string) {
    setCounts((c) => ({ ...c, [key]: v.replace(/[^\d]/g, "") }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      toast.success(
        variance === 0
          ? "Cashier closed — till balanced"
          : `Cashier closed — variance ${money(variance)}`,
      );
      setSubmitting(false);
      navigate({ to: "/transactions" });
    }, 500);
  }

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Link to="/transactions" className="text-xs text-primary hover:underline">
        ← Back to transactions
      </Link>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground mb-4">
            <Lock size={14} className="text-primary" />
            Enter the physical count of each denomination in your till before closing the day.
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div
              className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-2.5 px-4 bg-secondary/40 border-b border-border"
              style={{ gridTemplateColumns: ".7fr .5fr 1fr 1fr" }}
            >
              <div>Denomination</div>
              <div>Type</div>
              <div className="text-right">Count</div>
              <div className="text-right">Subtotal ({getActiveCurrency()})</div>
            </div>
            {rows.map((r) => (
              <div
                key={r.key}
                className="grid items-center text-[12.5px] py-2 px-4 border-b border-row-divider last:border-b-0"
                style={{ gridTemplateColumns: ".7fr .5fr 1fr 1fr" }}
              >
                <div className="font-mono font-semibold">{r.label}</div>
                <div className="text-muted-foreground capitalize">{r.kind}</div>
                <div className="text-right">
                  <input
                    inputMode="numeric"
                    value={counts[r.key] ?? ""}
                    onChange={(e) => setQty(r.key, e.target.value)}
                    placeholder="0"
                    className={`${inputCls} font-mono text-right w-28 ml-auto`}
                  />
                </div>
                <div
                  className={cn(
                    "text-right font-mono",
                    r.subtotal > 0 ? "text-foreground" : "text-faint",
                  )}
                >
                  {money(r.subtotal)}
                </div>
              </div>
            ))}
            <div
              className="grid items-center text-[13px] font-semibold py-2.5 px-4 bg-secondary/40"
              style={{ gridTemplateColumns: ".7fr .5fr 1fr 1fr" }}
            >
              <div className="col-span-3">Total counted</div>
              <div className="text-right font-mono">{money(counted)}</div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <FormGrid>
            <FormField label={`Expected balance (${getActiveCurrency()})`} span={4}>
              <input
                inputMode="numeric"
                value={expected}
                onChange={(e) => setExpected(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0"
                className={`${inputCls} font-mono font-semibold`}
              />
            </FormField>
            <FormField label={`Counted (${getActiveCurrency()})`} span={4}>
              <input
                readOnly
                value={money(counted)}
                className={`${inputCls} font-mono font-semibold bg-muted/50`}
              />
            </FormField>
            <FormField label="Variance" span={4}>
              <input
                readOnly
                value={money(variance)}
                className={cn(
                  `${inputCls} font-mono font-semibold`,
                  variance === 0
                    ? "text-primary"
                    : variance > 0
                      ? "text-emerald-600"
                      : "text-rose-600",
                )}
              />
            </FormField>
            <FormField label="Remarks" span={12}>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Explain any variance, incidents, or handover notes for the supervisor"
                className={inputCls}
              />
            </FormField>
          </FormGrid>
        </Card>

        <FormActions>
          <Link to="/transactions" className={btnSecondaryCls}>
            Cancel
          </Link>
          <button type="submit" disabled={submitting} className={btnPrimaryCls}>
            {submitting ? "Closing…" : "Close cashier"}
          </button>
        </FormActions>
      </form>
    </div>
  );
}
