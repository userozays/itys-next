import ExcelJS from "exceljs";
import Papa from "papaparse";
import { AppError } from "../errors";

export type ParsedSheet = { headers: string[]; rows: string[][] };

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

/** Excel in Turkish locales often saves CSV as Windows-1254 rather than UTF-8. */
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1254").decode(bytes);
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text);
    if ("error" in value) return "";
  }
  return String(value);
}

function parseCsv(bytes: Uint8Array): string[][] {
  const text = decodeText(bytes).replace(/^﻿/, "");
  // Delimiter is auto-detected: Turkish Excel writes ";" instead of ",".
  return Papa.parse<string[]>(text, { skipEmptyLines: "greedy" }).data;
}

async function parseXlsx(bytes: Uint8Array): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    throw new AppError("importUnreadable");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const table: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let column = 1; column <= sheet.columnCount; column++) cells.push(cellText(row.getCell(column).value));
    table.push(cells);
  });
  return table;
}

/** Reads the first sheet of a .csv or .xlsx file into a header row and text rows. */
export async function parseSpreadsheet(filename: string, bytes: Uint8Array): Promise<ParsedSheet> {
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new AppError("importTooLarge");
  const extension = filename.toLowerCase().split(".").pop();
  let table: string[][];
  if (extension === "csv" || extension === "txt") table = parseCsv(bytes);
  else if (extension === "xlsx") table = await parseXlsx(bytes);
  else throw new AppError("importUnsupported");

  const cleaned = table.map((row) => row.map((cell) => String(cell ?? "").trim())).filter((row) => row.some((cell) => cell !== ""));
  if (cleaned.length < 2) throw new AppError("importEmpty");
  if (cleaned.length - 1 > MAX_IMPORT_ROWS) throw new AppError("importTooManyRows");

  // Width is the last column that holds anything; trailing empty columns are dropped.
  const width = Math.max(...cleaned.map((row) => row.findLastIndex((cell) => cell !== "") + 1));
  const [first, ...rest] = cleaned;
  const headers = Array.from({ length: width }, (_, i) => first[i] || `#${i + 1}`);
  const rows = rest.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ""));
  return { headers, rows };
}
