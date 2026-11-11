import QRCode from "qrcode";

/** The address a printed label points at; resolved by src/app/(app)/a/[company]/[tag]. */
export function assetLabelUrl(origin: string, companyId: number, tag: string): string {
  return `${origin}/a/${companyId}/${encodeURIComponent(tag)}`;
}

/** An SVG QR code (no margin) for the given text. */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
}
