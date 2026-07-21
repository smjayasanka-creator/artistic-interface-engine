import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getAutoCollectionConfig,
  updateAutoCollectionConfig,
} from "@/lib/savings-settings.functions";
import { Card, CardTitle } from "@/components/mzizi/Card";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  selectCls,
  btnPrimaryCls,
} from "@/components/mzizi/FormGrid";

const TZ = [
  "",
  "Asia/Colombo",
  "Africa/Nairobi",
  "Africa/Kampala",
  "Africa/Dar_es_Salaam",
  "Africa/Kigali",
  "UTC",
  "Europe/London",
];

function toHHMM(t: string | null | undefined) {
  if (!t) return "10:00";
  const m = /^(\d{2}:\d{2})/.exec(t);
  return m ? m[1] : "10:00";
}

export function SavingsAutoCollectionTab() {
  const qc = useQueryClient();
  const getFn = useServerFn(getAutoCollectionConfig);
  const updFn = useServerFn(updateAutoCollectionConfig);

  const { data: cfg, isLoading } = useQuery({
    queryKey: ["savings-auto-coll-config"],
    queryFn: () => getFn(),
  });

  const [form, setForm] = useState<{
    morning_enabled: boolean;
    morning_time: string;
    afternoon_enabled: boolean;
    afternoon_time: string;
    timezone_override: string;
    max_retries: number;
  } | null>(null);

  useEffect(() => {
    if (cfg && !form) {
      setForm({
        morning_enabled: !!cfg.morning_enabled,
        morning_time: toHHMM(cfg.morning_time),
        afternoon_enabled: !!cfg.afternoon_enabled,
        afternoon_time: toHHMM(cfg.afternoon_time),
        timezone_override: cfg.timezone_override ?? "",
        max_retries: Number(cfg.max_retries ?? 0),
      });
    }
  }, [cfg, form]);

  const save = useMutation({
    mutationFn: (v: NonNullable<typeof form>) =>
      updFn({
        data: {
          ...v,
          timezone_override: v.timezone_override || null,
        },
      }),
    onSuccess: () => {
      toast.success("Auto-collection settings saved");
      qc.invalidateQueries({ queryKey: ["savings-auto-coll-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !form) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <Card>
      <CardTitle>Loan repayment auto-collection windows</CardTitle>
      <p className="text-[12px] text-muted-foreground -mt-1 mb-3">
        The scheduler runs twice per business day and sweeps savings accounts to settle loan arrears
        through active mandates. Times are interpreted in the company timezone unless overridden
        below.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
      >
        <FormGrid>
          <FormField label="Morning window" span={6}>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-[12px]">
                <input
                  type="checkbox"
                  checked={form.morning_enabled}
                  onChange={(e) => setForm({ ...form, morning_enabled: e.target.checked })}
                />
                Enabled
              </label>
              <input
                type="time"
                value={form.morning_time}
                onChange={(e) => setForm({ ...form, morning_time: e.target.value })}
                className={inputCls}
                disabled={!form.morning_enabled}
              />
            </div>
          </FormField>

          <FormField label="Afternoon window" span={6}>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-[12px]">
                <input
                  type="checkbox"
                  checked={form.afternoon_enabled}
                  onChange={(e) => setForm({ ...form, afternoon_enabled: e.target.checked })}
                />
                Enabled
              </label>
              <input
                type="time"
                value={form.afternoon_time}
                onChange={(e) => setForm({ ...form, afternoon_time: e.target.value })}
                className={inputCls}
                disabled={!form.afternoon_enabled}
              />
            </div>
          </FormField>

          <FormField
            label="Timezone override"
            span={6}
            hint="Leave blank to use the company timezone"
          >
            <select
              value={form.timezone_override}
              onChange={(e) => setForm({ ...form, timezone_override: e.target.value })}
              className={selectCls}
            >
              {TZ.map((tz) => (
                <option key={tz || "default"} value={tz}>
                  {tz || "— use company timezone —"}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="Max retries per mandate"
            span={6}
            hint="Retry insufficient-funds mandates within the same window"
          >
            <input
              type="number"
              min={0}
              max={5}
              value={form.max_retries}
              onChange={(e) =>
                setForm({ ...form, max_retries: Math.max(0, Math.min(5, Number(e.target.value))) })
              }
              className={inputCls}
            />
          </FormField>
        </FormGrid>

        <FormActions>
          <button type="submit" disabled={save.isPending} className={btnPrimaryCls}>
            {save.isPending ? "Saving…" : "Save settings"}
          </button>
        </FormActions>
      </form>
    </Card>
  );
}
