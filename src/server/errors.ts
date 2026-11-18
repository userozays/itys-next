/** Error codes double as translation keys under "errors.*" in messages/*.json. */
export type ErrorCode =
  | "forbidden"
  | "notFound"
  | "usernameTaken"
  | "companyNameTaken"
  | "inactiveCompany"
  | "lastAdmin"
  | "setupDone"
  | "wrongPassword"
  | "tagTaken"
  | "locationNameTaken"
  | "invalidLocation"
  | "noSeats"
  | "alreadyAssigned"
  | "invalidAsset"
  | "retiredAsset"
  | "chooseAsset"
  | "seatsBelowUsage"
  | "importEmpty"
  | "importTooManyRows"
  | "importTooLarge"
  | "importUnsupported"
  | "importUnreadable"
  | "importDone"
  | "importNoName"
  | "importNothingValid"
  | "telegramTokenMissing"
  | "noChannelEnabled";

/** One problem with one form field. `key` is a full translation key ("validation.ip", "errors.serialUsedBy"). */
export type FieldIssue = { field: string; key: string; params?: Record<string, string | number> };

/** Several field problems reported together, so a form shows them all at once (QA O7). */
export class FieldErrors extends Error {
  constructor(public readonly issues: FieldIssue[]) {
    super("field errors");
    this.name = "FieldErrors";
  }
}

export class AppError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(code);
    this.name = "AppError";
  }
}
