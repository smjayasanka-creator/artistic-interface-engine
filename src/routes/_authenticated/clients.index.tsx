import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { getClients } from "@/lib/mzizi.functions";
import { Avatar } from "@/components/mzizi/Avatar";
import { StatusBadge, RiskBadge } from "@/components/mzizi/Badge";

import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsList,
});

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pending_kyc", label: "Pending KYC" },
] as const;

function ClientsList() {
  const nav = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [code, setCode] = useState("");
  const fn = useServerFn(getClients);
  const { data } = useQuery({ queryKey: ["clients", filter], queryFn: () => fn({ data: { filter } }) });

  const shown = useMemo(() => {
    const q = code.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (c: any) =>
        c.full_name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.national_id?.toLowerCase().includes(q) ||
        c.id.toLowerCase().startsWith(q),
    );
  }, [data, code]);

  function jumpToCode() {
    const q = code.trim();
    if (!q) return;
    const hit = (data ?? []).find(
      (c: any) =>
        c.id.toLowerCase().startsWith(q.toLowerCase()) ||
        c.national_id?.toLowerCase() === q.toLowerCase() ||
        c.phone === q,
    );
    if (hit) nav({ to: "/clients/$id", params: { id: hit.id } });
    else toast.error("No customer matches that code");
  }

  return (
    <div className="animate-fadein">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "text-xs font-medium px-3 py-1.5 rounded-md border",
                filter === f.key ? "bg-primary text-primary-foreground border-primary" : "bg-card text-secondary-foreground border-border hover:border-border-strong",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            jumpToCode();
          }}
          className="flex items-center gap-1.5 bg-card border border-border rounded-md px-2.5 py-1.5 focus-within:border-primary"
        >
          <Search size={13} className="text-muted-foreground" />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Customer code, NIC or phone…"
            className="bg-transparent outline-none text-[12.5px] w-56 placeholder:text-faint"
          />
        </form>
        <Link
          to="/clients/new"
          className="ml-auto bg-primary text-primary-foreground text-[12.5px] font-semibold px-3.5 py-2 rounded-[9px] hover:bg-primary-hover flex items-center gap-1.5"
        >
          <span className="text-[15px] leading-none">+</span> New client
        </Link>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
             style={{ gridTemplateColumns: "2fr 1.3fr 1fr .7fr 1.1fr .9fr" }}>
          <div>Client</div><div>Group</div><div>Status</div><div>Loans</div><div>Outstanding</div><div>Risk</div>
        </div>
        {(data ?? []).map((c: any) => (
          <Link
            key={c.id}
            to="/clients/$id"
            params={{ id: c.id }}
            className="grid items-center text-[13px] py-3 px-5 border-b border-row-divider last:border-b-0 hover:bg-row-hover"
            style={{ gridTemplateColumns: "2fr 1.3fr 1fr .7fr 1.1fr .9fr" }}
          >
            <div className="font-semibold flex items-center gap-2.5">
              <Avatar name={c.full_name} color={c.avatar_color} />
              <div>
                <div>{c.full_name}</div>
                <div className="text-[11px] text-faint font-normal">{c.phone ?? "—"}</div>
              </div>
            </div>
            <div className="text-secondary-foreground">{c.group?.name ?? "—"}</div>
            <div><StatusBadge status={c.status} /></div>
            <div className="font-mono text-secondary-foreground">{c.loans}</div>
            <div className="font-mono font-semibold">{money(c.outstanding)}</div>
            <div><RiskBadge risk={c.risk_grade} /></div>
          </Link>
        ))}
        {(data ?? []).length === 0 && <div className="text-center text-faint text-sm py-10">No clients yet. Create your first via "New client".</div>}
      </div>
    </div>
  );
}
