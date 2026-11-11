import { describe, expect, it } from "vitest";
import { addCompany, addUser, assetInput, testDb } from "../testing/fixtures";
import { assetInput as schema } from "../validation";
import { assetSummary, createAsset, deleteAsset, findModelSpecs, getAsset, listAssets, PAGE_SIZE, updateAsset } from "./assets";
import { createLocation, deleteLocation, listLocations, renameLocation } from "./locations";

async function world() {
  const db = testDb();
  const a = addCompany(db, "A");
  const b = addCompany(db, "B");
  const admin = await addUser(db, "admin", "admin");
  const techA = await addUser(db, "tech-a", "technician", { companyIds: [a] });
  const techB = await addUser(db, "tech-b", "technician", { companyIds: [b] });
  return { db, a, b, admin, techA, techB };
}

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe("asset isolation between companies", () => {
  it("a technician lists only their own company's assets", async () => {
    const { db, a, b, admin, techA } = await world();
    createAsset(db, admin, a, assetInput({ name: "A-PC" }));
    createAsset(db, admin, b, assetInput({ name: "B-PC" }));

    expect(names(listAssets(db, techA, a).rows)).toEqual(["A-PC"]);
    expect(() => listAssets(db, techA, b)).toThrow("notFound");
    expect(() => assetSummary(db, techA, b)).toThrow("notFound");
  });

  it("a technician cannot read, create, change or delete another company's asset", async () => {
    const { db, b, admin, techA } = await world();
    const other = createAsset(db, admin, b, assetInput({ name: "B-PC" }));

    expect(() => getAsset(db, techA, other.id)).toThrow("notFound");
    expect(() => createAsset(db, techA, b, assetInput())).toThrow("notFound");
    expect(() => updateAsset(db, techA, other.id, assetInput({ name: "Ele Geçirildi" }))).toThrow("notFound");
    expect(() => deleteAsset(db, techA, other.id)).toThrow("forbidden");
    expect(getAsset(db, admin, other.id).name).toBe("B-PC");
  });

  it("an asset cannot be placed in another company's location", async () => {
    const { db, a, b, admin, techA } = await world();
    const foreign = createLocation(db, admin, b, { name: "B Deposu" });
    const own = createAsset(db, techA, a, assetInput());

    expect(() => createAsset(db, techA, a, assetInput({ locationId: foreign.id }))).toThrow("invalidLocation");
    expect(() => updateAsset(db, techA, own.id, assetInput({ locationId: foreign.id }))).toThrow("invalidLocation");
  });

  it("locations are isolated too", async () => {
    const { db, a, b, admin, techA } = await world();
    const foreign = createLocation(db, admin, b, { name: "B Deposu" });
    createLocation(db, techA, a, { name: "A Ofisi" });

    expect(names(listLocations(db, techA, a))).toEqual(["A Ofisi"]);
    expect(() => listLocations(db, techA, b)).toThrow("notFound");
    expect(() => createLocation(db, techA, b, { name: "Sızma" })).toThrow("notFound");
    expect(() => renameLocation(db, techA, foreign.id, { name: "Sızma" })).toThrow("notFound");
  });
});

describe("asset tags", () => {
  it("generates D-0001, D-0002… per company and skips taken numbers", async () => {
    const { db, a, b, admin } = await world();
    expect(createAsset(db, admin, a, assetInput()).tag).toBe("D-0001");
    createAsset(db, admin, a, assetInput({ tag: "D-0003" }));
    expect(createAsset(db, admin, a, assetInput()).tag).toBe("D-0004");
    expect(createAsset(db, admin, b, assetInput()).tag).toBe("D-0001");
  });

  it("rejects a duplicate tag inside a company but allows it across companies", async () => {
    const { db, a, b, admin } = await world();
    const first = createAsset(db, admin, a, assetInput({ tag: "PC-1" }));
    const second = createAsset(db, admin, a, assetInput({ tag: "PC-2" }));

    expect(() => createAsset(db, admin, a, assetInput({ tag: "PC-1" }))).toThrow("tagTaken");
    expect(() => updateAsset(db, admin, second.id, assetInput({ tag: "PC-1" }))).toThrow("tagTaken");
    expect(createAsset(db, admin, b, assetInput({ tag: "PC-1" })).tag).toBe("PC-1");
    expect(updateAsset(db, admin, first.id, assetInput({ tag: null })).tag).toBe("PC-1");
  });
});

