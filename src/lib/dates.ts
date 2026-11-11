/** Helpers for calendar dates stored as "YYYY-MM-DD" (no time, no time zone). */

export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

export type WarrantyState = "expired" | "soon" | "ok";

/** "soon" means the warranty ends within 30 days, today included. */
export function warrantyState(endIso: string | null, today: string): WarrantyState | null {
  if (!endIso) return null;
  const days = daysBetween(today, endIso);
  return days < 0 ? "expired" : days <= 30 ? "soon" : "ok";
}

export function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}
