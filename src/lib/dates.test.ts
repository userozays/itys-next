import { describe, expect, it } from "vitest";
import { daysBetween, formatDate, todayIso, warrantyState } from "./dates";

describe("dates", () => {
  it("formats today in local time", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("counts days across a month and a leap day", () => {
    expect(daysBetween("2026-01-31", "2026-02-01")).toBe(1);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2026-03-10", "2026-03-01")).toBe(-9);
  });

  it("classifies warranty: expired yesterday, soon through day 30, ok from day 31", () => {
    const today = "2026-06-01";
    expect(warrantyState(null, today)).toBeNull();
    expect(warrantyState("2026-05-31", today)).toBe("expired");
    expect(warrantyState("2026-06-01", today)).toBe("soon");
    expect(warrantyState("2026-07-01", today)).toBe("soon");
    expect(warrantyState("2026-07-02", today)).toBe("ok");
  });

  it("formats a date for the locale and tolerates a missing one", () => {
    expect(formatDate("2026-03-09", "tr")).toBe("9 Mar 2026");
    expect(formatDate("2026-03-09 14:00:00", "tr")).toBe("9 Mar 2026");
    expect(formatDate(null, "tr")).toBe("—");
  });
});

import { formatMoney, moneyInputValue } from "./money";

describe("money", () => {
  it("formats minor units as currency for the locale", () => {
    expect(formatMoney(125050, "TRY", "tr")).toBe("₺1.250,50");
    expect(formatMoney(null, "TRY", "tr")).toBe("—");
  });

  it("produces an input value the validator reads back", () => {
    expect(moneyInputValue(125050, "tr")).toBe("1250,50");
    expect(moneyInputValue(125050, "en")).toBe("1250.50");
    expect(moneyInputValue(null, "tr")).toBe("");
  });
});
