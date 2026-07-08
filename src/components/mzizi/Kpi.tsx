import { money } from "@/lib/format";
import { Card } from "./Card";

export function Kpi({ label, value, delta, deltaTone = "positive" }: {
  label: string;
  value: string | number;
  delta?: string;
  deltaTone?: "positive" | "neutral" | "negative";
}) {
  const deltaColor =
    deltaTone === "positive" ? "text-primary" : deltaTone === "negative" ? "text-status-danger-fg" : "text-muted-foreground";
  return (
    <Card className="px-4 py-4">
      <div className="text-[11.5px] font-medium text-muted-foreground">{label}</div>
      <div className="font-mono text-[22px] font-semibold tracking-tight mt-2 text-foreground">
        {typeof value === "number" ? money(value) : value}
      </div>
      {delta && <div className={`text-[11px] font-semibold mt-1.5 ${deltaColor}`}>{delta}</div>}
    </Card>
  );
}
