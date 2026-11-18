import { describe, expect, it } from "vitest";
import { addCompany, addUser, assetInput, PASSWORD, testDb } from "../testing/fixtures";
import { companyInput, firstAdminInput, newUserInput, userUpdateInput } from "../validation";
import { createAsset, listAssetOptions, listAssets } from "./assets";
import { createImportJob, previewImport } from "./imports";
import { assignLicense, createLicense } from "./licenses";
import { createUser, listUsers, updateUser } from "./users";

const messagesOf = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.success ? [] : result.error!.issues.map((i) => `${String(i.path[0])}:${i.message}`);

describe("sorting (QA D6, D7)", () => {
  it("puts devices without a warranty date last in both directions", async () => {
    const db = testDb();
    const a = addCompany(db, "A");
    const admin = await addUser(db, "admin", "admin");
    createAsset(db, admin, a, assetInput({ name: "Yok" }));
    createAsset(db, admin, a, assetInput({ name: "Erken", warrantyEnd: "2026-01-01" }));
    createAsset(db, admin, a, assetInput({ name: "Geç", warrantyEnd: "2028-01-01" }));

    const names = (dir: "asc" | "desc") => listAssets(db, admin, a, { sort: "warrantyEnd", dir }).rows.map((r) => r.name);
    expect(names("asc")).toEqual(["Erken", "Geç", "Yok"]);
    expect(names("desc")).toEqual(["Geç", "Erken", "Yok"]);
  });

  it("sorts status as in use → in stock → in repair → retired, and type in list order", async () => {
    const db = testDb();
    const a = addCompany(db, "A");
    const admin = await addUser(db, "admin", "admin");
    createAsset(db, admin, a, assetInput({ name: "1", status: "retired", type: "phone" }));
    createAsset(db, admin, a, assetInput({ name: "2", status: "in_repair", type: "computer" }));
    createAsset(db, admin, a, assetInput({ name: "3", status: "in_use", type: "server" }));
    createAsset(db, admin, a, assetInput({ name: "4", status: "in_stock", type: "laptop" }));

    const statuses = listAssets(db, admin, a, { sort: "status" }).rows.map((r) => r.status);
    expect(statuses).toEqual(["in_use", "in_stock", "in_repair", "retired"]);
    const types = listAssets(db, admin, a, { sort: "type", dir: "desc" }).rows.map((r) => r.type);
    expect(types).toEqual(["phone", "server", "laptop", "computer"]);
  });
});

describe("license assignment (QA D4, D5)", () => {
  it("leaves retired devices out of the choices and refuses them", async () => {
    const db = testDb();
    const a = addCompany(db, "A");
    const admin = await addUser(db, "admin", "admin");
    const live = createAsset(db, admin, a, assetInput({ name: "Çalışan" }));
    const retired = createAsset(db, admin, a, assetInput({ name: "Hurda", status: "retired" }));
    const license = createLicense(db, admin, a, { name: "Office", currency: "TRY" });

    expect(listAssetOptions(db, admin, a).map((o) => [o.name, o.type])).toEqual([["Çalışan", "computer"]]);
    expect(() => assignLicense(db, admin, license.id, retired.id)).toThrow("retiredAsset");
    expect(() => assignLicense(db, admin, license.id, 0)).toThrow("chooseAsset");
    assignLicense(db, admin, license.id, live.id);
  });
});

describe("technicians and companies (QA D8)", () => {
  it("requires at least one company for a technician, not for an admin", () => {
    const base = { username: "tech", name: "T", password: PASSWORD, companyIds: [] };
    expect(messagesOf(newUserInput.safeParse({ ...base, role: "technician" }))).toEqual(["companyIds:technicianCompany"]);
    expect(newUserInput.safeParse({ ...base, role: "admin" }).success).toBe(true);
    expect(messagesOf(userUpdateInput.safeParse({ name: "T", role: "technician", active: true, companyIds: [] }))).toEqual([
      "companyIds:technicianCompany",
    ]);
  });

  it("shows the missing company together with other errors", () => {
    const result = newUserInput.safeParse({ username: "x", name: "", password: PASSWORD, role: "technician", companyIds: [] });
    expect(messagesOf(result)).toEqual(["username:username", "name:required", "companyIds:technicianCompany"]);
  });

  it("does not assign an inactive company, but keeps one the technician already has", async () => {
    const db = testDb();
    const active = addCompany(db, "Aktif");
    const old = addCompany(db, "Eski", false);
    const admin = await addUser(db, "admin", "admin");
    const user = { username: "tech", name: "T", password: PASSWORD, role: "technician" as const };

    await expect(createUser(db, admin, { ...user, companyIds: [old] })).rejects.toThrow("inactiveCompany");

    const tech = await addUser(db, "tech2", "technician", { companyIds: [active, old] });
    updateUser(db, admin, tech.id, { name: "T2", role: "technician", active: true, companyIds: [active, old] });
    expect(listUsers(db, admin).find((u) => u.id === tech.id)?.companyIds.sort()).toEqual([active, old].sort());
  });
});

describe("passwords (QA D9)", () => {
  it("rejects easy passwords and ones containing the username", () => {
    const user = { username: "ayse.k", name: "Ayşe", role: "admin", companyIds: [] };
    expect(messagesOf(newUserInput.safeParse({ ...user, password: "1111111111" }))).toEqual(["password:passwordWeak"]);
    expect(messagesOf(newUserInput.safeParse({ ...user, password: "AYSE.K-2026-bahar" }))).toEqual([
      "password:passwordHasUsername",
    ]);
    expect(messagesOf(firstAdminInput.safeParse({ username: "admin", name: "Y", password: "qwertyuiop" }))).toEqual([
      "password:passwordWeak",
    ]);
    expect(newUserInput.safeParse({ ...user, password: PASSWORD }).success).toBe(true);
  });
});

describe("company phone (QA D10)", () => {
  it.each(["+90 (212) 555 12 34", "0212-555-1234 / 102", "444 0 123"])("accepts %s", (phone) => {
    expect(companyInput.safeParse({ name: "A", phone }).success).toBe(true);
  });

  it.each(["abc-telefon-<b>", "12", "0212 555 12 34 dahili"])("rejects %s", (phone) => {
    expect(messagesOf(companyInput.safeParse({ name: "A", phone }))).toEqual(["phone:phone"]);
  });
});

describe("import rows list every problem (QA D11)", () => {
  it("reports a taken tag together with a bad IP address", async () => {
    const db = testDb();
    const a = addCompany(db, "A");
    const admin = await addUser(db, "admin", "admin");
    createAsset(db, admin, a, assetInput({ tag: "PC-1", serial: "SN-12345", macAddress: "00:1A:2B:3C:4D:5E" }));
    const headers = ["Etiket No", "Cihaz Adı", "IP Adresi", "Seri No", "MAC Adresi"];
    const rows = [["pc-1", "Kopya", "999.1.1.1", "sn-12345", "001a2b3c4d5e"]];
    const jobId = createImportJob(db, admin, a, "c.csv", { headers, rows });

    expect(previewImport(db, admin, jobId).skipped).toEqual([
      {
        row: 2,
        issues: [
          { field: "ipAddress", code: "ip" },
          { field: "tag", code: "tagTaken" },
          { field: "serial", code: "serialTaken" },
          { field: "macAddress", code: "macTaken" },
        ],
      },
    ]);
  });
});
