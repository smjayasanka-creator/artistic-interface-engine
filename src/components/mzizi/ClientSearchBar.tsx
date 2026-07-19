import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useRef, useEffect } from "react";
import { Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { getClients } from "@/lib/mzizi.functions";
import { Avatar } from "@/components/mzizi/Avatar";
import { StatusBadge } from "@/components/mzizi/Badge";

export function ClientSearchBar({ autoFocus = false }: { autoFocus?: boolean }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fn = useServerFn(getClients);
  const { data } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: () => fn({ data: { filter: "all" } }),
  });

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return (data ?? [])
      .filter(
        (c: any) =>
          c.full_name?.toLowerCase().includes(term) ||
          c.phone?.toLowerCase().includes(term) ||
          c.national_id?.toLowerCase().includes(term) ||
          c.id.toLowerCase().startsWith(term),
      )
      .slice(0, 8);
  }, [data, q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function openTopMatch() {
    const term = q.trim();
    if (!term) return;
    const exact = (data ?? []).find(
      (c: any) =>
        c.id.toLowerCase() === term.toLowerCase() ||
        c.id.toLowerCase().startsWith(term.toLowerCase()) ||
        c.national_id?.toLowerCase() === term.toLowerCase() ||
        c.phone === term,
    );
    const hit = exact ?? matches[0];
    if (hit) {
      setOpen(false);
      setQ("");
      nav({ to: "/clients/$id", params: { id: hit.id } });
    } else toast.error("No customer matches that code");
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          openTopMatch();
        }}
        className="flex items-center gap-2 bg-card border border-border rounded-xl px-3.5 py-2.5 focus-within:border-primary shadow-sm"
      >
        <Search size={15} className="text-muted-foreground shrink-0" />
        <input
          autoFocus={autoFocus}
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          placeholder="Search customer code, NIC or phone…"
          className="bg-transparent outline-none text-[13px] flex-1 placeholder:text-faint min-w-0"
        />
        <Link
          to="/clients/new"
          className="hidden sm:inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline shrink-0"
        >
          <UserPlus size={12} /> New
        </Link>
        <button
          type="submit"
          className="bg-primary text-primary-foreground text-[12px] font-semibold px-3 py-1.5 rounded-md hover:bg-primary-hover shrink-0"
        >
          Open
        </button>
      </form>

      {open && q.trim() && (
        <div className="absolute z-20 mt-1.5 left-0 right-0 bg-card border border-border rounded-xl overflow-hidden shadow-lg">
          {matches.length === 0 ? (
            <div className="text-center text-faint text-[12.5px] py-6">
              No customer matches "{q}".
            </div>
          ) : (
            matches.map((c: any) => (
              <Link
                key={c.id}
                to="/clients/$id"
                params={{ id: c.id }}
                onClick={() => {
                  setOpen(false);
                  setQ("");
                }}
                className="flex items-center gap-3 px-3.5 py-2.5 border-b border-row-divider last:border-b-0 hover:bg-row-hover"
              >
                <Avatar name={c.full_name} color={c.avatar_color} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold truncate">{c.full_name}</div>
                  <div className="text-[11px] text-faint truncate">
                    {c.phone ?? "—"} ·{" "}
                    <span className="font-mono">{c.id.slice(0, 8).toUpperCase()}</span>
                    {c.national_id ? <> · {c.national_id}</> : null}
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
