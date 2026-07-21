import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/mzizi/Card";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  selectCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import { getClients, listCompanyBranches } from "@/lib/mzizi.functions";
import { listSavingsProducts, submitSavingsAccount } from "@/lib/savings.functions";

export const Route = createFileRoute("/_authenticated/savings/new")({
  component: NewSavings,
});

const CHANNELS = [
  { v: "branch", l: "Branch counter" },
  { v: "atm", l: "ATM" },
  { v: "ceft", l: "CEFT" },
  { v: "internet_banking", l: "Internet Banking" },
  { v: "mobile", l: "Mobile" },
  { v: "api", l: "External API" },
  { v: "other", l: "Other" },
];

const HOLDER_ROLES = [
  { v: "primary", l: "Primary" },
  { v: "joint", l: "Joint" },
  { v: "minor_guardian", l: "Minor / Guardian" },
  { v: "trustee", l: "Trustee" },
  { v: "power_of_attorney", l: "Power of Attorney" },
] as const;

const SIGNING_RULES = [
  { v: "single", l: "Single signatory" },
  { v: "any_one", l: "Any one" },
  { v: "jointly", l: "Jointly (all)" },
  { v: "any_two", l: "Any two" },
  { v: "custom", l: "Custom" },
] as const;

type Holder = {
  client_id?: string | null;
  role: (typeof HOLDER_ROLES)[number]["v"];
  ownership_pct: number;
  full_name?: string;
  nic?: string;
  relation?: string;
  is_signatory: boolean;
  signing_order?: number | null;
};
type Nominee = {
  full_name: string;
  nic?: string;
  relation?: string;
  percentage: number;
  contact?: string;
};

const STEPS = [
  { key: "customer", label: "Customer & Product" },
  { key: "holders", label: "Holders & Nominees" },
  { key: "mandate", label: "Mandate & Preferences" },
  { key: "deposit", label: "Opening Deposit & Review" },
] as const;

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold ${
                done
                  ? "bg-primary text-primary-foreground"
                  : active
                    ? "bg-primary/20 text-primary border border-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-[12px] ${active ? "text-foreground font-medium" : "text-muted-foreground"}`}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && <div className="w-6 h-px bg-border mx-1" />}
          </div>
        );
      })}
    </div>
  );
}

