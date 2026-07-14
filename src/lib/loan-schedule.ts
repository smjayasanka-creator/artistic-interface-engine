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
