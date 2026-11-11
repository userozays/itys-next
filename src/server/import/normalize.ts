import { assetInput, type AssetInput } from "../validation";
import { readDate, readStatus, readType, type ImportField, type Mapping } from "./mapping";

/** Codes are translation keys under "import.issues.*". */
export type RowIssue = { field: ImportField; code: string };
export type NormalizedRow = { input: AssetInput; locationName: string | null };
export type RowResult = { ok: true; value: NormalizedRow } | { ok: false; issues: RowIssue[] };

/** Turns one spreadsheet row into a validated asset, or the list of what is wrong with it. */
export function normalizeRow(cells: string[], mapping: Mapping): RowResult {
  const cell = (field: ImportField) => {
    const index = mapping[field];
    return index === undefined ? "" : (cells[index] ?? "").trim();
  };
  const issues: RowIssue[] = [];

  const typeText = cell("type");
  const type = typeText ? readType(typeText) : "other";
  if (!type) issues.push({ field: "type", code: "type" });

  const statusText = cell("status");
  const status = statusText ? readStatus(statusText) : "in_use";
  if (!status) issues.push({ field: "status", code: "status" });

  const date = (field: "purchaseDate" | "warrantyEnd") => {
    const text = cell(field);
    if (!text) return "";
    const iso = readDate(text);
    if (!iso) issues.push({ field, code: "date" });
    return iso ?? "";
  };

  const parsed = assetInput.safeParse({
    tag: cell("tag"),
    name: cell("name"),
    type: type ?? "other",
    status: status ?? "in_use",
    brand: cell("brand"),
    model: cell("model"),
    serial: cell("serial"),
    assignedTo: cell("assignedTo"),
    purchaseDate: date("purchaseDate"),
    warrantyEnd: date("warrantyEnd"),
    notes: cell("notes"),
    cpu: cell("cpu"),
    ramGb: cell("ramGb"),
    storage: cell("storage"),
    os: cell("os"),
    hostname: cell("hostname"),
    ipAddress: cell("ipAddress"),
    macAddress: cell("macAddress"),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]) as ImportField;
      if (!issues.some((i) => i.field === field)) issues.push({ field, code: issue.message });
    }
  }

  const locationName = cell("location");
  if (locationName.length > 80) issues.push({ field: "location", code: "tooLong" });

  if (issues.length > 0 || !parsed.success) return { ok: false, issues };
  return { ok: true, value: { input: parsed.data, locationName: locationName || null } };
}
