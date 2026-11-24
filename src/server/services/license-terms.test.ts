import { describe, expect, it } from "vitest";
import { addCompany, addUser, assetInput, testDb } from "../testing/fixtures";
import { licenseInput } from "../validation";
import { createAsset } from "./assets";
import { assignLicense, createLicense, getLicense, licenseSummary } from "./licenses";

describe("license kind, period and purchase date (QA Ö6)", () => {
  it("keeps a renewal period only for subscriptions, yearly by default", () => {
    const parse = (raw: Record<string, unknown>) => licenseInput.parse({ name: "X", ...raw });
    expect(parse({ kind: "subscription", billingPeriod: "monthly" }).billingPeriod).toBe("monthly");
    expect(parse({ kind: "subscription" }).billingPeriod).toBe("yearly");
    expect(parse({ kind: "perpetual", billingPeriod: "monthly" }).billingPeriod).toBeNull();
    expect(parse({}).kind).toBe("subscription");
  });

  it("refuses an end date before the purchase date, together with other errors", () => {
    const result = licenseInput.safeParse({ name: "", purchaseDate: "2026-05-01", expiryDate: "2026-01-01" });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((i) => `${String(i.path[0])}:${i.message}`)).toEqual(["name:required"]);
    const datesOnly = licenseInput.safeParse({ name: "X", purchaseDate: "2026-05-01", expiryDate: "2026-01-01" });
    expect(datesOnly.error!.issues.map((i) => `${String(i.path[0])}:${i.message}`)).toEqual(["expiryDate:expiryBeforePurchase"]);
  });

  it("stores the new fields", async () => {
    const db = testDb();
    const a = addCompany(db, "A");
    const admin = await addUser(db, "admin", "admin");
    const { id } = createLicense(db, admin, a, { name: "Windows 11 Pro", currency: "TRY", kind: "perpetual", purchaseDate: "2025-03-01" });
    expect(getLicense(db, admin, id)).toMatchObject({ kind: "perpetual", billingPeriod: null, purchaseDate: "2025-03-01" });
  });
});

describe("license summary on the dashboard (QA Ö6)", () => {
  it("adds up seats, licenses ending soon and costs per currency", async () => {
    const db = testDb();
    const a = addCompany(db, "A");
    const admin = await addUser(db, "admin", "admin");
    const today = "2026-11-24";
    const pc = createAsset(db, admin, a, assetInput({ name: "PC" }));

    const full = createLicense(db, admin, a, { name: "Dolu", currency: "TRY", seats: 1, kind: "subscription", billingPeriod: "monthly", cost: 10000 });
    assignLicense(db, admin, full.id, pc.id);
    createLicense(db, admin, a, { name: "Yıllık", currency: "TRY", seats: 4, cost: 50000, expiryDate: "2026-12-10" });
    createLicense(db, admin, a, { name: "Dolar", currency: "USD", kind: "subscription", billingPeriod: "yearly", cost: 12000 });
    createLicense(db, admin, a, { name: "Kalıcı", currency: "TRY", kind: "perpetual", cost: 300000, expiryDate: "2026-10-01" });
    createLicense(db, admin, a, { name: "Ücretsiz", currency: "EUR" });

    expect(licenseSummary(db, admin, a, today)).toEqual({
      count: 5,
      seatsUsed: 1,
      seatsTotal: 5,
      fullCount: 1,
      endingSoon: 1,
      yearlySubscriptions: { TRY: 10000 * 12 + 50000, USD: 12000 },
      perpetualPurchases: { TRY: 300000 },
    });
  });
});
