import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { fold, guessMapping, readDate, readStatus, readType, sanitizeMapping } from "./mapping";
import { normalizeRow } from "./normalize";
import { MAX_IMPORT_BYTES, parseSpreadsheet } from "./parse";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("reading spreadsheet files", () => {
  it("reads a comma CSV with quotes, and drops blank rows", async () => {
    const sheet = await parseSpreadsheet("a.csv", bytes('Ad,Marka\n"Yazıcı, renkli",HP\n\n , \nPC,Dell\n'));
    expect(sheet).toEqual({ headers: ["Ad", "Marka"], rows: [["Yazıcı, renkli", "HP"], ["PC", "Dell"]] });
  });

  it("reads a semicolon CSV with a BOM, as Turkish Excel writes it", async () => {
    const sheet = await parseSpreadsheet("a.csv", bytes("﻿Cihaz Adı;Seri No\nMuhasebe PC;SN-1\n"));
    expect(sheet).toEqual({ headers: ["Cihaz Adı", "Seri No"], rows: [["Muhasebe PC", "SN-1"]] });
  });

  it("falls back to Windows-1254 when the file is not UTF-8", async () => {
    // "Yazıcı;Şube\nİğne;Çağrı\n" encoded as Windows-1254.
    const win1254 = Uint8Array.from([
      0x59, 0x61, 0x7a, 0xfd, 0x63, 0xfd, 0x3b, 0xde, 0x75, 0x62, 0x65, 0x0a, 0xdd, 0xf0, 0x6e, 0x65, 0x3b, 0xc7, 0x61, 0xf0, 0x72, 0xfd, 0x0a,
    ]);
    const sheet = await parseSpreadsheet("a.csv", win1254);
    expect(sheet).toEqual({ headers: ["Yazıcı", "Şube"], rows: [["İğne", "Çağrı"]] });
  });

  it("reads the first sheet of an xlsx file, with dates and numbers as text", async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Cihazlar");
    ws.addRow(["Ad", "Garanti Bitişi", "Seri No", ""]);
    ws.addRow(["Sunucu", new Date(Date.UTC(2027, 0, 31)), 12345]);
    ws.addRow([]);
    ws.addRow(["Switch", "15.02.2026", "SW-9"]);
    const sheet = await parseSpreadsheet("cihazlar.XLSX", new Uint8Array(await workbook.xlsx.writeBuffer()));

    expect(sheet.headers).toEqual(["Ad", "Garanti Bitişi", "Seri No"]);
    expect(sheet.rows).toEqual([
      ["Sunucu", "2027-01-31", "12345"],
      ["Switch", "15.02.2026", "SW-9"],
    ]);
  });

  it("names blank header cells and pads short rows", async () => {
    const sheet = await parseSpreadsheet("a.csv", bytes("Ad,,Model\nPC\n"));
    expect(sheet).toEqual({ headers: ["Ad", "#2", "Model"], rows: [["PC", "", ""]] });
  });

  it("rejects empty, oversized, unsupported and corrupt files", async () => {
    await expect(parseSpreadsheet("a.csv", bytes("Ad,Marka\n"))).rejects.toThrow("importEmpty");
    await expect(parseSpreadsheet("a.csv", new Uint8Array(MAX_IMPORT_BYTES + 1))).rejects.toThrow("importTooLarge");
    await expect(parseSpreadsheet("a.pdf", bytes("x"))).rejects.toThrow("importUnsupported");
    await expect(parseSpreadsheet("a.xlsx", bytes("not a zip file"))).rejects.toThrow("importUnreadable");
    const many = "Ad\n" + "PC\n".repeat(5001);
    await expect(parseSpreadsheet("a.csv", bytes(many))).rejects.toThrow("importTooManyRows");
  });
});

describe("column mapping", () => {
  it("folds Turkish letters, case, spaces and punctuation", () => {
    expect(fold("  Garanti Bitişi (Tarih) ")).toBe("garantibitisitarih");
    expect(fold("IŞIK İĞNE")).toBe("isikigne");
  });

  it("guesses fields from Turkish and English headers", () => {
    expect(guessMapping(["Etiket No", "Cihaz Adı", "Türü", "SERİ NO", "Konum", "Zimmetli Kişi", "Garanti Bitişi", "Fiyat"])).toEqual({
      tag: 0,
      name: 1,
      type: 2,
      serial: 3,
      location: 4,
      assignedTo: 5,
      warrantyEnd: 6,
    });
    expect(guessMapping(["Name", "Brand", "Model", "Serial Number", "Status"])).toEqual({ name: 0, brand: 1, model: 2, serial: 3, status: 4 });
  });

  it("uses each column once and ignores unknown headers", () => {
    expect(guessMapping(["Ad", "Ad", "???"])).toEqual({ name: 0 });
  });

  it("drops unknown fields and out-of-range columns from a submitted mapping", () => {
    expect(sanitizeMapping({ name: "1", tag: "", brand: "7", evil: "0", model: "x", serial: 0 }, 3)).toEqual({ name: 1, serial: 0 });
  });
});

