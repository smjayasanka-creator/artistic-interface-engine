export type Frequency = "daily" | "weekly" | "biweekly" | "monthly";
export type InterestMethod = "flat" | "declining_balance";
export type ScheduleType = "normal" | "structured";

export interface ScheduleRow {
  seq: number;
  dueDate: string; // ISO date
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
  perPayment: number; // for flat
}

export const FREQ_META: Record<Frequency, { label: string; perYear: number; stepDays: number }> = {
  daily: { label: "Daily", perYear: 365, stepDays: 1 },
  weekly: { label: "Weekly", perYear: 52, stepDays: 7 },
  biweekly: { label: "Bi-weekly", perYear: 26, stepDays: 14 },
  monthly: { label: "Monthly", perYear: 12, stepDays: 30 },
};

export function installmentCount(termMonths: number, freq: Frequency): number {
  const m = FREQ_META[freq];
  return Math.max(1, Math.round((termMonths / 12) * m.perYear));
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function generateSchedule(opts: {
  principal: number;
  annualRatePct: number;
  termMonths: number;
  frequency: Frequency;
  method?: InterestMethod;
  startDate?: Date;
}): ScheduleSummary {
  const { principal, annualRatePct, termMonths, frequency, method = "flat" } = opts;
  const start = opts.startDate ?? new Date();
  const meta = FREQ_META[frequency];
  const n = installmentCount(termMonths, frequency);
  const periodRate = annualRatePct / 100 / meta.perYear;

  const rows: ScheduleRow[] = [];
  let balance = principal;

  if (method === "declining_balance" && periodRate > 0) {
    // Amortized payment
    const payment = (principal * periodRate) / (1 - Math.pow(1 + periodRate, -n));
    for (let i = 1; i <= n; i++) {
      const interest = balance * periodRate;
      let principalPart = payment - interest;
      if (i === n) principalPart = balance;
      balance = Math.max(0, balance - principalPart);
      rows.push({
        seq: i,
        dueDate: addDays(start, i * meta.stepDays).toISOString().slice(0, 10),
        principal: round2(principalPart),
        interest: round2(interest),
        payment: round2(principalPart + interest),
        balance: round2(balance),
      });
    }
  } else {
    // Flat interest, level principal & interest per period
    const totalInt = principal * (annualRatePct / 100) * (termMonths / 12);
    const principalPer = principal / n;
    const interestPer = totalInt / n;
    for (let i = 1; i <= n; i++) {
      balance = Math.max(0, balance - principalPer);
      rows.push({
        seq: i,
        dueDate: addDays(start, i * meta.stepDays).toISOString().slice(0, 10),
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
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Structured schedule — user overrides the total rental (principal+interest) for
 * specific installments; remaining installments auto-amortize the balance.
 *
 * Semantics:
 * - `overrides[seq]` is the total rental the user wants for that seq (>= 0).
 * - Flat interest: total interest is fixed (`P × r × t`). Interest is spread
 *   equally across all periods. Manual rows' principal = override - interestPer.
 *   Remaining principal is spread equally over the auto rows.
 * - Declining balance: walk period-by-period. For manual rows, interest = balance×periodRate,
 *   principal = override - interest. If override < interest the shortfall is
 *   CAPITALIZED (principal becomes negative — balance grows). For auto rows,
 *   compute the level payment that amortizes the current balance over remaining
 *   auto periods (skipping future manual rows' contribution) — simpler and
 *   deterministic: level-payment against the remaining balance over remaining
 *   periods; when the next row is manual we defer to its override.
 * - Final row absorbs rounding so balance ends at 0 (or the capitalized amount
 *   is carried into the last row's principal).
 */
export function generateStructuredSchedule(opts: {
  principal: number;
  annualRatePct: number;
  termMonths: number;
  frequency: Frequency;
  method?: InterestMethod;
  startDate?: Date;
  overrides: Record<number, number>;
}): ScheduleSummary & { warnings: string[] } {
  const { principal, annualRatePct, termMonths, frequency, method = "flat", overrides } = opts;
  const start = opts.startDate ?? new Date();
  const meta = FREQ_META[frequency];
  const n = installmentCount(termMonths, frequency);
  const periodRate = annualRatePct / 100 / meta.perYear;
  const warnings: string[] = [];

  const manualSeqs = new Set(
    Object.keys(overrides)
      .map((k) => Number(k))
      .filter((k) => k >= 1 && k <= n && Number.isFinite(overrides[k])),
  );

  const rows: ScheduleRow[] = [];

  if (method === "flat") {
    const totalInt = principal * (annualRatePct / 100) * (termMonths / 12);
    const interestPer = totalInt / n;
    // Manual principals
    let manualPrincipalSum = 0;
    const manualPrincipal: Record<number, number> = {};
    for (const s of manualSeqs) {
      const p = overrides[s] - interestPer;
      manualPrincipal[s] = p;
      manualPrincipalSum += p;
    }
    const autoCount = n - manualSeqs.size;
    const autoPrincipalTotal = principal - manualPrincipalSum;
    const autoPrincipalPer = autoCount > 0 ? autoPrincipalTotal / autoCount : 0;
    if (autoCount > 0 && autoPrincipalPer < 0) {
      warnings.push("Manual rentals exceed the principal; auto rows would be negative.");
    }
    let balance = principal;
    for (let i = 1; i <= n; i++) {
      const isManual = manualSeqs.has(i);
      let principalPart = isManual ? manualPrincipal[i] : autoPrincipalPer;
      if (i === n) principalPart = balance; // absorb rounding
      balance = round2(balance - principalPart);
      rows.push({
        seq: i,
        dueDate: addDays(start, i * meta.stepDays).toISOString().slice(0, 10),
        principal: round2(principalPart),
        interest: round2(interestPer),
        payment: round2(principalPart + interestPer),
        balance: Math.max(0, balance),
        isManual,
      });
    }
  } else {
    // Declining balance
    let balance = principal;
    for (let i = 1; i <= n; i++) {
      const isManual = manualSeqs.has(i);
      const interest = balance * periodRate;
      let principalPart: number;
      if (isManual) {
        principalPart = overrides[i] - interest;
        if (principalPart < 0) {
          warnings.push(`Row ${i}: rental below interest — shortfall capitalized.`);
        }
      } else {
        // Level payment over remaining periods on current balance
        const remaining = n - i + 1;
        let payment: number;
        if (periodRate > 0) {
          payment = (balance * periodRate) / (1 - Math.pow(1 + periodRate, -remaining));
        } else {
          payment = balance / remaining;
        }
        principalPart = payment - interest;
      }
      if (i === n) principalPart = balance; // final row absorbs remainder
      balance = balance - principalPart;
      rows.push({
        seq: i,
        dueDate: addDays(start, i * meta.stepDays).toISOString().slice(0, 10),
        principal: round2(principalPart),
        interest: round2(interest),
        payment: round2(principalPart + interest),
        balance: round2(Math.max(0, balance)),
        isManual,
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
    warnings,
  };
}
