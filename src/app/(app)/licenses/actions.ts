"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { getActiveCompany, requireActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { checked, runForm, text } from "@/server/form";
import {
  assignLicense,
  createLicense,
  deleteLicense,
  revealLicenseKey,
  unassignLicense,
  updateLicense,
} from "@/server/services/licenses";
import { licenseInput } from "@/server/validation";

export async function saveLicenseAction(form: FormData): Promise<FormState> {
  const actor = await requireActor();
  let savedId = 0;
  const state = await runForm(async () => {
    const input = licenseInput.parse({
      name: text(form, "name"),
      vendor: text(form, "vendor"),
      seats: text(form, "seats"),
      key: text(form, "key"),
      clearKey: checked(form, "clearKey"),
      kind: text(form, "kind") || undefined,
      billingPeriod: text(form, "billingPeriod") || undefined,
      purchaseDate: text(form, "purchaseDate"),
      expiryDate: text(form, "expiryDate"),
      cost: text(form, "cost"),
      currency: text(form, "currency") || undefined,
      notes: text(form, "notes"),
    });
    const id = Number(form.get("id"));
    if (id) {
      savedId = updateLicense(getDb(), actor, id, input).id;
    } else {
      const company = await getActiveCompany(actor);
      if (!company) throw new AppError("notFound");
      savedId = createLicense(getDb(), actor, company.id, input).id;
    }
    revalidatePath("/", "layout");
  });
  if (state.ok) redirect(`/licenses/${savedId}`);
  return state;
}

export async function deleteLicenseAction(licenseId: number): Promise<FormState> {
  const actor = await requireActor();
  const state = await runForm(async () => {
    deleteLicense(getDb(), actor, licenseId);
    revalidatePath("/", "layout");
  });
  if (state.ok) redirect("/licenses");
  return state;
}

/** Returns the decrypted key to someone who may access the license. */
export async function revealLicenseKeyAction(licenseId: number): Promise<{ key: string | null; error?: string }> {
  const actor = await requireActor();
  let key: string | null = null;
  const state = await runForm(async () => {
    key = revealLicenseKey(getDb(), actor, licenseId);
  });
  return { key, error: state.error };
}

export async function assignLicenseAction(licenseId: number, form: FormData): Promise<FormState> {
  const actor = await requireActor();
  return runForm(async () => {
    assignLicense(getDb(), actor, licenseId, Number(form.get("assetId")) || 0);
    revalidatePath("/", "layout");
  });
}

export async function unassignLicenseAction(licenseId: number, assetId: number): Promise<FormState> {
  const actor = await requireActor();
  return runForm(async () => {
    unassignLicense(getDb(), actor, licenseId, assetId);
    revalidatePath("/", "layout");
  });
}
