import ExcelJS from "exceljs";

/** A calendar date is passed as `{ date: "YYYY-MM-DD" }` so both formats can show it as a date. */
export type Cell = string | number | { date: string } | null;
export type Sheet = { name: string; headers: string[]; rows: Cell[][]; widths?: number[] };
export type ExportFormat = "xlsx" | "csv";

// A cell starting with one of these is run as a formula when a CSV is opened in a
// spreadsheet ("CSV injection"). Such values get a leading apostrophe (QA Ö1).
const FORMULA_START = /^[=+\-@\t\r]/;

const dmy = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

function csvCell(cell: Cell): string {
  if (cell === null) return "";
  if (typeof cell === "number") return String(cell).replace(".", ",");
  const text = typeof cell === "string" ? cell : dmy(cell.date);
  const safe = typeof cell === "string" && FORMULA_START.test(text) ? `'${text}` : text;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Semicolons, CRLF and a BOM, the way Excel in Turkish locales reads a CSV (same as the import template). */
export function toCsv(sheet: Sheet): string {
  const lines = [sheet.headers, ...sheet.rows].map((row) => row.map((cell) => csvCell(cell)).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

export async function toXlsx(sheet: Sheet): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheet.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  worksheet.columns = sheet.headers.map((header, i) => ({ header, width: sheet.widths?.[i] ?? 16 }));
  worksheet.getRow(1).font = { bold: true };
  for (const row of sheet.rows) {
    const added = worksheet.addRow(
      // Text stays text in xlsx (never a formula); dates become real dates.
      row.map((cell) => (cell !== null && typeof cell === "object" ? isoToDate(cell.date) : cell)),
    );
    row.forEach((cell, i) => {
      if (cell !== null && typeof cell === "object") added.getCell(i + 1).numFmt = "dd.mm.yyyy";
    });
  }
  worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.headers.length } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

/** A download response; the file name is ASCII with the Turkish original alongside. */
export async function sheetResponse(sheet: Sheet, format: ExportFormat, baseName: string): Promise<Response> {
  const fileName = `${baseName.trim().replace(/\s+/g, "-")}.${format}`;
  const ascii = fileName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^A-Za-z0-9._-]+/g, "-");
  const body = format === "xlsx" ? new Uint8Array(await toXlsx(sheet)) : toCsv(sheet);
  return new Response(body, {
    headers: {
      "Content-Type":
        format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
