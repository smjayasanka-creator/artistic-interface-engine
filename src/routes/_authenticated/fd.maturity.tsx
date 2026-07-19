import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listMaturingDeposits, processMaturity } from "@/lib/fd.functions";
import { Card } from "@/components/mzizi/Card";
import { Modal } from "@/components/mzizi/Modal";
import { FormGrid, btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import {
  PaymentMethodPicker,
  paymentMethodValid,
  type PaymentMethodValue,
} from "@/components/mzizi/PaymentMethodPicker";

export const Route = createFileRoute("/_authenticated/fd/maturity")({
  component: MaturityDue,
});

function MaturityDue() {
  const [win, setWin] = useState<7 | 30 | 60>(30);
  const qc = useQueryClient();
  const listFn = useServerFn(listMaturingDeposits);
  const matureFn = useServerFn(processMaturity);
  const { data: rows } = useQuery({
    queryKey: ["fd-maturity", win],
    queryFn: () => listFn({ data: { window: win } }),
  });

  const [payoutFor, setPayoutFor] = useState<any | null>(null);
  const [pay, setPay] = useState<PaymentMethodValue>({ method: "fund_transfer" });

  const matureM = useMutation({
    mutationFn: (args: { id: string; payload?: PaymentMethodValue }) =>
      matureFn({
        data: {
          id: args.id,
          ...(args.payload
            ? {
                payment_method: args.payload.method,
                bank_account_id: args.payload.bank_account_id ?? null,
                savings_account_id: args.payload.savings_account_id ?? null,
                reference: args.payload.reference ?? null,
              }
            : {}),
        } as any,
      }),
    onSuccess: (r) => {
      toast.success(
        r.action === "renewed"
          ? `Renewed as ${r.new_certificate}`
          : `Payout ${money(r.settlement ?? 0)}`,
      );
      qc.invalidateQueries({ queryKey: ["fd-maturity"] });
      setPayoutFor(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onProcess(d: any) {
    if (d.maturity_instruction === "payout") {
      setPayoutFor(d);
      setPay({ method: "fund_transfer" });
    } else {
      matureM.mutate({ id: d.id });
    }
  }

  return (
    <div className="animate-fadein flex flex-col gap-5">
      <div className="flex gap-2">
        {([7, 30, 60] as const).map((w) => (
          <button
            key={w}
            onClick={() => setWin(w)}
            className={cn(
              "px-4 py-2 rounded-md text-[13px] font-medium border",
              win === w
                ? "bg-primary text-primary-foreground border-primary"
                : "border-input hover:bg-muted",
            )}
          >
            Next {w} days
          </button>
        ))}
      </div>
      <Card>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-faint font-semibold border-b border-border">
              <th className="py-2 pr-3">Certificate</th>
              <th className="py-2 pr-3">Client</th>
              <th className="py-2 pr-3">Product</th>
              <th className="py-2 pr-3 text-right">Principal</th>
              <th className="py-2 pr-3">Maturity</th>
              <th className="py-2 pr-3">Instruction</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((d) => (
              <tr key={d.id} className="border-b border-border/50">
                <td className="py-2 pr-3 font-mono">
                  <Link to="/fd/$id" params={{ id: d.id }} className="text-primary hover:underline">
                    {d.certificate_no}
                  </Link>
                </td>
                <td className="py-2 pr-3">{d.client?.full_name}</td>
                <td className="py-2 pr-3">{d.product?.name}</td>
                <td className="py-2 pr-3 text-right font-mono">{money(Number(d.principal))}</td>
                <td className="py-2 pr-3">{d.maturity_date}</td>
                <td className="py-2 pr-3 capitalize">
                  {d.maturity_instruction.replace(/_/g, " ")}
                </td>
                <td className="py-2 pr-3 text-right">
                  <button
                    className={btnPrimaryCls}
                    onClick={() => onProcess(d)}
                    disabled={matureM.isPending}
                  >
                    Process
                  </button>
                </td>
              </tr>
            ))}
            {(rows ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  No deposits maturing in this window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={!!payoutFor}
        onClose={() => !matureM.isPending && setPayoutFor(null)}
        title="Fixed deposit withdrawal"
        width={560}
      >
        {payoutFor && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!paymentMethodValid(pay)) return toast.error("Complete payment details");
              matureM.mutate({ id: payoutFor.id, payload: pay });
            }}
            className="flex flex-col gap-4"
          >
            <div className="rounded-lg bg-secondary/40 border border-border p-3 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Certificate</span>
                <span className="font-mono">{payoutFor.certificate_no}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">Client</span>
                <span className="font-medium">{payoutFor.client?.full_name ?? "—"}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">Principal</span>
                <span className="font-mono font-semibold text-primary">
                  {money(Number(payoutFor.principal))}
                </span>
              </div>
            </div>

            <FormGrid>
              <PaymentMethodPicker
                allowed={["fund_transfer", "cheque", "sdf_savings"]}
                clientId={payoutFor.client?.id}
                value={pay}
                onChange={setPay}
              />
            </FormGrid>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayoutFor(null)}
                disabled={matureM.isPending}
                className={btnSecondaryCls}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={matureM.isPending || !paymentMethodValid(pay)}
                className={btnPrimaryCls}
              >
                {matureM.isPending ? "Processing…" : "Confirm payout"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
