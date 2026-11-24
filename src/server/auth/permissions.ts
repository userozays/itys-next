import { AppError } from "../errors";
import type { Actor } from "./sessions";

type Who = Pick<Actor, "role" | "canSeeLicenseKeys">;

/**
 * What each role may do. Pages hide what is not allowed; services refuse it.
 *
 * | | admin | technician | viewer |
 * |---|---|---|---|
 * | devices, locations, import, labels, assigning licenses | ✓ | ✓ | — |
 * | adding and editing licenses, costs | ✓ | — | — |
 * | license keys | ✓ | if allowed | — |
 * | deleting, users, companies, notifications | ✓ | — | — |
 */
export const can = {
  editInventory: (a: Who) => a.role !== "viewer",
  manageLicenses: (a: Who) => a.role === "admin",
  seeCosts: (a: Who) => a.role === "admin",
  seeLicenseKeys: (a: Who) => a.role === "admin" || (a.role === "technician" && a.canSeeLicenseKeys),
};

export function assertCan(allowed: boolean): void {
  if (!allowed) throw new AppError("forbidden");
}
