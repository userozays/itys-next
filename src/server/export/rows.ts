import type { AssetListItem } from "../services/assets";
import type { LicenseView } from "../services/licenses";
import type { Cell, Sheet } from "./sheet";

type T = (key: string) => string;

const date = (iso: string | null): Cell => (iso ? { date: iso } : null);

// Same columns, headers and words as the import, so an exported file can be edited and imported again.
const ASSET_COLUMNS = [
  "tag", "name", "type", "status", "brand", "model", "serial", "location", "assignedTo", "purchaseDate",
  "warrantyEnd", "notes", "cpu", "ramGb", "storage", "os", "hostname", "ipAddress", "macAddress",
] as const;
const ASSET_WIDTHS = [11, 28, 13, 12, 12, 20, 16, 18, 20, 12, 13, 30, 24, 9, 16, 18, 16, 15, 19];

export function assetSheet(rows: AssetListItem[], t: T, sheetName: string): Sheet {
  return {
    name: sheetName,
    headers: ASSET_COLUMNS.map((c) => t(`assets.${c}`)),
    widths: ASSET_WIDTHS,
    rows: rows.map((a) => [
      a.tag,
      a.name,
      t(`assets.types.${a.type}`),
      t(`assets.statuses.${a.status}`),
      a.brand,
      a.model,
      a.serial,
      a.locationName,
      a.assignedTo,
      date(a.purchaseDate),
      date(a.warrantyEnd),
      a.notes,
      a.cpu,
      a.ramGb,
      a.storage,
      a.os,
      a.hostname,
      a.ipAddress,
      a.macAddress,
    ]),
  };
}

/** License keys are never exported; they are only shown one at a time on the license page. */
export function licenseSheet(rows: LicenseView[], t: T, sheetName: string): Sheet {
  return {
    name: sheetName,
    headers: ["name", "vendor", "seats", "seatsUsage", "expiryDate", "cost", "currency", "notes"].map((c) => t(`licenses.${c}`)),
    widths: [28, 18, 13, 10, 12, 12, 11, 30],
    rows: rows.map((l) => [
      l.name,
      l.vendor,
      l.seats ?? t("licenses.unlimited"),
      l.usedSeats,
      l.expiryDate ? { date: l.expiryDate } : t("licenses.perpetual"),
      l.costMinor === null ? null : l.costMinor / 100,
      l.currency,
      l.notes,
    ]),
  };
}
