import { cn } from "@/lib/utils";

export function Card({ children, className, padded = true }: { children: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card", padded && "px-5 py-4", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, right, subtitle }: { children: React.ReactNode; right?: React.ReactNode; subtitle?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">{children}</div>
        {right}
      </div>
      {subtitle && <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>}
    </div>
  );
}
