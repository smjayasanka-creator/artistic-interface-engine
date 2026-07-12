import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
import { getClients, listCompanyBranches } from "@/lib/mzizi.functions";
import { listSavingsProducts, createSavingsAccount } from "@/lib/savings.functions";

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

function NewSavings() {
  const navigate = useNavigate();
  const clientFn = useServerFn(getClients);
  const branchFn = useServerFn(listCompanyBranches);
  const prodFn = useServerFn(listSavingsProducts);
  const createFn = useServerFn(createSavingsAccount);

  const { data: clients } = useQuery({
    queryKey: ["clients", "active"],
    queryFn: () => clientFn({ data: { filter: "active" } }),
  });
  const { data: branches } = useQuery({
    queryKey: ["company-branches"],
    queryFn: () => branchFn(),
  });
  const { data: products } = useQuery({
    queryKey: ["savings-products"],
    queryFn: () => prodFn(),
  });

  const [clientId, setClientId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [productId, setProductId] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [channel, setChannel] = useState("branch");
  const [externalRef, setExternalRef] = useState("");
  const [narration, setNarration] = useState("");

  const product = useMemo(
    () => (products ?? []).find((p: any) => p.id === productId),
    [products, productId],
  );

  const createM = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          client_id: clientId,
          branch_id: branchId,
          product_id: productId,
          opening_deposit: Number(amount),
          channel: channel as any,
          external_ref: externalRef || null,
          narration: narration || null,
        },
      }),
    onSuccess: (acct: any) => {
      toast.success(`Account ${acct.account_no} created`);
      navigate({ to: "/savings" });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to open account"),
  });

  const canSubmit =
    clientId && branchId && productId && Number(amount) >= Number(product?.min_opening_balance ?? 0);

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Card>
        <div className="mb-3">
          <div className="text-sm font-semibold">New Savings Account</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Opens the account, applies opening fee (if any) and posts opening deposit.
          </div>
        </div>
        <FormGrid>
          <FormField label="Customer" required span={6}>
            <select className={selectCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Select customer…</option>
              {(clients ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} — {c.phone}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Branch" required span={3}>
            <select className={selectCls} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Select branch…</option>
              {(branches ?? []).map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Savings Product" required span={3}>
            <select
              className={selectCls}
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">Select product…</option>
              {(products ?? [])
                .filter((p: any) => p.active !== false)
                .map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.interest_rate_pct}% p.a.)
                  </option>
                ))}
            </select>
          </FormField>

          <FormField
            label="Opening Deposit"
            required
            span={3}
            hint={
              product
                ? `Min ${product.min_opening_balance} ${product.currency} • Fee ${product.opening_fee}`
                : undefined
            }
          >
            <input
              type="number"
              className={inputCls}
              value={amount}
              min={0}
              onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </FormField>
          <FormField label="Channel" span={3}>
            <select className={selectCls} value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.l}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="External Reference" span={6} hint="Third-party transaction / channel ref">
            <input
              className={inputCls}
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
              placeholder="e.g. CEFT-2026-000123"
            />
          </FormField>
          <FormField label="Narration" span={12}>
            <input
              className={inputCls}
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="Optional description"
            />
          </FormField>
        </FormGrid>

        <FormActions align="between">
          <button className={btnSecondaryCls} onClick={() => navigate({ to: "/savings" })}>
            Cancel
          </button>
          <button
            className={btnPrimaryCls}
            disabled={!canSubmit || createM.isPending}
            onClick={() => createM.mutate()}
          >
            {createM.isPending ? "Opening…" : "Open Account"}
          </button>
        </FormActions>
      </Card>
    </div>
  );
}
