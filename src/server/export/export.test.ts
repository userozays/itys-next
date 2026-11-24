import { describe, expect, it } from "vitest";
import messages from "../../../messages/tr.json";
import { guessMapping } from "../import/mapping";
import { normalizeRow } from "../import/normalize";
import { parseSpreadsheet } from "../import/parse";
import { createLicense, listLicenses } from "../services/licenses";
import { createAsset, listAssetsForExport } from "../services/assets";
import { createLocation } from "../services/locations";
import { addCompany, addUser, assetInput, testDb } from "../testing/fixtures";
import { assetSheet, licenseSheet } from "./rows";
import { toCsv, toXlsx, type Sheet } from "./sheet";

/** Looks up "a.b.c" in the Turkish messages, like the app's translator. */
const t = (key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages) as string;

async function world() {
  const db = testDb();
  const a = addCompany(db, "A");
  const b = addCompany(db, "B");
  const admin = await addUser(db, "admin", "admin");
  const techA = await addUser(db, "tech", "technician", { companyIds: [a] });
  return { db, a, b, admin, techA };
}

describe("CSV export", () => {
  it("escapes cells a spreadsheet would run as a formula, and quotes separators", () => {
    const sheet: Sheet = {
      name: "x",
      headers: ["A", "B"],
      rows: [
        ["=HYPERLINK(\"http://x\")", "+90 212 555 12 34"],
        ["-2+3", "@SUM(A1)"],
        ["Kat 2; oda 5", 16],
        [{ date: "2027-01-31" }, null],
      ],
    };
    expect(toCsv(sheet).split("\r\n")).toEqual([
      "﻿A;B",
      "\"'=HYPERLINK(\"\"http://x\"\")\";'+90 212 555 12 34",
      "'-2+3;'@SUM(A1)",
      "\"Kat 2; oda 5\";16",
      "31.01.2027;",
      "",
    ]);
  });
});

describe("device export (QA Ö1)", () => {
  it("follows the list filter and order, and stays inside the company", async () => {
    const { db, a, b, admin, techA } = await world();
    createAsset(db, admin, a, assetInput({ name: "Zeytin PC", type: "computer" }));
    createAsset(db, admin, a, assetInput({ name: "Çınar Yazıcı", type: "printer" }));
    createAsset(db, admin, a, assetInput({ name: "Ardıç PC", type: "computer" }));
    createAsset(db, admin, b, assetInput({ name: "Başka Şirket PC" }));

    const names = listAssetsForExport(db, techA, a, { type: "computer" }).rows.map((r) => r.name);
    expect(names).toEqual(["Ardıç PC", "Zeytin PC"]);
    expect(() => listAssetsForExport(db, techA, b)).toThrow("notFound"); // other companies do not exist for a technician
  });

  it("writes an Excel file that the import reads back to the same devices", async () => {
    const { db, a, admin } = await world();
    const location = createLocation(db, admin, a, { name: "Merkez Ofis" });
    createAsset(
      db,
      admin,
      a,
      assetInput({
        tag: "PC-7",
        name: "Muhasebe PC",
        type: "laptop",
        status: "in_repair",
        serial: "SN-998877",
        locationId: location.id,
        assignedTo: "Ayşe Yılmaz",
        purchaseDate: "2024-01-15",
        warrantyEnd: "2027-01-15",
        ramGb: 16,
        ipAddress: "192.168.1.21",
        macAddress: "00:1A:2B:3C:4D:5E",
        notes: "=1+1",
      }),
    );

    const sheet = assetSheet(listAssetsForExport(db, admin, a).rows, t, "Donanım");
    for (const [file, bytes] of [
      ["cihazlar.xlsx", new Uint8Array(await toXlsx(sheet))],
      ["cihazlar.csv", new TextEncoder().encode(toCsv(sheet))],
    ] as const) {
      const parsed = await parseSpreadsheet(file, bytes);
      const mapping = guessMapping(parsed.headers);
      const result = normalizeRow(parsed.rows[0]!, mapping);
      expect(result.ok, file).toBe(true);
      if (!result.ok) continue;
      expect(result.value.locationName).toBe("Merkez Ofis");
      expect(result.value.input).toMatchObject({
        tag: "PC-7",
        name: "Muhasebe PC",
        type: "laptop",
        status: "in_repair",
        serial: "SN-998877",
        assignedTo: "Ayşe Yılmaz",
        purchaseDate: "2024-01-15",
        warrantyEnd: "2027-01-15",
        ramGb: 16,
        ipAddress: "192.168.1.21",
        macAddress: "00:1A:2B:3C:4D:5E",
      });
    }
  });
});

describe("license export (QA Ö1)", () => {
  it("never includes the license key", async () => {
    const { db, a, admin } = await world();
    createLicense(db, admin, a, { name: "Office", currency: "TRY", key: "SECRET-KEY-123", seats: 5, cost: 125050 });
    const sheet = licenseSheet(listLicenses(db, admin, a), t, "Lisanslar");
    expect(sheet.headers).not.toContain(t("licenses.key"));
    expect(JSON.stringify(sheet.rows)).not.toContain("SECRET-KEY-123");
    expect(sheet.rows[0]).toEqual(["Office", null, "Abonelik", "Yıllık", 5, 0, null, "Süresiz", 1250.5, "TRY", null]);
  });
});
