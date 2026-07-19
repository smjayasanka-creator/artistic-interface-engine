import { describe, it, expect, afterEach } from "vitest";
import {
  addDaysISO,
  addMonthsPreservingAnchor,
  adjustBusinessDay,
  contractualDueDate,
  generateSchedule,
  generateStructuredSchedule,
  toDateOnly,
} from "@/lib/loan-schedule";

const dueDates = (s: ReturnType<typeof generateSchedule>) => s.rows.map((r) => r.dueDate);

describe("date-only helpers", () => {
  it("addDaysISO handles year and leap boundaries", () => {
    expect(addDaysISO("2024-12-31", 1)).toBe("2025-01-01");
    expect(addDaysISO("2024-02-28", 1)).toBe("2024-02-29"); // leap
    expect(addDaysISO("2023-02-28", 1)).toBe("2023-03-01"); // non-leap
    expect(addDaysISO("2100-02-28", 1)).toBe("2100-03-01"); // century non-leap
    expect(addDaysISO("2000-02-28", 1)).toBe("2000-02-29"); // /400 leap
  });

  it("addMonthsPreservingAnchor rolls to end-of-month for EOM anchors", () => {
    const anchorEom = { day: 31, isEom: true };
    expect(addMonthsPreservingAnchor("2025-01-31", 1, anchorEom)).toBe("2025-02-28");
    expect(addMonthsPreservingAnchor("2025-01-31", 2, anchorEom)).toBe("2025-03-31");
    expect(addMonthsPreservingAnchor("2025-01-31", 3, anchorEom)).toBe("2025-04-30");
    // leap year Feb 29
    expect(addMonthsPreservingAnchor("2024-01-31", 1, anchorEom)).toBe("2024-02-29");
    // Aug 31 → Sep 30 → Oct 31 → Nov 30 → Dec 31
    expect(addMonthsPreservingAnchor("2025-08-31", 1, anchorEom)).toBe("2025-09-30");
    expect(addMonthsPreservingAnchor("2025-08-31", 2, anchorEom)).toBe("2025-10-31");
    expect(addMonthsPreservingAnchor("2025-08-31", 3, anchorEom)).toBe("2025-11-30");
  });

  it("addMonthsPreservingAnchor preserves mid-month days, clamping when short", () => {
    const a15 = { day: 15, isEom: false };
    expect(addMonthsPreservingAnchor("2025-01-15", 1, a15)).toBe("2025-02-15");
    expect(addMonthsPreservingAnchor("2025-01-15", 2, a15)).toBe("2025-03-15");
    // day 30 anchor into Feb clamps to Feb 28 / 29
    const a30 = { day: 30, isEom: false };
    expect(addMonthsPreservingAnchor("2025-01-30", 1, a30)).toBe("2025-02-28");
    expect(addMonthsPreservingAnchor("2024-01-30", 1, a30)).toBe("2024-02-29");
    // day 30 anchor after clamping stays at 30 in later months
    expect(addMonthsPreservingAnchor("2025-01-30", 2, a30)).toBe("2025-03-30");
  });

  it("contractualDueDate: Feb 29 leap-year anchor", () => {
    // 2024-02-29 is NOT the EOM anchor of a typical month, but IS the EOM of
    // Feb 2024. Anchor-day = 29 (not EOM by our rule — we snapshot from the
    // caller's firstDueDate). Subsequent Febs may clamp.
    expect(contractualDueDate("2024-02-29", 1, "monthly")).toBe("2024-02-29");
    expect(contractualDueDate("2024-02-29", 13, "monthly")).toBe("2025-02-28"); // clamp
    expect(contractualDueDate("2024-02-29", 49, "monthly")).toBe("2028-02-29"); // next leap
  });

  it("toDateOnly is timezone-safe from local Date", () => {
    // Regardless of the runner's TZ, a Date constructed from local components
    // must round-trip via toDateOnly using local getFullYear/Month/Date.
    const d = new Date(2025, 0, 31); // Jan 31 2025 local
    expect(toDateOnly(d)).toBe("2025-01-31");
    expect(toDateOnly("2025-01-31")).toBe("2025-01-31");
    expect(toDateOnly("2025-01-31T23:30:00+05:30")).toBe("2025-01-31");
  });
});

