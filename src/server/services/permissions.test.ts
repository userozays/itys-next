import { describe, expect, it } from "vitest";
import messages from "../../../messages/tr.json";
import { createSession, getSessionActor } from "../auth/sessions";
import { licenseSheet } from "../export/rows";
import { addCompany, addUser, assetInput, testDb } from "../testing/fixtures";
import { newUserInput } from "../validation";
import { createAsset, listAssets, listAssetsForExport, listAssetsForLabels, updateAsset } from "./assets";
import { createImportJob } from "./imports";
import {
  assignLicense,
  createLicense,
  getLicense,
  licenseSummary,
  listLicenses,
  listLicensesForAsset,
  revealLicenseKey,
  unassignLicense,
  updateLicense,
} from "./licenses";
import { createLocation, listLocations, renameLocation } from "./locations";
import { createUser, listUsers, updateUser } from "./users";

const t = (key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages) as string;

async function world() {
  const db = testDb();
  const a = addCompany(db, "A");
  const admin = await addUser(db, "admin", "admin");
  const tech = await addUser(db, "tech", "technician", { companyIds: [a] });
  const keyTech = await addUser(db, "key-tech", "technician", { companyIds: [a], canSeeLicenseKeys: true });
  const viewer = await addUser(db, "viewer", "viewer", { companyIds: [a] });
  const pc = createAsset(db, admin, a, assetInput({ name: "PC" }));
  const location = createLocation(db, admin, a, { name: "Depo" });
  const license = createLicense(db, admin, a, { name: "Office", currency: "TRY", key: "SECRET-KEY", cost: 120000, seats: 5 });
  return { db, a, admin, tech, keyTech, viewer, pc, location, license };
}

describe("viewer role", () => {
  it("reads everything in its companies, exports included", async () => {
    const { db, a, viewer } = await world();
    expect(listAssets(db, viewer, a).rows.map((r) => r.name)).toEqual(["PC"]);
    expect(listAssetsForExport(db, viewer, a).rows).toHaveLength(1);
    expect(listLocations(db, viewer, a).map((l) => l.name)).toEqual(["Depo"]);
    expect(listLicenses(db, viewer, a).map((l) => l.name)).toEqual(["Office"]);
  });

  it("changes nothing", async () => {
    const { db, a, viewer, pc, location, license } = await world();
    expect(() => createAsset(db, viewer, a, assetInput())).toThrow("forbidden");
    expect(() => updateAsset(db, viewer, pc.id, assetInput({ name: "X" }))).toThrow("forbidden");
    expect(() => createLocation(db, viewer, a, { name: "Ofis" })).toThrow("forbidden");
    expect(() => renameLocation(db, viewer, location.id, { name: "Ofis" })).toThrow("forbidden");
    expect(() => createImportJob(db, viewer, a, "x.csv", { headers: ["Ad"], rows: [["PC"]] })).toThrow("forbidden");
    expect(() => listAssetsForLabels(db, viewer, a)).toThrow("forbidden");
    expect(() => assignLicense(db, viewer, license.id, pc.id)).toThrow("forbidden");
    expect(() => unassignLicense(db, viewer, license.id, pc.id)).toThrow("forbidden");
    expect(() => createLicense(db, viewer, a, { name: "X", currency: "TRY" })).toThrow("forbidden");
    expect(() => revealLicenseKey(db, viewer, license.id)).toThrow("forbidden");
  });
});

describe("technician role", () => {
  it("works on devices and puts licenses on them, but does not add or edit licenses", async () => {
    const { db, a, tech, pc, license } = await world();
    createAsset(db, tech, a, assetInput({ name: "Yeni PC" }));
    assignLicense(db, tech, license.id, pc.id);
    expect(getLicense(db, tech, license.id).usedSeats).toBe(1);
    expect(() => createLicense(db, tech, a, { name: "X", currency: "TRY" })).toThrow("forbidden");
    expect(() => updateLicense(db, tech, license.id, { name: "X", currency: "TRY" })).toThrow("forbidden");
  });

  it("reads license keys only with the exception", async () => {
    const { db, tech, keyTech, admin, license } = await world();
    expect(() => revealLicenseKey(db, tech, license.id)).toThrow("forbidden");
    expect(revealLicenseKey(db, keyTech, license.id)).toBe("SECRET-KEY");
    expect(revealLicenseKey(db, admin, license.id)).toBe("SECRET-KEY");
  });
});

describe("costs", () => {
  it("are left out for everyone but admins, in lists, details and the summary", async () => {
    const { db, a, admin, tech, viewer, pc, license } = await world();
    assignLicense(db, admin, license.id, pc.id);
    for (const actor of [tech, viewer]) {
      expect(getLicense(db, actor, license.id).costMinor).toBeNull();
      expect(listLicenses(db, actor, a)[0]!.costMinor).toBeNull();
      expect(listLicensesForAsset(db, actor, pc.id)[0]!.costMinor).toBeNull();
      expect(licenseSummary(db, actor, a)).toMatchObject({ count: 1, yearlySubscriptions: {}, perpetualPurchases: {} });
    }
    expect(getLicense(db, admin, license.id).costMinor).toBe(120000);
    expect(licenseSummary(db, admin, a).yearlySubscriptions).toEqual({ TRY: 120000 });
  });

  it("are not columns of the license export without them", async () => {
    const { db, a, tech } = await world();
    const sheet = licenseSheet(listLicenses(db, tech, a), t, "Lisanslar", false);
    expect(sheet.headers).not.toContain(t("licenses.cost"));
    expect(sheet.headers).not.toContain(t("licenses.currency"));
    expect(sheet.rows[0]).toHaveLength(sheet.headers.length);
  });
});

describe("users and roles", () => {
  it("a viewer needs a company, like a technician", () => {
    const base = { username: "izleyici", name: "İzleyici", password: "kuzey-rüzgarı-2026", role: "viewer" };
    expect(newUserInput.safeParse({ ...base, companyIds: [] }).success).toBe(false);
    expect(newUserInput.safeParse({ ...base, companyIds: [1] }).success).toBe(true);
  });

  it("keeps the key exception for technicians only", async () => {
    const { db, a, admin } = await world();
    const id = await createUser(db, admin, {
      username: "deniz",
      name: "Deniz",
      password: "kuzey-rüzgarı-2026",
      role: "viewer",
      companyIds: [a],
      canSeeLicenseKeys: true,
    });
    const row = () => listUsers(db, admin).find((u) => u.id === id)!;
    expect(row()).toMatchObject({ role: "viewer", canSeeLicenseKeys: false, companyIds: [a] });

    updateUser(db, admin, id, { name: "Deniz", role: "technician", active: true, companyIds: [a], canSeeLicenseKeys: true });
    expect(row()).toMatchObject({ role: "technician", canSeeLicenseKeys: true });

    updateUser(db, admin, id, { name: "Deniz", role: "admin", active: true, companyIds: [], canSeeLicenseKeys: true });
    expect(row()).toMatchObject({ role: "admin", canSeeLicenseKeys: false, companyIds: [] });
  });

  it("the signed-in user carries the exception, so a change applies on the next request", async () => {
    const { db, a, admin, tech } = await world();
    const token = createSession(db, tech.id);
    expect(getSessionActor(db, token)?.canSeeLicenseKeys).toBe(false);
    updateUser(db, admin, tech.id, { name: "tech", role: "technician", active: true, companyIds: [a], canSeeLicenseKeys: true });
    expect(getSessionActor(db, token)?.canSeeLicenseKeys).toBe(true);
  });
});
