import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, ShieldAlert, Search } from "lucide-react";
import { screenCustomer, type ScreeningResult, type ScreeningMatch } from "@/lib/screening.functions";
import { Card } from "@/components/mzizi/Card";
import { btnPrimaryCls } from "@/components/mzizi/FormGrid";

type Props = {
  firstName: string;
  lastName: string;
  nationalId: string;
  result: ScreeningResult | null;
  onResult: (r: ScreeningResult | null) => void;
};

export function CustomerScreeningTab({ firstName, lastName, nationalId, result, onResult }: Props) {
  const screenFn = useServerFn(screenCustomer);
  const fullName = `${firstName} ${lastName}`.trim();
  const canScreen = fullName.length > 0 && nationalId.trim().length > 0;

  const m = useMutation({
    mutationFn: async () =>
      screenFn({ data: { name: fullName, customer_id: nationalId.trim() } }),
    onSuccess: (r) => onResult(r),
    onError: () => onResult(null),
  });

  const hasDirect = (result?.direct_matches.length ?? 0) > 0;
  const hasFuzzy = (result?.fuzzy_matches.length ?? 0) > 0;
  const clean = result != null && !hasDirect && !hasFuzzy;

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-secondary-foreground uppercase tracking-wider">
            Customer screening
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Screen the customer against FIU sanction and watch lists using the
            details from the Application tab.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <ReadonlyField label="Name" value={fullName || "—"} />
        <ReadonlyField label="National ID" value={nationalId || "—"} mono />
      </div>

      {!canScreen && (
        <div className="text-[11.5px] rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-2 mb-3">
          Fill first name, last name, and national ID on the Application tab
          before screening.
        </div>
      )}

      <button
        type="button"
        className={btnPrimaryCls}
        disabled={!canScreen || m.isPending}
        onClick={() => m.mutate()}
      >
        <Search size={13} className="mr-1" />
        {m.isPending ? "Screening…" : result ? "Re-screen" : "Run screening"}
      </button>

      {m.isError && (
        <div className="mt-4 text-[12px] rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2">
          {(m.error as Error).message}
        </div>
      )}

      {result && (
        <div className="mt-5 flex flex-col gap-4">
          <SummaryBanner clean={clean} hasDirect={hasDirect} hasFuzzy={hasFuzzy} />

          <MatchesSection
            title="Direct matches"
            emptyLabel="No direct matches found."
            matches={result.direct_matches}
            variant="direct"
          />
          <MatchesSection
            title="Fuzzy matches"
            emptyLabel="No fuzzy matches found."
            matches={result.fuzzy_matches}
            variant="fuzzy"
          />
        </div>
      )}
    </Card>
  );
}

function ReadonlyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-sm text-secondary-foreground ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function SummaryBanner({
  clean,
  hasDirect,
  hasFuzzy,
}: {
  clean: boolean;
  hasDirect: boolean;
  hasFuzzy: boolean;
}) {
  if (clean) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 px-3 py-2 text-[12.5px]">
        <CheckCircle2 size={14} />
        No matches found. Customer is clear for onboarding.
      </div>
    );
  }
  if (hasDirect) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 text-[12.5px]">
        <ShieldAlert size={14} />
        Direct match on a watch list — escalate to compliance before proceeding.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-2 text-[12.5px]">
      <AlertTriangle size={14} />
      Possible fuzzy match — review scores below.
    </div>
  );
}

function MatchesSection({
  title,
  emptyLabel,
  matches,
  variant,
}: {
  title: string;
  emptyLabel: string;
  matches: ScreeningMatch[];
  variant: "direct" | "fuzzy";
}) {
  return (
    <div className="rounded-md border border-border">
      <div className="px-3 py-2 border-b border-border bg-muted/40 flex items-center justify-between">
        <span className="text-[12.5px] font-semibold">{title}</span>
        <span className="text-[11px] text-muted-foreground">
          {matches.length} result{matches.length === 1 ? "" : "s"}
        </span>
      </div>
      {matches.length === 0 ? (
        <div className="px-3 py-3 text-[12px] text-muted-foreground">{emptyLabel}</div>
      ) : (
        <table className="w-full text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border">
              <th className="text-left font-medium px-3 py-2">List type</th>
              <th className="text-left font-medium px-3 py-2">Reference</th>
              {variant === "fuzzy" && (
                <th className="text-right font-medium px-3 py-2">Score</th>
              )}
            </tr>
          </thead>
          <tbody>
            {matches.map((m, i) => (
              <tr key={i} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2">
                  <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium">
                    {m.list_type}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono">{m.ref}</td>
                {variant === "fuzzy" && (
                  <td className="px-3 py-2 text-right font-mono">
                    {typeof m.score === "number" ? `${m.score.toFixed(1)}%` : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
