/**
 * Fixed-Deposit interest calculation helpers (pure functions, no I/O).
 * All money in LKR to 2 decimals; rates in % per annum.
 */

export type FdPayoutOption = "monthly" | "at_maturity";

export interface FdScheduleRow {
  seq: number;
  due_date: string; // ISO
  gross_interest: number;
  wht_amount: number;
  net_interest: number;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Clamp end-of-month rollover (e.g. Jan 31 + 1 month -> Feb 28)
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00Z").getTime();
  const b = new Date(toIso + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

/**
 * Build the payout schedule for a deposit.
 * - monthly: one row per anniversary month
 * - at_maturity: single row on maturity date
 *   tenure ≤ 12: simple interest
 *   tenure > 12: annual compounding for full years + simple for the trailing months
 */
export function buildSchedule(opts: {
  principal: number;
  annualRatePct: number;
  tenureMonths: number;
  valueDate: string;
  payoutOption: FdPayoutOption;
  whtRatePct: number;
}): FdScheduleRow[] {
  const { principal, annualRatePct, tenureMonths, valueDate, payoutOption, whtRatePct } = opts;
  const r = annualRatePct / 100;
  const wht = whtRatePct / 100;
  const rows: FdScheduleRow[] = [];

  if (payoutOption === "monthly") {
    const monthlyGross = principal * (r / 12);
    for (let i = 1; i <= tenureMonths; i++) {
      const gross = r2(monthlyGross);
      const w = r2(gross * wht);
      rows.push({
        seq: i,
        due_date: addMonths(valueDate, i),
        gross_interest: gross,
        wht_amount: w,
        net_interest: r2(gross - w),
      });
    }
    return rows;
  }

  // at_maturity
  let interest: number;
  if (tenureMonths <= 12) {
    interest = principal * r * (tenureMonths / 12);
  } else {
    const fullYears = Math.floor(tenureMonths / 12);
    const trailingMonths = tenureMonths - fullYears * 12;
    const compounded = principal * Math.pow(1 + r, fullYears);
    const trailing = compounded * r * (trailingMonths / 12);
    interest = compounded - principal + trailing;
  }
  const gross = r2(interest);
  const w = r2(gross * wht);
  rows.push({
    seq: 1,
    due_date: addMonths(valueDate, tenureMonths),
    gross_interest: gross,
    wht_amount: w,
    net_interest: r2(gross - w),
  });
  return rows;
}

/** Daily accrual on actual/365 basis (rate is % per annum). */
export function dailyAccrual(principal: number, annualRatePct: number): number {
  return Math.round(((principal * (annualRatePct / 100)) / 365) * 10000) / 10000;
}

/** Interest entitled for a shortened period (used by premature closure). */
export function interestForPeriod(
  principal: number,
  annualRatePct: number,
  monthsHeld: number,
): number {
  return r2(principal * (annualRatePct / 100) * (monthsHeld / 12));
}
