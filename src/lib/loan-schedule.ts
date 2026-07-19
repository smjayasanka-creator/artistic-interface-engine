// ---------------------------------------------------------------------------
// Loan schedule engine
//
// Date conventions implemented (canonical spec — mirrored in DB schedule RPCs):
//
//   * Dates are date-only strings ("YYYY-MM-DD"). We never call
//     `Date.prototype.toISOString()` on a local Date to derive a financial
//     date, because that converts through UTC and can shift the day in
//     positive- or negative-offset timezones (Asia/Colombo, Pacific/Auckland,
//     America/Los_Angeles, DST edges…).
//
//   * Frequency-specific period arithmetic:
//         daily     → +1 calendar day
//         weekly    → +7 calendar days
//         biweekly  → +14 calendar days
//         monthly   → +1 calendar month, preserving the anchor day
//                     · if the anchor is the last day of its month, every
//                       installment is the last day of its target month
//                       (Jan 31 → Feb 28/29 → Mar 31 → Apr 30 → …)
//                     · otherwise preserve the anchor day; when the target
//                       month is shorter (e.g. Feb from a 30/31 anchor) use
//                       the final day of that month
//
//   * The distinct dates a loan carries:
//         applicationDate      — when the customer applied
//         disbursementDate     — when cash actually moved
//         interestStartDate    — when interest begins to accrue
//         firstRepaymentDate   — the contractual date of installment #1
//         maturityDate         — the date of the final generated installment
//
//   * `firstRepaymentDate`, when supplied, IS installment #1. We do NOT add
//     another period on top of it. Subsequent installments step forward from
//     that anchor using the frequency rule above.
//
//   * `maturityDate` is derived from the last generated row, not approximated
//     from tenor × 30 days.
//
//   * Business-day adjustment is applied AFTER the contractual date is
//     computed — never folded into the anchor. Supported conventions:
//         none                 — keep the contractual date
//         following            — first business day on/after
//         modified_following   — following, unless that crosses month-end,
//                                in which case use preceding business day
//         preceding            — first business day on/before
//     Weekends default to Sat+Sun; company/branch holidays are passed in as
//     date-only strings.
// ---------------------------------------------------------------------------

export type Frequency = "daily" | "weekly" | "biweekly" | "monthly";
export type InterestMethod = "flat" | "declining_balance";
export type ScheduleType = "normal" | "structured";
export type BusinessDayConvention =
  | "none"
  | "following"
  | "modified_following"
  | "preceding";

export interface BusinessDayConfig {
  convention: BusinessDayConvention;
  /** 0=Sunday … 6=Saturday. Defaults to [0,6] when omitted. */
  weekend?: number[];
  /** Non-working days as "YYYY-MM-DD" strings. */
  holidays?: string[];
}

export interface ScheduleRow {
  seq: number;
  dueDate: string; // "YYYY-MM-DD"
  principal: number;
  interest: number;
  payment: number;
  balance: number;
  isManual?: boolean;
}

export interface ScheduleSummary {
  rows: ScheduleRow[];
  totalPayment: number;
  totalInterest: number;
  installmentCount: number;
  perPayment: number;
  /** Date of the final installment (post business-day adjustment). */
  maturityDate?: string;
}

// perYear is used for interest math only; stepDays is retained for daily
// accrual math but is intentionally NOT used to walk monthly dates anymore.
export const FREQ_META: Record<
  Frequency,
  { label: string; perYear: number; stepDays: number }
> = {
  daily: { label: "Daily", perYear: 365, stepDays: 1 },
  weekly: { label: "Weekly", perYear: 52, stepDays: 7 },
  biweekly: { label: "Bi-weekly", perYear: 26, stepDays: 14 },
  monthly: { label: "Monthly", perYear: 12, stepDays: 30 },
};

export function installmentCount(termMonths: number, freq: Frequency): number {
  const m = FREQ_META[freq];
  return Math.max(1, Math.round((termMonths / 12) * m.perYear));
}

// ---------------------------------------------------------------------------
// Date-only helpers ("YYYY-MM-DD"). Deterministic, timezone-independent.
// ---------------------------------------------------------------------------

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateOnly(s: string): { y: number; m: number; d: number } {
  const m = DATE_RE.exec(s);
  if (!m) throw new Error(`Invalid date-only string: ${s}`);
  return { y: +m[1], m: +m[2], d: +m[3] };
}

