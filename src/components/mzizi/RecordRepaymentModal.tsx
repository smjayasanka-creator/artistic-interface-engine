import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Modal } from "./Modal";
import { getActiveLoansForClient, recordRepayment } from "@/lib/mzizi.functions";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export function RecordRepaymentModal({ open, onClose, presetLoanId }: { open: boolean; onClose: () => void; presetLoanId?: string }) {
  const [loanId, setLoanId] = useState<string>(presetLoanId ?? "");
  const [amount, setAmount] = useState<string>("");
  const [channel, setChannel] = useState<"cash" | "mpesa" | "bank">("mpesa");
  const listFn = useServerFn(getActiveLoansForClient);
  const { data: loans } = useQuery({
    queryKey: ["active-loans"],
    queryFn: () => listFn(),
    enabled: open,
  });
  const qc = useQueryClient();
  const recordFn = useServerFn(recordRepayment);
  const post = useMutation({
    mutationFn: recordFn,
    onSuccess: (r) => {
      toast.success(`Repayment posted · ${r.reference}`);
      qc.invalidateQueries();
      onClose();
      setAmount("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal open={open} onClose={onClose} title="Record repayment" width={440}>
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium text-muted-foreground">Loan</label>
        <select
          value={loanId}
          onChange={(e) => setLoanId(e.target.value)}
          className="border border-input rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">Select loan…</option>
          {(loans ?? []).map((l: any) => (
            <option key={l.id} value={l.id}>
              {l.client?.full_name} — {money(l.principal)}
            </option>
          ))}
        </select>

        <label className="text-xs font-medium text-muted-foreground mt-1">Amount (KES)</label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="0"
          className="border border-input rounded-md px-3 py-2 text-base font-mono font-semibold bg-background"
        />

        <label className="text-xs font-medium text-muted-foreground mt-1">Method</label>
        <div className="grid grid-cols-3 gap-2">
          {(["cash", "mpesa", "bank"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={cn(
                "text-sm py-2 rounded-md border font-medium capitalize",
                channel === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-input text-secondary-foreground hover:border-border-strong",
              )}
            >
              {c === "mpesa" ? "M-Pesa" : c}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-sm px-4 py-2 border border-input rounded-md hover:bg-muted">
            Cancel
          </button>
          <button
            disabled={!loanId || !amount || post.isPending}
            onClick={() => post.mutate({ data: { loan_id: loanId, amount: Number(amount), channel } })}
            className="text-sm px-4 py-2 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary-hover disabled:opacity-50"
          >
            {post.isPending ? "Posting…" : "Post repayment"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
