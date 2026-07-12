import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CircleUser, Wallet, ArrowDownCircle, ArrowUpCircle, Vault, Scale } from "lucide-react";
import { getSession } from "@/lib/mzizi.functions";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

type Row = { label: string; value: number; tone?: "in" | "out" | "neutral" };

// Placeholder teller till figures. Wire to real till/cash-drawer data when available.
const OPENING_BALANCE = 0;
const VAULT_RECEIVED = 0;

const RECEIPTS: Row[] = [
  { label: "Loan Repayments", value: 0, tone: "in" },
  { label: "Deposit Receipts", value: 0, tone: "in" },
  { label: "Other Payments In", value: 0, tone: "in" },
];

const PAYMENTS: Row[] = [
  { label: "Loan Disbursements", value: 0, tone: "out" },
  { label: "Deposit Withdrawals", value: 0, tone: "out" },
  { label: "Other Payments Out", value: 0, tone: "out" },
];

export function TellerSummary() {
  const sessionFn = useServerFn(getSession);
  const { data: session } = useQuery({ queryKey: ["session"], queryFn: () => sessionFn() });

  const totalReceipts = RECEIPTS.reduce((s, r) => s + r.value, 0);
  const totalPayments = PAYMENTS.reduce((s, r) => s + r.value, 0);
  const closing = OPENING_BALANCE + VAULT_RECEIVED + totalReceipts - totalPayments;

  const tellerName = session?.staff?.full_name ?? "—";
  const branch = session?.staff?.branch?.name ?? "—";
  const today = new Date().toLocaleDateString("en-KE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <aside className="flex w-[280px] lg:w-[300px] flex-none flex-col gap-3 border-l border-border bg-secondary/30 p-4 overflow-y-auto">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <CircleUser size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">Teller</div>
            <div className="font-semibold text-[13.5px] truncate">{tellerName}</div>
            <div className="text-[11px] text-muted-foreground truncate">{branch}</div>
          </div>
        </div>
        <div className="mt-2 text-[10.5px] text-faint">{today}</div>
      </div>

      {/* Cash inflow / setup */}
      <Section title="Till">
        <Line icon={<Wallet size={13} />} label="Opening Balance" value={OPENING_BALANCE} />
        <Line icon={<Vault size={13} />} label="Cash from Vault" value={VAULT_RECEIVED} tone="in" />
      </Section>

      {/* Receipts */}
      <Section title="Receipts" icon={<ArrowDownCircle size={12} className="text-emerald-600" />}>
        {RECEIPTS.map((r) => (
          <Line key={r.label} label={r.label} value={r.value} tone={r.tone} />
        ))}
        <Total label="Total Receipts" value={totalReceipts} tone="in" />
      </Section>

      {/* Payments */}
      <Section title="Payments" icon={<ArrowUpCircle size={12} className="text-rose-600" />}>
        {PAYMENTS.map((r) => (
          <Line key={r.label} label={r.label} value={r.value} tone={r.tone} />
        ))}
        <Total label="Total Payments" value={totalPayments} tone="out" />
      </Section>

      {/* Closing balance */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 mt-auto">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-primary font-semibold">
          <Scale size={13} /> Closing Balance
        </div>
        <div className="font-mono text-[22px] font-semibold tracking-tight mt-1.5 text-foreground">
          {money(closing)}
        </div>
        <div className="text-[10.5px] text-faint mt-1">Opening + Vault + Receipts − Payments</div>
      </div>
    </aside>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-faint font-semibold mb-2">
        {icon}
        {title}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Line({
  label,
  value,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: number;
  tone?: "in" | "out" | "neutral";
  icon?: React.ReactNode;
}) {
  const color =
    tone === "in" ? "text-emerald-600" : tone === "out" ? "text-rose-600" : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="flex items-center gap-1.5 text-muted-foreground truncate">
        {icon}
        {label}
      </span>
      <span className={cn("font-mono tabular-nums", color)}>{money(value)}</span>
    </div>
  );
}

function Total({ label, value, tone }: { label: string; value: number; tone: "in" | "out" }) {
  const color = tone === "in" ? "text-emerald-600" : "text-rose-600";
  return (
    <div className="mt-1.5 pt-1.5 border-t border-border flex items-center justify-between text-[12px] font-semibold">
      <span className="text-foreground">{label}</span>
      <span className={cn("font-mono tabular-nums", color)}>{money(value)}</span>
    </div>
  );
}
