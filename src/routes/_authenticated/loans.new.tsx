import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getClients, getProducts, submitApplication } from "@/lib/mzizi.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardTitle } from "@/components/mzizi/Card";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  selectCls,
  readOnlyCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import { money, shortDate, getActiveCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

import { generateSchedule, generateStructuredSchedule, FREQ_META, type Frequency, type InterestMethod, type ScheduleType } from "@/lib/loan-schedule";

type UploadedDoc = { path: string; name: string; size: number };
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
function slugifyDoc(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "doc";
}
function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export const Route = createFileRoute("/_authenticated/loans/new")({
  component: NewLoan,
});

type TabKey = "customer" | "application" | "documents" | "evaluations";
const TABS: { key: TabKey; label: string }[] = [
  { key: "customer", label: "Customer" },
  { key: "application", label: "Application" },
  { key: "documents", label: "Documents" },
  { key: "evaluations", label: "Evaluations" },
];

function FormHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <CardTitle>{title}</CardTitle>
      <button
        type="button"
        onClick={onBack}
        className="text-[12px] text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5"
      >
        ← Back to list
      </button>
    </div>
  );
}

function TabHeader({ tab, setTab }: { tab: TabKey; setTab: (t: TabKey) => void }) {
  return (
    <div className="flex items-center gap-1 border-b border-border mt-4 -mx-1 px-1 overflow-x-auto">
      {TABS.map((t) => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 text-[12.5px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function NewLoan() {
  const nav = useNavigate();
  const [tab, setTab] = useState<TabKey>("customer");
  const [clientId, setClientId] = useState("");
  const [productId, setProductId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [term, setTerm] = useState<number | "">("");
  const [rate, setRate] = useState<number | "">("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [method, setMethod] = useState<InterestMethod>("flat");
  const [scheduleType, setScheduleType] = useState<ScheduleType>("normal");
  const [overrides, setOverrides] = useState<Record<number, number>>({});
  const [purpose, setPurpose] = useState("");
  const [checkedDocs, setCheckedDocs] = useState<Record<string, boolean>>({});
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, UploadedDoc>>({});
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);


  const clientsFn = useServerFn(getClients);
  const productsFn = useServerFn(getProducts);
  const { data: clients } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: () => clientsFn({ data: { filter: "all" } }),
  });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => productsFn() });
  const qc = useQueryClient();
  const submitFn = useServerFn(submitApplication);
  const submit = useMutation({
    mutationFn: submitFn,
    onSuccess: () => {
      toast.success("Application submitted");
      qc.invalidateQueries();
      nav({ to: "/loans" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const product = products?.find((p: any) => p.id === productId);
  const selectedClient = (clients ?? []).find((c: any) => c.id === clientId);

  function selectProduct(p: any) {
    setProductId(p.id);
    setFrequency((p.frequency as Frequency) ?? "monthly");
    setMethod((p.interest_method as InterestMethod) ?? "flat");
    setCheckedDocs({});
    setUploadedDocs({});
  }

  async function uploadDocFile(doc: string, file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`${file.name} exceeds 10 MB limit.`);
      return;
    }
    setUploadingDoc(doc);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      if (!clientId) {
        toast.error("Select a client before uploading documents");
        setUploadingDoc(null);
        return;
      }
      const path = `${clientId}/${productId || "no-product"}/${slugifyDoc(doc)}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("loan-documents").upload(path, file, {
        upsert: true,
        contentType: file.type || undefined,
      });
      if (error) throw error;
      setUploadedDocs((prev) => ({ ...prev, [doc]: { path, name: file.name, size: file.size } }));
      setCheckedDocs((prev) => ({ ...prev, [doc]: true }));
      toast.success(`Uploaded ${doc}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploadingDoc(null);
    }
  }

  async function removeDocFile(doc: string) {
    const existing = uploadedDocs[doc];
    if (existing) {
      await supabase.storage.from("loan-documents").remove([existing.path]);
    }
    setUploadedDocs((prev) => {
      const next = { ...prev };
      delete next[doc];
      return next;
    });
    setCheckedDocs((prev) => ({ ...prev, [doc]: false }));
  }

  async function openSignedUrl(path: string, downloadName?: string) {
    const { data, error } = await supabase.storage
      .from("loan-documents")
      .createSignedUrl(path, 60, downloadName ? { download: downloadName } : undefined);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Could not open file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const requiredDocs: string[] = Array.isArray(product?.required_documents)
    ? (product?.required_documents as string[])
    : [];
  const missingDocs = requiredDocs.filter((d) => !checkedDocs[d]);
  const docsSatisfied = requiredDocs.length === 0 || missingDocs.length === 0;


  const rateNum = typeof rate === "number" ? rate : Number(rate || product?.annual_rate_pct || 0);
  const principalNum = Number(principal || 0);

  const schedule = useMemo(() => {
    if (!principalNum || !rateNum || !term) return null;
    if (scheduleType === "structured") {
      return generateStructuredSchedule({
        principal: principalNum,
        annualRatePct: rateNum,
        termMonths: term,
        frequency,
        method,
        overrides,
      });
    }
    return generateSchedule({
      principal: principalNum,
      annualRatePct: rateNum,
      termMonths: term,
      frequency,
      method,
    });
  }, [principalNum, rateNum, term, frequency, method, scheduleType, overrides]);

  const termOptions = useMemo(() => {
    const lo = product?.min_term_months ?? 1;
    const hi = product?.max_term_months ?? 24;
    const opts: number[] = [];
    for (let t = lo; t <= hi; t++) opts.push(t);
    return opts;
  }, [product]);

  const outOfRange =
    product &&
    (principalNum < Number(product.min_principal ?? 0) ||
      (product.max_principal && principalNum > Number(product.max_principal)) ||
      term < Number(product.min_term_months) ||
      term > Number(product.max_term_months));

  const canSubmit =
    !!clientId && !!productId && !!principal && !!rateNum && docsSatisfied && !submit.isPending;


  return (
    <div className="animate-fadein">
      <Card>
        <FormHeader title="New loan application" onBack={() => nav({ to: "/loans" })} />
        <TabHeader tab={tab} setTab={setTab} />

        <div className="flex flex-col gap-4 text-[12.5px] mt-5">
          {tab === "customer" && (
            <FormGrid>
              <FormField label="Select client" span={12} required>
                <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={selectCls}>
                  <option value="">— pick a client —</option>
                  {(clients ?? []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} {c.group?.name ? `· ${c.group.name}` : ""}
                    </option>
                  ))}
                </select>
              </FormField>

              {selectedClient ? (
                <>
                  <div className="sm:col-span-12 text-[11px] uppercase tracking-wider text-faint font-semibold pb-1 border-b border-border -mt-1">
                    Customer details
                  </div>
                  <FormField label="Phone" span={3}>
                    <input value={selectedClient.phone ?? "—"} readOnly className={readOnlyCls} />
                  </FormField>
                  <FormField label="National ID" span={3}>
                    <input value={selectedClient.national_id ?? "—"} readOnly className={readOnlyCls} />
                  </FormField>
                  <FormField label="Email" span={3}>
                    <input value={selectedClient.email ?? "—"} readOnly className={readOnlyCls} />
                  </FormField>
                  <FormField label="Gender" span={3}>
                    <input value={selectedClient.gender ?? "—"} readOnly className={readOnlyCls} />
                  </FormField>
                  <FormField label="Date of birth" span={3}>
                    <input
                      value={selectedClient.date_of_birth ? shortDate(selectedClient.date_of_birth) : "—"}
                      readOnly
                      className={readOnlyCls}
                    />
                  </FormField>
                  <FormField label="Joined" span={3}>
                    <input
                      value={selectedClient.joined_on ? shortDate(selectedClient.joined_on) : "—"}
                      readOnly
                      className={readOnlyCls}
                    />
                  </FormField>
                  <FormField label="Status" span={2}>
                    <input value={selectedClient.status ?? "—"} readOnly className={readOnlyCls} />
                  </FormField>
                  <FormField label="Risk grade" span={2}>
                    <input value={selectedClient.risk_grade ?? "—"} readOnly className={readOnlyCls} />
                  </FormField>
                  <FormField label="Group" span={2}>
                    <input value={selectedClient.group?.name ?? "Individual"} readOnly className={readOnlyCls} />
                  </FormField>
                  <FormField label="Occupation" span={4}>
                    <input value={selectedClient.occupation ?? "—"} readOnly className={readOnlyCls} />
                  </FormField>
                  <FormField label="Monthly income" span={4}>
                    <input
                      value={
                        selectedClient.monthly_income ? money(Number(selectedClient.monthly_income), true) : "—"
                      }
                      readOnly
                      className={readOnlyCls + " font-mono"}
                    />
                  </FormField>
                  <FormField label="Address" span={8}>
                    <input value={selectedClient.address ?? "—"} readOnly className={readOnlyCls} />
                  </FormField>
                </>
              ) : (
                <div className="sm:col-span-12 text-[12px] text-muted-foreground py-6 text-center border border-dashed border-border rounded-md">
                  Select a client to view their details.
                </div>
              )}
            </FormGrid>
          )}

          {tab === "application" && (
            <>
              <FormGrid>
                <FormField label="Product" span={6} required>
                  <select
                    value={productId}
                    onChange={(e) => {
                      const p = (products ?? []).find((x: any) => x.id === e.target.value);
                      if (p) selectProduct(p);
                      else setProductId("");
                    }}
                    className={selectCls}
                  >
                    <option value="">— pick a product —</option>
                    {(products ?? []).map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Purpose" span={6} hint="Optional">
                  <input
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="Working capital, school fees, …"
                    className={inputCls}
                  />
                </FormField>

                {product && (
                  <div className="sm:col-span-12 text-[11.5px] text-muted-foreground font-mono -mt-1">
                    Range: {money(product.min_principal)} –{" "}
                    {product.max_principal ? money(product.max_principal) : "∞"} · {product.min_term_months}–
                    {product.max_term_months} months · {FREQ_META[product.frequency as Frequency]?.label} · default{" "}
                    {product.annual_rate_pct}%/yr
                  </div>
                )}

                <FormField label={`Principal (${getActiveCurrency()})`} span={4} required>
                  <input
                    value={principal}
                    onChange={(e) => setPrincipal(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="0"
                    className={inputCls + " font-mono"}
                  />
                </FormField>
                <FormField label="Annual rate (%)" span={4} required>
                  <input
                    type="number"
                    step="0.01"
                    value={rate}
                    onChange={(e) => setRate(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder={product ? String(product.annual_rate_pct) : "15"}
                    className={inputCls + " font-mono"}
                  />
                </FormField>
                <FormField label="Term (months)" span={4} required>
                  <select
                    value={String(term)}
                    onChange={(e) => setTerm(Number(e.target.value))}
                    className={selectCls}
                  >
                    {termOptions.map((t) => (
                      <option key={t} value={t}>
                        {t} {t === 1 ? "month" : "months"}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Repayment frequency" span={6} hint="Set on the product">
                  <input
                    value={FREQ_META[frequency]?.label ?? frequency}
                    readOnly
                    className={readOnlyCls}
                  />
                </FormField>
                <FormField label="Interest method" span={6} hint="Set on the product">
                  <input
                    value={method.replace("_", " ")}
                    readOnly
                    className={readOnlyCls + " capitalize"}
                  />
                </FormField>

                <FormField label="Schedule type" span={6} hint="Structured lets you set specific rentals; the rest auto-amortize.">
                  <select
                    value={scheduleType}
                    onChange={(e) => {
                      setScheduleType(e.target.value as ScheduleType);
                      if (e.target.value === "normal") setOverrides({});
                    }}
                    className={selectCls}
                  >
                    <option value="normal">Normal (equal instalments)</option>
                    <option value="structured">Structured (manual rentals)</option>
                  </select>
                </FormField>
                <FormField label="Manual rows" span={6}>
                  <input
                    value={
                      scheduleType === "structured"
                        ? `${Object.keys(overrides).length} overridden`
                        : "—"
                    }
                    readOnly
                    className={readOnlyCls}
                  />
                </FormField>

                {outOfRange && (
                  <div className="sm:col-span-12 text-[12px] rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-800 px-3 py-2">
                    Values are outside the product's configured range.
                  </div>
                )}

                {schedule && (schedule as any).warnings?.length > 0 && (
                  <div className="sm:col-span-12 text-[12px] rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-800 px-3 py-2 space-y-0.5">
                    {(schedule as any).warnings.map((w: string, i: number) => (
                      <div key={i}>• {w}</div>
                    ))}
                  </div>
                )}

                {schedule && (
                  <div className="sm:col-span-12 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px] mt-1">
                    <SummaryStat label="Installments" value={String(schedule.installmentCount)} />
                    <SummaryStat label="Per payment" value={money(schedule.perPayment, true)} />
                    <SummaryStat label="Total interest" value={money(schedule.totalInterest, true)} />
                    <SummaryStat label="Total payable" value={money(schedule.totalPayment, true)} />
                  </div>
                )}
              </FormGrid>

              {schedule && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">
                      Repayment schedule {scheduleType === "structured" && <span className="ml-2 text-primary normal-case">· editable</span>}
                    </div>
                    {scheduleType === "structured" && Object.keys(overrides).length > 0 && (
                      <button
                        type="button"
                        onClick={() => setOverrides({})}
                        className="text-[11px] text-muted-foreground hover:text-foreground underline"
                      >
                        Clear all overrides
                      </button>
                    )}
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                    <div
                      className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-2 px-3 border-b border-border bg-secondary/40 sticky top-0"
                      style={{ gridTemplateColumns: "40px 1.2fr 1fr 1fr 1.2fr 1fr 70px" }}
                    >
                      <div>#</div>
                      <div>Due</div>
                      <div>Principal</div>
                      <div>Interest</div>
                      <div>Payment</div>
                      <div>Balance</div>
                      <div>Type</div>
                    </div>
                    {schedule.rows.map((r) => {
                      const editable = scheduleType === "structured";
                      const isManual = !!r.isManual;
                      return (
                        <div
                          key={r.seq}
                          className={cn(
                            "grid items-center text-[12px] py-1.5 px-3 border-b border-row-divider last:border-b-0",
                            isManual && "bg-primary/5",
                          )}
                          style={{ gridTemplateColumns: "40px 1.2fr 1fr 1fr 1.2fr 1fr 70px" }}
                        >
                          <div className="font-mono text-muted-foreground">{r.seq}</div>
                          <div>{shortDate(r.dueDate)}</div>
                          <div className="font-mono">{money(r.principal, true)}</div>
                          <div className="font-mono">{money(r.interest, true)}</div>
                          <div className="font-mono font-semibold">
                            {editable ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={overrides[r.seq] ?? ""}
                                  placeholder={r.payment.toFixed(2)}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setOverrides((prev) => {
                                      const next = { ...prev };
                                      if (v === "") delete next[r.seq];
                                      else next[r.seq] = Number(v);
                                      return next;
                                    });
                                  }}
                                  className="w-full bg-transparent border border-border rounded px-2 py-0.5 font-mono text-right focus:border-primary outline-none"
                                />
                                {overrides[r.seq] !== undefined && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOverrides((prev) => {
                                        const next = { ...prev };
                                        delete next[r.seq];
                                        return next;
                                      })
                                    }
                                    className="text-muted-foreground hover:text-foreground text-[11px] px-1"
                                    title="Clear override"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ) : (
                              money(r.payment, true)
                            )}
                          </div>
                          <div className="font-mono text-muted-foreground">{money(r.balance, true)}</div>
                          <div>
                            <span
                              className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded-full border",
                                isManual
                                  ? "border-primary/40 bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground",
                              )}
                            >
                              {isManual ? "Manual" : "Auto"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "documents" && (
            <div className="flex flex-col gap-3">
              {!productId ? (
                <div className="text-[12.5px] text-muted-foreground py-10 text-center border border-dashed border-border rounded-md">
                  Select a product on the Application tab to see its required documents.
                </div>
              ) : requiredDocs.length === 0 ? (
                <div className="text-[12.5px] text-muted-foreground py-10 text-center border border-dashed border-border rounded-md">
                  This product has no required documents configured.
                </div>
              ) : (
                <>
                  <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">
                    Required documents for {product?.name}
                  </div>
                  <div className="border border-border rounded-lg divide-y divide-row-divider">
                    {requiredDocs.map((doc) => {
                      const uploaded = uploadedDocs[doc];
                      const checked = !!checkedDocs[doc];
                      const busy = uploadingDoc === doc;
                      const inputId = `docfile-${slugifyDoc(doc)}`;
                      return (
                        <div
                          key={doc}
                          className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-[12.5px]"
                        >
                          <div className="flex-1 min-w-[180px]">
                            <div className="font-medium">{doc}</div>
                            {uploaded ? (
                              <div className="text-[11px] text-muted-foreground font-mono truncate">
                                {uploaded.name} · {formatBytes(uploaded.size)}
                              </div>
                            ) : (
                              <div className="text-[11px] text-muted-foreground">
                                PDF, image, or document up to 10 MB
                              </div>
                            )}
                          </div>

                          <input
                            id={inputId}
                            type="file"
                            accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) uploadDocFile(doc, f);
                            }}
                          />
                          <label
                            htmlFor={inputId}
                            className={cn(
                              "text-[11.5px] px-3 py-1.5 rounded-md border border-border cursor-pointer hover:bg-secondary",
                              busy && "opacity-60 pointer-events-none",
                            )}
                          >
                            {busy ? "Uploading…" : uploaded ? "Replace" : "Upload file"}
                          </label>
                          {uploaded && (
                            <>
                              <button
                                type="button"
                                onClick={() => openSignedUrl(uploaded.path)}
                                className="text-[11.5px] px-2.5 py-1.5 rounded-md border border-border hover:bg-secondary"
                              >
                                Preview
                              </button>
                              <button
                                type="button"
                                onClick={() => openSignedUrl(uploaded.path, uploaded.name)}
                                className="text-[11.5px] px-2.5 py-1.5 rounded-md border border-border hover:bg-secondary"
                              >
                                Download
                              </button>
                              <button
                                type="button"
                                onClick={() => removeDocFile(doc)}
                                className="text-[11.5px] px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                              >
                                Remove
                              </button>
                            </>
                          )}
                          <span
                            className={cn(
                              "text-[10.5px] px-2 py-0.5 rounded-full border",
                              checked
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                                : "border-amber-500/40 bg-amber-500/10 text-amber-700",
                            )}
                          >
                            {checked ? "Provided" : "Missing"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    {missingDocs.length === 0
                      ? "All required documents have been marked as provided."
                      : `${missingDocs.length} of ${requiredDocs.length} document${requiredDocs.length === 1 ? "" : "s"} still missing.`}
                  </div>
                </>
              )}
            </div>
          )}


          {tab === "evaluations" && (
            <div className="text-[12.5px] text-muted-foreground py-10 text-center border border-dashed border-border rounded-md">
              Credit scoring and evaluation checks will appear here.
            </div>
          )}

          <FormActions align="between">
            <button type="button" onClick={() => nav({ to: "/loans" })} className={btnSecondaryCls}>
              Cancel
            </button>
            <div className="flex items-center gap-2">
              {tab !== "customer" && (
                <button
                  type="button"
                  onClick={() => {
                    const i = TABS.findIndex((t) => t.key === tab);
                    setTab(TABS[i - 1].key);
                  }}
                  className={btnSecondaryCls}
                >
                  ← Back
                </button>
              )}
              {tab !== "evaluations" ? (
                <button
                  type="button"
                  disabled={tab === "documents" && !docsSatisfied}
                  onClick={() => {
                    if (tab === "documents" && !docsSatisfied) {
                      toast.error(
                        `Please provide all required documents (${missingDocs.length} missing).`,
                      );
                      return;
                    }
                    const i = TABS.findIndex((t) => t.key === tab);
                    setTab(TABS[i + 1].key);
                  }}
                  className={btnPrimaryCls}
                >
                  Next →
                </button>

              ) : (
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={() =>
                    submit.mutate({
                      data: {
                        client_id: clientId,
                        product_id: productId,
                        principal: principalNum,
                        term_months: term,
                        purpose: purpose || undefined,
                        annual_rate_pct: rateNum,
                        frequency,
                        schedule_type: scheduleType,
                        schedule_overrides:
                          scheduleType === "structured"
                            ? Object.fromEntries(
                                Object.entries(overrides).map(([k, v]) => [String(k), Number(v)]),
                              )
                            : undefined,
                      },
                    })
                  }
                  className={btnPrimaryCls}
                >
                  {submit.isPending ? "Submitting…" : "Submit application"}
                </button>
              )}
            </div>
          </FormActions>
        </div>
      </Card>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded-md p-3 bg-secondary/30">
      <div className="text-[10.5px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className="font-mono font-semibold mt-1">{value}</div>
    </div>
  );
}