describe("asset list", () => {
  async function inventory() {
    const w = await world();
    const { db, a, admin } = w;
    const office = createLocation(db, admin, a, { name: "Ofis" });
    createAsset(db, admin, a, assetInput({ name: "Muhasebe PC", brand: "Dell", serial: "SN-100", locationId: office.id, warrantyEnd: "2027-01-01" }));
    createAsset(db, admin, a, assetInput({ name: "Yazıcı", type: "printer", brand: "HP", status: "in_repair", warrantyEnd: "2026-06-01" }));
    createAsset(db, admin, a, assetInput({ name: "Sunucu", type: "server", assignedTo: "Ali Veli", status: "in_stock" }));
    return { ...w, office };
  }

  it("searches tag, name, brand, serial and assignee, treating % and _ literally", async () => {
    const { db, a, admin } = await inventory();
    const search = (q: string) => names(listAssets(db, admin, a, { q }).rows);

    expect(search("dell")).toEqual(["Muhasebe PC"]);
    expect(search("SN-1")).toEqual(["Muhasebe PC"]);
    expect(search("ali")).toEqual(["Sunucu"]);
    expect(search("D-0002")).toEqual(["Yazıcı"]);
    expect(search("%")).toEqual([]);
    expect(search("_")).toEqual([]);
  });

  it("filters by type, status and location, and includes the location name", async () => {
    const { db, a, admin, office } = await inventory();
    expect(names(listAssets(db, admin, a, { type: "printer" }).rows)).toEqual(["Yazıcı"]);
    expect(names(listAssets(db, admin, a, { status: "in_stock" }).rows)).toEqual(["Sunucu"]);

    const inOffice = listAssets(db, admin, a, { locationId: office.id }).rows;
    expect(inOffice).toHaveLength(1);
    expect(inOffice[0].locationName).toBe("Ofis");
  });

  it("sorts by the requested column and direction", async () => {
    const { db, a, admin } = await inventory();
    expect(names(listAssets(db, admin, a).rows)).toEqual(["Muhasebe PC", "Sunucu", "Yazıcı"]);
    expect(names(listAssets(db, admin, a, { sort: "name", dir: "desc" }).rows)).toEqual(["Yazıcı", "Sunucu", "Muhasebe PC"]);
    expect(names(listAssets(db, admin, a, { sort: "warrantyEnd", dir: "desc" }).rows)[0]).toBe("Muhasebe PC");
  });

  it("pages 25 at a time and clamps an out-of-range page", async () => {
    const { db, a, admin } = await world();
    for (let i = 1; i <= PAGE_SIZE + 5; i++) createAsset(db, admin, a, assetInput({ name: `PC ${String(i).padStart(2, "0")}` }));

    const first = listAssets(db, admin, a);
    expect(first).toMatchObject({ total: 30, page: 1, pageCount: 2 });
    expect(first.rows).toHaveLength(PAGE_SIZE);

    const beyond = listAssets(db, admin, a, { page: 99 });
    expect(beyond.page).toBe(2);
    expect(names(beyond.rows)).toEqual(["PC 26", "PC 27", "PC 28", "PC 29", "PC 30"]);
  });

  it("summarises counts by type and status", async () => {
    const { db, a, b, admin } = await inventory();
    createAsset(db, admin, b, assetInput());

    expect(assetSummary(db, admin, a)).toEqual({
      total: 3,
      byType: { computer: 1, printer: 1, server: 1 },
      byStatus: { in_use: 1, in_repair: 1, in_stock: 1 },
    });
  });
});

