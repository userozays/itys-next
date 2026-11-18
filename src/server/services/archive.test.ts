import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createSession, getSessionActor } from "../auth/sessions";
import { userCompanies, users } from "../db/schema";
import { addCompany, addUser, assetInput, testDb } from "../testing/fixtures";
import { createAsset, listAssets } from "./assets";
import { companyRecordCounts, deleteCompany, listCompanies, resolveActiveCompany } from "./companies";
import { createLicense } from "./licenses";
import { createLocation } from "./locations";
import { deleteUser, listUsers } from "./users";

describe("inactive companies (QA Ö7)", () => {
  it("an admin can work in one and see its records; a technician cannot", async () => {
    const db = testDb();
    const open = addCompany(db, "Açık");
    const closed = addCompany(db, "Kapalı", false);
    const admin = await addUser(db, "admin", "admin");
    const tech = await addUser(db, "tech", "technician", { companyIds: [open, closed] });
    createAsset(db, admin, closed, assetInput({ name: "Arşiv PC" }));

    expect(resolveActiveCompany(db, admin, closed)?.id).toBe(closed);
    expect(listAssets(db, admin, closed).rows.map((r) => r.name)).toEqual(["Arşiv PC"]);
    expect(resolveActiveCompany(db, tech, closed)?.id).toBe(open);
    expect(() => listAssets(db, tech, closed)).toThrow("notFound");
  });
});

describe("deleting companies (QA Ö8)", () => {
  it("deletes an empty company with its technician assignments", async () => {
    const db = testDb();
    const keep = addCompany(db, "Kalan");
    const mistake = addCompany(db, "Yanlış Şirket");
    const admin = await addUser(db, "admin", "admin");
    const tech = await addUser(db, "tech", "technician", { companyIds: [keep, mistake] });

    deleteCompany(db, admin, mistake);

    expect(listCompanies(db, admin).map((c) => c.name)).toEqual(["Kalan"]);
    expect(db.select().from(userCompanies).where(eq(userCompanies.userId, tech.id)).all().map((r) => r.companyId)).toEqual([keep]);
  });

  it.each(["device", "license", "location"] as const)("refuses a company that has a %s", async (kind) => {
    const db = testDb();
    const a = addCompany(db, "A");
    const admin = await addUser(db, "admin", "admin");
    if (kind === "device") createAsset(db, admin, a, assetInput());
    if (kind === "license") createLicense(db, admin, a, { name: "Office", currency: "TRY" });
    if (kind === "location") createLocation(db, admin, a, { name: "Depo" });

    expect(companyRecordCounts(db, admin).get(a)).toBe(1);
    expect(() => deleteCompany(db, admin, a)).toThrow("companyHasRecords");
    expect(listCompanies(db, admin)).toHaveLength(1);
  });

  it("is for admins only", async () => {
    const db = testDb();
    const a = addCompany(db, "A");
    const tech = await addUser(db, "tech", "technician", { companyIds: [a] });
    expect(() => deleteCompany(db, tech, a)).toThrow("forbidden");
    expect(() => companyRecordCounts(db, tech)).toThrow("forbidden");
  });
});

describe("deleting users (QA Ö8)", () => {
  it("removes the account and signs it out everywhere", async () => {
    const db = testDb();
    const a = addCompany(db, "A");
    const admin = await addUser(db, "admin", "admin");
    const tech = await addUser(db, "tech", "technician", { companyIds: [a] });
    const token = createSession(db, tech.id);

    deleteUser(db, admin, tech.id);

    expect(listUsers(db, admin).map((u) => u.username)).toEqual(["admin"]);
    expect(getSessionActor(db, token)).toBeNull();
  });

  it("never deletes yourself or the last active admin", async () => {
    const db = testDb();
    const admin = await addUser(db, "admin", "admin");
    const other = await addUser(db, "admin2", "admin");
    expect(() => deleteUser(db, admin, admin.id)).toThrow("cannotDeleteSelf");

    deleteUser(db, admin, other.id); // another admin remains (the actor)
    const inactiveAdmin = await addUser(db, "old-admin", "admin", { active: false });
    deleteUser(db, admin, inactiveAdmin.id);
    expect(db.select().from(users).all().map((u) => u.username)).toEqual(["admin"]);

    const tech = await addUser(db, "tech", "technician");
    expect(() => deleteUser(db, tech, admin.id)).toThrow("forbidden");
  });
});
