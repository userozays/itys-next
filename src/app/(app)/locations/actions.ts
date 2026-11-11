"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { getActiveCompany, requireActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { runForm, text } from "@/server/form";
import { createLocation, deleteLocation, renameLocation } from "@/server/services/locations";
import { locationInput } from "@/server/validation";

export async function saveLocationAction(form: FormData): Promise<FormState> {
  const actor = await requireActor();
  return runForm(async () => {
    const input = locationInput.parse({ name: text(form, "name") });
    const id = Number(form.get("id"));
    if (id) {
      renameLocation(getDb(), actor, id, input);
    } else {
      const company = await getActiveCompany(actor);
      if (!company) throw new AppError("notFound");
      createLocation(getDb(), actor, company.id, input);
    }
    revalidatePath("/", "layout");
  });
}

export async function deleteLocationAction(locationId: number): Promise<FormState> {
  const actor = await requireActor();
  return runForm(async () => {
    deleteLocation(getDb(), actor, locationId);
    revalidatePath("/", "layout");
  });
}
