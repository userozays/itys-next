import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { licenses } from "../db/schema";
import { addCompany, addUser, assetInput, testDb } from "../testing/fixtures";
import { licenseInput as schema, type LicenseInput } from "../validation";
import { createAsset, deleteAsset } from "./assets";
import {
  assignLicense,
  createLicense,
  deleteLicense,
  getLicense,
  listAssignedAssets,
  listLicenses,
  listLicensesForAsset,
  revealLicenseKey,
  unassignLicense,
  updateLicense,
} from "./licenses";

const KEY = "XXXXX-YYYYY-ZZZZZ-11111";

function input(overrides: Partial<LicenseInput> = {}): LicenseInput {
  return { name: "Microsoft 365", currency: "TRY", ...overrides };
}

async function world() {
  const db = testDb();
  const a = addCompany(db, "A");
  const b = addCompany(db, "B");
  const admin = await addUser(db, "admin", "admin");
  const techA = await addUser(db, "tech-a", "technician", { companyIds: [a], canSeeLicenseKeys: true });
  const pcA = createAsset(db, admin, a, assetInput({ name: "A-PC" }));
  const pcA2 = createAsset(db, admin, a, assetInput({ name: "A-PC-2" }));
  const pcB = createAsset(db, admin, b, assetInput({ name: "B-PC" }));
  return { db, a, b, admin, techA, pcA, pcA2, pcB };
}

describe("license keys", () => {
  it("are stored encrypted and never returned by list or get", async () => {
    const { db, a, admin } = await world();
    const license = createLicense(db, admin, a, input({ key: KEY }));

    const stored = db.select().from(licenses).where(eq(licenses.id, license.id)).get();
    expect(stored?.keyEncrypted).toMatch(/^v1\./);
    expect(stored?.keyEncrypted).not.toContain("XXXXX");

    expect(JSON.stringify([license, listLicenses(db, admin, a), getLicense(db, admin, license.id)])).not.toContain("XXXXX");
    expect(license.hasKey).toBe(true);
    expect(revealLicenseKey(db, admin, license.id)).toBe(KEY);
  });

  it("an empty key on edit keeps the stored one; clearKey removes it; a new key replaces it", async () => {
    const { db, a, admin } = await world();
    const { id } = createLicense(db, admin, a, input({ key: KEY }));

    updateLicense(db, admin, id, input({ name: "Yeni Ad", key: "" }));
    expect(revealLicenseKey(db, admin, id)).toBe(KEY);

    updateLicense(db, admin, id, input({ key: "NEW-KEY" }));
    expect(revealLicenseKey(db, admin, id)).toBe("NEW-KEY");

    const cleared = updateLicense(db, admin, id, input({ clearKey: true }));
    expect(cleared.hasKey).toBe(false);
    expect(revealLicenseKey(db, admin, id)).toBeNull();
  });
});

describe("license isolation between companies", () => {
  it("a technician cannot list, read, reveal, change or assign another company's license", async () => {
    const { db, a, b, admin, techA, pcA } = await world();
    const other = createLicense(db, admin, b, input({ name: "B Lisansı", key: KEY }));
    createLicense(db, admin, a, input({ name: "A Lisansı" }));

    expect(listLicenses(db, techA, a).map((l) => l.name)).toEqual(["A Lisansı"]);
    expect(() => listLicenses(db, techA, b)).toThrow("notFound");
    expect(() => getLicense(db, techA, other.id)).toThrow("notFound");
    expect(() => revealLicenseKey(db, techA, other.id)).toThrow("notFound");
    expect(() => assignLicense(db, techA, other.id, pcA.id)).toThrow("notFound");
    expect(() => listAssignedAssets(db, techA, other.id)).toThrow("notFound");
    expect(getLicense(db, admin, other.id).name).toBe("B Lisansı");
  });

  it("a license cannot be put on another company's device", async () => {
    const { db, a, admin, techA, pcB } = await world();
    const license = createLicense(db, admin, a, input());

    expect(() => assignLicense(db, techA, license.id, pcB.id)).toThrow("invalidAsset");
    expect(() => assignLicense(db, admin, license.id, pcB.id)).toThrow("invalidAsset");
    expect(() => assignLicense(db, admin, license.id, 9999)).toThrow("invalidAsset");
    expect(() => listLicensesForAsset(db, techA, pcB.id)).toThrow("notFound");
  });
});

describe("seats", () => {
  it("counts used seats and refuses to exceed the limit or assign twice", async () => {
    const { db, a, admin, pcA, pcA2 } = await world();
    const { id } = createLicense(db, admin, a, input({ seats: 1 }));

    assignLicense(db, admin, id, pcA.id);
    expect(getLicense(db, admin, id)).toMatchObject({ seats: 1, usedSeats: 1 });
    expect(() => assignLicense(db, admin, id, pcA.id)).toThrow("alreadyAssigned");
    expect(() => assignLicense(db, admin, id, pcA2.id)).toThrow("noSeats");

    unassignLicense(db, admin, id, pcA.id);
    assignLicense(db, admin, id, pcA2.id);
    expect(listAssignedAssets(db, admin, id).map((x) => x.name)).toEqual(["A-PC-2"]);
  });

  it("an unlimited license takes any number of devices", async () => {
    const { db, a, admin, pcA, pcA2 } = await world();
    const { id } = createLicense(db, admin, a, input({ seats: null }));
    assignLicense(db, admin, id, pcA.id);
    assignLicense(db, admin, id, pcA2.id);
    expect(getLicense(db, admin, id).usedSeats).toBe(2);
  });

  it("the seat count cannot be lowered below what is in use", async () => {
    const { db, a, admin, pcA, pcA2 } = await world();
    const { id } = createLicense(db, admin, a, input({ seats: 5 }));
    assignLicense(db, admin, id, pcA.id);
    assignLicense(db, admin, id, pcA2.id);

    expect(() => updateLicense(db, admin, id, input({ seats: 1 }))).toThrow("seatsBelowUsage");
    expect(updateLicense(db, admin, id, input({ seats: 2 })).seats).toBe(2);
  });

  it("deleting a device frees its seat; a device lists its licenses", async () => {
    const { db, a, admin, pcA } = await world();
    const { id } = createLicense(db, admin, a, input({ seats: 1 }));
    assignLicense(db, admin, id, pcA.id);
    expect(listLicensesForAsset(db, admin, pcA.id).map((l) => l.name)).toEqual(["Microsoft 365"]);

    deleteAsset(db, admin, pcA.id);
    expect(getLicense(db, admin, id).usedSeats).toBe(0);
  });
});

