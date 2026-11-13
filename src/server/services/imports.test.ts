import { describe, expect, it } from "vitest";
import { addCompany, addUser, assetInput, testDb } from "../testing/fixtures";
import { createAsset, listAssets } from "./assets";
import { createImportJob, getImportJob, previewImport, runImport, setImportMapping } from "./imports";
import { createLocation, listLocations } from "./locations";

const headers = ["Etiket No", "Cihaz Adı", "Tür", "Konum", "Garanti Bitişi"];

async function world() {
  const db = testDb();
  const a = addCompany(db, "A");
  const b = addCompany(db, "B");
  const admin = await addUser(db, "admin", "admin");
  const techA = await addUser(db, "tech-a", "technician", { companyIds: [a] });
  const techB = await addUser(db, "tech-b", "technician", { companyIds: [b] });
  return { db, a, b, admin, techA, techB };
}

describe("spreadsheet import", () => {
  it("imports valid rows, skips invalid ones with reasons, and creates missing locations", async () => {
    const { db, a, admin, techA } = await world();
    createLocation(db, admin, a, { name: "Merkez Ofis" });
    createAsset(db, admin, a, assetInput({ tag: "PC-1", name: "Zaten Var" }));
    const rows = [
      ["", "Muhasebe PC", "Masaüstü", "merkez ofis", "31.01.2027"], // row 2: ok, existing location (case-insensitive)
      ["PC-1", "Çakışan", "", "", ""], // row 3: tag already in the company
      ["SW-1", "Omurga Switch", "Switch", "Sistem Odası", ""], // row 4: ok, new location
      ["SW-1", "Kopya Switch", "", "", ""], // row 5: tag repeated in the file
      ["", "", "Yazıcı", "", ""], // row 6: no name
      ["", "Yazıcı", "uzay gemisi", "Sistem Odası", "31.02.2026"], // row 7: bad type and date
      ["", "Yedek Dizüstü", "Dizüstü", "Sistem Odası", "2026-12-01"], // row 8: ok
    ];
    const jobId = createImportJob(db, techA, a, "cihazlar.xlsx", { headers, rows });

    const preview = previewImport(db, techA, jobId);
    expect(preview.total).toBe(7);
    expect(preview.valid.map((v) => v.row)).toEqual([2, 4, 8]);
    expect(preview.newLocations).toEqual(["Sistem Odası"]);
    expect(preview.skipped).toEqual([
      { row: 3, issues: [{ field: "tag", code: "tagTaken" }] },
      { row: 5, issues: [{ field: "tag", code: "tagDuplicate" }] },
      { row: 6, issues: [{ field: "name", code: "required" }] },
      { row: 7, issues: [{ field: "type", code: "type" }, { field: "warrantyEnd", code: "date" }] },
    ]);
    expect(listAssets(db, admin, a).total).toBe(1); // preview changes nothing

    expect(runImport(db, techA, jobId)).toEqual({ imported: 3, skipped: 4 });

    const imported = listAssets(db, admin, a, { sort: "tag" }).rows;
    expect(imported.map((r) => [r.tag, r.name, r.type, r.locationName, r.warrantyEnd, r.source])).toEqual([
      ["D-0001", "Muhasebe PC", "computer", "Merkez Ofis", "2027-01-31", "import"],
      ["D-0002", "Yedek Dizüstü", "laptop", "Sistem Odası", "2026-12-01", "import"],
      ["PC-1", "Zaten Var", "computer", null, null, "manual"],
      ["SW-1", "Omurga Switch", "network", "Sistem Odası", null, "import"],
    ]);
    expect(listLocations(db, admin, a).map((l) => l.name)).toEqual(["Merkez Ofis", "Sistem Odası"]);

    const done = getImportJob(db, techA, jobId);
    expect(done).toMatchObject({ status: "done", importedCount: 3, rows: [] });
    expect(done.report.map((r) => r.row)).toEqual([3, 5, 6, 7]);
  });

  it("cannot run twice", async () => {
    const { db, a, admin } = await world();
    const jobId = createImportJob(db, admin, a, "a.csv", { headers: ["Ad"], rows: [["PC"]] });
    runImport(db, admin, jobId);

    expect(() => runImport(db, admin, jobId)).toThrow("importDone");
    expect(() => previewImport(db, admin, jobId)).toThrow("importDone");
    expect(() => setImportMapping(db, admin, jobId, { name: 0 })).toThrow("importDone");
    expect(listAssets(db, admin, a).total).toBe(1);
  });

  it("a changed mapping changes what is imported", async () => {
    const { db, a, admin } = await world();
    const jobId = createImportJob(db, admin, a, "a.csv", { headers: ["Kolon A", "Kolon B"], rows: [["HP", "Kat Yazıcısı"]] });

    expect(getImportJob(db, admin, jobId).mapping).toEqual({});
    expect(() => runImport(db, admin, jobId)).toThrow("importNoName");

    setImportMapping(db, admin, jobId, { name: "1", brand: "0", tag: "", bogus: "0", model: "9" });
    expect(getImportJob(db, admin, jobId).mapping).toEqual({ name: 1, brand: 0 });
    runImport(db, admin, jobId);
    expect(listAssets(db, admin, a).rows[0]).toMatchObject({ name: "Kat Yazıcısı", brand: "HP" });
  });

  it("imports nothing at all when no row is valid", async () => {
    const { db, a, admin } = await world();
    const jobId = createImportJob(db, admin, a, "a.csv", { headers: ["Ad", "Konum"], rows: [["", "Yeni Oda"]] });

    expect(() => runImport(db, admin, jobId)).toThrow("importNothingValid");
    expect(listLocations(db, admin, a)).toEqual([]);
    expect(getImportJob(db, admin, jobId).status).toBe("pending");
  });

  it("is isolated between companies", async () => {
    const { db, a, b, admin, techA, techB } = await world();
    const jobId = createImportJob(db, techA, a, "a.csv", { headers: ["Ad"], rows: [["A-PC"]] });

    expect(() => createImportJob(db, techB, a, "x.csv", { headers: ["Ad"], rows: [["Sızma"]] })).toThrow("notFound");
    expect(() => getImportJob(db, techB, jobId)).toThrow("notFound");
    expect(() => previewImport(db, techB, jobId)).toThrow("notFound");
    expect(() => setImportMapping(db, techB, jobId, { name: 0 })).toThrow("notFound");
    expect(() => runImport(db, techB, jobId)).toThrow("notFound");

    runImport(db, techA, jobId);
    expect(listAssets(db, admin, a).total).toBe(1);
    expect(listAssets(db, admin, b).total).toBe(0);
  });

  it("handles 5000 rows quickly, continuing the tag sequence", async () => {
    const { db, a, admin } = await world();
    createAsset(db, admin, a, assetInput());
    const rows = Array.from({ length: 5000 }, (_, i) => [`Cihaz ${i + 1}`]);
    const jobId = createImportJob(db, admin, a, "big.csv", { headers: ["Ad"], rows });

    const started = Date.now();
    expect(runImport(db, admin, jobId)).toEqual({ imported: 5000, skipped: 0 });
    expect(Date.now() - started).toBeLessThan(5000);

    expect(listAssets(db, admin, a, { q: "D-5001" }).rows.map((r) => r.name)).toEqual(["Cihaz 5000"]);
  });
});

