import { describe, expect, it } from "vitest";
import { addCompany, addUser, assetInput, fieldIssuesOf, testDb } from "../testing/fixtures";
import { assetInput as schema } from "../validation";
import {
  assetConflicts,
  assetSummary,
  createAsset,
  deleteAsset,
  devicesSharingIp,
  findModelSpecs,
  getAsset,
  getAssetByTag,
  listAssets,
  PAGE_SIZE,
  updateAsset,
} from "./assets";
import { createCompany } from "./companies";
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

    expect(fieldIssuesOf(() => createAsset(db, admin, a, assetInput({ tag: "PC-1" })))).toEqual(["tag:errors.tagUsedBy"]);
    expect(fieldIssuesOf(() => updateAsset(db, admin, second.id, assetInput({ tag: "PC-1" })))).toEqual(["tag:errors.tagUsedBy"]);
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

describe("device counts per location (QA K1)", () => {
  it("counts each location's own devices, whatever their ids happen to be", async () => {
    const { db, a, b, admin } = await world();
    const depot = createLocation(db, admin, a, { name: "Depo" });
    const office = createLocation(db, admin, a, { name: "Ofis" });
    const empty = createLocation(db, admin, a, { name: "Boş Oda" });
    const other = createLocation(db, admin, b, { name: "B Deposu" });
    for (let i = 0; i < 3; i++) createAsset(db, admin, a, assetInput({ locationId: office.id }));
    createAsset(db, admin, a, assetInput({ locationId: depot.id }));
    createAsset(db, admin, a, assetInput());
    for (let i = 0; i < 2; i++) createAsset(db, admin, b, assetInput({ locationId: other.id }));

    expect(listLocations(db, admin, a).map((l) => [l.name, l.assetCount])).toEqual([["Boş Oda", 0], ["Depo", 1], ["Ofis", 3]]);
    expect(listLocations(db, admin, b).map((l) => [l.name, l.assetCount])).toEqual([["B Deposu", 2]]);
    expect(empty.id).toBeGreaterThan(0);
  });
});

describe("tags are never handed out twice (QA K2)", () => {
  it("a deleted device's number is not given to the next device", async () => {
    const { db, a, admin } = await world();
    createAsset(db, admin, a, assetInput());
    const second = createAsset(db, admin, a, assetInput());
    expect(second.tag).toBe("D-0002");

    deleteAsset(db, admin, second.id);
    expect(createAsset(db, admin, a, assetInput()).tag).toBe("D-0003");

    // Even when every device is gone, numbering does not start over.
    for (const row of listAssets(db, admin, a).rows) deleteAsset(db, admin, row.id);
    expect(createAsset(db, admin, a, assetInput()).tag).toBe("D-0004");
  });

  it("continues after the highest number in use, and ignores look-alike tags", async () => {
    const { db, a, b, admin } = await world();
    createAsset(db, admin, a, assetInput({ tag: "D-0040" })); // typed by hand
    createAsset(db, admin, a, assetInput({ tag: "D-12A" })); // not of the D-NNNN form
    createAsset(db, admin, a, assetInput({ tag: "PC-7" }));

    expect(createAsset(db, admin, a, assetInput()).tag).toBe("D-0041");
    expect(createAsset(db, admin, a, assetInput()).tag).toBe("D-0042");

    // Typed in lower case it is stored as D-0900 (QA O4), so numbering continues after it.
    expect(createAsset(db, admin, a, assetInput({ tag: "d-0900" })).tag).toBe("D-0900");
    expect(createAsset(db, admin, a, assetInput()).tag).toBe("D-0901");
    expect(createAsset(db, admin, b, assetInput()).tag).toBe("D-0001"); // each company has its own sequence
  });
});

