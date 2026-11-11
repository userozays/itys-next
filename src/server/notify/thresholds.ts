/** Warnings go out 30 and 7 days before a due date, and on the day itself. */
export const THRESHOLDS = [30, 7, 0] as const;
export type Threshold = (typeof THRESHOLDS)[number];

/** Something that expired longer ago than this is old news and raises nothing. */
export const EXPIRED_GRACE_DAYS = 7;

/**
 * The warning that applies when `daysLeft` days remain (negative: already past).
 * Only the tightest one applies, so an item first seen 3 days before its date
 * gets the 7-day warning, not the 30-day one as well.
 */
export function thresholdFor(daysLeft: number): Threshold | null {
  if (daysLeft > 30 || daysLeft < -EXPIRED_GRACE_DAYS) return null;
  if (daysLeft <= 0) return 0;
  if (daysLeft <= 7) return 7;
  return 30;
}
