import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { getPendingDisbursements, getSession } from "@/lib/mzizi.functions";
import { disburseApplication } from "@/lib/loan-application.functions";
import { Card } from "@/components/mzizi/Card";
import { Modal } from "@/components/mzizi/Modal";
import { FormGrid, btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  PaymentMethodPicker,
  paymentMethodValid,
  type PaymentMethodValue,
} from "@/components/mzizi/PaymentMethodPicker";

export const Route = createFileRoute("/_authenticated/transactions/disbursement")({
  component: DisbursementPage,
});

function DisbursementPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(getPendingDisbursements);
  const sessionFn = useServerFn(getSession);
  const { data: session } = useQuery({ queryKey: ["session"], queryFn: () => sessionFn() });
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["pending-disbursements"],
    queryFn: () => listFn(),
  });
  const role = (session?.staff as any)?.role as string | undefined;
  const roles = (session as any)?.roles ?? [];
  const canDisburse =
    ["branch_manager", "admin"].includes(role ?? "") ||
    roles.includes("admin") ||
    roles.includes("branch_manager");

  const [selected, setSelected] = useState<any | null>(null);
  const [pay, setPay] = useState<PaymentMethodValue>({ method: "fund_transfer" });

  const disburseFn = useServerFn(disburseApplication);
  const disburse = useMutation({
    mutationFn: disburseFn,
    onSuccess: (r: any) => {
      toast.success(`Disbursed · loan ${r.loan_id?.slice?.(0, 8) ?? ""}`);
      setSelected(null);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openModal(loan: any) {
    setSelected(loan);
    setPay({ method: "fund_transfer" });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (!paymentMethodValid(pay)) return toast.error("Complete payment details");
    // Stable idempotency key so a retried click cannot double-disburse.
    const idem = `disburse:${selected.application_id ?? selected.id}`;
    disburse.mutate({
      data: {
        application_id: selected.application_id ?? selected.id,
        payment_channel: pay.method,
        payment_reference: pay.reference || undefined,
        idempotency_key: idem,
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
          <div className="text-center text-faint text-sm py-10">
            No loans awaiting disbursement.
          </div>
        ) : (
          loans.map((l: any) => (
            <div
              key={l.id}
              className="grid items-center text-[12.5px] py-2.5 px-5 border-b border-row-divider hover:bg-secondary/30"
              style={{ gridTemplateColumns: "1fr 1.4fr 1fr .9fr 1fr 210px" }}
            >
              <div className="text-muted-foreground">
                <div>{l.submitted_at ? shortDate(l.submitted_at) : "—"}</div>
                {l.application_no && (
                  <div className="text-[10.5px] text-faint font-mono">{l.application_no}</div>
                )}
              </div>
              <div className="truncate">{l.client?.full_name ?? "—"}</div>
              <div className="text-muted-foreground truncate">{l.product?.name ?? "—"}</div>
              <div className="text-muted-foreground truncate">
                {l.branch?.code ?? l.branch?.name ?? "—"}
              </div>
              <div className="text-right font-mono text-primary">{money(Number(l.principal))}</div>
              <div className="flex justify-end gap-2">
                {canDisburse && (
                  <button
                    onClick={() => openModal(l)}
                    className={cn(
                      "inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold hover:bg-primary-hover",
                    )}
                  >
                    <Send size={13} />
                    Disburse
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </Card>

      <Modal
        open={!!selected}
        onClose={() => !disburse.isPending && setSelected(null)}
        title="Disburse loan"
        width={560}
      >
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
                <span className="font-mono font-semibold text-primary">
                  {money(Number(selected.principal))}
                </span>
              </div>
            </div>

            <FormGrid>
              <PaymentMethodPicker
                allowed={["fund_transfer", "cheque", "sdf_savings"]}
                clientId={selected.client?.id}
                value={pay}
                onChange={setPay}
              />
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
              <button
                type="submit"
                disabled={disburse.isPending || !paymentMethodValid(pay)}
                className={btnPrimaryCls}
              >
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
