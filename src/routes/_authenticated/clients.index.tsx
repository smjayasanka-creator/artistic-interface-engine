import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Search, UserPlus, User2 } from "lucide-react";
import { toast } from "sonner";
import { getClients } from "@/lib/mzizi.functions";
import { Avatar } from "@/components/mzizi/Avatar";
import { StatusBadge } from "@/components/mzizi/Badge";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsSearch,
});

function ClientsSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const fn = useServerFn(getClients);
  // Load all clients once to power the type-ahead. No list is rendered until the user types.
  const { data } = useQuery({ queryKey: ["clients", "all"], queryFn: () => fn({ data: { filter: "all" } }) });

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return (data ?? []).filter((c: any) =>
      c.full_name?.toLowerCase().includes(term) ||
      c.phone?.toLowerCase().includes(term) ||
      c.national_id?.toLowerCase().includes(term) ||
      c.id.toLowerCase().startsWith(term),
    ).slice(0, 8);
  }, [data, q]);

  function openTopMatch() {
    const term = q.trim();
    if (!term) return;
    const exact = (data ?? []).find((c: any) =>
      c.id.toLowerCase() === term.toLowerCase() ||
      c.id.toLowerCase().startsWith(term.toLowerCase()) ||
      c.national_id?.toLowerCase() === term.toLowerCase() ||
      c.phone === term,
    );
    const hit = exact ?? matches[0];
    if (hit) nav({ to: "/clients/$id", params: { id: hit.id } });
    else toast.error("No customer matches that code");
  }

  return (
    <div className="animate-fadein max-w-2xl mx-auto pt-10">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-primary/10 text-primary">
          <User2 size={26} />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Find a client</h1>
        <p className="text-sm text-muted-foreground mt-1">Enter a customer code, NIC or phone number to view the 360° profile.</p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); openTopMatch(); }}
        className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-3 focus-within:border-primary shadow-sm"
      >
        <Search size={16} className="text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Customer code, NIC or phone…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-faint"
        />
        <button
          type="submit"
          className="bg-primary text-primary-foreground text-[12.5px] font-semibold px-4 py-1.5 rounded-md hover:bg-primary-hover"
        >
          Open
        </button>
      </form>

      {q.trim() && (
        <div className="mt-3 bg-card border border-border rounded-xl overflow-hidden">
          {matches.length === 0 ? (
            <div className="text-center text-faint text-sm py-8">No customer matches "{q}".</div>
          ) : (
            matches.map((c: any) => (
              <Link
                key={c.id}
                to="/clients/$id"
                params={{ id: c.id }}
                className="flex items-center gap-3 px-4 py-3 border-b border-row-divider last:border-b-0 hover:bg-row-hover"
              >
                <Avatar name={c.full_name} color={c.avatar_color} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold truncate">{c.full_name}</div>
                  <div className="text-[11.5px] text-faint">
                    {c.phone ?? "—"} · <span className="font-mono">{c.id.slice(0, 8).toUpperCase()}</span>
                    {c.national_id ? <> · {c.national_id}</> : null}
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </Link>
            ))
          )}
        </div>
      )}

      <div className="mt-6 flex items-center justify-center">
        <Link
          to="/clients/new"
          className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-primary hover:underline"
        >
          <UserPlus size={14} /> Onboard a new client
        </Link>
      </div>
    </div>
  );
}
