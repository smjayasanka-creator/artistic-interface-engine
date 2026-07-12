import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { listFdProducts, lookupFdRate, createFixedDeposit } from "@/lib/fd.functions";
import { getClients, listGlAccounts } from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import { FormGrid, FormField, FormActions, inputCls, selectCls, btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";
import { addMonths } from "@/lib/fd-schedule";
import { money, getActiveCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/fd/new")({
  component: NewFd,
});

type Nominee = { name: string; nic: string; relationship: string; percentage: number };

function NewFd() {
  const navigate = useNavigate();
  const prodFn = useServerFn(listFdProducts);
  const clientFn = useServerFn(getClients);
  const glFn = useServerFn(listGlAccounts);
  const rateFn = useServerFn(lookupFdRate);
  const createFn = useServerFn(createFixedDeposit);

  const { data: products } = useQuery({ queryKey: ["fd-products"], queryFn: () => prodFn() });
  const { data: clients } = useQuery({ queryKey: ["clients", "active"], queryFn: () => clientFn({ data: { filter: "active" } }) });
  const { data: glAccounts } = useQuery({ queryKey: ["gl_accounts"], queryFn: () => glFn() });

  const today = new Date().toISOString().slice(0, 10);
  const [clientId, setClientId] = useState("");
  const [productId, setProductId] = useState("");
  const [tenure, setTenure] = useState<number | "">("");
  const [principal, setPrincipal] = useState<number | "">("");
  const [payoutOption, setPayoutOption] = useState<"monthly" | "at_maturity">("at_maturity");
  const [settlement, setSettlement] = useState("");
  const [maturityInstr, setMaturityInstr] = useState<"payout" | "renew_principal" | "renew_principal_interest">("payout");
  const [valueDate, setValueDate] = useState(today);
  const [nominees, setNominees] = useState<Nominee[]>([{ name: "", nic: "", relationship: "", percentage: 100 }]);
  const [rate, setRate] = useState<number | null>(null);

  const product = useMemo(() => products?.find((p) => p.id === productId) ?? null, [products, productId]);
  const availableTenures = useMemo(() => {
    if (!product) return [];
    const set = new Set<number>();
    for (const t of (product as unknown as { rate_tiers: { tenure_months: number }[] }).rate_tiers) set.add(t.tenure_months);
    return Array.from(set).sort((a, b) => a - b);
  }, [product]);

  const maturity = useMemo(() => (tenure && valueDate ? addMonths(valueDate, Number(tenure)) : ""), [tenure, valueDate]);

  async function refreshRate(p = productId, t = tenure, d = valueDate) {
    if (!p || !t || !d) {
      setRate(null);
      return;
    }
    const res = await rateFn({ data: { product_id: p, tenure_months: Number(t), on_date: d } });
    setRate(res.annual_rate);
  }

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
            name: n.name,
            nic: n.nic || null,
            relationship: n.relationship || null,
            percentage: Number(n.percentage),
          })),
        },
      }),
    onSuccess: (fd) => {
      toast.success(`Deposit ${fd.certificate_no} created — awaiting approval`);
      navigate({ to: "/fd/$id", params: { id: fd.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nomineeTotal = nominees.reduce((s, n) => s + Number(n.percentage || 0), 0);

  return (
    <div className="animate-fadein max-w-4xl">
      <Card>
        <div className="text-[15px] font-semibold mb-4">New fixed deposit</div>
        <FormGrid>
          <FormField label="Customer" required span={6}>
            <select className={selectCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
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
            <select
              className={selectCls}
              value={tenure}
              onChange={(e) => {
                const t = e.target.value === "" ? "" : Number(e.target.value);
                setTenure(t);
                refreshRate(productId, t, valueDate);
              }}
              disabled={!productId}
            >
              <option value="">…</option>
              {availableTenures.map((t) => (
                <option key={t} value={t}>
                  {t} months
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Applicable rate (%)" span={3}>
            <input className={inputCls + " bg-muted/40 font-mono"} value={rate == null ? "—" : rate.toFixed(3)} readOnly />
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
                Min {money(Number(product.min_amount))} · Max {product.max_amount == null ? "—" : money(Number(product.max_amount))}
              </span>
            )}
          </FormField>
          <FormField label="Interest payout" required span={4}>
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
          <FormField label="Maturity instruction" required span={4}>
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
          <FormField label="Settlement account" span={12}>
            <select className={selectCls} value={settlement} onChange={(e) => setSettlement(e.target.value)}>
              <option value="">— none —</option>
              {(glAccounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </FormField>
        </FormGrid>

        <div className="mt-6 border-t border-border pt-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[13px] font-semibold">Nominees</div>
              <div className="text-[11px] text-muted-foreground">Percentages must total 100. Currently: {nomineeTotal}%</div>
            </div>
            <button
              className={btnSecondaryCls}
              onClick={() => setNominees([...nominees, { name: "", nic: "", relationship: "", percentage: 0 }])}
            >
              <Plus size={13} className="mr-1" /> Add nominee
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {nominees.map((n, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input placeholder="Name" className={inputCls + " col-span-4"} value={n.name} onChange={(e) => update(i, { name: e.target.value })} />
                <input placeholder="NIC" className={inputCls + " col-span-3"} value={n.nic} onChange={(e) => update(i, { nic: e.target.value })} />
                <input placeholder="Relationship" className={inputCls + " col-span-3"} value={n.relationship} onChange={(e) => update(i, { relationship: e.target.value })} />
                <input
                  type="number"
                  placeholder="%"
                  className={inputCls + " col-span-1 font-mono"}
                  value={n.percentage}
                  onChange={(e) => update(i, { percentage: Number(e.target.value) })}
                />
                <button className="col-span-1 text-destructive hover:text-destructive/80 flex justify-center" onClick={() => setNominees(nominees.filter((_, j) => j !== i))} disabled={nominees.length === 1}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <FormActions>
          <button className={btnSecondaryCls} onClick={() => navigate({ to: "/fd" })}>Cancel</button>
          <button
            className={btnPrimaryCls}
            disabled={createM.isPending || !clientId || !productId || !tenure || !principal || rate == null}
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