describe("reading cell values", () => {
  it("understands device types in Turkish and English", () => {
    expect(readType("Dizüstü")).toBe("laptop");
    expect(readType("NOTEBOOK")).toBe("laptop");
    expect(readType("Masaüstü Bilgisayar")).toBe("computer");
    expect(readType("Yazıcı")).toBe("printer");
    expect(readType("Ağ Cihazı")).toBe("network");
    expect(readType("uzay gemisi")).toBeUndefined();
  });

  it("understands statuses", () => {
    expect(readStatus("Kullanımda")).toBe("in_use");
    expect(readStatus("DEPODA")).toBe("in_stock");
    expect(readStatus("arızalı")).toBe("in_repair");
    expect(readStatus("Hurda")).toBe("retired");
    expect(readStatus("kayıp")).toBeUndefined();
  });

  it("reads day-first and ISO dates and rejects impossible ones", () => {
    expect(readDate("2026-03-09")).toBe("2026-03-09");
    expect(readDate("9.3.2026")).toBe("2026-03-09");
    expect(readDate("09/03/2026")).toBe("2026-03-09");
    expect(readDate("09-03-2026")).toBe("2026-03-09");
    expect(readDate("2026-03-09T00:00:00.000Z")).toBe("2026-03-09");
    expect(readDate("31.02.2026")).toBeNull();
    expect(readDate("03/2026")).toBeNull();
    expect(readDate("yarın")).toBeNull();
  });
});

describe("turning a row into a device", () => {
  const mapping = { name: 0, type: 1, status: 2, warrantyEnd: 3, tag: 4, location: 5 };

  it("accepts a complete row", () => {
    const result = normalizeRow(["Muhasebe PC", "Masaüstü", "Kullanımda", "31.01.2027", "PC-7", "Merkez Ofis"], mapping);
    expect(result).toEqual({
      ok: true,
      value: {
        input: expect.objectContaining({ name: "Muhasebe PC", type: "computer", status: "in_use", warrantyEnd: "2027-01-31", tag: "PC-7" }),
        locationName: "Merkez Ofis",
      },
    });
  });

  it("defaults a blank type to other and a blank status to in use", () => {
    const result = normalizeRow(["Bir şey", "", "", "", "", ""], mapping);
    expect(result.ok && result.value.input).toMatchObject({ type: "other", status: "in_use", tag: null, warrantyEnd: null });
    expect(result.ok && result.value.locationName).toBeNull();
  });

  it("reports every problem in a row, by field", () => {
    const result = normalizeRow(["", "uzay gemisi", "kayıp", "31.02.2026", "etiket boşluklu", "x".repeat(81)], mapping);
    expect(result).toEqual({
      ok: false,
      issues: expect.arrayContaining([
        { field: "name", code: "required" },
        { field: "type", code: "type" },
        { field: "status", code: "status" },
        { field: "warrantyEnd", code: "date" },
        { field: "tag", code: "tag" },
        { field: "location", code: "tooLong" },
      ]),
    });
    expect(!result.ok && result.issues).toHaveLength(6);
  });

  it("ignores columns that are not mapped", () => {
    const result = normalizeRow(["PC", "uzay gemisi"], { name: 0 });
    expect(result.ok && result.value.input.type).toBe("other");
  });
});

describe("importing technical specifications", () => {
  it("guesses the specification columns", () => {
    expect(guessMapping(["Ad", "İşlemci", "RAM", "Disk", "İşletim Sistemi", "Bilgisayar Adı", "IP Adresi", "MAC"])).toEqual({
      name: 0, cpu: 1, ramGb: 2, storage: 3, os: 4, hostname: 5, ipAddress: 6, macAddress: 7,
    });
  });

  it("reads them from a row, and reports a bad RAM value", () => {
    const mapping = { name: 0, cpu: 1, ramGb: 2, os: 3, ipAddress: 4 };
    const ok = normalizeRow(["PC", "Ryzen 5 5600", "16 GB", "Windows 11", "10.0.0.5"], mapping);
    expect(ok.ok && ok.value.input).toMatchObject({ cpu: "Ryzen 5 5600", ramGb: 16, os: "Windows 11", ipAddress: "10.0.0.5" });

    const blank = normalizeRow(["PC", "", "", "", ""], mapping);
    expect(blank.ok && blank.value.input).toMatchObject({ cpu: null, ramGb: null });

    expect(normalizeRow(["PC", "", "bol", "", ""], mapping)).toEqual({ ok: false, issues: [{ field: "ramGb", code: "ram" }] });
  });
});