describe("asset changes", () => {
  it("a technician creates and edits; only an admin deletes", async () => {
    const { db, a, admin, techA } = await world();
    const asset = createAsset(db, techA, a, assetInput({ name: "Eski Ad" }));
    const updated = updateAsset(db, techA, asset.id, assetInput({ name: "Yeni Ad", status: "retired" }));

    expect(updated).toMatchObject({ name: "Yeni Ad", status: "retired", companyId: a, source: "manual" });
    expect(() => deleteAsset(db, techA, asset.id)).toThrow("forbidden");
    deleteAsset(db, admin, asset.id);
    expect(() => getAsset(db, admin, asset.id)).toThrow("notFound");
  });

  it("deleting a location keeps its assets and clears their location", async () => {
    const { db, a, admin, techA } = await world();
    const office = createLocation(db, admin, a, { name: "Ofis" });
    const asset = createAsset(db, admin, a, assetInput({ locationId: office.id }));
    expect(listLocations(db, admin, a)[0].assetCount).toBe(1);

    expect(() => deleteLocation(db, techA, office.id)).toThrow("forbidden");
    deleteLocation(db, admin, office.id);

    expect(getAsset(db, admin, asset.id)).toMatchObject({ locationId: null, locationName: null });
  });

  it("location names are unique within a company only", async () => {
    const { db, a, b, admin } = await world();
    const depo = createLocation(db, admin, a, { name: "Depo" });
    createLocation(db, admin, a, { name: "Ofis" });

    expect(() => createLocation(db, admin, a, { name: "Depo" })).toThrow("locationNameTaken");
    expect(() => renameLocation(db, admin, depo.id, { name: "Ofis" })).toThrow("locationNameTaken");
    expect(createLocation(db, admin, b, { name: "Depo" }).name).toBe("Depo");
  });
});

describe("asset input validation", () => {
  const base = { name: "PC", type: "computer", status: "in_use" };

  it("turns blank optional fields into null and trims text", () => {
    const parsed = schema.parse({ ...base, name: "  PC  ", tag: "", brand: " ", warrantyEnd: "" });
    expect(parsed).toMatchObject({ name: "PC", tag: null, brand: null, warrantyEnd: null });
  });

  it("rejects bad tags, dates, types and an empty name", () => {
    expect(schema.safeParse({ ...base, tag: "has space" }).success).toBe(false);
    expect(schema.safeParse({ ...base, warrantyEnd: "01.02.2026" }).success).toBe(false);
    expect(schema.safeParse({ ...base, warrantyEnd: "2026-13-45" }).success).toBe(false);
    expect(schema.safeParse({ ...base, type: "spaceship" }).success).toBe(false);
    expect(schema.safeParse({ ...base, name: "  " }).success).toBe(false);
  });
});

