import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, BookMarked } from "lucide-react";
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
import { listCompanyBranches } from "@/lib/mzizi.functions";
import {
  listSavingsProducts,
  listSavingsAccounts,
  listPassbookStock,
  receivePassbookStock,
  listPassbookIssues,
  issuePassbook,
} from "@/lib/savings.functions";

export const Route = createFileRoute("/_authenticated/savings/passbook")({
  component: PassbookPage,
});

function PassbookPage() {
  const qc = useQueryClient();
  const branchFn = useServerFn(listCompanyBranches);
  const prodFn = useServerFn(listSavingsProducts);
  const acctFn = useServerFn(listSavingsAccounts);
  const stockFn = useServerFn(listPassbookStock);
  const issuesFn = useServerFn(listPassbookIssues);
  const receiveFn = useServerFn(receivePassbookStock);
  const issueFn = useServerFn(issuePassbook);

  const { data: branches } = useQuery({
    queryKey: ["company-branches"],
    queryFn: () => branchFn(),
  });
  const { data: products } = useQuery({ queryKey: ["savings-products"], queryFn: () => prodFn() });
  const { data: accounts } = useQuery({
    queryKey: ["savings-accounts", "active"],
    queryFn: () => acctFn({ data: { status: "active" } }),
  });
  const { data: stock } = useQuery({ queryKey: ["passbook-stock"], queryFn: () => stockFn() });
  const { data: issues } = useQuery({ queryKey: ["passbook-issues"], queryFn: () => issuesFn() });

  // Receive stock form
  const [rBranch, setRBranch] = useState("");
  const [rProduct, setRProduct] = useState("");
  const [rPrefix, setRPrefix] = useState("");
  const [rFrom, setRFrom] = useState<number | "">("");
  const [rTo, setRTo] = useState<number | "">("");
  const [rSupplier, setRSupplier] = useState("");

  const rQty = rFrom !== "" && rTo !== "" ? Number(rTo) - Number(rFrom) + 1 : 0;

  const receiveM = useMutation({
    mutationFn: () =>
      receiveFn({
        data: {
          branch_id: rBranch,
          product_id: rProduct || null,
          series_prefix: rPrefix || null,
          serial_from: Number(rFrom),
          serial_to: Number(rTo),
          supplier: rSupplier || null,
        },
      }),
    onSuccess: () => {
      toast.success(`Received ${rQty} passbooks`);
      setRFrom("");
      setRTo("");
      setRPrefix("");
      setRSupplier("");
      qc.invalidateQueries({ queryKey: ["passbook-stock"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to receive stock"),
  });

  // Issue form
  const [iStockId, setIStockId] = useState("");
  const [iAcctId, setIAcctId] = useState("");
  const [iSerial, setISerial] = useState<number | "">("");

  const selectedStock = useMemo(
    () => (stock ?? []).find((s: any) => s.id === iStockId),
    [stock, iStockId],
  );
  const nextSerial =
    selectedStock && Number(selectedStock.serial_from) + Number(selectedStock.quantity_issued);

  const issueM = useMutation({
    mutationFn: () =>
      issueFn({
        data: {
          stock_id: iStockId,
          account_id: iAcctId,
          serial_no: iSerial === "" ? null : Number(iSerial),
        },
      }),
    onSuccess: (row: any) => {
      toast.success(`Passbook #${row.serial_no} issued`);
      setIAcctId("");
      setISerial("");
      qc.invalidateQueries({ queryKey: ["passbook-stock"] });
      qc.invalidateQueries({ queryKey: ["passbook-issues"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to issue"),
  });

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Plus size={16} className="text-primary" />
          <div className="text-sm font-semibold">Receive Passbook Stock</div>
        </div>
        <FormGrid>
          <FormField label="Branch" required span={4}>
            <select
              className={selectCls}
              value={rBranch}
              onChange={(e) => setRBranch(e.target.value)}
            >
              <option value="">Select…</option>
              {(branches ?? []).map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Product (optional)"
            span={4}
            hint="Restrict batch to a specific product"
          >
            <select
              className={selectCls}
              value={rProduct}
              onChange={(e) => setRProduct(e.target.value)}
            >
              <option value="">Any product</option>
              {(products ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Series Prefix" span={4}>
            <input
              className={inputCls}
              value={rPrefix}
              onChange={(e) => setRPrefix(e.target.value)}
              placeholder="e.g. PB-A"
            />
          </FormField>
          <FormField label="Serial From" required span={3}>
            <input
              type="number"
              className={inputCls}
              value={rFrom}
              onChange={(e) => setRFrom(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </FormField>
          <FormField label="Serial To" required span={3}>
            <input
              type="number"
              className={inputCls}
              value={rTo}
              onChange={(e) => setRTo(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </FormField>
          <FormField label="Quantity" span={2}>
            <input readOnly className={inputCls + " bg-muted/40"} value={rQty > 0 ? rQty : ""} />
          </FormField>
          <FormField label="Supplier" span={4}>
            <input
              className={inputCls}
              value={rSupplier}
              onChange={(e) => setRSupplier(e.target.value)}
            />
          </FormField>
        </FormGrid>
        <FormActions>
          <button
            className={btnPrimaryCls}
            disabled={!rBranch || rQty <= 0 || receiveM.isPending}
            onClick={() => receiveM.mutate()}
          >
            {receiveM.isPending ? "Saving…" : "Receive Stock"}
          </button>
        </FormActions>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold">Stock Batches</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
                <th className="py-2 pr-3">Received</th>
                <th className="py-2 pr-3">Branch</th>
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3">Prefix</th>
                <th className="py-2 pr-3">Serial Range</th>
                <th className="py-2 pr-3 text-right">Received</th>
                <th className="py-2 pr-3 text-right">Issued</th>
                <th className="py-2 pr-3 text-right">Remaining</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(stock ?? []).map((s: any) => {
                const remaining =
                  Number(s.quantity_received) -
                  Number(s.quantity_issued) -
                  Number(s.quantity_void ?? 0);
                return (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 text-xs">{s.received_on}</td>
                    <td className="py-2 pr-3">{s.branch?.name}</td>
                    <td className="py-2 pr-3">{s.product?.name ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{s.series_prefix ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {s.serial_from}–{s.serial_to}
                    </td>
                    <td className="py-2 pr-3 text-right">{s.quantity_received}</td>
                    <td className="py-2 pr-3 text-right">{s.quantity_issued}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{remaining}</td>
                    <td className="py-2 pr-3 capitalize text-xs">
                      {String(s.status).replace("_", " ")}
                    </td>
                  </tr>
                );
              })}
              {!stock?.length && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted-foreground text-sm">
                    No stock received yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <BookMarked size={16} className="text-primary" />
          <div className="text-sm font-semibold">Issue Passbook</div>
        </div>
        <FormGrid>
          <FormField label="Stock Batch" required span={5}>
            <select
              className={selectCls}
              value={iStockId}
              onChange={(e) => {
                setIStockId(e.target.value);
                setISerial("");
              }}
            >
              <option value="">Select…</option>
              {(stock ?? [])
                .filter(
                  (s: any) =>
                    s.status !== "exhausted" &&
                    s.status !== "void" &&
                    Number(s.quantity_received) - Number(s.quantity_issued) > 0,
                )
                .map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.branch?.name} — {s.series_prefix ?? ""} {s.serial_from}–{s.serial_to}
                  </option>
                ))}
            </select>
          </FormField>
          <FormField label="Account" required span={5}>
            <select
              className={selectCls}
              value={iAcctId}
              onChange={(e) => setIAcctId(e.target.value)}
            >
              <option value="">Select account…</option>
              {(accounts ?? []).map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.account_no} — {a.client?.full_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Serial No."
            span={2}
            hint={nextSerial ? `Next: ${nextSerial}` : undefined}
          >
            <input
              type="number"
              className={inputCls}
              value={iSerial}
              placeholder={nextSerial ? String(nextSerial) : "auto"}
              onChange={(e) => setISerial(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </FormField>
        </FormGrid>
        <FormActions>
          <button
            className={btnSecondaryCls}
            onClick={() => {
              setIAcctId("");
              setISerial("");
            }}
          >
            Reset
          </button>
          <button
            className={btnPrimaryCls}
            disabled={!iStockId || !iAcctId || issueM.isPending}
            onClick={() => issueM.mutate()}
          >
            {issueM.isPending ? "Issuing…" : "Issue Passbook"}
          </button>
        </FormActions>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold">Recent Issues</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-border">
                <th className="py-2 pr-3">Issued</th>
                <th className="py-2 pr-3">Serial</th>
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">Customer</th>
                <th className="py-2 pr-3">Branch</th>
              </tr>
            </thead>
            <tbody>
              {(issues ?? []).map((r: any) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3 text-xs">{r.issued_on}</td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {r.series_prefix ?? ""} {r.serial_no}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{r.account?.account_no}</td>
                  <td className="py-2 pr-3">{r.account?.client?.full_name}</td>
                  <td className="py-2 pr-3">{r.stock?.branch?.name}</td>
                </tr>
              ))}
              {!issues?.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground text-sm">
                    No passbooks issued yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
