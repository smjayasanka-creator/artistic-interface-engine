import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import {
  listFdProducts,
  lookupFdRate,
  createFixedDeposit,
  listClientBankAccounts,
  listClientSavingsAccounts,
  listIntroducers,
  listMarketingOfficers,
} from "@/lib/fd.functions";
import { getClients, listGlAccounts } from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  selectCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import { addMonths } from "@/lib/fd-schedule";
import { money, getActiveCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/fd/new")({
  component: NewFd,
});

type Nominee = {
  client_id: string | null;
  name: string;
  nic: string;
  relationship: string;
  percentage: number;
};

function NewFd() {
  const navigate = useNavigate();
  const prodFn = useServerFn(listFdProducts);
  const clientFn = useServerFn(getClients);
  const glFn = useServerFn(listGlAccounts);
  const rateFn = useServerFn(lookupFdRate);
  const createFn = useServerFn(createFixedDeposit);
  const bankFn = useServerFn(listClientBankAccounts);
  const savingsFn = useServerFn(listClientSavingsAccounts);
  const introFn = useServerFn(listIntroducers);
  const moFn = useServerFn(listMarketingOfficers);

  const { data: products } = useQuery({ queryKey: ["fd-products"], queryFn: () => prodFn() });
  const { data: clients } = useQuery({
    queryKey: ["clients", "active"],
    queryFn: () => clientFn({ data: { filter: "active" } }),
  });
  const { data: glAccounts } = useQuery({ queryKey: ["gl_accounts"], queryFn: () => glFn() });
  const { data: introducers } = useQuery({ queryKey: ["introducers"], queryFn: () => introFn() });
  const { data: officers } = useQuery({ queryKey: ["marketing-officers"], queryFn: () => moFn() });

  const today = new Date().toISOString().slice(0, 10);
  const [clientId, setClientId] = useState("");
  const [productId, setProductId] = useState("");
  const [tenure, setTenure] = useState<number | "">("");
  const [principal, setPrincipal] = useState<number | "">("");
  const [payoutOption, setPayoutOption] = useState<"monthly" | "at_maturity">("at_maturity");
  const [settlement, setSettlement] = useState("");
  const [maturityInstr, setMaturityInstr] = useState<
    "payout" | "renew_principal" | "renew_principal_interest"
  >("payout");
  const [valueDate, setValueDate] = useState(today);
  const [nominees, setNominees] = useState<Nominee[]>([
    { client_id: null, name: "", nic: "", relationship: "", percentage: 100 },
  ]);
  const [rate, setRate] = useState<number | null>(null);

  const [dispatchOption, setDispatchOption] = useState<"post" | "branch" | "digital">("branch");
  const [payoutBankAcct, setPayoutBankAcct] = useState<string>("");
  const [interestMode, setInterestMode] = useState<"bank_transfer" | "credit_savings">(
    "credit_savings",
  );
  const [interestSavingsAcct, setInterestSavingsAcct] = useState<string>("");
  const [marketingOfficer, setMarketingOfficer] = useState<string>("");
  const [introducerId, setIntroducerId] = useState<string>("");
  const [introCommission, setIntroCommission] = useState<number | "">("");
  const [introPayMode, setIntroPayMode] = useState<"cash" | "bank_transfer" | "credit_savings">(
    "cash",
  );

  const { data: clientBanks } = useQuery({
    queryKey: ["client-banks", clientId],
    queryFn: () => bankFn({ data: { client_id: clientId } }),
    enabled: !!clientId,
  });
  const { data: clientSavings } = useQuery({
    queryKey: ["client-savings", clientId],
    queryFn: () => savingsFn({ data: { client_id: clientId } }),
    enabled: !!clientId,
  });

  // Reset dependent selections when client changes
  useEffect(() => {
    setPayoutBankAcct("");
    setInterestSavingsAcct("");
  }, [clientId]);

  // Prefill commission from introducer defaults
  useEffect(() => {
    if (!introducerId) {
      setIntroCommission("");
      return;
    }
    const intro = introducers?.find((i) => i.id === introducerId);
    if (intro?.default_commission_amount != null)
      setIntroCommission(Number(intro.default_commission_amount));
    else if (intro?.default_commission_pct != null && principal) {
      setIntroCommission(
        Math.round(Number(principal) * (Number(intro.default_commission_pct) / 100) * 100) / 100,
      );
    }
  }, [introducerId, introducers, principal]);

  const product = useMemo(
    () => products?.find((p) => p.id === productId) ?? null,
    [products, productId],
  );
  // Tenure is validated against the product's min/max range; rates come from ALCO.

  const maturity = useMemo(
    () => (tenure && valueDate ? addMonths(valueDate, Number(tenure)) : ""),
    [tenure, valueDate],
  );

  async function refreshRate(p = productId, t = tenure, d = valueDate) {
    if (!p || !t || !d) {
      setRate(null);
      return;
    }
    const res = await rateFn({ data: { product_id: p, tenure_months: Number(t), on_date: d } });
    setRate(res.annual_rate);
  }

  const needBankAccount = maturityInstr === "payout" || interestMode === "bank_transfer";
  const needSavingsAccount = interestMode === "credit_savings";

  const createM = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          client_id: clientId,
          product_id: productId,
          tenure_months: Number(tenure),
          principal: Number(principal),
          payout_option: payoutOption,
          settlement_account: settlement || null,
          maturity_instruction: maturityInstr,
          value_date: valueDate,
          nominees: nominees.map((n) => ({
            client_id: n.client_id,
            name: n.name,
            nic: n.nic || null,
            relationship: n.relationship || null,
            percentage: Number(n.percentage),
          })),
          dispatch_option: dispatchOption,
          payout_bank_account_id: needBankAccount ? payoutBankAcct || null : null,
          interest_payment_mode: interestMode,
          interest_savings_account_id: needSavingsAccount ? interestSavingsAcct || null : null,
          marketing_officer_id: marketingOfficer || null,
          introducer_id: introducerId || null,
          introducer_commission_amount: introducerId
            ? introCommission === ""
              ? null
              : Number(introCommission)
            : null,
          introducer_commission_payment_mode: introducerId ? introPayMode : null,
        },
      }),
    onSuccess: (fd) => {
      toast.success(`Deposit ${fd.certificate_no} created — awaiting approval`);
      navigate({ to: "/fd/$id", params: { id: fd.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nomineeTotal = nominees.reduce((s, n) => s + Number(n.percentage || 0), 0);
  const canSubmit =
    !!clientId &&
    !!productId &&
    !!tenure &&
    !!principal &&
    rate != null &&
    (!needBankAccount || !!payoutBankAcct) &&
    (!needSavingsAccount || !!interestSavingsAcct);

  return (
    <div className="animate-fadein max-w-4xl">
      <Card>
        <div className="text-[15px] font-semibold mb-4">New fixed deposit</div>
        <FormGrid>
          <FormField label="Customer" required span={6}>
            <select
              className={selectCls}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Select customer…</option>
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Value date" required span={3}>
            <input
              type="date"
              className={inputCls}
              value={valueDate}
              onChange={(e) => {
                setValueDate(e.target.value);
                refreshRate(productId, tenure, e.target.value);
              }}
            />
          </FormField>
          <FormField label="Maturity date" span={3}>
            <input className={inputCls + " bg-muted/40"} value={maturity} readOnly />
          </FormField>

          <FormField label="Product" required span={6}>
            <select
              className={selectCls}
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setTenure("");
                setRate(null);
              }}
            >
              <option value="">Select product…</option>
              {(products ?? [])
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
            </select>
          </FormField>
          <FormField label="Tenure (months)" required span={3}>
            <input
              type="number"
              min={(product as any)?.min_tenure_months ?? 1}
              max={(product as any)?.max_tenure_months ?? undefined}
              step={1}
              className={inputCls}
              value={tenure}
              onChange={(e) => {
                const t = e.target.value === "" ? "" : Number(e.target.value);
                setTenure(t);
                refreshRate(productId, t, valueDate);
              }}
              disabled={!productId}
            />
            {product && (
              <span className="text-[11px] text-muted-foreground mt-1">
                Allowed: {(product as any).min_tenure_months ?? 1}–
                {(product as any).max_tenure_months ?? "—"} months
              </span>
            )}
          </FormField>
          <FormField label="Applicable rate (%)" span={3}>
            <input
              className={inputCls + " bg-muted/40 font-mono"}
              value={rate == null ? "—" : rate.toFixed(3)}
              readOnly
            />
          </FormField>

          <FormField label={`Principal (${getActiveCurrency()})`} required span={4}>
            <input
              type="number"
              step="0.01"
              className={inputCls}
              value={principal}
              onChange={(e) => setPrincipal(e.target.value === "" ? "" : Number(e.target.value))}
            />
            {product && (
              <span className="text-[11px] text-muted-foreground mt-1">
                Min {money(Number(product.min_amount))} · Max{" "}
                {product.max_amount == null ? "—" : money(Number(product.max_amount))}
              </span>
            )}
          </FormField>
          <FormField label="Marketing officer" span={4}>
            <select
              className={selectCls}
              value={marketingOfficer}
              onChange={(e) => setMarketingOfficer(e.target.value)}
            >
              <option value="">— none —</option>
              {(officers ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.full_name} · {o.role}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Settlement GL account" span={12}>
            <select
              className={selectCls}
              value={settlement}
              onChange={(e) => setSettlement(e.target.value)}
            >
              <option value="">— none —</option>
              {(glAccounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </FormField>
        </FormGrid>

        {/* Maturity instruction */}
        <div className="mt-6 border-t border-border pt-4">
          <div className="text-[13px] font-semibold mb-2">Maturity instruction</div>
          <FormGrid>
            <FormField label="On maturity" required span={6}>
              <select
                className={selectCls}
                value={maturityInstr}
                onChange={(e) => setMaturityInstr(e.target.value as typeof maturityInstr)}
              >
                <option value="payout">Pay out</option>
                <option value="renew_principal">Renew principal only</option>
                <option value="renew_principal_interest">Renew principal + interest</option>
              </select>
            </FormField>
            <FormField label="Certificate dispatch" required span={6}>
              <select
                className={selectCls}
                value={dispatchOption}
                onChange={(e) => setDispatchOption(e.target.value as typeof dispatchOption)}
              >
                <option value="branch">Collect from branch</option>
                <option value="post">Post</option>
                <option value="digital">Digital certificate</option>
              </select>
            </FormField>
            {maturityInstr === "payout" && (
              <FormField label="Pay-out bank account" required span={12}>
                <select
                  className={selectCls}
                  value={payoutBankAcct}
                  onChange={(e) => setPayoutBankAcct(e.target.value)}
                  disabled={!clientId}
                >
                  <option value="">
                    {clientId ? "Select bank account…" : "Select customer first"}
                  </option>
                  {(clientBanks ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} · {b.account_no} · {b.account_name}
                      {b.is_primary ? " (primary)" : ""}
                    </option>
                  ))}
                </select>
                {clientId && (clientBanks?.length ?? 0) === 0 && (
                  <span className="text-[11px] text-destructive mt-1">
                    No bank accounts on file — add one on the customer profile.
                  </span>
                )}
              </FormField>
            )}
          </FormGrid>
        </div>

        {/* Interest payout */}
        <div className="mt-6 border-t border-border pt-4">
          <div className="text-[13px] font-semibold mb-2">Interest payout</div>
          <FormGrid>
            <FormField label="Frequency" required span={6}>
              <select
                className={selectCls}
                value={payoutOption}
                onChange={(e) => setPayoutOption(e.target.value as "monthly" | "at_maturity")}
              >
                {product?.allow_monthly && <option value="monthly">Monthly</option>}
                {product?.allow_at_maturity && <option value="at_maturity">At maturity</option>}
                {!product && (
                  <>
                    <option value="at_maturity">At maturity</option>
                    <option value="monthly">Monthly</option>
                  </>
                )}
              </select>
            </FormField>
            <FormField label="Payment mode" required span={6}>
              <select
                className={selectCls}
                value={interestMode}
                onChange={(e) => setInterestMode(e.target.value as typeof interestMode)}
              >
                <option value="credit_savings">Credit to SDF account</option>
                <option value="bank_transfer">Bank transfer</option>
              </select>
            </FormField>
            {interestMode === "bank_transfer" && (
              <FormField label="Bank account (interest transfer)" required span={12}>
                <select
                  className={selectCls}
                  value={payoutBankAcct}
                  onChange={(e) => setPayoutBankAcct(e.target.value)}
                  disabled={!clientId}
                >
                  <option value="">
                    {clientId ? "Select bank account…" : "Select customer first"}
                  </option>
                  {(clientBanks ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} · {b.account_no} · {b.account_name}
                      {b.is_primary ? " (primary)" : ""}
                    </option>
                  ))}
                </select>
                {clientId && (clientBanks?.length ?? 0) === 0 && (
                  <span className="text-[11px] text-destructive mt-1">
                    No bank accounts on file — add one on the customer profile.
                  </span>
                )}
              </FormField>
            )}
            {interestMode === "credit_savings" && (
              <FormField label="SDF savings account" required span={12}>
                <select
                  className={selectCls}
                  value={interestSavingsAcct}
                  onChange={(e) => setInterestSavingsAcct(e.target.value)}
                  disabled={!clientId}
                >
                  <option value="">
                    {clientId ? "Select savings account…" : "Select customer first"}
                  </option>
                  {(clientSavings ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.account_no} · {(s.product as { name?: string } | null)?.name ?? "Savings"}
                    </option>
                  ))}
                </select>
                {clientId && (clientSavings?.length ?? 0) === 0 && (
                  <span className="text-[11px] text-destructive mt-1">
                    No active savings accounts — open one first.
                  </span>
                )}
              </FormField>
            )}
          </FormGrid>
        </div>

        {/* Introducer */}
        <div className="mt-6 border-t border-border pt-4">
          <div className="text-[13px] font-semibold mb-2">Introducer (optional)</div>
          <FormGrid>
            <FormField label="Introducer" span={6}>
              <select
                className={selectCls}
                value={introducerId}
                onChange={(e) => setIntroducerId(e.target.value)}
              >
                <option value="">— none —</option>
                {(introducers ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.full_name}
                    {i.national_id ? ` · ${i.national_id}` : ""}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-muted-foreground mt-1">
                Introducers are managed in Customers → mark as introducer on the client record.
              </span>
            </FormField>
            <FormField label={`Commission amount (${getActiveCurrency()})`} span={3}>
              <input
                type="number"
                step="0.01"
                className={inputCls}
                value={introCommission}
                onChange={(e) =>
                  setIntroCommission(e.target.value === "" ? "" : Number(e.target.value))
                }
                disabled={!introducerId}
              />
            </FormField>
            <FormField label="Commission payment" span={3}>
              <select
                className={selectCls}
                value={introPayMode}
                onChange={(e) => setIntroPayMode(e.target.value as typeof introPayMode)}
                disabled={!introducerId}
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="credit_savings">Credit to SDF account</option>
              </select>
            </FormField>
          </FormGrid>
        </div>

        {/* Nominees */}
        <div className="mt-6 border-t border-border pt-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[13px] font-semibold">Nominees</div>
              <div className="text-[11px] text-muted-foreground">
                Pick from registered customers. Percentages must total 100 — currently{" "}
                {nomineeTotal}%
              </div>
            </div>
            <button
              className={btnSecondaryCls}
              onClick={() =>
                setNominees([
                  ...nominees,
                  { client_id: null, name: "", nic: "", relationship: "", percentage: 0 },
                ])
              }
            >
              <Plus size={13} className="mr-1" /> Add nominee
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {nominees.map((n, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <select
                  className={selectCls + " col-span-4"}
                  value={n.client_id ?? ""}
                  onChange={(e) => {
                    const cid = e.target.value || null;
                    const c = clients?.find((x) => x.id === cid);
                    update(i, {
                      client_id: cid,
                      name: c?.full_name ?? n.name,
                      nic: c?.national_id ?? n.nic,
                    });
                  }}
                >
                  <option value="">Select customer…</option>
                  {(clients ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="NIC"
                  className={inputCls + " col-span-3"}
                  value={n.nic}
                  onChange={(e) => update(i, { nic: e.target.value })}
                />
                <input
                  placeholder="Relationship"
                  className={inputCls + " col-span-3"}
                  value={n.relationship}
                  onChange={(e) => update(i, { relationship: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="%"
                  className={inputCls + " col-span-1 font-mono"}
                  value={n.percentage}
                  onChange={(e) => update(i, { percentage: Number(e.target.value) })}
                />
                <button
                  className="col-span-1 text-destructive hover:text-destructive/80 flex justify-center"
                  onClick={() => setNominees(nominees.filter((_, j) => j !== i))}
                  disabled={nominees.length === 1}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <FormActions>
          <button className={btnSecondaryCls} onClick={() => navigate({ to: "/fd" })}>
            Cancel
          </button>
          <button
            className={btnPrimaryCls}
            disabled={createM.isPending || !canSubmit}
            onClick={() => createM.mutate()}
          >
            {createM.isPending ? "Creating…" : "Create deposit (pending approval)"}
          </button>
        </FormActions>
      </Card>
    </div>
  );

  function update(i: number, patch: Partial<Nominee>) {
    setNominees(nominees.map((n, idx) => (idx === i ? { ...n, ...patch } : n)));
  }
}