describe("license management", () => {
  it("an admin creates and deletes; a technician assigns", async () => {
    const { db, a, admin, techA, pcA } = await world();
    const license = createLicense(db, admin, a, input({ vendor: "Microsoft", cost: 125050, expiryDate: "2027-01-31" }));
    expect(license).toMatchObject({ vendor: "Microsoft", costMinor: 125050, currency: "TRY", expiryDate: "2027-01-31" });

    assignLicense(db, techA, license.id, pcA.id);
    expect(() => deleteLicense(db, techA, license.id)).toThrow("forbidden");
    deleteLicense(db, admin, license.id);
    expect(() => getLicense(db, admin, license.id)).toThrow("notFound");
    expect(listLicensesForAsset(db, admin, pcA.id)).toEqual([]);
  });

  it("searches by name and vendor", async () => {
    const { db, a, admin } = await world();
    createLicense(db, admin, a, input({ name: "Office 2021", vendor: "Microsoft" }));
    createLicense(db, admin, a, input({ name: "AutoCAD", vendor: "Autodesk" }));

    expect(listLicenses(db, admin, a, "micro").map((l) => l.name)).toEqual(["Office 2021"]);
    expect(listLicenses(db, admin, a, "auto").map((l) => l.name)).toEqual(["AutoCAD"]);
    expect(listLicenses(db, admin, a, "%")).toEqual([]);
  });
});

describe("license input validation", () => {
  const parse = (extra: Record<string, unknown>) => schema.safeParse({ name: "X", ...extra });

  it("reads money in Turkish and plain formats into minor units", () => {
    const cost = (v: string) => schema.parse({ name: "X", cost: v }).cost;
    expect(cost("1250")).toBe(125000);
    expect(cost("1250,5")).toBe(125050);
    expect(cost("1.250,50")).toBe(125050);
    expect(cost("1250.50")).toBe(125050);
    expect(cost("0,07")).toBe(7);
    expect(cost("")).toBeNull();
    expect(parse({ cost: "12,345" }).success).toBe(false);
    expect(parse({ cost: "abc" }).success).toBe(false);
    expect(parse({ cost: "-5" }).success).toBe(false);
  });

  it("reads seats: empty is unlimited, otherwise a whole number from 1", () => {
    expect(schema.parse({ name: "X", seats: "" }).seats).toBeNull();
    expect(schema.parse({ name: "X", seats: "25" }).seats).toBe(25);
    expect(parse({ seats: "0" }).success).toBe(false);
    expect(parse({ seats: "2.5" }).success).toBe(false);
    expect(parse({ seats: "-1" }).success).toBe(false);
  });

  it("defaults the currency and rejects an unknown one", () => {
    expect(schema.parse({ name: "X" }).currency).toBe("TRY");
    expect(parse({ currency: "GBP" }).success).toBe(false);
  });
});

describe("Turkish search and order for licenses (QA O2, O3)", () => {
  it("finds and sorts licenses the Turkish way, and lists assigned devices in order", async () => {
    const { db, a, admin } = await world();
    for (const name of ["TeamViewer", "TEST lisansı", "Çizim Programı", "İş Takibi", "antivirüs"]) createLicense(db, admin, a, input({ name }));
    const order = listLicenses(db, admin, a).map((l) => l.name);
    expect(order).toEqual(["antivirüs", "Çizim Programı", "İş Takibi", "TeamViewer", "TEST lisansı"]);
    expect(listLicenses(db, admin, a, "iş takibi").map((l) => l.name)).toEqual(["İş Takibi"]);
    expect(listLicenses(db, admin, a, "ANTIVIRUS").map((l) => l.name)).toEqual(["antivirüs"]);

    const license = createLicense(db, admin, a, input({ name: "Ofis" }));
    for (const name of ["Zirve PC", "Üretim PC", "Çağrı PC"]) assignLicense(db, admin, license.id, createAsset(db, admin, a, assetInput({ name })).id);
    expect(listAssignedAssets(db, admin, license.id).map((x) => x.name)).toEqual(["Çağrı PC", "Üretim PC", "Zirve PC"]);
  });
});

describe("expiry filter (QA O9)", () => {
  it("lists licenses expiring within 30 days or already expired", async () => {
    const { db, a, admin } = await world();
    for (const [name, expiryDate] of [
      ["Bugün", "2026-06-01"],
      ["Ay Sonu", "2026-07-01"],
      ["Uzak", "2026-09-01"],
      ["Geçen Ay", "2026-05-01"],
      ["Süresiz", null],
    ] as const) {
      createLicense(db, admin, a, input({ name, expiryDate }));
    }
    const list = (expiry: "soon" | "expired") => listLicenses(db, admin, a, "", expiry, "2026-06-01").map((l) => l.name);
    expect(list("soon")).toEqual(["Ay Sonu", "Bugün"]);
    expect(list("expired")).toEqual(["Geçen Ay"]);
  });
});
