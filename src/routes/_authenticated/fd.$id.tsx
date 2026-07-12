import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import {
  getFixedDeposit,
  approveFixedDeposit,
  previewPrematureClosure,
  closePrematurely,
  processMaturity,
  runFdDailyAccrual,
  runFdInterestPayouts,
} from "@/lib/fd.functions";
import { Card } from "@/components/mzizi/Card";
import { btnPrimaryCls, btnSecondaryCls, inputCls } from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";
import { money, getActiveCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/fd/$id")({
  component: FdDetail,
});

type Tab = "overview" | "schedule" | "accruals" | "nominees" | "transactions";

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  active: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  matured: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  prematurely_closed: "bg-rose-500/10 text-rose-700 border-rose-500/30",
  renewed: "bg-violet-500/10 text-violet-700 border-violet-500/30",
};

function FdDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const getFn = useServerFn(getFixedDeposit);
  const approveFn = useServerFn(approveFixedDeposit);
  const previewFn = useServerFn(previewPrematureClosure);
  const closeFn = useServerFn(closePrematurely);
  const matureFn = useServerFn(processMaturity);
  const accrueFn = useServerFn(runFdDailyAccrual);
  const payoutsFn = useServerFn(runFdInterestPayouts);

  const { data } = useQuery({ queryKey: ["fd", id], queryFn: () => getFn({ data: { id } }) });
  const [tab, setTab] = useState<Tab>("overview");
  const [closeModal, setCloseModal] = useState<{ onDate: string; reason: string } | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewFn>> | null>(null);

  const approveM = useMutation({
    mutationFn: () => approveFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deposit approved and activated");
      qc.invalidateQueries({ queryKey: ["fd", id] });
      qc.invalidateQueries({ queryKey: ["fd-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const closeM = useMutation({
    mutationFn: (v: { on_date: string; reason?: string }) => closeFn({ data: { id, ...v } }),
    onSuccess: (r) => {
      toast.success(`Closed. Settlement ${money(r.settlement)}`);
      setCloseModal(null);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["fd", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const matureM = useMutation({
    mutationFn: () => matureFn({ data: { id } }),
    onSuccess: (r) => {
      if (r.action === "renewed") {
        toast.success(`Renewed as ${r.new_certificate}`);
        navigate({ to: "/fd/$id", params: { id: r.new_id! } });
      } else {
        toast.success(`Matured. Payout ${money(r.settlement ?? 0)}`);
      }
      qc.invalidateQueries({ queryKey: ["fd", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data?.fd) return <div className="text-muted-foreground">Loading…</div>;
  const fd = data.fd as unknown as {
    id: string;
    certificate_no: string;
    status: string;
    principal: number;
    rate_at_booking: number;
    wht_rate_at_booking: number;
    tenure_months: number;
    payout_option: string;
    value_date: string;
    maturity_date: string;
    maturity_instruction: string;
    close_reason: string | null;
    client: { id: string; full_name: string; phone?: string; national_id?: string };
    product: { id: string; code: string; name: string };
    branch: { code: string; name: string };
    settlement: { code: string; name: string } | null;
  };

  return (
    <div className="animate-fadein flex flex-col gap-5">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="font-mono text-[12px] px-2 py-0.5 rounded bg-muted">{fd.certificate_no}</div>
              <span className={cn("inline-flex px-2 py-0.5 rounded border text-[10.5px] uppercase tracking-wide", STATUS_TONE[fd.status])}>
                {fd.status.replace("_", " ")}
              </span>
            </div>
            <div className="mt-2 text-[15px] font-semibold">{fd.client.full_name}</div>
            <div className="text-[12px] text-muted-foreground">
              {fd.product.code} · {fd.product.name} · {fd.branch.name}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className={btnSecondaryCls} onClick={() => window.print()}>
              <Printer size={14} className="mr-1.5" /> Certificate
            </button>
            {fd.status === "pending" && (
              <button className={btnPrimaryCls} onClick={() => approveM.mutate()} disabled={approveM.isPending}>
                {approveM.isPending ? "Approving…" : "Approve & activate"}
              </button>
            )}
            {fd.status === "active" && (
              <>
                <button
                  className={btnSecondaryCls}
                  onClick={() =>
                    setCloseModal({ onDate: new Date().toISOString().slice(0, 10), reason: "" })
                  }
                >
                  Premature close
                </button>
                <button className={btnPrimaryCls} onClick={() => matureM.mutate()} disabled={matureM.isPending}>
                  Process maturity
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 text-[13px]">
          <Info label="Principal" value={money(Number(fd.principal))} />
          <Info label="Rate" value={`${Number(fd.rate_at_booking).toFixed(3)}%`} />
          <Info label="Tenure" value={`${fd.tenure_months} months`} />
          <Info label="Payout" value={fd.payout_option.replace("_", " ")} />
          <Info label="Value date" value={fd.value_date} />
          <Info label="Maturity date" value={fd.maturity_date} />
          <Info label="WHT" value={`${Number(fd.wht_rate_at_booking).toFixed(3)}%`} />
          <Info label="Settlement account" value={fd.settlement ? `${fd.settlement.code} · ${fd.settlement.name}` : "—"} />
        </div>
      </Card>

      <div className="flex gap-2 flex-wrap">
        <button
          className={btnSecondaryCls}
          onClick={async () => {
            const r = await accrueFn();
            toast.success(`Accrual posted for ${r.inserted} deposits`);
            qc.invalidateQueries({ queryKey: ["fd", id] });
          }}
        >
          Run daily accrual
        </button>
        <button
          className={btnSecondaryCls}
          onClick={async () => {
            const r = await payoutsFn();
            toast.success(`${r.paid} monthly payouts posted`);
            qc.invalidateQueries({ queryKey: ["fd", id] });
          }}
        >
          Post due interest payouts
        </button>
      </div>

      <Card>
        <div className="flex gap-1 border-b border-border mb-4">
          {(["overview", "schedule", "accruals", "nominees", "transactions"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px capitalize",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="text-[13px] text-muted-foreground">
            Maturity instruction: <span className="text-foreground font-medium">{fd.maturity_instruction.replace(/_/g, " ")}</span>
            {fd.close_reason && (
              <div className="mt-2">Close reason: {fd.close_reason}</div>
            )}
          </div>
        )}

        {tab === "schedule" && (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-faint font-semibold border-b border-border">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Due date</th>
                <th className="py-2 pr-3 text-right">Gross ({getActiveCurrency()})</th>
                <th className="py-2 pr-3 text-right">WHT ({getActiveCurrency()})</th>
                <th className="py-2 pr-3 text-right">Net ({getActiveCurrency()})</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.schedule.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="py-1.5 pr-3">{r.seq}</td>
                  <td className="py-1.5 pr-3">{r.due_date}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{Number(r.gross_interest).toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{Number(r.wht_amount).toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{Number(r.net_interest).toLocaleString()}</td>
                  <td className="py-1.5 pr-3">
                    {r.paid ? (
                      <span className="text-emerald-600">Paid {r.paid_date}</span>
                    ) : (
                      <span className="text-amber-600">Pending</span>
                    )}
                  </td>
                </tr>
              ))}
              {data.schedule.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">Schedule appears after approval.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === "accruals" && (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-faint font-semibold border-b border-border">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3 text-right">Daily accrual</th>
                <th className="py-2 pr-3 text-right">Cumulative</th>
              </tr>
            </thead>
            <tbody>
              {data.accruals.map((r) => (
                <tr key={r.accrual_date} className="border-b border-border/50">
                  <td className="py-1.5 pr-3">{r.accrual_date}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{Number(r.daily_amount).toFixed(4)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{Number(r.cumulative_amount).toFixed(4)}</td>
                </tr>
              ))}
              {data.accruals.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-muted-foreground">No accruals yet. Run daily accrual.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === "nominees" && (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-faint font-semibold border-b border-border">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">NIC</th>
                <th className="py-2 pr-3">Relationship</th>
                <th className="py-2 pr-3 text-right">Percentage</th>
              </tr>
            </thead>
            <tbody>
              {data.nominees.map((n) => (
                <tr key={n.id} className="border-b border-border/50">
                  <td className="py-1.5 pr-3">{n.name}</td>
                  <td className="py-1.5 pr-3">{n.nic ?? "—"}</td>
                  <td className="py-1.5 pr-3">{n.relationship ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{Number(n.percentage).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "transactions" && (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-faint font-semibold border-b border-border">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3 text-right">Amount (LKR)</th>
                <th className="py-2 pr-3">Reference</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((t) => (
                <tr key={t.id} className="border-b border-border/50">
                  <td className="py-1.5 pr-3">{t.txn_date}</td>
                  <td className="py-1.5 pr-3 capitalize">{t.type.replace(/_/g, " ")}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{Number(t.amount).toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{t.reference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {closeModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setCloseModal(null)}>
          <div className="bg-card rounded-xl border border-border max-w-lg w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="font-semibold text-[15px] mb-3">Premature closure</div>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">Closure date</span>
                <input
                  type="date"
                  className={inputCls}
                  value={closeModal.onDate}
                  onChange={(e) => setCloseModal({ ...closeModal, onDate: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">Reason</span>
                <input
                  className={inputCls}
                  value={closeModal.reason}
                  onChange={(e) => setCloseModal({ ...closeModal, reason: e.target.value })}
                />
              </label>
              <button
                className={btnSecondaryCls}
                onClick={async () => {
                  const p = await previewFn({ data: { id, on_date: closeModal.onDate } });
                  setPreview(p);
                }}
              >
                Preview breakdown
              </button>
              {preview && (
                <div className="text-[12.5px] bg-muted/50 rounded p-3 flex flex-col gap-1">
                  <Row k="Period held" v={`${preview.completeMonths}m ${preview.trailingDays}d`} />
                  <Row k="Published rate for period" v={`${preview.publishedRate.toFixed(3)}%`} />
                  <Row k="Applicable rate (after penalty)" v={`${preview.applicableRate.toFixed(3)}%`} />
                  <Row k="Interest entitled (gross)" v={`LKR ${preview.grossEntitled.toLocaleString()}`} />
                  <Row k="WHT" v={`LKR ${preview.whtEntitled.toLocaleString()}`} />
                  <Row k="Interest entitled (net)" v={`LKR ${preview.netEntitled.toLocaleString()}`} />
                  <Row k="Already paid (net)" v={`LKR ${preview.alreadyPaidNet.toLocaleString()}`} />
                  <Row k="Excess to recover from principal" v={`LKR ${preview.excessPaid.toLocaleString()}`} />
                  <Row k="Settlement amount" v={`LKR ${preview.settlement.toLocaleString()}`} strong />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button className={btnSecondaryCls} onClick={() => setCloseModal(null)}>Cancel</button>
                <button
                  className={btnPrimaryCls}
                  disabled={!preview || closeM.isPending}
                  onClick={() => closeM.mutate({ on_date: closeModal.onDate, reason: closeModal.reason || undefined })}
                >
                  Confirm & close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn("font-mono", strong && "font-semibold text-foreground")}>{v}</span>
    </div>
  );
}
