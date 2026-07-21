import { useMemo, useState } from "react";
import { Search, Lock } from "lucide-react";
import { Card, CardTitle } from "@/components/mzizi/Card";
import { inputCls } from "@/components/mzizi/FormGrid";
import {
  API_CONTRACTS,
  contractsByResource,
  type ApiContract,
  type ApiFieldDoc,
} from "@/lib/api-contract";
import { cn } from "@/lib/utils";

type Row = {
  resource: string;
  contract: ApiContract;
  field: ApiFieldDoc;
};

export function ApiDataCatalogue() {
  const [q, setQ] = useState("");
  const [resource, setResource] = useState<string>("all");
  const [dir, setDir] = useState<"all" | "in" | "out" | "sensitive">("all");

  const groups = contractsByResource();
  const resources = ["all", ...Object.keys(groups)];

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const c of API_CONTRACTS) {
      for (const f of c.fields) {
        out.push({ resource: c.resource, contract: c, field: f });
      }
    }
    return out;
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (resource !== "all" && r.resource !== resource) return false;
      if (dir === "in" && r.field.inbound === false) return false;
      if (dir === "out" && r.field.outbound !== true) return false;
      if (dir === "sensitive" && !r.field.sensitive) return false;
      if (!term) return true;
      return (
        r.field.path.toLowerCase().includes(term) ||
        r.field.label.toLowerCase().includes(term) ||
        r.contract.title.toLowerCase().includes(term)
      );
    });
  }, [rows, q, resource, dir]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3 gap-3">
        <CardTitle>Data catalogue</CardTitle>
        <div className="text-[11.5px] text-muted-foreground">
          {filtered.length} of {rows.length} fields
        </div>
      </div>
      <div className="grid grid-cols-12 gap-2 mb-3">
        <div className="col-span-6 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            className={cn(inputCls, "pl-8")}
            placeholder="Search field name, label or endpoint…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className={cn(inputCls, "col-span-3")}
          value={resource}
          onChange={(e) => setResource(e.target.value)}
        >
          {resources.map((r) => (
            <option key={r} value={r}>
              {r === "all" ? "All resources" : r}
            </option>
          ))}
        </select>
        <select
          className={cn(inputCls, "col-span-3")}
          value={dir}
          onChange={(e) => setDir(e.target.value as typeof dir)}
        >
          <option value="all">All directions</option>
          <option value="in">Inbound only</option>
          <option value="out">Outbound only</option>
          <option value="sensitive">Sensitive / PII</option>
        </select>
      </div>
      <div className="border border-border rounded overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="bg-muted/50 text-muted-foreground uppercase tracking-wider text-[10.5px]">
            <tr>
              <th className="text-left p-2 font-semibold">Field</th>
              <th className="text-left p-2 font-semibold">Type</th>
              <th className="text-left p-2 font-semibold">Resource</th>
              <th className="text-left p-2 font-semibold">Endpoint</th>
              <th className="text-left p-2 font-semibold">Flags</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={`${r.contract.id}-${r.field.path}-${i}`} className="border-t border-border">
                <td className="p-2">
                  <div className="font-mono text-[11.5px]">{r.field.path}</div>
                  <div className="text-[11px] text-muted-foreground">{r.field.label}</div>
                </td>
                <td className="p-2 font-mono text-[11px]">{r.field.type}</td>
                <td className="p-2">{r.resource}</td>
                <td className="p-2 text-muted-foreground text-[11px]">
                  <span className="font-mono">{r.contract.method}</span> {r.contract.path}
                </td>
                <td className="p-2">
                  <div className="flex gap-1 flex-wrap">
                    {r.field.required && <Chip tone="danger">required</Chip>}
                    {r.field.sensitive && (
                      <Chip tone="warn">
                        <Lock className="h-2.5 w-2.5 inline mr-0.5" />
                        PII
                      </Chip>
                    )}
                    {r.field.inbound && <Chip tone="info">inbound</Chip>}
                    {r.field.outbound && <Chip tone="success">outbound</Chip>}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground text-[12px]">
                  No fields match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "danger" | "warn" | "info" | "success";
}) {
  const cls =
    tone === "danger"
      ? "bg-rose-500/10 text-rose-700 border-rose-500/30"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
        : tone === "info"
          ? "bg-sky-500/10 text-sky-700 border-sky-500/30"
          : "bg-emerald-500/10 text-emerald-700 border-emerald-500/30";
  return (
    <span
      className={cn(
        "text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider",
        cls,
      )}
    >
      {children}
    </span>
  );
}