describe("technical specifications", () => {
  it("are stored, returned, and searchable by computer name and IP", async () => {
    const { db, a, admin } = await world();
    const pc = createAsset(
      db,
      admin,
      a,
      assetInput({ cpu: "Intel Core i5-13500", ramGb: 16, storage: "512 GB SSD", os: "Windows 11 Pro", hostname: "MUHASEBE-01", ipAddress: "192.168.1.21", macAddress: "00:1A:2B:3C:4D:5E" }),
    );
    createAsset(db, admin, a, assetInput({ name: "Diğer PC", ipAddress: "192.168.1.22" }));

    expect(getAsset(db, admin, pc.id)).toMatchObject({ cpu: "Intel Core i5-13500", ramGb: 16, storage: "512 GB SSD", os: "Windows 11 Pro", hostname: "MUHASEBE-01" });
    expect(names(listAssets(db, admin, a, { q: "muhasebe-01" }).rows)).toEqual(["Dell OptiPlex"]);
    expect(names(listAssets(db, admin, a, { q: "192.168.1.22" }).rows)).toEqual(["Diğer PC"]);

    const cleared = updateAsset(db, admin, pc.id, assetInput());
    expect(cleared).toMatchObject({ cpu: null, ramGb: null, hostname: null });
  });

  it("RAM accepts a number, a numeric string and '16 GB', and rejects anything else", () => {
    const ram = (v: unknown) => schema.safeParse({ ...{ name: "PC", type: "computer", status: "in_use" }, ramGb: v });
    expect(ram(16).data?.ramGb).toBe(16);
    expect(ram("16").data?.ramGb).toBe(16);
    expect(ram(" 32 gb ").data?.ramGb).toBe(32);
    expect(ram("").data?.ramGb).toBeNull();
    expect(ram(undefined).data?.ramGb).toBeUndefined();
    for (const bad of ["çok", "16.5", "0", "-4", "99999"]) expect(ram(bad).success, bad).toBe(false);
  });
});

describe("specifications from a device of the same model", () => {
  const specs = { cpu: "Intel Core i5-13500", ramGb: 16, storage: "512 GB SSD", os: "Windows 11 Pro" };

  it("finds them ignoring case, spacing and Turkish letters, and never copies per-device values", async () => {
    const { db, a, admin } = await world();
    createAsset(db, admin, a, assetInput({ name: "Muhasebe PC", brand: "Dell", model: "OptiPlex 7010", ...specs, hostname: "MUH-01", ipAddress: "10.0.0.5", serial: "SN1" }));

    const found = findModelSpecs(db, admin, " DELL ", "optiplex7010");
    expect(found).toEqual({ sourceTag: "D-0001", sourceName: "Muhasebe PC", ...specs });
    expect(findModelSpecs(db, admin, "Dell", "OptiPlex 7020")).toBeNull();
    expect(findModelSpecs(db, admin, "HP", "OptiPlex 7010")).toBeNull();
    expect(findModelSpecs(db, admin, "Dell", "")).toBeNull();
  });

  it("skips devices without specifications, prefers the most recently changed, and can exclude the device being edited", async () => {
    const { db, a, admin } = await world();
    createAsset(db, admin, a, assetInput({ name: "Boş", brand: "Lenovo", model: "E14" }));
    expect(findModelSpecs(db, admin, "Lenovo", "E14")).toBeNull();

    const first = createAsset(db, admin, a, assetInput({ name: "İlk", brand: "Lenovo", model: "E14", ramGb: 8 }));
    const second = createAsset(db, admin, a, assetInput({ name: "İkinci", brand: "Lenovo", model: "E14", ramGb: 16 }));
    expect(findModelSpecs(db, admin, "Lenovo", "E14")).toMatchObject({ sourceName: "İkinci", ramGb: 16 });
    expect(findModelSpecs(db, admin, "Lenovo", "E14", second.id)).toMatchObject({ sourceName: "İlk", ramGb: 8 });
    expect(findModelSpecs(db, admin, "Lenovo", "E14", first.id)).toMatchObject({ sourceName: "İkinci" });
  });

  it("does not reveal devices of companies the user cannot access", async () => {
    const { db, a, b, admin, techA } = await world();
    createAsset(db, admin, b, assetInput({ name: "B-PC", brand: "Dell", model: "7010", ...specs }));
    expect(findModelSpecs(db, techA, "Dell", "7010")).toBeNull();
    expect(findModelSpecs(db, admin, "Dell", "7010")).toMatchObject({ sourceName: "B-PC" });

    createAsset(db, admin, a, assetInput({ name: "A-PC", brand: "Dell", model: "7010", ramGb: 8 }));
    expect(findModelSpecs(db, techA, "Dell", "7010")).toMatchObject({ sourceName: "A-PC", ramGb: 8 });
  });
});
