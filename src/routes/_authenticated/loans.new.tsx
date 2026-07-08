import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getClients, getProducts, submitApplication } from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/loans/new")({
  component: NewLoan,
});

const TERMS = [3, 6, 12];

function NewLoan() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [clientId, setClientId] = useState("");
  const [productId, setProductId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [term, setTerm] = useState(6);
  const clientsFn = useServerFn(getClients);
  const productsFn = useServerFn(getProducts);
  const { data: clients } = useQuery({ queryKey: ["clients", "all"], queryFn: () => clientsFn({ data: { filter: "all" } }) });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => productsFn() });
  const qc = useQueryClient();
  const submitFn = useServerFn(submitApplication);
  const submit = useMutation({
    mutationFn: submitFn,
    onSuccess: () => {
      toast.success("Application submitted");
      qc.invalidateQueries();
      nav({ to: "/dashboard" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const product = products?.find((p: any) => p.id === productId);
  const client = clients?.find((c: any) => c.id === clientId);
  const weekly = principal ? (Number(principal) * (1 + (product?.annual_rate_pct ?? 15) / 100 * (term / 12))) / (term * 4) : 0;

  return (
    <div className="animate-fadein max-w-[880px] mx-auto">
      <Link to="/dashboard" className="text-xs text-primary hover:underline">← Cancel</Link>
      <div className="flex items-center gap-0 my-6">
        {["Client", "Product & amount", "Review"].map((label, i) => {
          const n = i + 1;
          const done = step > n;
          const active = step === n;
          return (
            <div key={n} className="flex items-center gap-2.5 flex-1">
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-none",
                  done || active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {done ? "✓" : n}
              </div>
              <div className={cn("text-[12.5px] font-medium", active || done ? "text-foreground" : "text-muted-foreground")}>
                {label}
              </div>
              {n < 3 && <div className="flex-1 h-px bg-border ml-2" />}
            </div>
          );
        })}
      </div>

      <Card className="p-6">
        {step === 1 && (
          <>
            <div className="text-sm font-semibold mb-3">Select client</div>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full border border-input rounded-md px-3 py-2.5 text-sm bg-background">
              <option value="">— pick a client —</option>
              {(clients ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.full_name} {c.group?.name ? `· ${c.group.name}` : ""}</option>
              ))}
            </select>
          </>
        )}
        {step === 2 && (
          <>
            <div className="text-sm font-semibold mb-3">Product</div>
            <div className="flex flex-wrap gap-2 mb-5">
              {(products ?? []).map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProductId(p.id)}
                  className={cn(
                    "px-3.5 py-2 rounded-full border text-[12.5px] font-medium",
                    productId === p.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-border-strong",
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className="text-sm font-semibold mb-2">Principal (KES)</div>
            <input
              value={principal}
              onChange={(e) => setPrincipal(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="0"
              className="w-full border border-input rounded-md px-3 py-2.5 text-lg font-mono font-semibold bg-background mb-5"
            />
            <div className="text-sm font-semibold mb-2">Term</div>
            <div className="flex gap-2">
              {TERMS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTerm(t)}
                  className={cn(
                    "px-4 py-2 rounded-full border text-[12.5px] font-medium",
                    term === t ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-border-strong",
                  )}
                >
                  {t} months
                </button>
              ))}
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <div className="text-sm font-semibold mb-4">Review application</div>
            <div className="grid gap-2.5 text-[13px]">
              {[
                ["Borrower", client?.full_name ?? "—"],
                ["Group", client?.group?.name ?? "Individual"],
                ["Product", product?.name ?? "—"],
                ["Principal", money(Number(principal))],
                ["Term", `${term} months`],
                ["Est. weekly repayment", money(weekly)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-row-divider py-2">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-mono font-semibold">{v}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="flex justify-between mt-6">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="border border-input px-4 py-2 rounded-md text-sm hover:bg-muted disabled:opacity-40"
          >
            Back
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={(step === 1 && !clientId) || (step === 2 && (!productId || !principal))}
              className="bg-primary text-primary-foreground px-5 py-2 rounded-md text-sm font-semibold hover:bg-primary-hover disabled:opacity-50"
            >
              Continue
            </button>
          ) : (
            <button
              disabled={submit.isPending}
              onClick={() => submit.mutate({ data: { client_id: clientId, product_id: productId, principal: Number(principal), term_months: term } })}
              className="bg-primary text-primary-foreground px-5 py-2 rounded-md text-sm font-semibold hover:bg-primary-hover disabled:opacity-50"
            >
              {submit.isPending ? "Submitting…" : "Submit application"}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
