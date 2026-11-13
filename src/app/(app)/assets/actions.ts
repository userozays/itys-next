"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { getActiveCompany, requireActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { AppError, FieldErrors } from "@/server/errors";
import { runForm, text, zodIssues } from "@/server/form";
import {
  assetConflicts,
  createAsset,
  deleteAsset,
  findModelSpecs,
  getAsset,
  updateAsset,
  type ModelSpecs,
} from "@/server/services/assets";
import { assetInput } from "@/server/validation";

export async function saveAssetAction(form: FormData): Promise<FormState> {
  const actor = await requireActor();
  let savedId = 0;
  const state = await runForm(async () => {
    const raw = {
      tag: text(form, "tag"),
      name: text(form, "name"),
      type: text(form, "type"),
      status: text(form, "status"),
      brand: text(form, "brand"),
      model: text(form, "model"),
      serial: text(form, "serial"),
      locationId: Number(form.get("locationId")) || null,
      assignedTo: text(form, "assignedTo"),
      purchaseDate: text(form, "purchaseDate"),
      warrantyEnd: text(form, "warrantyEnd"),
      notes: text(form, "notes"),
      cpu: text(form, "cpu"),
      ramGb: text(form, "ramGb"),
      storage: text(form, "storage"),
      os: text(form, "os"),
      hostname: text(form, "hostname"),
      ipAddress: text(form, "ipAddress"),
      macAddress: text(form, "macAddress"),
    };
    const db = getDb();
    const id = Number(form.get("id"));
    // New devices always go to the company the user is working in; existing ones stay where they are.
    const companyId = id ? getAsset(db, actor, id).companyId : (await getActiveCompany(actor))?.id;
    if (!companyId) throw new AppError("notFound");

    // Format problems and clashes with other devices are reported together (QA O7).
    const parsed = assetInput.safeParse(raw);
    const conflicts = assetConflicts(db, companyId, raw, id || undefined);
    if (!parsed.success || conflicts.length > 0) {
      throw new FieldErrors([...(parsed.success ? [] : zodIssues(parsed.error)), ...conflicts]);
    }
    savedId = id ? updateAsset(db, actor, id, parsed.data).id : createAsset(db, actor, companyId, parsed.data).id;
    revalidatePath("/", "layout");
  });
  if (state.ok) redirect(`/assets/${savedId}`);
  return state;
}

export async function deleteAssetAction(assetId: number): Promise<FormState> {
  const actor = await requireActor();
  const state = await runForm(async () => {
    deleteAsset(getDb(), actor, assetId);
    revalidatePath("/", "layout");
  });
  if (state.ok) redirect("/assets");
  return state;
}

/** Looks up the specifications of an existing device of the same brand and model. */
export async function suggestModelSpecsAction(brand: string, model: string, excludeAssetId?: number): Promise<ModelSpecs | null> {
  const actor = await requireActor();
  return findModelSpecs(getDb(), actor, brand.slice(0, 120), model.slice(0, 120), excludeAssetId);
}
