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
/** Cost columns only for those who may see costs (admins). */
export function licenseSheet(rows: LicenseView[], t: T, sheetName: string, withCosts = true): Sheet {
  const columns: { key: string; width: number; value: (l: LicenseView) => Cell }[] = [
    { key: "name", width: 28, value: (l) => l.name },
    { key: "vendor", width: 18, value: (l) => l.vendor },
    { key: "kind", width: 15, value: (l) => t(`licenses.kinds.${l.kind}`) },
    { key: "billingPeriod", width: 12, value: (l) => (l.billingPeriod ? t(`licenses.periods.${l.billingPeriod}`) : null) },
    { key: "seats", width: 13, value: (l) => l.seats ?? t("licenses.unlimited") },
    { key: "seatsUsage", width: 10, value: (l) => l.usedSeats },
    { key: "purchaseDate", width: 12, value: (l) => (l.purchaseDate ? { date: l.purchaseDate } : null) },
    { key: "expiryDate", width: 12, value: (l) => (l.expiryDate ? { date: l.expiryDate } : t("licenses.perpetual")) },
    ...(withCosts
      ? [
          { key: "cost", width: 12, value: (l: LicenseView) => (l.costMinor === null ? null : l.costMinor / 100) },
          { key: "currency", width: 11, value: (l: LicenseView) => l.currency },
        ]
      : []),
    { key: "notes", width: 30, value: (l) => l.notes },
  ];
  return {
    name: sheetName,
    headers: columns.map((c) => t(`licenses.${c.key}`)),
    widths: columns.map((c) => c.width),
    rows: rows.map((l) => columns.map((c) => c.value(l))),
  };
}
