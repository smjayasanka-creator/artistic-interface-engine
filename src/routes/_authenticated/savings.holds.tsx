import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Lock, ShieldOff, Plus } from "lucide-react";
import { Card } from "@/components/mzizi/Card";
import { Modal } from "@/components/mzizi/Modal";
import {
  FormGrid,
  FormField,
  inputCls,
  selectCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import {
  listSavingsAccounts,
  listSavingsHolds,
  createSavingsHold,
  requestSavingsHoldRelease,
} from "@/lib/savings.functions";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/savings/holds")({
  component: SavingsHoldsPage,
});

const HOLD_TYPES = [
  { code: "debit_block", label: "Debit block" },
  { code: "credit_block", label: "Credit block" },
  { code: "full_block", label: "Full block" },
  { code: "amount_hold", label: "Amount hold" },
  { code: "lien", label: "Lien" },
  { code: "legal", label: "Legal" },
  { code: "aml", label: "AML" },
  { code: "deceased", label: "Deceased" },
  { code: "customer", label: "Customer request" },
  { code: "loan_lien", label: "Loan lien" },
  { code: "administrative", label: "Administrative" },
  { code: "temporary", label: "Temporary" },
];

function SavingsHoldsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "all">("active");
  const [openCreate, setOpenCreate] = useState(false);
  const [releaseFor, setReleaseFor] = useState<any | null>(null);

  const listFn = useServerFn(listSavingsHolds);
  const { data: holds = [] } = useQuery({
    queryKey: ["savings-holds", tab],
    queryFn: () => listFn({ data: tab === "active" ? { active_only: true } : {} }),
  });

  const acctFn = useServerFn(listSavingsAccounts);
  const { data: accounts = [] } = useQuery({
    queryKey: ["savings-accounts", "active"],
    queryFn: () => acctFn({ data: { status: "active" } }),
  });

  const createFn = useServerFn(createSavingsHold);
  const createM = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      toast.success("Hold placed");
      qc.invalidateQueries({ queryKey: ["savings-holds"] });
      qc.invalidateQueries({ queryKey: ["savings-accounts"] });
      setOpenCreate(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const releaseFn = useServerFn(requestSavingsHoldRelease);
  const releaseM = useMutation({
    mutationFn: releaseFn,
    onSuccess: () => {
      toast.success("Release sent for approval");
      qc.invalidateQueries({ queryKey: ["savings-holds"] });
      setReleaseFor(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="animate-fadein space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/savings"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} /> Back to Savings
          </Link>
          <h1 className="text-lg font-semibold mt-1">Holds &amp; blocks</h1>
          <p className="text-[12px] text-faint">
            Debit / credit / amount holds. Release requires workflow approval.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 border border-border rounded-lg p-0.5 bg-card">
            {(["active", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-3 py-1.5 text-[12px] font-medium rounded-md",
                  tab === t
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "active" ? "Active" : "History"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setOpenCreate(true)}
            className={cn(btnPrimaryCls, "inline-flex items-center gap-1.5")}
          >
            <Plus size={14} /> Place hold
          </button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">Customer</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3">Reason</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Release</th>
                <th className="py-2 pr-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {holds.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-faint">
                    No holds.
                  </td>
                </tr>
              )}
              {(holds as any[]).map((h) => {
                const canRequestRelease =
                  h.active && (h.release_status === "none" || h.release_status === "rejected");
                return (
                  <tr key={h.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{h.account?.account_no}</td>
                    <td className="py-2 pr-3">{h.account?.client?.full_name}</td>
                    <td className="py-2 pr-3 capitalize text-xs">
                      {String(h.hold_type).replace(/_/g, " ")}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {Number(h.amount) ? money(Number(h.amount), true) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs max-w-[240px] truncate" title={h.reason}>
                      {h.reason}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {h.active ? (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <Lock size={11} /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <ShieldOff size={11} /> Released
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs capitalize">{h.release_status}</td>
                    <td className="py-2 pr-3 text-right">
                      {canRequestRelease ? (
                        <button
                          onClick={() => setReleaseFor(h)}
                          className={cn(btnSecondaryCls, "h-7 px-2 text-[11px]")}
                        >
                          Request release
                        </button>
                      ) : h.release_status === "pending" ? (
                        <Link
                          to="/approvals"
                          className="text-[11px] text-primary hover:underline"
                        >
                          Awaiting approval
                        </Link>
                      ) : (
                        <span className="text-[11px] text-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {openCreate && (
        <CreateHoldModal
          accounts={accounts as any[]}
          onClose={() => setOpenCreate(false)}
          onSubmit={(payload) => createM.mutate({ data: payload })}
          pending={createM.isPending}
        />
      )}

      {releaseFor && (
        <ReleaseModal
          hold={releaseFor}
          onClose={() => setReleaseFor(null)}
          onSubmit={(reason) =>
            releaseM.mutate({ data: { hold_id: releaseFor.id, reason } })
          }
          pending={releaseM.isPending}
        />
      )}
    </div>
  );
}

function CreateHoldModal({
  accounts,
  onClose,
  onSubmit,
  pending,
}: {
  accounts: any[];
  onClose: () => void;
  onSubmit: (payload: any) => void;
  pending: boolean;
}) {
  const [account_id, setAccount] = useState("");
  const [hold_type, setHoldType] = useState("amount_hold");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [expires_at, setExpires] = useState("");
  const needsAmount = useMemo(
    () => ["amount_hold", "lien", "loan_lien"].includes(hold_type),
    [hold_type],
  );
  const valid = account_id && reason.length >= 3 && (!needsAmount || Number(amount) > 0);

  return (
    <Modal open title="Place hold on account" onClose={onClose} width={520}>
      <FormGrid>
        <FormField label="Savings account" required span={12}>
          <select
            value={account_id}
            onChange={(e) => setAccount(e.target.value)}
            className={selectCls}
          >
            <option value="">Select account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_no} — {a.client?.full_name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Hold type" required span={6}>
          <select
            value={hold_type}
            onChange={(e) => setHoldType(e.target.value)}
            className={selectCls}
          >
            {HOLD_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Amount" span={6}>
          <input
            className={`${inputCls} font-mono`}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            disabled={!needsAmount}
            placeholder={needsAmount ? "0.00" : "n/a"}
          />
        </FormField>
        <FormField label="Reason" required span={12}>
          <input
            className={inputCls}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
          />
        </FormField>
        <FormField label="Expires at" span={12}>
          <input
            type="datetime-local"
            className={inputCls}
            value={expires_at}
            onChange={(e) => setExpires(e.target.value)}
          />
        </FormField>
      </FormGrid>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className={btnSecondaryCls}>
          Cancel
        </button>
        <button
          disabled={!valid || pending}
          onClick={() =>
            onSubmit({
              account_id,
              hold_type,
              amount: needsAmount ? Number(amount) : 0,
              reason,
              expires_at: expires_at ? new Date(expires_at).toISOString() : null,
            })
          }
          className={btnPrimaryCls}
        >
          {pending ? "Placing…" : "Place hold"}
        </button>
      </div>
    </Modal>
  );
}

function ReleaseModal({
  hold,
  onClose,
  onSubmit,
  pending,
}: {
  hold: any;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal open title="Request release" onClose={onClose} width={460}>
      <div className="text-[12.5px] text-secondary-foreground mb-3">
        Releasing <span className="font-semibold">{hold.account?.account_no}</span> —{" "}
        {String(hold.hold_type).replace(/_/g, " ")}. This starts the{" "}
        <span className="font-semibold">Savings hold release</span> workflow; the hold stays
        active until an approver signs off.
      </div>
      <FormField label="Reason for release" required>
        <textarea
          className={inputCls}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={400}
        />
      </FormField>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className={btnSecondaryCls}>
          Cancel
        </button>
        <button
          disabled={reason.length < 3 || pending}
          onClick={() => onSubmit(reason)}
          className={btnPrimaryCls}
        >
          {pending ? "Submitting…" : "Submit for approval"}
        </button>
      </div>
    </Modal>
  );
}
