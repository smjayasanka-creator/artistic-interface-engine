export function ProgressBar({ value, tone = "primary", height = 8 }: { value: number; tone?: "primary" | string; height?: number }) {
  const bg = tone === "primary" ? "var(--primary)" : tone;
  return (
    <div className="w-full overflow-hidden rounded-full bg-muted" style={{ height }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: bg }} />
    </div>
  );
}