describe("generated tags in an import (QA K2)", () => {
  it("do not collide with tags written further down the same file, nor reuse deleted numbers", async () => {
    const db = testDb();
    const a = addCompany(db, "A");
    const admin = await addUser(db, "admin", "admin");
    const gone = createAsset(db, admin, a, assetInput());
    const { deleteAsset } = await import("./assets");
    deleteAsset(db, admin, gone.id); // D-0001 was issued once and must stay retired

    const jobId = createImportJob(db, admin, a, "a.csv", {
      headers: ["Etiket No", "Cihaz Adı"],
      rows: [["", "İlk"], ["D-0002", "Elle Etiketli"], ["", "Son"]],
    });
    expect(runImport(db, admin, jobId)).toEqual({ imported: 3, skipped: 0 });

    expect(listAssets(db, admin, a, { sort: "tag" }).rows.map((r) => [r.tag, r.name])).toEqual([
      ["D-0002", "Elle Etiketli"],
      ["D-0003", "İlk"],
      ["D-0004", "Son"],
    ]);
  });
});

describe("duplicates in an import (QA O4, O6)", () => {
  it("skips rows whose tag, serial or MAC is taken, in any case, or repeated in the file", async () => {
    const db = testDb();
    const a = addCompany(db, "A");
    const admin = await addUser(db, "admin", "admin");
    createAsset(db, admin, a, assetInput({ tag: "PC-1", serial: "SN-AAAA", macAddress: "00:00:00:00:00:01" }));

    const jobId = createImportJob(db, admin, a, "a.csv", {
      headers: ["Etiket No", "Cihaz Adı", "Seri No", "MAC Adresi", "IP Adresi"],
      rows: [
        ["pc-1", "Küçük Harfli Etiket", "", "", ""], // 2
        ["", "Aynı Seri", "sn-aaaa", "", ""], // 3
        ["", "Aynı MAC", "", "00-00-00-00-00-01", ""], // 4
        ["", "Yeni", "SN-BBBB", "00:00:00:00:00:02", "10.0.0.9"], // 5
        ["", "Dosyada Tekrar", "SN-BBBB", "000000000002", ""], // 6
        ["", "Bozuk Adres", "", "zz", "999.1.1.1"], // 7
      ],
    });
    const preview = previewImport(db, admin, jobId);
    expect(preview.valid.map((v) => v.row)).toEqual([5]);
    expect(preview.skipped).toEqual([
      { row: 2, issues: [{ field: "tag", code: "tagTaken" }] },
      { row: 3, issues: [{ field: "serial", code: "serialTaken" }] },
      { row: 4, issues: [{ field: "macAddress", code: "macTaken" }] },
      { row: 6, issues: [{ field: "serial", code: "serialDuplicate" }, { field: "macAddress", code: "macDuplicate" }] },
      { row: 7, issues: [{ field: "ipAddress", code: "ip" }, { field: "macAddress", code: "mac" }] },
    ]);
    expect(runImport(db, admin, jobId)).toEqual({ imported: 1, skipped: 5 });
  });
});
