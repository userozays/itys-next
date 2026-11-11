import { notFound } from "next/navigation";
import type { Actor } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { getAsset, type AssetListItem } from "@/server/services/assets";

/** Loads the asset for a detail/edit page; a missing or inaccessible one is a 404. */
export function loadAsset(actor: Actor, idParam: string): AssetListItem {
  try {
    return getAsset(getDb(), actor, Number(idParam) || 0);
  } catch (e) {
    if (e instanceof AppError && e.code === "notFound") notFound();
    throw e;
  }
}
