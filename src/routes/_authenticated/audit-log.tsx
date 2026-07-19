import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { listAuditLog } from "@/lib/audit.functions";
import { Card } from "@/components/mzizi/Card";
import { TablePagination } from "@/components/mzizi/TablePagination";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/audit-log")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["audit-log", "all", 1, 25],
      queryFn: () => listAuditLog({ data: { limit: 25, offset: 0 } }),
    }),
  component: AuditLogPage,
});

const ACTION_FILTERS: { label: string; prefix?: string }[] = [
  { label: "All actions" },
  { label: "Ledger", prefix: "ledger." },
  { label: "Workflow", prefix: "workflow." },
  { label: "Loan", prefix: "loan." },
  { label: "FD", prefix: "fd." },
  { label: "Savings", prefix: "savings." },
];

function AuditLogPage() {
  const [prefix, setPrefix] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  useEffect(() => {
    setPage(1);
  }, [prefix, pageSize]);

  const fn = useServerFn(listAuditLog);
  const { data, isLoading, isFetching, isPlaceholderData } = useQuery({
    queryKey: ["audit-log", prefix ?? "all", page, pageSize],
    queryFn: () =>
      fn({ data: { limit: pageSize, offset: (page - 1) * pageSize, action_prefix: prefix } }),
    placeholderData: keepPreviousData,
  });

  const rows = data?.rows ?? [];
  const totalCount = data?.totalCount ?? 0;

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Append-only trail of every posted ledger entry, workflow action, and privileged operation
          for your company.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        {ACTION_FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setPrefix(f.prefix)}
            className={cn(
              "text-xs font-medium px-3 py-1.5 rounded-md border",
              (prefix ?? undefined) === f.prefix
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border hover:border-border-strong",
            )}
          >
            {f.label}
          </button>
        ))}
        {isFetching && <Loader2 size={13} className="ml-2 animate-spin text-faint" />}
      </div>

      <Card padded={false}>
        <div className={cn("relative", isPlaceholderData && "opacity-60 transition-opacity")}>
          <div
            className="grid text-[10.5px] uppercase tracking-wider text-faint font-semibold py-3 px-5 border-b border-border bg-secondary/40"
            style={{ gridTemplateColumns: "1.2fr 1.2fr 1.2fr 1.4fr 2fr" }}
          >
            <div>When</div>
            <div>Actor</div>
            <div>Action</div>
            <div>Entity</div>
            <div>Metadata</div>
          </div>
          {isLoading && <div className="text-center text-faint text-sm py-8">Loading…</div>}
          {!isLoading && rows.length === 0 && (
            <div className="text-center text-faint text-sm py-8">
              No audit entries match this filter yet.
            </div>
          )}
          {rows.map((r: any) => (
            <div
              key={r.id}
              className="grid items-start text-[12.5px] py-2.5 px-5 border-b border-row-divider"
              style={{ gridTemplateColumns: "1.2fr 1.2fr 1.2fr 1.4fr 2fr" }}
            >
              <div className="text-muted-foreground font-mono">
                {new Date(r.created_at).toLocaleString()}
              </div>
              <div className="font-mono text-faint truncate" title={r.actor_user_id ?? "system"}>
                {r.actor_user_id ? r.actor_user_id.slice(0, 8) : "system"}
              </div>
              <div className="font-medium">{r.action}</div>
              <div className="text-muted-foreground truncate" title={r.entity_id ?? ""}>
                {r.entity_type}
                {r.entity_id ? (
                  <span className="font-mono text-faint ml-1">{r.entity_id.slice(0, 8)}</span>
                ) : null}
              </div>
              <div
                className="font-mono text-[11.5px] text-faint truncate"
                title={JSON.stringify(r.metadata)}
              >
                {r.metadata && Object.keys(r.metadata).length > 0
                  ? JSON.stringify(r.metadata)
                  : "—"}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <TablePagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        label="entries"
      />
    </div>
  );
}
