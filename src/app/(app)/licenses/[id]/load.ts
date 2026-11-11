import { notFound } from "next/navigation";
import type { Actor } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { getLicense, type LicenseView } from "@/server/services/licenses";

/** Loads the license for a detail/edit page; a missing or inaccessible one is a 404. */
export function loadLicense(actor: Actor, idParam: string): LicenseView {
  try {
    return getLicense(getDb(), actor, Number(idParam) || 0);
  } catch (e) {
    if (e instanceof AppError && e.code === "notFound") notFound();
    throw e;
  }
}