describe("Turkish search and order (QA O2, O3)", () => {
  async function people() {
    const w = await world();
    const { db, a, admin } = w;
    for (const [name, assignedTo] of [
      ["Zirve PC", "Ayşe Yılmaz"],
      ["Üretim PC", "İsmail Işık"],
      ["İnsan Kaynakları PC", "Can Öztürk"],
      ["Çağrı Merkezi PC", null],
      ["arşiv PC", null],
      ["Bilgi İşlem PC", null],
    ] as const) {
      createAsset(db, admin, a, assetInput({ name, assignedTo }));
    }
    return w;
  }

  it("finds records regardless of Turkish case and accents", async () => {
    const { db, a, admin } = await people();
    const search = (q: string) => names(listAssets(db, admin, a, { q }).rows);

    for (const q of ["ayşe", "AYŞE", "ayse", "Ayse"]) expect(search(q), q).toEqual(["Zirve PC"]);
    for (const q of ["İnsan", "insan", "INSAN"]) expect(search(q), q).toEqual(["İnsan Kaynakları PC"]);
    for (const q of ["ışık", "IŞIK", "isik"]) expect(search(q), q).toEqual(["Üretim PC"]);
    expect(search("ÇAĞRI")).toEqual(["Çağrı Merkezi PC"]);
    expect(search("%")).toEqual([]);
  });

  it("sorts names in Turkish alphabetical order, ignoring case, both ways", async () => {
    const { db, a, admin } = await people();
    const expected = ["arşiv PC", "Bilgi İşlem PC", "Çağrı Merkezi PC", "İnsan Kaynakları PC", "Üretim PC", "Zirve PC"];
    expect(names(listAssets(db, admin, a).rows)).toEqual(expected);
    expect(names(listAssets(db, admin, a, { sort: "name", dir: "desc" }).rows)).toEqual([...expected].reverse());
  });
});

describe("duplicates that differ only in case (QA O4)", () => {
  it("tags are stored in capitals, so d-0054 and D-0054 cannot both exist", async () => {
    const { db, a, admin } = await world();
    const first = createAsset(db, admin, a, assetInput({ tag: "pc-54" }));
    expect(first.tag).toBe("PC-54");
    expect(fieldIssuesOf(() => createAsset(db, admin, a, assetInput({ tag: "Pc-54" })))).toEqual(["tag:errors.tagUsedBy"]);
    // A label scanned in any case still opens the device.
    expect(getAssetByTag(db, admin, a, "pc-54").id).toBe(first.id);
  });

  it("location and company names are compared ignoring Turkish case", async () => {
    const { db, a, admin } = await world();
    createLocation(db, admin, a, { name: "Depo" });
    const office = createLocation(db, admin, a, { name: "İç Ofis" });
    expect(() => createLocation(db, admin, a, { name: "depo" })).toThrow("locationNameTaken");
    expect(() => createLocation(db, admin, a, { name: "iç ofis" })).toThrow("locationNameTaken");
    expect(() => renameLocation(db, admin, office.id, { name: "DEPO" })).toThrow("locationNameTaken");
    expect(renameLocation(db, admin, office.id, { name: "İÇ OFİS" }).name).toBe("İÇ OFİS"); // renaming itself is fine

    expect(() => createCompany(db, admin, { name: "a", active: true })).toThrow("companyNameTaken");
  });
});

describe("IP, MAC and date checks (QA O5)", () => {
  const base = { name: "PC", type: "computer", status: "in_use" };
  const check = (extra: Record<string, unknown>) => schema.safeParse({ ...base, ...extra });

  it("accepts IPv4 and IPv6, rejects anything else", () => {
    expect(check({ ipAddress: "192.168.1.20" }).data?.ipAddress).toBe("192.168.1.20");
    expect(check({ ipAddress: "FE80::1" }).data?.ipAddress).toBe("fe80::1");
    expect(check({ ipAddress: "" }).data?.ipAddress).toBeNull();
    for (const bad of ["999.1.1.1", "192.168.1", "sunucu", "10.0.0.1/24"]) expect(check({ ipAddress: bad }).success, bad).toBe(false);
  });

  it("accepts the usual MAC formats and stores one form", () => {
    for (const mac of ["00:1a:2b:3c:4d:5e", "00-1A-2B-3C-4D-5E", "001a.2b3c.4d5e", "001A2B3C4D5E"]) {
      expect(check({ macAddress: mac }).data?.macAddress, mac).toBe("00:1A:2B:3C:4D:5E");
    }
    for (const bad of ["zz:zz", "00:1A:2B:3C:4D", "00:1A:2B:3C:4D:5E:6F"]) expect(check({ macAddress: bad }).success, bad).toBe(false);
  });

  it("a warranty cannot end before the purchase", () => {
    const result = check({ purchaseDate: "2026-05-01", warrantyEnd: "2025-01-01" });
    expect(!result.success && result.error.issues.map((i) => [i.path[0], i.message])).toEqual([["warrantyEnd", "warrantyBeforePurchase"]]);
    expect(check({ purchaseDate: "2026-05-01", warrantyEnd: "2026-05-01" }).success).toBe(true);
    expect(check({ warrantyEnd: "2025-01-01" }).success).toBe(true);
  });
});

