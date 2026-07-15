import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getScreeningConfig, saveScreeningConfig } from "@/lib/screening.functions";
import { Card } from "@/components/mzizi/Card";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  btnPrimaryCls,
} from "@/components/mzizi/FormGrid";

export function ScreeningConfigTab() {
  const qc = useQueryClient();
  const getFn = useServerFn(getScreeningConfig);
  const saveFn = useServerFn(saveScreeningConfig);
  const { data, isLoading } = useQuery({
    queryKey: ["screening-config"],
    queryFn: () => getFn(),
  });

  const [tier1, setTier1] = useState<number>(60);
  const [tier2, setTier2] = useState<number>(85);
  const [autoDirect, setAutoDirect] = useState<boolean>(true);

  useEffect(() => {
    if (data) {
      setTier1(data.tier1_min_score);
      setTier2(data.tier2_min_score);
      setAutoDirect(data.auto_escalate_direct);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: (v: { tier1_min_score: number; tier2_min_score: number; auto_escalate_direct: boolean }) =>
      saveFn({ data: v }),
    onSuccess: () => {
      toast.success("Screening thresholds saved");
      qc.invalidateQueries({ queryKey: ["screening-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold mb-1 text-secondary-foreground uppercase tracking-wider">
        Customer screening thresholds
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Fuzzy-match scores from the FIU screening API are routed to approval workflows using these thresholds.
        Configure the matching workflows under <strong>Workflows</strong> using the transaction types
        <code className="mx-1 px-1 rounded bg-muted">customer_screening_tier1</code> and
        <code className="mx-1 px-1 rounded bg-muted">customer_screening_tier2</code>.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (tier2 < tier1) {
            toast.error("Tier 2 must be ≥ Tier 1");
            return;
          }
          save.mutate({ tier1_min_score: tier1, tier2_min_score: tier2, auto_escalate_direct: autoDirect });
        }}
        className="flex flex-col gap-4"
      >
        <FormGrid>
          <FormField label="Tier 1 minimum score" required span={4} hint="Score ≥ this triggers first-tier review">
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              className={inputCls + " font-mono"}
              value={tier1}
              onChange={(e) => setTier1(Number(e.target.value))}
            />
          </FormField>
          <FormField label="Tier 2 minimum score" required span={4} hint="Score ≥ this escalates to second-tier">
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              className={inputCls + " font-mono"}
              value={tier2}
              onChange={(e) => setTier2(Number(e.target.value))}
            />
          </FormField>
          <FormField label="Direct match handling" span={4}>
            <label className="flex items-center gap-2 text-sm h-9">
              <input
                type="checkbox"
                checked={autoDirect}
                onChange={(e) => setAutoDirect(e.target.checked)}
              />
              Auto-escalate direct hits to Tier 2
            </label>
          </FormField>
        </FormGrid>

        <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-[12px] text-muted-foreground">
          <div className="font-medium text-foreground mb-1">Routing preview</div>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>Score below {tier1} and no direct match → <strong>clear</strong>, no approval required.</li>
            <li>
              Score {tier1}–{Math.max(tier1, tier2 - 0.01).toFixed(1)}
              {autoDirect ? "" : " or direct match"} → <strong>Tier 1 review</strong>.
            </li>
            <li>
              Score ≥ {tier2}{autoDirect ? " or any direct match" : ""} → <strong>Tier 2 escalation</strong>.
            </li>
          </ul>
        </div>

        <FormActions>
          <button type="submit" disabled={save.isPending} className={btnPrimaryCls}>
            {save.isPending ? "Saving…" : "Save thresholds"}
          </button>
        </FormActions>
      </form>
    </Card>
  );
}
