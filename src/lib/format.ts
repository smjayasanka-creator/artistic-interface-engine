export type CurrencyCode = string;

// Locale hints for known currencies; unknown codes fall back to en-US.
const LOCALE_BY_CURRENCY: Record<string, string> = {
  KES: "en-KE",
  LKR: "en-LK",
  USD: "en-US",
  EUR: "en-IE",
  GBP: "en-GB",
  INR: "en-IN",
  UGX: "en-UG",
  TZS: "en-TZ",
  RWF: "en-RW",
  NGN: "en-NG",
  ZAR: "en-ZA",
};

const cache = new Map<string, { whole: Intl.NumberFormat; dec: Intl.NumberFormat }>();

function formattersFor(code: string) {
  const cur = (code || "KES").toUpperCase();
  let f = cache.get(cur);
  if (!f) {
    const locale = LOCALE_BY_CURRENCY[cur] ?? "en-US";
    try {
      f = {
        whole: new Intl.NumberFormat(locale, {
          style: "currency",
          currency: cur,
          maximumFractionDigits: 0,
        }),
        dec: new Intl.NumberFormat(locale, {
          style: "currency",
          currency: cur,
          minimumFractionDigits: 2,
        }),
      };
    } catch {
      f = {
        whole: new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }),
        dec: new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
        }),
      };
    }
    cache.set(cur, f);
  }
  return f;
}

// Active currency defaults to KES; set by CompanyCurrencyProvider at runtime.
let ACTIVE_CURRENCY: string = "KES";
export function setActiveCurrency(code: string | null | undefined) {
  if (!code) return;
  ACTIVE_CURRENCY = code.toUpperCase();
}
export function getActiveCurrency(): string {
  return ACTIVE_CURRENCY;
}

// Kept for backward-compat imports; these reflect the active currency lazily.
export const KES = formattersFor("KES").whole;
export const KESdec = formattersFor("KES").dec;
export const LKR = formattersFor("LKR").whole;
export const LKRdec = formattersFor("LKR").dec;

export function money(
  v: string | number | null | undefined,
  decimals: boolean | CurrencyCode = false,
  currency?: CurrencyCode,
): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  // Backward compat: second arg can be a currency code instead of decimals flag.
  let dec = false;
  let cur: string = currency ?? ACTIVE_CURRENCY;
  if (typeof decimals === "string") cur = decimals;
  else dec = decimals;
  const fmt = formattersFor(cur);
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
  "#0f766e",
  "#0369a1",
  "#7c3aed",
  "#c2410c",
  "#b45309",
  "#065f46",
  "#9333ea",
  "#be185d",
  "#1d4ed8",
  "#a16207",
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
