import { cn } from "@/lib/utils";
import { initials as getInitials } from "@/lib/format";

export function Avatar({ name, color, size = 32, className }: { name: string; color?: string | null; size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-full font-semibold text-white", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: color ?? "var(--muted)",
      }}
    >
      {getInitials(name)}
    </span>
  );
}
