"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { getActiveCompany, requireActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { runForm, text } from "@/server/form";
import { createAsset, deleteAsset, findModelSpecs, updateAsset, type ModelSpecs } from "@/server/services/assets";
import { assetInput } from "@/server/validation";

export async function saveAssetAction(form: FormData): Promise<FormState> {
  const actor = await requireActor();
  let savedId = 0;
  const state = await runForm(async () => {
    const input = assetInput.parse({
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
    });
    const id = Number(form.get("id"));
    if (id) {
      savedId = updateAsset(getDb(), actor, id, input).id;
    } else {
      // New devices always go to the company the user is working in.
      const company = await getActiveCompany(actor);
      if (!company) throw new AppError("notFound");
      savedId = createAsset(getDb(), actor, company.id, input).id;
    }
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
