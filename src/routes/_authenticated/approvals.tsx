import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listInstances, actOnInstance, cancelInstance, getInstanceReference, CANONICAL_TX_TYPES } from "@/lib/workflow.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { Modal } from "@/components/mzizi/Modal";
import { btnPrimaryCls, btnSecondaryCls, inputCls } from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";
import { money, shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/approvals")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["workflow_instances", "mine"],
      queryFn: () => listInstances({ data: { mine: true, status: "pending" } as any }),
    }),
  component: Approvals,
});

function Approvals() {
  const [tab, setTab] = useState<"mine" | "pending" | "all">("mine");
  const [openInst, setOpenInst] = useState<any | null>(null);
  const fn = useServerFn(listInstances);
  const { data = [] } = useQuery({
    queryKey: ["workflow_instances", tab],
    queryFn: () => fn({ data: { mine: tab === "mine", status: tab === "all" ? "all" : "pending" } as any }),
  });

  return (
    <div className="space-y-5 animate-fadein">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Approvals inbox</h2>
          <p className="text-[12.5px] text-faint mt-0.5">Multi-step approvals across every configured transaction type.</p>
        </div>
        <div className="flex gap-1 border border-border rounded-lg p-0.5 bg-card">
          {(["mine", "pending", "all"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-3 py-1.5 text-[12px] font-medium rounded-md",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t === "mine" ? "Assigned to me" : t === "pending" ? "All pending" : "History"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        {data.length === 0 && <Card><div className="text-center text-faint text-sm py-8">Nothing here.</div></Card>}
        {data.map((inst: any) => <InstanceRow key={inst.id} inst={inst} onOpen={() => setOpenInst(inst)} />)}
      </div>

      {openInst && (
        <InstanceDetailModal
          instance={openInst}
          onClose={() => setOpenInst(null)}
        />
      )}
    </div>
  );
}

function InstanceRow({ inst, onOpen }: { inst: any; onOpen: () => void }) {
  const step = inst.step_config;
  const totalSteps = inst.workflow?.steps?.length ?? 0;
  const txLabel = CANONICAL_TX_TYPES.find((t) => t.code === inst.transaction_type)?.label ?? inst.transaction_type;
  const statusTone: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    approved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    declined: "bg-rose-500/10 text-rose-700 border-rose-500/30",
    cancelled: "bg-muted text-faint border-border",
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-foreground">{inst.reference_label}</span>
            <span className={cn("text-[10.5px] px-1.5 py-0.5 rounded border capitalize", statusTone[inst.status])}>{inst.status}</span>
            {inst.overdue && <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 border border-rose-500/30">SLA overdue</span>}
          </div>
          <div className="text-[11.5px] text-faint mt-0.5">
            {txLabel} · {inst.workflow?.name} · started {new Date(inst.initiated_at).toLocaleString()}
            {inst.amount != null && <> · {money(Number(inst.amount))}</>}
          </div>
          <div className="text-[11.5px] text-secondary-foreground mt-2">
            Step {inst.current_step} of {totalSteps}: <span className="font-semibold">{step?.name}</span>
            {step && (
              <> — {step.approver_kind === "user" ? "specific user" : step.approver_kind === "branch_role" ? `role ${step.role} in branch` : `role ${step.role}`}
                {step.required_approvals > 1 && <> · requires {inst.approvals_recorded}/{step.required_approvals} approvals</>}
                {step.sla_hours && <> · SLA {step.sla_hours}h ({step.sla_action})</>}
              </>
            )}
          </div>
        </div>
        <button
          onClick={onOpen}
          className="shrink-0 inline-flex items-center h-8 px-3 rounded-md border border-border text-[12px] font-semibold hover:border-primary hover:text-primary"
        >
          Open
        </button>
      </div>
    </Card>
  );
}

function InstanceDetailModal({ instance, onClose }: { instance: any; onClose: () => void }) {
  const [comment, setComment] = useState("");
  const qc = useQueryClient();
  const refFn = useServerFn(getInstanceReference);
  const actFn = useServerFn(actOnInstance);
  const cancelFn = useServerFn(cancelInstance);

  const { data: refData, isLoading: refLoading } = useQuery({
    queryKey: ["workflow_instance_ref", instance.id],
    queryFn: () => refFn({ data: { instance_id: instance.id } }),
    enabled: !!instance?.reference_id,
  });

  const act = useMutation({
    mutationFn: actFn,
    onSuccess: (r: any) => {
      toast.success(
        r.status === "approved" ? "Fully approved"
          : r.status === "declined" ? "Declined"
          : r.advanced_to ? `Advanced to step ${r.advanced_to}`
          : `Recorded (${r.approvals ?? ""} approvals)`,
      );
      qc.invalidateQueries({ queryKey: ["workflow_instances"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: cancelFn,
    onSuccess: () => { toast.success("Cancelled"); qc.invalidateQueries({ queryKey: ["workflow_instances"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const txLabel = CANONICAL_TX_TYPES.find((t) => t.code === instance.transaction_type)?.label ?? instance.transaction_type;
  const step = instance.step_config;

  return (
    <Modal open onClose={onClose} title={`Approval · ${instance.reference_label}`} width={640}>
      <div className="space-y-4">
        {/* Meta */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
          <MetaRow label="Transaction" value={txLabel} />
          <MetaRow label="Workflow" value={instance.workflow?.name} />
          <MetaRow label="Status" value={instance.status} />
          <MetaRow label="Started" value={new Date(instance.initiated_at).toLocaleString()} />
          {instance.amount != null && <MetaRow label="Amount" value={money(Number(instance.amount))} />}
          <MetaRow
            label="Current step"
            value={`${instance.current_step}/${instance.workflow?.steps?.length ?? 0} — ${step?.name ?? "—"}`}
          />
        </div>

        {/* Reference details (read-only) */}
        <div className="border border-border rounded-lg p-3 bg-secondary/30">
          <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-2">Reference details</div>
          {refLoading ? (
            <div className="text-[12px] text-faint">Loading…</div>
          ) : (
            <ReferenceView kind={refData?.kind} data={refData?.data} />
          )}
          {instance.reference_id && typeof instance.transaction_type === "string" && instance.transaction_type.startsWith("loan_") && (
            <Link to="/loans/$id" params={{ id: instance.reference_id }}
              className="inline-block mt-2 text-[11.5px] font-semibold text-primary hover:underline">
              Open full loan page →
            </Link>
          )}
        </div>

        {/* Action history */}
        {instance.actions?.length > 0 && (
          <div className="border-t border-border pt-2 space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1">History</div>
            {instance.actions.map((a: any) => (
              <div key={a.id} className="text-[11.5px] text-secondary-foreground flex items-center gap-2">
                <span className={cn("px-1.5 py-0.5 rounded text-[10px]",
                  a.decision === "approve" ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700")}>
                  {a.decision}
                </span>
                <span className="font-mono text-faint">step {a.step_order}</span>
                <span className="text-faint">· {new Date(a.acted_at).toLocaleString()}</span>
                {a.comment && <span className="text-muted-foreground">— {a.comment}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {instance.status === "pending" ? (
          <div className="space-y-2 pt-2 border-t border-border">
            <input
              className={inputCls + " w-full"}
              placeholder="Comment (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className={btnPrimaryCls}
                disabled={act.isPending}
                onClick={() => act.mutate({ data: { instance_id: instance.id, decision: "approve", comment: comment || null } })}
              >
                Approve
              </button>
              <button
                className={btnSecondaryCls}
                disabled={act.isPending}
                onClick={() => act.mutate({ data: { instance_id: instance.id, decision: "decline", comment: comment || null } })}
              >
                Decline
              </button>
              <button
                className="ml-auto text-[11.5px] text-muted-foreground hover:text-destructive px-2"
                onClick={() => { if (confirm("Cancel this request?")) cancel.mutate({ data: { instance_id: instance.id } }); }}
              >
                Cancel request
              </button>
            </div>
          </div>
        ) : (
          <div className="pt-2 border-t border-border flex justify-end">
            <button className={btnSecondaryCls} onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function MetaRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10.5px] uppercase tracking-wider text-faint font-semibold">{label}</span>
      <span className="text-foreground">{value ?? "—"}</span>
    </div>
  );
}

function ReferenceView({ kind, data }: { kind?: string; data: any }) {
  if (!data) return <div className="text-[12px] text-faint">No linked record.</div>;
  if (kind === "loan") {
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <MetaRow label="Loan no" value={data.loan_no} />
        <MetaRow label="Client" value={data.client?.full_name} />
        <MetaRow label="Product" value={data.product?.name} />
        <MetaRow label="Branch" value={data.branch?.code ?? data.branch?.name} />
        <MetaRow label="Principal" value={money(Number(data.principal))} />
        <MetaRow label="Rate" value={data.interest_rate != null ? `${data.interest_rate}%` : "—"} />
        <MetaRow label="Term" value={data.term_months ? `${data.term_months} mo` : "—"} />
        <MetaRow label="Status" value={data.status} />
        <MetaRow label="Submitted" value={data.submitted_at ? shortDate(data.submitted_at) : "—"} />
        <MetaRow label="Purpose" value={data.purpose} />
      </div>
    );
  }
  if (kind === "fd") {
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <MetaRow label="FD no" value={data.fd_no} />
        <MetaRow label="Client" value={data.client?.full_name} />
        <MetaRow label="Product" value={data.product?.name} />
        <MetaRow label="Branch" value={data.branch?.code ?? data.branch?.name} />
        <MetaRow label="Principal" value={money(Number(data.principal))} />
        <MetaRow label="Rate" value={data.interest_rate != null ? `${data.interest_rate}%` : "—"} />
        <MetaRow label="Term" value={data.term_months ? `${data.term_months} mo` : "—"} />
        <MetaRow label="Status" value={data.status} />
        <MetaRow label="Opened" value={data.opened_at ? shortDate(data.opened_at) : "—"} />
        <MetaRow label="Maturity" value={data.maturity_date ? shortDate(data.maturity_date) : "—"} />
      </div>
    );
  }
  if (kind === "journal") {
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <MetaRow label="Entry no" value={data.entry_no} />
        <MetaRow label="Date" value={data.entry_date ? shortDate(data.entry_date) : "—"} />
        <MetaRow label="Status" value={data.status} />
        <MetaRow label="Debit" value={money(Number(data.total_debit ?? 0))} />
        <MetaRow label="Credit" value={money(Number(data.total_credit ?? 0))} />
        <div className="col-span-2"><MetaRow label="Description" value={data.description} /></div>
      </div>
    );
  }
  if (kind === "client") {
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <MetaRow label="Full name" value={data.full_name} />
        <MetaRow label="National ID" value={data.national_id} />
        <MetaRow label="Phone" value={data.phone} />
        <MetaRow label="Email" value={data.email} />
        <MetaRow label="KYC" value={data.kyc_status} />
        <MetaRow label="Risk" value={data.risk_rating} />
      </div>
    );
  }
  return <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>;
}
