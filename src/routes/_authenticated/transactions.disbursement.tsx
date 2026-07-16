import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { approveLoan, getPendingDisbursements, getSession } from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import { Modal } from "@/components/mzizi/Modal";
import { FormField, FormGrid, inputCls, selectCls, btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/transactions/disbursement")({
  component: DisbursementPage,
});

type PaymentChannel = "cash" | "mpesa" | "bank" | "cheque";

function DisbursementPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(getPendingDisbursements);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["pending-disbursements"],
    queryFn: () => listFn(),
  });

  const [selected, setSelected] = useState<any | null>(null);
  const [channel, setChannel] = useState<PaymentChannel>("cash");
  const [reference, setReference] = useState("");
  const [bankAccount, setBankAccount] = useState("");

  const disburseFn = useServerFn(approveLoan);
  const disburse = useMutation({
    mutationFn: disburseFn,
    onSuccess: (r: any) => {
      toast.success(`Disbursed · ${r.reference}`);
      setSelected(null);
      setReference("");
      setBankAccount("");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openModal(loan: any) {
    setSelected(loan);
    setChannel("cash");
    setReference("");
    setBankAccount("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const needsRef = channel !== "cash";
    const needsBank = channel === "bank" || channel === "cheque";
    if (needsRef && !reference.trim()) return toast.error("Reference required");
    if (needsBank && !bankAccount) return toast.error("Bank account required");
    disburse.mutate({
      data: {
        loan_id: selected.id,
        payment_channel: channel,
        payment_reference: reference.trim() || undefined,
        bank_account: bankAccount || undefined,
      } as any,
    });
  }

  const loans = data ?? [];

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div className="text-[11.5px] text-faint flex items-center gap-2">
          {isFetching && <Loader2 size={13} className="animate-spin" />}
          {loans.length} pending
        </div>
      </div>

      <Card padded={false}>
        <div
          className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
          style={{ gridTemplateColumns: "1fr 1.4fr 1fr .9fr 1fr 210px" }}
        >
          <div>Submitted</div>
          <div>Client</div>
          <div>Product</div>
          <div>Branch</div>
          <div className="text-right">Principal</div>
          <div className="text-right">Action</div>
        </div>

        {isLoading ? (
          <div className="text-center text-faint text-sm py-10">Loading…</div>
        ) : loans.length === 0 ? (
          <div className="text-center text-faint text-sm py-10">No loans awaiting disbursement.</div>
        ) : (
          loans.map((l: any) => (
            <div
              key={l.id}
              className="grid items-center text-[12.5px] py-2.5 px-5 border-b border-row-divider hover:bg-secondary/30"
              style={{ gridTemplateColumns: "1fr 1.4fr 1fr .9fr 1fr 210px" }}
            >
              <div className="text-muted-foreground">{l.submitted_at ? shortDate(l.submitted_at) : "—"}</div>
              <div className="truncate">{l.client?.full_name ?? "—"}</div>
              <div className="text-muted-foreground truncate">{l.product?.name ?? "—"}</div>
              <div className="text-muted-foreground truncate">{l.branch?.code ?? l.branch?.name ?? "—"}</div>
              <div className="text-right font-mono text-primary">{money(Number(l.principal))}</div>
              <div className="flex justify-end gap-2">
                <Link
                  to="/loans/$id"
                  params={{ id: l.id }}
                  className="inline-flex items-center h-8 px-3 rounded-md border border-border text-[12px] font-semibold hover:border-primary"
                >
                  View
                </Link>
                <button
                  onClick={() => openModal(l)}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold hover:bg-primary-hover",
                  )}
                >
                  <Send size={13} />
                  Disburse
                </button>
              </div>
            </div>
          ))
        )}
      </Card>

      <Modal open={!!selected} onClose={() => !disburse.isPending && setSelected(null)} title="Disburse loan" width={520}>
        {selected && (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="rounded-lg bg-secondary/40 border border-border p-3 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Client</span>
                <span className="font-medium">{selected.client?.full_name ?? "—"}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">Product</span>
                <span>{selected.product?.name ?? "—"}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">Principal</span>
                <span className="font-mono font-semibold text-primary">{money(Number(selected.principal))}</span>
              </div>
            </div>

            <FormGrid>
              <FormField label="Payment mode" required span={12}>
                <div className="grid grid-cols-4 gap-2">
                  {(["cash", "mpesa", "bank", "cheque"] as PaymentChannel[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setChannel(c)}
                      className={cn(
                        "text-sm py-1.5 rounded-md border font-medium capitalize",
                        channel === c
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-input text-secondary-foreground hover:border-border-strong",
                      )}
                    >
                      {c === "mpesa" ? "M-Pesa" : c}
                    </button>
                  ))}
                </div>
              </FormField>

              {(channel === "bank" || channel === "cheque") && (
                <FormField label="Bank account" required span={12}>
                  <select value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className={selectCls}>
                    <option value="">Select bank account…</option>
                    <option value="KCB — Current">KCB — Current</option>
                    <option value="Equity — Operating">Equity — Operating</option>
                    <option value="Co-op — Settlement">Co-op — Settlement</option>
                    <option value="NCBA — Disbursement">NCBA — Disbursement</option>
                  </select>
                </FormField>
              )}

              {channel !== "cash" && (
                <FormField
                  label={
                    channel === "mpesa"
                      ? "M-Pesa transaction ID"
                      : channel === "cheque"
                      ? "Cheque number"
                      : "Bank reference"
                  }
                  required
                  span={12}
                >
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className={`${inputCls} font-mono`}
                    maxLength={80}
                    placeholder={channel === "mpesa" ? "e.g. QGH7XY82ZT" : channel === "cheque" ? "e.g. 000123" : "e.g. RTGS/2026/00123"}
                  />
                </FormField>
              )}
            </FormGrid>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                disabled={disburse.isPending}
                className={btnSecondaryCls}
              >
                Cancel
              </button>
              <button type="submit" disabled={disburse.isPending} className={btnPrimaryCls}>
                {disburse.isPending ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 size={13} className="animate-spin" /> Processing…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Send size={13} /> Confirm disbursement
                  </span>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
