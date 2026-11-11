/** Formats an amount stored in minor units (kuruş, cent). */
export function formatMoney(minor: number | null, currency: string, locale: string): string {
  if (minor === null) return "—";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);
}

/** Minor units as an editable decimal string for the locale ("1250,50" in Turkish). */
export function moneyInputValue(minor: number | null, locale: string): string {
  if (minor === null) return "";
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(minor / 100);
}
