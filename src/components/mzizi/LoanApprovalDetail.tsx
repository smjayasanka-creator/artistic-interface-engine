import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getLoanApplication } from "@/lib/loan-application.functions";
import { getLoanEvaluation } from "@/lib/evaluation.functions";
import { getClientRiskAssessment } from "@/lib/risk.functions";
import { generateSchedule, type Frequency, type InterestMethod } from "@/lib/loan-schedule";
import { supabase } from "@/integrations/supabase/client";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "application", label: "Application" },
  { key: "customer", label: "Customer" },
  { key: "evaluation", label: "Evaluation" },
  { key: "schedule", label: "Schedule" },
  { key: "documents", label: "Documents" },
  { key: "history", label: "History" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function LoanApprovalDetail({ loan }: { loan: any }) {
  const [tab, setTab] = useState<TabKey>("application");

  const getAppFn = useServerFn(getLoanApplication);
  const getEvalFn = useServerFn(getLoanEvaluation);
  const getRiskFn = useServerFn(getClientRiskAssessment);

  const appQuery = useQuery({
    queryKey: ["approval-loan-application", loan?.application_id],
    queryFn: () => getAppFn({ data: { id: loan.application_id as string } }),
    enabled: !!loan?.application_id,
  });

  const evalQuery = useQuery({
    queryKey: ["approval-loan-evaluation", loan?.id],
    queryFn: () =>
      getEvalFn({
        data: { loan_id: loan.id as string, loan_product_id: loan.product?.id },
      }),
    enabled: !!loan?.id,
  });

  const riskQuery = useQuery({
    queryKey: ["approval-client-risk", loan?.client?.id],
    queryFn: () => getRiskFn({ data: { client_id: loan.client.id as string } }),
    enabled: !!loan?.client?.id,
  });

  const app = appQuery.data as any;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-3 py-1.5 text-[12px] font-medium border-b-2 -mb-px",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-h-[60vh] overflow-y-auto pr-1">
        {tab === "application" && <ApplicationTab loan={loan} app={app} />}
        {tab === "customer" && <CustomerTab loan={loan} app={app} risk={riskQuery.data as any} />}
        {tab === "evaluation" && (
          <EvaluationTab evalData={evalQuery.data as any} loading={evalQuery.isLoading} />
        )}
        {tab === "schedule" && <ScheduleTab loan={loan} />}
        {tab === "documents" && (
          <DocumentsTab docs={app?.documents ?? []} loading={appQuery.isLoading} />
        )}
        {tab === "history" && (
          <HistoryTab
            history={app?.status_history ?? []}
            approvals={app?.approvals ?? []}
            notes={app?.notes ?? []}
          />
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1.5">
        {title}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10.5px] uppercase tracking-wider text-faint font-semibold">
        {label}
      </span>
      <span className="text-foreground break-words">{value ?? "—"}</span>
    </div>
  );
}

function ApplicationTab({ loan, app }: { loan: any; app: any }) {
  const m = app?.master ?? {};
  return (
    <div>
      <Section title="Application">
        <Row label="Application no" value={loan.application_no ?? m.application_no} />
        <Row
          label="Application date"
          value={
            m.created_at
              ? shortDate(m.created_at)
              : loan.submitted_at
                ? shortDate(loan.submitted_at)
                : "—"
          }
        />
        <Row label="Loan number" value={loan.loan_no} />
        <Row label="Status" value={loan.status} />
        <Row label="Branch" value={loan.branch?.code ?? loan.branch?.name} />
        <Row label="Channel" value={m.channel} />
      </Section>
      <Section title="Loan product">
        <Row label="Product" value={loan.product?.name} />
        <Row label="Product code" value={loan.product?.code} />
        <Row label="Interest method" value={loan.product?.interest_method} />
        <Row
          label="Product base rate"
          value={loan.product?.annual_rate_pct != null ? `${loan.product.annual_rate_pct}%` : "—"}
        />
      </Section>
      <Section title="Requested terms">
        <Row
          label="Requested amount"
          value={money(Number(loan.principal ?? m.requested_principal ?? 0))}
        />
        <Row
          label="Requested period"
          value={`${loan.term_months ?? m.requested_tenor_months ?? 0} months`}
        />
        <Row
          label="Interest rate"
          value={
            loan.annual_rate_pct != null
              ? `${loan.annual_rate_pct}%`
              : m.requested_rate_pct != null
                ? `${m.requested_rate_pct}%`
                : "—"
          }
        />
        <Row label="Repayment frequency" value={loan.frequency ?? m.frequency} />
        <Row label="Schedule type" value={loan.schedule_type ?? "normal"} />
        <Row label="Currency" value={m.currency ?? "KES"} />
      </Section>
      <Section title="Purpose & terms">
        <div className="col-span-2">
          <Row label="Purpose of loan" value={loan.purpose ?? m.purpose} />
        </div>
        {m.metadata?.terms_and_conditions && (
          <div className="col-span-2">
            <Row label="Terms & conditions" value={m.metadata.terms_and_conditions} />
          </div>
        )}
      </Section>
    </div>
  );
}

function CustomerTab({ loan, app, risk }: { loan: any; app: any; risk: any }) {
  const c = loan.client ?? {};
  const employment = app?.employment ?? [];
  const business = app?.business ?? [];
  const existing = app?.existing_facilities ?? [];
  return (
    <div>
      <Section title="Customer">
        <Row label="Full name" value={c.full_name} />
        <Row label="Customer ID" value={c.id} />
        <Row label="National ID / NIC" value={c.national_id} />
        <Row label="Date of birth" value={c.date_of_birth ? shortDate(c.date_of_birth) : "—"} />
        <Row label="Gender" value={c.gender} />
        <Row label="Occupation" value={c.occupation} />
      </Section>
      <Section title="Contact">
        <Row label="Phone" value={c.phone} />
        <Row label="Email" value={c.email} />
        <Row label="Next of kin" value={c.next_of_kin_name} />
        <Row label="Next of kin phone" value={c.next_of_kin_phone} />
      </Section>
      <Section title="Address">
        <div className="col-span-2">
          <Row label="Address" value={c.address} />
        </div>
        <Row label="GN division" value={c.gn_division} />
        <Row label="DS division" value={c.divisional_secretariat} />
        <Row label="District" value={c.district} />
        <Row label="Province" value={c.province} />
      </Section>
      <Section title="Income">
        <Row
          label="Monthly income"
          value={c.monthly_income != null ? money(Number(c.monthly_income)) : "—"}
        />
        <Row label="Risk grade" value={c.risk_grade} />
      </Section>

      {employment.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1.5">
            Employment
          </div>
          <div className="space-y-2">
            {employment.map((e: any) => (
              <div key={e.id} className="border border-border rounded p-2 text-[12px]">
                <div className="font-medium">{e.employer_name ?? "—"}</div>
                <div className="text-faint text-[11px]">
                  {e.position ?? "—"} · {e.employment_type ?? "—"} · income{" "}
                  {e.monthly_income != null ? money(Number(e.monthly_income)) : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {business.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1.5">
            Business
          </div>
          <div className="space-y-2">
            {business.map((b: any) => (
              <div key={b.id} className="border border-border rounded p-2 text-[12px]">
                <div className="font-medium">{b.business_name ?? "—"}</div>
                <div className="text-faint text-[11px]">
                  {b.business_type ?? "—"} · monthly revenue{" "}
                  {b.monthly_revenue != null ? money(Number(b.monthly_revenue)) : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {existing.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1.5">
            Existing facilities
          </div>
          <div className="space-y-2">
            {existing.map((x: any) => (
              <div key={x.id} className="border border-border rounded p-2 text-[12px]">
                <div className="font-medium">
                  {x.lender_name ?? "—"} — {x.facility_type ?? "—"}
                </div>
                <div className="text-faint text-[11px]">
                  outstanding{" "}
                  {x.outstanding_balance != null ? money(Number(x.outstanding_balance)) : "—"} ·
                  installment{" "}
                  {x.monthly_installment != null ? money(Number(x.monthly_installment)) : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Section title="Customer risk assessment">
        {risk ? (
          <>
            <Row label="Score" value={`${risk.total_score ?? 0} / ${risk.max_score ?? 0}`} />
            <Row label="Percentage" value={risk.pct != null ? `${risk.pct}%` : "—"} />
            <Row label="Risk band" value={risk.band} />
            <Row label="Assessed at" value={risk.assessed_at ? shortDate(risk.assessed_at) : "—"} />
          </>
        ) : (
          <div className="col-span-2 text-faint text-[12px]">No risk assessment on file.</div>
        )}
      </Section>
    </div>
  );
}

function EvaluationTab({ evalData, loading }: { evalData: any; loading: boolean }) {
  if (loading) return <div className="text-[12px] text-faint">Loading evaluation…</div>;
  const sections = evalData?.sections ?? [];
  const values = evalData?.data ?? {};
  if (sections.length === 0) {
    return (
      <div className="text-[12.5px] text-muted-foreground py-6 text-center border border-dashed border-border rounded-md">
        No evaluation sections captured for this application.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {sections.map((s: any) => {
        const sv = values[s.code] ?? {};
        return (
          <div key={s.section_id} className="border border-border rounded p-3">
            <div className="text-[13px] font-semibold mb-2">
              {s.name}
              {s.is_mandatory && (
                <span className="ml-2 text-[10.5px] font-semibold uppercase tracking-wider text-rose-600">
                  Mandatory
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
              {s.fields.map((f: any) => {
                const v = sv[f.key];
                const display =
                  v === undefined || v === null || v === ""
                    ? "—"
                    : typeof v === "object"
                      ? JSON.stringify(v)
                      : String(v);
                return <Row key={f.key} label={f.label} value={display} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScheduleTab({ loan }: { loan: any }) {
  const schedule = useMemo(() => {
    const principal = Number(loan.principal ?? 0);
    const rate = Number(loan.annual_rate_pct ?? loan.product?.annual_rate_pct ?? 0);
    const term = Number(loan.term_months ?? 0);
    const frequency = (loan.frequency ?? loan.product?.frequency ?? "monthly") as Frequency;
    const method = (loan.product?.interest_method ?? "declining_balance") as InterestMethod;
    if (!principal || !term) return null;
    const start = loan.disbursed_at ? new Date(loan.disbursed_at) : new Date();
    return generateSchedule({
      principal,
      annualRatePct: rate,
      termMonths: term,
      frequency,
      method,
      startDate: start,
    });
  }, [loan]);

  if (!schedule) {
    return (
      <div className="text-[12.5px] text-muted-foreground py-6 text-center border border-dashed border-border rounded-md">
        Missing principal or term — schedule cannot be generated.
      </div>
    );
  }

  let opening = Number(loan.principal ?? 0);
  const total = schedule.rows.reduce((s, r) => s + r.payment, 0);

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 text-[11.5px] mb-3">
        <div className="border border-border rounded p-2">
          <div className="text-faint">Installments</div>
          <div className="font-semibold">{schedule.installmentCount}</div>
        </div>
        <div className="border border-border rounded p-2">
          <div className="text-faint">Per payment</div>
          <div className="font-semibold">{money(schedule.perPayment)}</div>
        </div>
        <div className="border border-border rounded p-2">
          <div className="text-faint">Total interest</div>
          <div className="font-semibold">{money(schedule.totalInterest)}</div>
        </div>
        <div className="border border-border rounded p-2">
          <div className="text-faint">Total repayable</div>
          <div className="font-semibold">{money(total)}</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px]">
          <thead className="bg-secondary/40 text-faint uppercase text-[10.5px]">
            <tr>
              <th className="text-left p-1.5">#</th>
              <th className="text-left p-1.5">Due</th>
              <th className="text-right p-1.5">Opening</th>
              <th className="text-right p-1.5">Principal</th>
              <th className="text-right p-1.5">Interest</th>
              <th className="text-right p-1.5">Installment</th>
              <th className="text-right p-1.5">Closing</th>
            </tr>
          </thead>
          <tbody>
            {schedule.rows.map((r) => {
              const open = opening;
              opening = r.balance;
              return (
                <tr key={r.seq} className="border-t border-border">
                  <td className="p-1.5">{r.seq}</td>
                  <td className="p-1.5">{r.dueDate}</td>
                  <td className="p-1.5 text-right font-mono">{money(open)}</td>
                  <td className="p-1.5 text-right font-mono">{money(r.principal)}</td>
                  <td className="p-1.5 text-right font-mono">{money(r.interest)}</td>
                  <td className="p-1.5 text-right font-mono">{money(r.payment)}</td>
                  <td className="p-1.5 text-right font-mono">{money(r.balance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocumentsTab({ docs, loading }: { docs: any[]; loading: boolean }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>("");

  async function openDoc(d: any) {
    const bucket = d.storage_bucket ?? "loan-application-documents";
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(d.storage_path, 300);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Could not open document");
      return;
    }
    setPreviewUrl(data.signedUrl);
    setPreviewName(d.file_name);
  }

  if (loading) return <div className="text-[12px] text-faint">Loading documents…</div>;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        {docs.length === 0 && (
          <div className="text-[12.5px] text-muted-foreground py-6 text-center border border-dashed border-border rounded-md">
            No documents uploaded.
          </div>
        )}
        {docs.map((d) => (
          <div
            key={d.id}
            className="border border-border rounded p-2 text-[12px] flex items-start justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="font-medium truncate">{d.file_name}</div>
              <div className="text-faint text-[11px] truncate">
                {d.document_type} · {d.mime_type ?? "file"}
                {d.size_bytes ? ` · ${Math.round(d.size_bytes / 1024)} KB` : ""}
              </div>
            </div>
            <button
              onClick={() => openDoc(d)}
              className="text-[11px] font-semibold text-primary hover:underline shrink-0"
            >
              Preview
            </button>
          </div>
        ))}
      </div>
      <div className="border border-border rounded min-h-[300px] bg-secondary/20 flex flex-col">
        {previewUrl ? (
          <>
            <div className="p-2 border-b border-border text-[11.5px] flex items-center justify-between">
              <span className="truncate font-medium">{previewName}</span>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Open ↗
              </a>
            </div>
            <iframe src={previewUrl} title={previewName} className="flex-1 w-full" />
          </>
        ) : (
          <div className="m-auto text-[12px] text-faint">Select a document to preview.</div>
        )}
      </div>
    </div>
  );
}

function HistoryTab({
  history,
  approvals,
  notes,
}: {
  history: any[];
  approvals: any[];
  notes: any[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1.5">
          Approval decisions
        </div>
        {approvals.length === 0 ? (
          <div className="text-[12px] text-faint">No approval decisions yet.</div>
        ) : (
          <div className="space-y-1">
            {approvals.map((a: any) => (
              <div key={a.id} className="text-[12px] border border-border rounded p-2">
                <span
                  className={cn(
                    "inline-block px-1.5 py-0.5 rounded text-[10.5px] mr-2",
                    a.decision === "approve"
                      ? "bg-emerald-500/10 text-emerald-700"
                      : a.decision === "reject"
                        ? "bg-rose-500/10 text-rose-700"
                        : "bg-amber-500/10 text-amber-700",
                  )}
                >
                  {a.decision}
                </span>
                <span className="text-faint">
                  {a.step_key ?? "step"} · {a.decided_at ? shortDate(a.decided_at) : "—"}
                </span>
                {a.comment && <div className="text-muted-foreground mt-0.5">{a.comment}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1.5">
          Status timeline
        </div>
        {history.length === 0 ? (
          <div className="text-[12px] text-faint">No status changes recorded.</div>
        ) : (
          <div className="space-y-1">
            {history.map((h: any) => (
              <div
                key={h.id}
                className="text-[12px] flex items-center gap-2 border border-border rounded p-2"
              >
                <span className="font-mono text-faint">
                  {h.from_status ?? "—"} → {h.to_status}
                </span>
                <span className="text-faint">· {h.created_at ? shortDate(h.created_at) : "—"}</span>
                {h.reason && <span className="text-muted-foreground">— {h.reason}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {notes.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1.5">
            Notes
          </div>
          <div className="space-y-1">
            {notes.map((n: any) => (
              <div key={n.id} className="text-[12px] border border-border rounded p-2">
                <div className="text-faint text-[10.5px]">
                  {n.created_at ? shortDate(n.created_at) : "—"}
                </div>
                <div>{n.note}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