describe("generateSchedule dates", () => {
  it("monthly Jan 15 rolls month-by-month", () => {
    const s = generateSchedule({
      principal: 12000,
      annualRatePct: 12,
      termMonths: 3,
      frequency: "monthly",
      method: "flat",
      firstRepaymentDate: "2025-01-15",
    });
    expect(dueDates(s)).toEqual(["2025-01-15", "2025-02-15", "2025-03-15"]);
    expect(s.maturityDate).toBe("2025-03-15");
  });

  it("monthly Jan 31 uses EOM rule in leap and non-leap years", () => {
    const non = generateSchedule({
      principal: 10000, annualRatePct: 10, termMonths: 4,
      frequency: "monthly", method: "flat",
      firstRepaymentDate: "2025-01-31",
    });
    expect(dueDates(non)).toEqual(["2025-01-31", "2025-02-28", "2025-03-31", "2025-04-30"]);

    const leap = generateSchedule({
      principal: 10000, annualRatePct: 10, termMonths: 4,
      frequency: "monthly", method: "flat",
      firstRepaymentDate: "2024-01-31",
    });
    expect(dueDates(leap)).toEqual(["2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30"]);
  });

  it("Aug 31 → Sep 30 → Oct 31 preserves EOM anchor", () => {
    const s = generateSchedule({
      principal: 10000, annualRatePct: 10, termMonths: 3,
      frequency: "monthly", method: "flat",
      firstRepaymentDate: "2025-08-31",
    });
    expect(dueDates(s)).toEqual(["2025-08-31", "2025-09-30", "2025-10-31"]);
  });

  it("month-length variety (28/29/30/31) is respected", () => {
    const s = generateSchedule({
      principal: 10000, annualRatePct: 10, termMonths: 12,
      frequency: "monthly", method: "flat",
      firstRepaymentDate: "2024-01-31",
    });
    // All Feb Mar Apr … end-of-month
    expect(s.rows[1].dueDate).toBe("2024-02-29");
    expect(s.rows[2].dueDate).toBe("2024-03-31");
    expect(s.rows[3].dueDate).toBe("2024-04-30");
    expect(s.rows[11].dueDate).toBe("2024-12-31");
  });

  it("year-boundary crossings work", () => {
    const s = generateSchedule({
      principal: 6000, annualRatePct: 0, termMonths: 3,
      frequency: "monthly", method: "flat",
      firstRepaymentDate: "2025-11-30",
    });
    expect(dueDates(s)).toEqual(["2025-11-30", "2025-12-31", "2026-01-31"]);
  });

  it("firstRepaymentDate is installment #1 — no extra period added", () => {
    const s = generateSchedule({
      principal: 3000, annualRatePct: 0, termMonths: 3,
      frequency: "monthly", method: "flat",
      firstRepaymentDate: "2025-06-10",
    });
    expect(s.rows[0].dueDate).toBe("2025-06-10");
  });

  it("startDate (no firstRepaymentDate) yields start + one period", () => {
    const s = generateSchedule({
      principal: 3000, annualRatePct: 0, termMonths: 2,
      frequency: "monthly", method: "flat",
      startDate: "2025-01-31",
    });
    expect(s.rows[0].dueDate).toBe("2025-02-28");
    expect(s.rows[1].dueDate).toBe("2025-03-31");
  });

  it("daily / weekly / biweekly unchanged", () => {
    const d = generateSchedule({ principal: 100, annualRatePct: 0, termMonths: 1,
      frequency: "daily", method: "flat", firstRepaymentDate: "2025-02-27" });
    expect(d.rows.slice(0, 4).map((r) => r.dueDate)).toEqual([
      "2025-02-27", "2025-02-28", "2025-03-01", "2025-03-02",
    ]);

    const w = generateSchedule({ principal: 100, annualRatePct: 0, termMonths: 1,
      frequency: "weekly", method: "flat", firstRepaymentDate: "2025-02-27" });
    expect(w.rows[0].dueDate).toBe("2025-02-27");
    expect(w.rows[1].dueDate).toBe("2025-03-06");

    const b = generateSchedule({ principal: 100, annualRatePct: 0, termMonths: 2,
      frequency: "biweekly", method: "flat", firstRepaymentDate: "2024-02-15" });
    expect(b.rows[0].dueDate).toBe("2024-02-15");
    expect(b.rows[1].dueDate).toBe("2024-02-29");
    expect(b.rows[2].dueDate).toBe("2024-03-14");
  });

  it("dates are strictly increasing", () => {
    const s = generateSchedule({
      principal: 100000, annualRatePct: 10, termMonths: 24,
      frequency: "monthly", method: "declining_balance",
      firstRepaymentDate: "2024-01-31",
    });
    for (let i = 1; i < s.rows.length; i++) {
      expect(s.rows[i].dueDate > s.rows[i - 1].dueDate).toBe(true);
    }
    // Maturity derived from final row, not tenor*30
    expect(s.maturityDate).toBe(s.rows[s.rows.length - 1].dueDate);
    expect(s.maturityDate).toBe("2025-12-31");
  });
});

