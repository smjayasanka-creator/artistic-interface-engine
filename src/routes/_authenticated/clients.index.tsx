import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getClients } from "@/lib/mzizi.functions";
import { Avatar } from "@/components/mzizi/Avatar";
import { StatusBadge, RiskBadge } from "@/components/mzizi/Badge";
import { useModals } from "@/components/mzizi/modal-context";
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
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const fn = useServerFn(getClients);
  const { data } = useQuery({ queryKey: ["clients", filter], queryFn: () => fn({ data: { filter } }) });
  const modals = useModals();

  return (
    <div className="animate-fadein">
      <div className="flex items-center gap-3 mb-4">
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
        <button
          onClick={modals.openNewClient}
          className="ml-auto bg-primary text-primary-foreground text-[12.5px] font-semibold px-3.5 py-2 rounded-[9px] hover:bg-primary-hover flex items-center gap-1.5"
        >
          <span className="text-[15px] leading-none">+</span> New client
        </button>
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
