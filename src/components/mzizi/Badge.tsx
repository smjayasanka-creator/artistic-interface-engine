import { cn } from "@/lib/utils";

type Tone = "active" | "pending" | "danger" | "neutral" | "low" | "medium" | "high";

const TONE: Record<Tone, string> = {
  active: "text-status-active-fg bg-status-active-bg",
  pending: "text-status-pending-fg bg-status-pending-bg",
  danger: "text-status-danger-fg bg-status-danger-bg",
  neutral: "text-muted-foreground bg-muted",
  low: "text-status-active-fg bg-status-active-bg",
  medium: "text-status-pending-fg bg-status-pending-bg",
  high: "text-status-danger-fg bg-status-danger-bg",
};

const LABELS: Record<string, string> = {
  active: "Active",
  pending_kyc: "Pending KYC",
  dormant: "Dormant",
  blacklisted: "Blacklisted",
  exited: "Exited",
  low: "Low",
  medium: "Medium",
  high: "High",
  submitted: "Submitted",
  approved: "Approved",
  disbursed: "Disbursed",
  closed: "Closed",
  rejected: "Rejected",
  draft: "Draft",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const tone: Tone =
    status === "active" || status === "disbursed"
      ? "active"
      : status === "pending_kyc" || status === "submitted"
        ? "pending"
        : status === "rejected" || status === "blacklisted"
          ? "danger"
          : "neutral";
  return <Badge tone={tone}>{LABELS[status] ?? status}</Badge>;
}

export function RiskBadge({ risk }: { risk: string | null | undefined }) {
  if (!risk) return null;
  const tone = (risk as Tone) in TONE ? (risk as Tone) : "neutral";
  return <Badge tone={tone}>{LABELS[risk] ?? risk}</Badge>;
}
