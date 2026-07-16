import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listInstances, CANONICAL_TX_TYPES } from "@/lib/workflow.functions";
import { Card } from "@/components/mzizi/Card";
import { InstanceDetailModal } from "@/components/mzizi/InstanceDetailModal";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";

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
