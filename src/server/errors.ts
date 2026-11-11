/** Error codes double as translation keys under "errors.*" in messages/*.json. */
export type ErrorCode =
  | "forbidden"
  | "notFound"
  | "usernameTaken"
  | "companyNameTaken"
  | "lastAdmin"
  | "setupDone"
  | "wrongPassword"
  | "tagTaken"
  | "locationNameTaken"
  | "invalidLocation"
  | "noSeats"
  | "alreadyAssigned"
  | "invalidAsset"
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

export class AppError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(code);
    this.name = "AppError";
  }
}