describe("timezone independence", () => {
  const restore = process.env.TZ;
  afterEach(() => { process.env.TZ = restore; });

  it("Sri Lanka (Asia/Colombo, +05:30) still returns Jan 31 → Feb 28", () => {
    process.env.TZ = "Asia/Colombo";
    const s = generateSchedule({
      principal: 1000, annualRatePct: 0, termMonths: 2,
      frequency: "monthly", method: "flat",
      firstRepaymentDate: "2025-01-31",
    });
    expect(dueDates(s)).toEqual(["2025-01-31", "2025-02-28"]);
  });

  it("Pacific/Kiritimati (+14) preserves date-only", () => {
    process.env.TZ = "Pacific/Kiritimati";
    const s = generateSchedule({
      principal: 1000, annualRatePct: 0, termMonths: 2,
      frequency: "monthly", method: "flat",
      firstRepaymentDate: "2025-01-31",
    });
    expect(dueDates(s)).toEqual(["2025-01-31", "2025-02-28"]);
  });

  it("America/Los_Angeles (-08) preserves date-only", () => {
    process.env.TZ = "America/Los_Angeles";
    const s = generateSchedule({
      principal: 1000, annualRatePct: 0, termMonths: 2,
      frequency: "monthly", method: "flat",
      firstRepaymentDate: "2025-01-31",
    });
    expect(dueDates(s)).toEqual(["2025-01-31", "2025-02-28"]);
  });

  it("DST spring-forward day is unaffected", () => {
    process.env.TZ = "America/New_York";
    // 2025-03-09 is US DST transition
    const s = generateSchedule({
      principal: 1000, annualRatePct: 0, termMonths: 2,
      frequency: "daily", method: "flat",
      firstRepaymentDate: "2025-03-08",
    });
    expect(s.rows.slice(0, 3).map((r) => r.dueDate)).toEqual([
      "2025-03-08", "2025-03-09", "2025-03-10",
    ]);
  });
});

describe("business-day adjustment", () => {
  it("following rolls Saturday to Monday", () => {
    // 2025-01-04 is a Saturday
    expect(adjustBusinessDay("2025-01-04", { convention: "following" }))
      .toBe("2025-01-06");
  });
  it("preceding rolls Sunday to Friday", () => {
    // 2025-01-05 Sunday → Fri 2025-01-03
    expect(adjustBusinessDay("2025-01-05", { convention: "preceding" }))
      .toBe("2025-01-03");
  });
  it("modified_following flips to preceding when it would cross month-end", () => {
    // 2025-05-31 is a Saturday; following would land in June, so we roll back.
    expect(adjustBusinessDay("2025-05-31", { convention: "modified_following" }))
      .toBe("2025-05-30");
  });
  it("holidays are honoured", () => {
    // Weekday holiday
    expect(adjustBusinessDay("2025-01-01", { convention: "following", holidays: ["2025-01-01", "2025-01-02"] }))
      .toBe("2025-01-03");
  });
  it("schedule with BDC keeps strictly increasing dates", () => {
    const s = generateSchedule({
      principal: 12000, annualRatePct: 0, termMonths: 3,
      frequency: "monthly", method: "flat",
      firstRepaymentDate: "2025-02-01", // Saturday
      businessDay: { convention: "following", holidays: [] },
    });
    // Feb 1 (Sat) → Mon Feb 3; Mar 1 (Sat) → Mon Mar 3; Apr 1 (Tue) stays.
    expect(dueDates(s)).toEqual(["2025-02-03", "2025-03-03", "2025-04-01"]);
    for (let i = 1; i < s.rows.length; i++) {
      expect(s.rows[i].dueDate > s.rows[i - 1].dueDate).toBe(true);
    }
  });
});

describe("normal vs structured parity", () => {
  it("both engines produce identical due dates for the same inputs", () => {
    const normal = generateSchedule({
      principal: 100000, annualRatePct: 12, termMonths: 6,
      frequency: "monthly", method: "declining_balance",
      firstRepaymentDate: "2024-01-31",
    });
    const structured = generateStructuredSchedule({
      principal: 100000, annualRatePct: 12, termMonths: 6,
      frequency: "monthly", method: "declining_balance",
      firstRepaymentDate: "2024-01-31",
      overrides: {},
    });
    expect(dueDates(normal)).toEqual(dueDates(structured));
    expect(normal.maturityDate).toBe(structured.maturityDate);
  });

  it("structured with BDC matches normal with BDC", () => {
    const bdc = { convention: "modified_following" as const };
    const normal = generateSchedule({
      principal: 60000, annualRatePct: 10, termMonths: 3,
      frequency: "monthly", method: "flat",
      firstRepaymentDate: "2025-05-31", businessDay: bdc,
    });
    const structured = generateStructuredSchedule({
      principal: 60000, annualRatePct: 10, termMonths: 3,
      frequency: "monthly", method: "flat",
      firstRepaymentDate: "2025-05-31", businessDay: bdc, overrides: {},
    });
    expect(dueDates(normal)).toEqual(dueDates(structured));
  });
});
