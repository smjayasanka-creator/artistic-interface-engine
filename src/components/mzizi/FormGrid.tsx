import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * 12-column responsive form grid.
 * Use `span` on FormField to size each field to its content type:
 *   date/code/currency/small select => 2-3
 *   phone/email/id/short text       => 3-4
 *   name/title                      => 4-6
 *   address/description/textarea    => 8-12
 * On small screens all fields collapse to full width.
 */
export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-3", className)}>
      {children}
    </div>
  );
}

export function FormSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {title && (
        <div className="text-[11px] uppercase tracking-wider text-faint font-semibold pb-1 border-b border-border">
          {title}
        </div>
      )}
      <FormGrid>{children}</FormGrid>
    </div>
  );
}

type Span = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

const SPAN_CLS: Record<Span, string> = {
  1: "sm:col-span-1",
  2: "sm:col-span-2",
  3: "sm:col-span-3",
  4: "sm:col-span-4",
  5: "sm:col-span-5",
  6: "sm:col-span-6",
  7: "sm:col-span-7",
  8: "sm:col-span-8",
  9: "sm:col-span-9",
  10: "sm:col-span-10",
  11: "sm:col-span-11",
  12: "sm:col-span-12",
};

export function FormField({
  label,
  required,
  error,
  hint,
  span = 6,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  span?: Span;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5 min-w-0", SPAN_CLS[span], className)}>
      <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">
        {label} {required && <span className="text-destructive normal-case">*</span>}
      </span>
      {children}
      {error ? (
        <span className="text-[11px] text-destructive">{error}</span>
      ) : hint ? (
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

/* Shared input classNames — consistent across every form */
export const inputCls =
  "border border-input rounded-md px-2.5 py-1.5 text-sm bg-background w-full focus:outline-none focus:ring-2 focus:ring-primary/30";
export const selectCls = inputCls + " appearance-none bg-card";
export const errorInputCls =
  "border border-destructive rounded-md px-2.5 py-1.5 text-sm bg-background w-full focus:outline-none focus:ring-2 focus:ring-destructive/30";

export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-end gap-2 pt-4 mt-2 border-t border-border", className)}>
      {children}
    </div>
  );
}