function NewSavings() {
  const navigate = useNavigate();
  const clientFn = useServerFn(getClients);
  const branchFn = useServerFn(listCompanyBranches);
  const prodFn = useServerFn(listSavingsProducts);
  const createFn = useServerFn(submitSavingsAccount);

  const { data: clients } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: () => clientFn({ data: { filter: "all" } }),
  });
  const { data: branches } = useQuery({
    queryKey: ["company-branches"],
    queryFn: () => branchFn(),
  });
  const { data: products } = useQuery({
    queryKey: ["savings-products"],
    queryFn: () => prodFn(),
  });

  const [step, setStep] = useState(0);
  // Step 1
  const [clientId, setClientId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [productId, setProductId] = useState("");
  const [channel, setChannel] = useState("branch");
  const [externalRef, setExternalRef] = useState("");

  // Step 2
  const [holders, setHolders] = useState<Holder[]>([]);
  const [nominees, setNominees] = useState<Nominee[]>([]);

  // Step 3
  const [signingRule, setSigningRule] = useState<(typeof SIGNING_RULES)[number]["v"]>("single");
  const [minSignatories, setMinSignatories] = useState<number | "">("");
  const [statementPref, setStatementPref] = useState("monthly");
  const [commPref, setCommPref] = useState("email");
  const [instructions, setInstructions] = useState("");

  // Step 4
  const [deposit, setDeposit] = useState("");
  const [narration, setNarration] = useState("");

  const product = useMemo(
    () => (products ?? []).find((p: any) => p.id === productId),
    [products, productId],
  );
  const selectedClient = useMemo(
    () => (clients ?? []).find((c: any) => c.id === clientId),
    [clients, clientId],
  );

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          client_id: clientId,
          branch_id: branchId,
          product_id: productId,
          opening_deposit: Number(deposit || 0),
          channel: channel as any,
          external_ref: externalRef || null,
          narration: narration || null,
          statement_preference: (statementPref || null) as any,
          communication_preference: (commPref || null) as any,
          special_instructions: instructions || null,
          holders:
            holders.length > 0
              ? holders.map((h) => ({
                  ...h,
                  client_id: h.client_id || null,
                }))
              : undefined,
          nominees: nominees.length > 0 ? nominees : undefined,
          mandate:
            holders.filter((h) => h.is_signatory).length > 1 || signingRule !== "single"
              ? {
                  signing_rule: signingRule,
                  min_signatories:
                    signingRule === "custom" && minSignatories !== ""
                      ? Number(minSignatories)
                      : null,
                }
              : null,
        },
      }),
    onSuccess: (acct: any) => {
      const status = acct?.status as string | undefined;
      if (status === "pending_approval") {
        toast.success(`Account ${acct.account_no} submitted for approval`);
      } else if (status === "pending_funding") {
        toast.success(`Account ${acct.account_no} approved — ready for initial deposit`);
      } else {
        toast.success(`Savings account ${acct.account_no} opened`);
      }
      navigate({ to: "/savings" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function next() {
    // Validate current step
    if (step === 0) {
      if (!clientId || !branchId || !productId) {
        toast.error("Customer, branch and product are required");
        return;
      }
    }
    if (step === 1) {
      if (holders.length > 0) {
        const total = holders.reduce((s, h) => s + Number(h.ownership_pct || 0), 0);
        if (Math.abs(total - 100) > 0.01) {
          toast.error(`Holder ownership must sum to 100% (got ${total.toFixed(2)})`);
          return;
        }
      }
      if (nominees.length > 0) {
        const total = nominees.reduce((s, n) => s + Number(n.percentage || 0), 0);
        if (Math.abs(total - 100) > 0.01) {
          toast.error(`Nominees must sum to 100% (got ${total.toFixed(2)})`);
          return;
        }
      }
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-semibold">Open savings account</h1>
        <button className={btnSecondaryCls} onClick={() => navigate({ to: "/savings" })}>
          Cancel
        </button>
      </div>

      <Card>
        <Stepper current={step} />

        {step === 0 && (
          <>
            <CardTitle subtitle="Choose the customer, branch and savings product to open.">
              Customer & Product
            </CardTitle>
            <FormGrid>
              <FormField label="Customer" span={6} required>
                <select
                  className={selectCls}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">— select customer —</option>
                  {(clients ?? []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Branch" span={6} required>
                <select
                  className={selectCls}
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  <option value="">— select branch —</option>
                  {(branches ?? []).map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.code} · {b.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Savings product" span={6} required>
                <select
                  className={selectCls}
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  <option value="">— select product —</option>
                  {(products ?? []).map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name} ({p.currency})
                    </option>
                  ))}
                </select>
                {product && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Min. opening: {product.min_opening_balance} · Min. balance:{" "}
                    {product.min_balance} · Opening fee: {product.opening_fee}
                  </p>
                )}
              </FormField>
              <FormField label="Opening channel" span={6}>
                <select
                  className={selectCls}
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  {CHANNELS.map((c) => (
                    <option key={c.v} value={c.v}>
                      {c.l}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="External reference" span={6} hint="Optional external system ID">
                <input
                  className={inputCls}
                  value={externalRef}
                  onChange={(e) => setExternalRef(e.target.value)}
                />
              </FormField>
            </FormGrid>
          </>
        )}

        {step === 1 && (
          <>
            <CardTitle subtitle="Add joint holders, guardians or trustees. Leave empty for a single-holder account.">
              Holders & Nominees
            </CardTitle>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[12px] font-semibold text-foreground">
                  Additional account holders
                </div>
                <button
                  type="button"
                  className={btnSecondaryCls}
                  onClick={() =>
                    setHolders((h) => [
                      ...h,
                      {
                        client_id: null,
                        role: "joint",
                        ownership_pct: 0,
                        is_signatory: true,
                      },
                    ])
                  }
                >
                  + Add holder
                </button>
              </div>
              {holders.length === 0 && (
                <p className="text-[11.5px] text-muted-foreground">
                  The selected customer is added as primary holder automatically.
                </p>
              )}
              {holders.map((h, idx) => (
                <div
                  key={idx}
                  className="border border-border rounded-md p-3 mb-2 grid grid-cols-12 gap-2"
                >
                  <div className="col-span-3">
                    <label className="text-[11px] text-muted-foreground">Existing client</label>
                    <select
                      className={selectCls}
                      value={h.client_id ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setHolders((arr) =>
                          arr.map((x, i) => (i === idx ? { ...x, client_id: v || null } : x)),
                        );
                      }}
                    >
                      <option value="">— none —</option>
                      {(clients ?? []).map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="text-[11px] text-muted-foreground">Full name</label>
                    <input
                      className={inputCls}
                      value={h.full_name ?? ""}
                      onChange={(e) =>
                        setHolders((arr) =>
                          arr.map((x, i) => (i === idx ? { ...x, full_name: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] text-muted-foreground">Role</label>
                    <select
                      className={selectCls}
                      value={h.role}
                      onChange={(e) =>
                        setHolders((arr) =>
                          arr.map((x, i) =>
                            i === idx ? { ...x, role: e.target.value as any } : x,
                          ),
                        )
                      }
                    >
                      {HOLDER_ROLES.map((r) => (
                        <option key={r.v} value={r.v}>
                          {r.l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-1">
                    <label className="text-[11px] text-muted-foreground">%</label>
                    <input
                      type="number"
                      className={inputCls}
                      value={h.ownership_pct}
                      onChange={(e) =>
                        setHolders((arr) =>
                          arr.map((x, i) =>
                            i === idx ? { ...x, ownership_pct: Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="col-span-2 flex items-end gap-2">
                    <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={h.is_signatory}
                        onChange={(e) =>
                          setHolders((arr) =>
                            arr.map((x, i) =>
                              i === idx ? { ...x, is_signatory: e.target.checked } : x,
                            ),
                          )
                        }
                      />
                      Signatory
                    </label>
                    <button
                      type="button"
                      className="text-[11px] text-destructive"
                      onClick={() => setHolders((arr) => arr.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {holders.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Total ownership including primary customer should equal 100%.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[12px] font-semibold text-foreground">Nominees</div>
                <button
                  type="button"
                  className={btnSecondaryCls}
                  onClick={() =>
                    setNominees((n) => [
                      ...n,
                      { full_name: "", percentage: n.length === 0 ? 100 : 0 },
                    ])
                  }
                >
                  + Add nominee
                </button>
              </div>
              {nominees.map((n, idx) => (
                <div
                  key={idx}
                  className="border border-border rounded-md p-3 mb-2 grid grid-cols-12 gap-2"
                >
                  <div className="col-span-3">
                    <label className="text-[11px] text-muted-foreground">Full name</label>
                    <input
                      className={inputCls}
                      value={n.full_name}
                      onChange={(e) =>
                        setNominees((arr) =>
                          arr.map((x, i) => (i === idx ? { ...x, full_name: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] text-muted-foreground">NIC</label>
                    <input
                      className={inputCls}
                      value={n.nic ?? ""}
                      onChange={(e) =>
                        setNominees((arr) =>
                          arr.map((x, i) => (i === idx ? { ...x, nic: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] text-muted-foreground">Relation</label>
                    <input
                      className={inputCls}
                      value={n.relation ?? ""}
                      onChange={(e) =>
                        setNominees((arr) =>
                          arr.map((x, i) => (i === idx ? { ...x, relation: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] text-muted-foreground">Contact</label>
                    <input
                      className={inputCls}
                      value={n.contact ?? ""}
                      onChange={(e) =>
                        setNominees((arr) =>
                          arr.map((x, i) => (i === idx ? { ...x, contact: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] text-muted-foreground">%</label>
                    <input
                      type="number"
                      className={inputCls}
                      value={n.percentage}
                      onChange={(e) =>
                        setNominees((arr) =>
                          arr.map((x, i) =>
                            i === idx ? { ...x, percentage: Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="col-span-1 flex items-end">
                    <button
                      type="button"
                      className="text-[11px] text-destructive"
                      onClick={() => setNominees((arr) => arr.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <CardTitle subtitle="Signing rules for multi-holder accounts and customer preferences.">
              Mandate & Preferences
            </CardTitle>
            <FormGrid>
              <FormField label="Signing rule" span={6}>
                <select
                  className={selectCls}
                  value={signingRule}
                  onChange={(e) => setSigningRule(e.target.value as any)}
                >
                  {SIGNING_RULES.map((r) => (
                    <option key={r.v} value={r.v}>
                      {r.l}
                    </option>
                  ))}
                </select>
              </FormField>
              {signingRule === "custom" && (
                <FormField label="Minimum signatories" span={6}>
                  <input
                    type="number"
                    min={1}
                    className={inputCls}
                    value={minSignatories}
                    onChange={(e) =>
                      setMinSignatories(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </FormField>
              )}
              <FormField label="Statement preference" span={6}>
                <select
                  className={selectCls}
                  value={statementPref}
                  onChange={(e) => setStatementPref(e.target.value)}
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="on_demand">On demand</option>
                  <option value="none">None</option>
                </select>
              </FormField>
              <FormField label="Communication preference" span={6}>
                <select
                  className={selectCls}
                  value={commPref}
                  onChange={(e) => setCommPref(e.target.value)}
                >
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="both">Both</option>
                  <option value="none">None</option>
                </select>
              </FormField>
              <FormField label="Special instructions" span={12}>
                <textarea
                  className={inputCls}
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </FormField>
            </FormGrid>
          </>
        )}

        {step === 3 && (
          <>
            <CardTitle subtitle="Confirm the details and post the opening deposit.">
              Opening Deposit & Review
            </CardTitle>
            <FormGrid>
              <FormField label="Opening deposit" span={6} required>
                <input
                  type="number"
                  className={inputCls}
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                />
                {product && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Minimum: {product.min_opening_balance} {product.currency}
                    {Number(product.opening_fee ?? 0) > 0 &&
                      ` · Opening fee ${product.opening_fee} will be deducted.`}
                  </p>
                )}
              </FormField>
              <FormField label="Narration" span={6}>
                <input
                  className={inputCls}
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                />
              </FormField>
            </FormGrid>

            <div className="mt-4 border-t border-border pt-3 text-[12px] text-muted-foreground">
              <div className="grid grid-cols-2 gap-y-1 gap-x-4 max-w-2xl">
                <div>Customer</div>
                <div className="text-foreground">
                  {selectedClient ? selectedClient.full_name : "—"}
                </div>
                <div>Product</div>
                <div className="text-foreground">
                  {product ? `${product.code} · ${product.name}` : "—"}
                </div>
                <div>Additional holders</div>
                <div className="text-foreground">{holders.length}</div>
                <div>Nominees</div>
                <div className="text-foreground">{nominees.length}</div>
                <div>Signing rule</div>
                <div className="text-foreground">
                  {SIGNING_RULES.find((r) => r.v === signingRule)?.l}
                </div>
              </div>
            </div>
          </>
        )}

        <FormActions>
          {step > 0 && (
            <button
              type="button"
              className={btnSecondaryCls}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className={btnPrimaryCls} onClick={next}>
              Continue
            </button>
          ) : (
            <button
              type="button"
              className={btnPrimaryCls}
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Opening…" : "Open account"}
            </button>
          )}
        </FormActions>
      </Card>
    </div>
  );
}