describe("serial numbers, MAC and IP addresses shared between devices (QA O6)", () => {
  it("refuses a serial or MAC already recorded in the company, naming the device", async () => {
    const { db, a, b, admin } = await world();
    const pc = createAsset(db, admin, a, assetInput({ name: "Muhasebe PC", serial: "SN-12345", macAddress: "00:1A:2B:3C:4D:5E" }));

    const clash = () => createAsset(db, admin, a, assetInput({ serial: "sn-12345", macAddress: "001a2b3c4d5e" }));
    expect(fieldIssuesOf(clash)).toEqual(["serial:errors.serialUsedBy", "macAddress:errors.macUsedBy"]);
    expect(assetConflicts(db, a, { serial: "SN-12345" })[0]?.params).toEqual({ tag: pc.tag, name: "Muhasebe PC" });

    // The device itself, another company, and placeholder serials are fine.
    expect(fieldIssuesOf(() => updateAsset(db, admin, pc.id, assetInput({ serial: "SN-12345", macAddress: "00:1A:2B:3C:4D:5E" })))).toEqual([]);
    expect(createAsset(db, admin, b, assetInput({ serial: "SN-12345" })).serial).toBe("SN-12345");
    createAsset(db, admin, a, assetInput({ serial: "N/A" }));
    expect(createAsset(db, admin, a, assetInput({ serial: "n/a" })).serial).toBe("n/a");
  });

  it("allows a shared IP address but lists the other devices", async () => {
    const { db, a, admin } = await world();
    const first = createAsset(db, admin, a, assetInput({ name: "Eski PC", ipAddress: "10.0.0.5" }));
    const second = createAsset(db, admin, a, assetInput({ name: "Yeni PC", ipAddress: "10.0.0.5" }));
    createAsset(db, admin, a, assetInput({ ipAddress: "10.0.0.6" }));

    expect(devicesSharingIp(db, admin, second.id).map((d) => d.name)).toEqual(["Eski PC"]);
    expect(devicesSharingIp(db, admin, first.id).map((d) => d.name)).toEqual(["Yeni PC"]);
  });
});

describe("warranty filter (QA O9)", () => {
  it("lists devices whose warranty ends within 30 days or has ended, leaving retired ones out", async () => {
    const { db, a, admin } = await world();
    const today = "2026-06-01";
    for (const [name, warrantyEnd, status] of [
      ["Bugün Biten", "2026-06-01", "in_use"],
      ["30 Gün Kalan", "2026-07-01", "in_use"],
      ["31 Gün Kalan", "2026-07-02", "in_use"],
      ["Dün Biten", "2026-05-31", "in_use"],
      ["Hurda Biten", "2026-05-01", "retired"],
      ["Garantisiz", null, "in_use"],
    ] as const) {
      createAsset(db, admin, a, assetInput({ name, warrantyEnd, status }));
    }
    const list = (warranty: "soon" | "expired") => names(listAssets(db, admin, a, { warranty, today, sort: "warrantyEnd" }).rows);
    expect(list("soon")).toEqual(["Bugün Biten", "30 Gün Kalan"]);
    expect(list("expired")).toEqual(["Dün Biten"]);
  });
});

describe("all form problems at once (QA O7)", () => {
  it("the date order is checked even when other fields are wrong", () => {
    const result = schema.safeParse({ name: "", type: "computer", status: "in_use", ramGb: "çok", purchaseDate: "2026-05-01", warrantyEnd: "2025-01-01" });
    expect(!result.success && result.error.issues.map((i) => String(i.path[0])).sort()).toEqual(["name", "ramGb", "warrantyEnd"]);
  });
});
