export const KES = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 0,
});

export const KESdec = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  minimumFractionDigits: 2,
});

export const LKR = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  maximumFractionDigits: 0,
});

export const LKRdec = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  minimumFractionDigits: 2,
});

export type CurrencyCode = "KES" | "LKR";

const FORMATTERS: Record<CurrencyCode, { whole: Intl.NumberFormat; dec: Intl.NumberFormat }> = {
  KES: { whole: KES, dec: KESdec },
  LKR: { whole: LKR, dec: LKRdec },
};

export function money(
  v: string | number | null | undefined,
  decimals: boolean | CurrencyCode = false,
  currency: CurrencyCode = "KES",
): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  // Backward compat: second arg can be a currency code instead of decimals flag.
  let dec = false;
  let cur: CurrencyCode = currency;
  if (typeof decimals === "string") cur = decimals;
  else dec = decimals;
  const fmt = FORMATTERS[cur] ?? FORMATTERS.KES;
  return (dec ? fmt.dec : fmt.whole).format(n);
}

export function moneyIn(
  v: string | number | null | undefined,
  currency: CurrencyCode,
  decimals = false,
): string {
  return money(v, decimals, currency);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  "#0f766e", "#0369a1", "#7c3aed", "#c2410c",
  "#b45309", "#065f46", "#9333ea", "#be185d",
  "#1d4ed8", "#a16207",
];

export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function relTime(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}