function fmtDateOnly(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const MONTH_LEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function daysInMonth(y: number, m: number): number {
  return m === 2 ? (isLeap(y) ? 29 : 28) : MONTH_LEN[m - 1];
}

/** Local-timezone Date → "YYYY-MM-DD" without going through UTC. */
export function toDateOnly(input: Date | string): string {
  if (typeof input === "string") {
    // Accept ISO-with-time by trimming to the date portion; if the caller
    // handed us a full ISO timestamp, take the date part *as authored*.
    if (DATE_RE.test(input)) return input;
    const head = input.slice(0, 10);
    if (DATE_RE.test(head)) return head;
    // Fallback: parse then format in local components.
    const d = new Date(input);
    return fmtDateOnly(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return fmtDateOnly(input.getFullYear(), input.getMonth() + 1, input.getDate());
}

export function addDaysISO(dateStr: string, n: number): string {
  const { y, m, d } = parseDateOnly(dateStr);
  // Use UTC math purely as a calendar calculator — we only ever read back
  // getUTC* components, so timezone conversion cannot affect the result.
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  const dt = new Date(t);
  return fmtDateOnly(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Add `months` calendar months to `dateStr`, preserving the intended anchor
 * day. Rules:
 *   - if `anchorDay` (the day-of-month the schedule is anchored to) equals
 *     the last day of the anchor's month, every result rolls to end-of-month
 *   - otherwise use `min(anchorDay, daysInMonth(target))`
 */
export function addMonthsPreservingAnchor(
  dateStr: string,
  months: number,
  anchor: { day: number; isEom: boolean },
): string {
  const { y, m } = parseDateOnly(dateStr);
  const totalMonth0 = (y * 12 + (m - 1)) + months;
  const ty = Math.floor(totalMonth0 / 12);
  const tm = (totalMonth0 % 12) + 1;
  const dim = daysInMonth(ty, tm);
  const day = anchor.isEom ? dim : Math.min(anchor.day, dim);
  return fmtDateOnly(ty, tm, day);
}

function anchorFromDate(dateStr: string) {
  const { y, m, d } = parseDateOnly(dateStr);
  return { day: d, isEom: d === daysInMonth(y, m) };
}

/**
 * The contractual date of installment `seq` (1-based), stepping from
 * `firstDueDate` which is itself installment #1.
 */
export function contractualDueDate(
  firstDueDate: string,
  seq: number,
  frequency: Frequency,
): string {
  if (seq < 1) throw new Error("seq must be >= 1");
  if (seq === 1) return firstDueDate;
  switch (frequency) {
    case "daily":
      return addDaysISO(firstDueDate, seq - 1);
    case "weekly":
      return addDaysISO(firstDueDate, (seq - 1) * 7);
    case "biweekly":
      return addDaysISO(firstDueDate, (seq - 1) * 14);
    case "monthly":
      return addMonthsPreservingAnchor(
        firstDueDate,
        seq - 1,
        anchorFromDate(firstDueDate),
      );
  }
}

// ---------------------------------------------------------------------------
// Business-day adjustment
// ---------------------------------------------------------------------------

function dayOfWeekISO(dateStr: string): number {
  const { y, m, d } = parseDateOnly(dateStr);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function isBusinessDay(dateStr: string, cfg: BusinessDayConfig): boolean {
  const weekend = cfg.weekend ?? [0, 6];
  if (weekend.includes(dayOfWeekISO(dateStr))) return false;
  if (cfg.holidays && cfg.holidays.includes(dateStr)) return false;
  return true;
}

export function adjustBusinessDay(
  dateStr: string,
  cfg?: BusinessDayConfig,
): string {
  if (!cfg || cfg.convention === "none") return dateStr;
  const step = (from: string, dir: 1 | -1): string => {
    let cur = from;
    for (let i = 0; i < 14; i++) {
      if (isBusinessDay(cur, cfg)) return cur;
      cur = addDaysISO(cur, dir);
    }
    return cur;
  };
  if (cfg.convention === "following") return step(dateStr, 1);
  if (cfg.convention === "preceding") return step(dateStr, -1);
  // modified_following: following, unless it crosses month-end
  const forward = step(dateStr, 1);
  const orig = parseDateOnly(dateStr);
  const fwd = parseDateOnly(forward);
  if (fwd.m !== orig.m || fwd.y !== orig.y) return step(dateStr, -1);
  return forward;
}

// ---------------------------------------------------------------------------
// Common: resolve the first-due-date from caller options.
// ---------------------------------------------------------------------------

interface DateOpts {
  /**
   * Contractual date of installment #1. When provided (as "YYYY-MM-DD" or
   * a Date), this IS the first due date — no extra period is added.
   */
  firstRepaymentDate?: string | Date;
  /**
   * Interest start / disbursement anchor. When provided WITHOUT
   * `firstRepaymentDate`, installment #1 = startDate + 1 period.
   */
  startDate?: string | Date;
  businessDay?: BusinessDayConfig;
}

function resolveFirstDueDate(opts: DateOpts, frequency: Frequency): string {
  if (opts.firstRepaymentDate) return toDateOnly(opts.firstRepaymentDate);
  const start = opts.startDate ? toDateOnly(opts.startDate) : toDateOnly(new Date());
  // Installment #1 = start + one period, using the same rules as
  // contractualDueDate so anchor-day preservation kicks in for monthly.
  switch (frequency) {
    case "daily":    return addDaysISO(start, 1);
    case "weekly":   return addDaysISO(start, 7);
    case "biweekly": return addDaysISO(start, 14);
    case "monthly":  return addMonthsPreservingAnchor(start, 1, anchorFromDate(start));
  }
}

function buildDueDates(
  firstDue: string,
  n: number,
  frequency: Frequency,
  bd?: BusinessDayConfig,
): string[] {
  const out: string[] = [];
  let prevAdjusted = "";
  for (let i = 1; i <= n; i++) {
    const contractual = contractualDueDate(firstDue, i, frequency);
    let adjusted = adjustBusinessDay(contractual, bd);
    // Strictly increasing guarantee — if BDC collapsed onto/before the
    // previous row (e.g. multiple weekend holidays), roll forward one day
    // at a time until we clear it.
    while (prevAdjusted && adjusted <= prevAdjusted) {
      adjusted = addDaysISO(adjusted, 1);
    }
    out.push(adjusted);
    prevAdjusted = adjusted;
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Normal schedule
// ---------------------------------------------------------------------------

export function generateSchedule(opts: {
  principal: number;
  annualRatePct: number;
  termMonths: number;
  frequency: Frequency;
  method?: InterestMethod;
} & DateOpts): ScheduleSummary {
  const { principal, annualRatePct, termMonths, frequency, method = "flat" } = opts;
  const meta = FREQ_META[frequency];
  const n = installmentCount(termMonths, frequency);
  const periodRate = annualRatePct / 100 / meta.perYear;

  const firstDue = resolveFirstDueDate(opts, frequency);
  const dueDates = buildDueDates(firstDue, n, frequency, opts.businessDay);

  const rows: ScheduleRow[] = [];
  let balance = principal;

  if (method === "declining_balance" && periodRate > 0) {
    const payment = (principal * periodRate) / (1 - Math.pow(1 + periodRate, -n));
    for (let i = 1; i <= n; i++) {
      const interest = balance * periodRate;
      let principalPart = payment - interest;
      if (i === n) principalPart = balance;
      balance = Math.max(0, balance - principalPart);
      rows.push({
        seq: i,
        dueDate: dueDates[i - 1],
        principal: round2(principalPart),
        interest: round2(interest),
        payment: round2(principalPart + interest),
        balance: round2(balance),
      });
    }
  } else {
    const totalInt = principal * (annualRatePct / 100) * (termMonths / 12);
    const principalPer = principal / n;
    const interestPer = totalInt / n;
    for (let i = 1; i <= n; i++) {
      balance = Math.max(0, balance - principalPer);
      rows.push({
        seq: i,
        dueDate: dueDates[i - 1],
        principal: round2(principalPer),
        interest: round2(interestPer),
        payment: round2(principalPer + interestPer),
        balance: round2(balance),
      });
    }
  }

  const totalPayment = round2(rows.reduce((s, r) => s + r.payment, 0));
  const totalInterest = round2(rows.reduce((s, r) => s + r.interest, 0));
  return {
    rows,
    totalPayment,
    totalInterest,
    installmentCount: n,
    perPayment: rows[0]?.payment ?? 0,
    maturityDate: rows[rows.length - 1]?.dueDate,
  };
}

// ---------------------------------------------------------------------------
// Structured schedule (same date engine)
//
// Manual override semantics — enforced by this engine and mirrored by the
// database disbursement RPC:
//
//   * Every entry in `overrides` is the EXACT total payment the user wants
//     for that installment. It is never silently replaced — not even the
//     final installment.
//   * Overrides are validated: sequence must be an integer in [1, n],
//     duplicates are rejected, amounts must be finite and ≥ 0.
//   * Automatic installments are recalculated around the fixed manual
//     payments. Any rounding residual (in currency minor units) is
//     absorbed by the LAST eligible automatic installment — never by
//     a manually overridden row.
//   * When every installment is manual, the schedule must fully amortize
//     the loan within the currency tolerance (1 minor unit). Under- or
//     over-payment surfaces as a structured error and is NOT silently
//     corrected.
//   * Flat interest: contractual interest total is fixed; manual payments
//     below their row's interest are rejected (capitalization is not
//     supported for flat schedules). Remaining principal is distributed
//     across automatic rows and any resulting negative auto principal is
//     rejected.
//   * Declining balance: interest is recomputed from the opening balance
//     each period. Manual payments below accrued interest are rejected
//     unless the caller explicitly opts into capitalization
//     (`allowCapitalization: true`). Automatic payments are solved so the
//     balance amortizes to zero; a negative solved payment is rejected.
//   * All internal arithmetic runs in integer minor units (cents) so
//     rounding is deterministic and the preview matches the DB result.
// ---------------------------------------------------------------------------

export interface StructuredScheduleError {
  code:
    | "invalid_sequence"
    | "duplicate_sequence"
    | "not_finite"
    | "negative_amount"
    | "below_interest"
    | "negative_auto_principal"
    | "negative_auto_payment"
    | "underpayment"
    | "overpayment"
    | "all_manual_mismatch"
    | "row_imbalance";
  seq?: number;
  message: string;
}

export interface StructuredScheduleResult extends ScheduleSummary {
  errors: StructuredScheduleError[];
  /** Kept for back-compat; new callers should use `errors`. */
  warnings: string[];
  isValid: boolean;
  /** Auto rows whose payment/principal were recalculated because of overrides. */
  recalculatedAutoSeqs: number[];
  /** Normalized overrides actually applied (invalid entries dropped). */
  appliedOverrides: Record<number, number>;
}

// ----- integer minor-unit (cents) helpers ---------------------------------

const CENT = 100;
const CENT_TOLERANCE = 1; // 1 cent
const toCents = (v: number): number => Math.round(v * CENT);
const fromCents = (c: number): number => Math.round(c) / CENT;

/**
 * Distribute `totalCents` across `n` slots so the cumulative floor is
 * exact — `sum(slot_i) === totalCents` and each slot differs by at most
 * one cent from `totalCents / n`.
 */
function distributeCents(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const sign = totalCents < 0 ? -1 : 1;
  const abs = Math.abs(totalCents);
  const out: number[] = new Array(n);
  let prev = 0;
  for (let i = 1; i <= n; i++) {
    const cur = Math.floor((abs * i) / n);
    out[i - 1] = sign * (cur - prev);
    prev = cur;
  }
  return out;
}

export function generateStructuredSchedule(opts: {
  principal: number;
  annualRatePct: number;
  termMonths: number;
  frequency: Frequency;
  method?: InterestMethod;
  overrides: Record<number, number>;
  /**
   * If true AND method === "declining_balance", a manual payment below the
   * period's accrued interest is allowed and the shortfall capitalizes
   * (balance grows). Never enabled implicitly.
   */
  allowCapitalization?: boolean;
} & DateOpts): StructuredScheduleResult {
  const {
    principal,
    annualRatePct,
    termMonths,
    frequency,
    method = "flat",
    overrides,
    allowCapitalization = false,
  } = opts;
  const meta = FREQ_META[frequency];
  const n = installmentCount(termMonths, frequency);
  const periodRate = annualRatePct / 100 / meta.perYear;

  const errors: StructuredScheduleError[] = [];
  const warnings: string[] = [];

  const firstDue = resolveFirstDueDate(opts, frequency);
  const dueDates = buildDueDates(firstDue, n, frequency, opts.businessDay);

  // ----- validate + normalize overrides -----
  const appliedOverrides: Record<number, number> = {};
  const overrideCents: Record<number, number> = {};
  const seenSeqs = new Set<number>();
  for (const key of Object.keys(overrides)) {
    const raw = (overrides as Record<string, unknown>)[key];
    if (!/^-?\d+$/.test(key)) {
      errors.push({ code: "invalid_sequence", message: `Invalid override sequence key: "${key}"` });
      continue;
    }
    const seq = Number(key);
    if (!Number.isInteger(seq) || seq < 1 || seq > n) {
      errors.push({ code: "invalid_sequence", seq, message: `Override sequence ${seq} is out of range 1..${n}` });
      continue;
    }
    if (seenSeqs.has(seq)) {
      errors.push({ code: "duplicate_sequence", seq, message: `Duplicate override for row ${seq}` });
      continue;
    }
    seenSeqs.add(seq);
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      errors.push({ code: "not_finite", seq, message: `Row ${seq}: payment must be a finite number` });
      continue;
    }
    if (raw < 0) {
      errors.push({ code: "negative_amount", seq, message: `Row ${seq}: payment must be ≥ 0` });
      continue;
    }
    appliedOverrides[seq] = raw;
    overrideCents[seq] = toCents(raw);
  }

  const manualSeqs = new Set<number>(Object.keys(appliedOverrides).map(Number));
  const autoSeqs: number[] = [];
  for (let i = 1; i <= n; i++) if (!manualSeqs.has(i)) autoSeqs.push(i);
  const lastAutoSeq = autoSeqs.length > 0 ? autoSeqs[autoSeqs.length - 1] : null;
  const recalculatedAutoSeqs = manualSeqs.size > 0 ? [...autoSeqs] : [];

  const principalCents = toCents(principal);
  const rows: ScheduleRow[] = new Array(n);

  if (method === "flat") {
    // Fixed contractual interest total, distributed exactly across rows.
    const totalIntCents = toCents(principal * (annualRatePct / 100) * (termMonths / 12));
    const interestPerRow = distributeCents(totalIntCents, n);

    // Manual principal per row = payment - interest for that row.
    const manualPrincipalCents: Record<number, number> = {};
    let manualPrincipalSum = 0;
    for (const seq of manualSeqs) {
      const p = overrideCents[seq] - interestPerRow[seq - 1];
      if (p < 0) {
        errors.push({
          code: "below_interest",
          seq,
          message: `Row ${seq}: payment is below the row's interest (flat schedules do not support capitalization).`,
        });
      }
      manualPrincipalCents[seq] = p;
      manualPrincipalSum += p;
    }

    const autoPrincipalTotal = principalCents - manualPrincipalSum;
    let autoPrincipals: number[] = [];
    if (autoSeqs.length > 0) {
      autoPrincipals = distributeCents(autoPrincipalTotal, autoSeqs.length);
      // Move rounding residual to the LAST auto row is already implicit in
      // distributeCents (last slot absorbs residual because of cumulative
      // flooring). Any negative slot means overrides exceed the loan.
      for (let idx = 0; idx < autoSeqs.length; idx++) {
        if (autoPrincipals[idx] < 0) {
          errors.push({
            code: "negative_auto_principal",
            seq: autoSeqs[idx],
            message: `Row ${autoSeqs[idx]}: automatic principal would be negative — manual rentals exceed the loan.`,
          });
        }
      }
    } else if (Math.abs(autoPrincipalTotal) > CENT_TOLERANCE) {
      errors.push({
        code: autoPrincipalTotal > 0 ? "underpayment" : "overpayment",
        message: `Manual rentals do not fully amortize the loan (residual ${fromCents(autoPrincipalTotal)}).`,
      });
    }

    let autoIdx = 0;
    let balCents = principalCents;
    for (let i = 1; i <= n; i++) {
      const isManual = manualSeqs.has(i);
      const interestCents = interestPerRow[i - 1];
      const principalPartCents = isManual ? manualPrincipalCents[i] : autoPrincipals[autoIdx++] ?? 0;
      const paymentCents = principalPartCents + interestCents;
      balCents -= principalPartCents;
      rows[i - 1] = {
        seq: i,
        dueDate: dueDates[i - 1],
        principal: fromCents(principalPartCents),
        interest: fromCents(interestCents),
        payment: fromCents(paymentCents),
        balance: fromCents(Math.max(0, balCents)),
        isManual,
      };
    }
    if (errors.length === 0 && Math.abs(balCents) > CENT_TOLERANCE) {
      // Should not happen with distributeCents, but guard anyway.
      errors.push({
        code: balCents > 0 ? "underpayment" : "overpayment",
        message: `Final balance is ${fromCents(balCents)} (should be 0).`,
      });
    }
  } else {
    // Declining balance. Solve autoPayment via closed-form future-value
    // identity, then simulate row-by-row in cents. The last auto row
    // absorbs the rounding residual so the closing balance is exactly 0.
    const growth = (k: number) => Math.pow(1 + periodRate, k);
    let manualFV = 0;
    let autoCoeff = 0;
    for (let i = 1; i <= n; i++) {
      const w = growth(n - i);
      if (manualSeqs.has(i)) manualFV += appliedOverrides[i] * w;
      else autoCoeff += w;
    }
    const targetFV = principal * growth(n);

    let autoPaymentCents = 0;
    if (autoSeqs.length > 0) {
      const solved = periodRate === 0
        ? (targetFV - manualFV) / autoSeqs.length
        : (targetFV - manualFV) / autoCoeff;
      autoPaymentCents = toCents(solved);
      if (autoPaymentCents < 0) {
        errors.push({
          code: "negative_auto_payment",
          message: `Manual rentals exceed the loan requirement — automatic payments would be negative.`,
        });
      }
    }

    let balCents = principalCents;
    for (let i = 1; i <= n; i++) {
      const isManual = manualSeqs.has(i);
      // Interest from opening balance, in cents.
      const interestCents = Math.round(balCents * periodRate);
      let paymentCents: number;
      let principalPartCents: number;

      if (isManual) {
        paymentCents = overrideCents[i];
        principalPartCents = paymentCents - interestCents;
        if (principalPartCents < 0 && !allowCapitalization) {
          errors.push({
            code: "below_interest",
            seq: i,
            message: `Row ${i}: payment is below accrued interest and capitalization is not enabled.`,
          });
        }
      } else if (i === lastAutoSeq) {
        // Residual absorption — always on an automatic row.
        principalPartCents = balCents;
        paymentCents = principalPartCents + interestCents;
        if (paymentCents < 0) {
          errors.push({
            code: "negative_auto_payment",
            seq: i,
            message: `Row ${i}: automatic payment would be negative.`,
          });
        }
      } else {
        paymentCents = autoPaymentCents;
        principalPartCents = paymentCents - interestCents;
        if (principalPartCents < 0) {
          errors.push({
            code: "negative_auto_principal",
            seq: i,
            message: `Row ${i}: automatic payment does not cover interest.`,
          });
        }
      }

      balCents -= principalPartCents;

      rows[i - 1] = {
        seq: i,
        dueDate: dueDates[i - 1],
        principal: fromCents(principalPartCents),
        interest: fromCents(interestCents),
        payment: fromCents(paymentCents),
        balance: fromCents(Math.max(0, balCents)),
        isManual,
      };
    }

    if (autoSeqs.length === 0 && Math.abs(balCents) > CENT_TOLERANCE) {
      errors.push({
        code: balCents > 0 ? "underpayment" : "overpayment",
        message: `Manual rentals do not fully amortize the loan (residual ${fromCents(balCents)}).`,
      });
    } else if (autoSeqs.length > 0 && errors.length === 0 && Math.abs(balCents) > CENT_TOLERANCE) {
      errors.push({
        code: "row_imbalance",
        message: `Final balance is ${fromCents(balCents)} after residual absorption (should be 0).`,
      });
    }
  }

  const totalPaymentCents = rows.reduce((s, r) => s + toCents(r.payment), 0);
  const totalInterestCents = rows.reduce((s, r) => s + toCents(r.interest), 0);

  // Per-row invariant sanity check (payment = principal + interest within tol).
  for (const r of rows) {
    const diff = toCents(r.payment) - toCents(r.principal) - toCents(r.interest);
    if (Math.abs(diff) > CENT_TOLERANCE) {
      errors.push({
        code: "row_imbalance",
        seq: r.seq,
        message: `Row ${r.seq}: payment ≠ principal + interest.`,
      });
    }
  }

  return {
    rows,
    totalPayment: fromCents(totalPaymentCents),
    totalInterest: fromCents(totalInterestCents),
    installmentCount: n,
    perPayment: rows[0]?.payment ?? 0,
    maturityDate: rows[rows.length - 1]?.dueDate,
    errors,
    warnings,
    isValid: errors.length === 0,
    recalculatedAutoSeqs,
    appliedOverrides,
  };
}
