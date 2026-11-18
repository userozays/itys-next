import { describe, expect, it } from "vitest";
import { addCompany, addUser, testDb } from "../testing/fixtures";
import { createCompany, getCompany, listCompanies, resolveActiveCompany, updateCompany } from "./companies";

async function world() {
  const db = testDb();
  const a = addCompany(db, "A Şirketi");
  const b = addCompany(db, "B Şirketi");
  const closed = addCompany(db, "Kapalı Şirket", false);
  const admin = await addUser(db, "admin", "admin");
  const techA = await addUser(db, "tech-a", "technician", { companyIds: [a, closed] });
  const techNone = await addUser(db, "tech-none");
  return { db, a, b, closed, admin, techA, techNone };
}

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe("company isolation", () => {
  it("admin sees every company, including inactive ones", async () => {
    const { db, admin } = await world();
    expect(names(listCompanies(db, admin))).toEqual(["A Şirketi", "B Şirketi", "Kapalı Şirket"]);
  });

  it("technician sees only assigned, active companies", async () => {
    const { db, techA, techNone } = await world();
    expect(names(listCompanies(db, techA))).toEqual(["A Şirketi"]);
    expect(listCompanies(db, techNone)).toEqual([]);
  });

  it("technician cannot open a company they are not assigned to", async () => {
    const { db, a, b, closed, techA } = await world();
    expect(getCompany(db, techA, a).name).toBe("A Şirketi");
    expect(() => getCompany(db, techA, b)).toThrow("notFound");
    expect(() => getCompany(db, techA, closed)).toThrow("notFound");
  });

  it("technician cannot create or change companies", async () => {
    const { db, a, techA } = await world();
    expect(() => createCompany(db, techA, { name: "Yeni", active: true })).toThrow("forbidden");
    expect(() => updateCompany(db, techA, a, { name: "Ele Geçirildi", active: true })).toThrow("forbidden");
    expect(getCompany(db, techA, a).name).toBe("A Şirketi");
  });

  it("active company falls back when the preferred one is not accessible", async () => {
    const { db, a, b, closed, admin, techA, techNone } = await world();
    expect(resolveActiveCompany(db, techA, b)?.id).toBe(a);
    expect(resolveActiveCompany(db, techA, null)?.id).toBe(a);
    expect(resolveActiveCompany(db, techNone, a)).toBeNull();
    expect(resolveActiveCompany(db, admin, b)?.id).toBe(b);
    expect(resolveActiveCompany(db, admin, closed)?.id).toBe(closed); // admins may open an inactive company (QA Ö7)
  });
});

describe("company order", () => {
  it("follows the Turkish alphabet", async () => {
    const db = testDb();
    for (const name of ["Zirve", "Çınar", "Işık", "İnci", "Hisar", "Şahin", "Ege", "Öz", "Ulu", "Ünal"]) addCompany(db, name);
    const admin = await addUser(db, "admin", "admin");
    expect(names(listCompanies(db, admin))).toEqual(["Çınar", "Ege", "Hisar", "Işık", "İnci", "Öz", "Şahin", "Ulu", "Ünal", "Zirve"]);
  });
});

describe("company management", () => {
  it("admin creates and updates a company", async () => {
    const { db, admin } = await world();
    const created = createCompany(db, admin, { name: "Yeni Ltd.", contact: "Ali Veli", active: true });
    const updated = updateCompany(db, admin, created.id, { name: "Yeni A.Ş.", contact: null, active: false });

    expect(updated).toMatchObject({ id: created.id, name: "Yeni A.Ş.", contact: null, active: false });
  });

  it("rejects a duplicate name on create and on rename", async () => {
    const { db, b, admin } = await world();
    expect(() => createCompany(db, admin, { name: "A Şirketi", active: true })).toThrow("companyNameTaken");
    expect(() => updateCompany(db, admin, b, { name: "A Şirketi", active: true })).toThrow("companyNameTaken");
  });

  it("reports a missing company", async () => {
    const { db, admin } = await world();
    expect(() => updateCompany(db, admin, 9999, { name: "Yok", active: true })).toThrow("notFound");
  });
});
