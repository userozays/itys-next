"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requireActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { checked, runForm, text } from "@/server/form";
import { createCompany, updateCompany } from "@/server/services/companies";
import { companyInput } from "@/server/validation";

export async function saveCompanyAction(form: FormData): Promise<FormState> {
  const actor = await requireActor();
  return runForm(async () => {
    const input = companyInput.parse({
      name: text(form, "name"),
      contact: text(form, "contact"),
      phone: text(form, "phone"),
      notes: text(form, "notes"),
      active: checked(form, "active"),
    });
    const id = Number(form.get("id"));
    if (id) updateCompany(getDb(), actor, id, input);
    else createCompany(getDb(), actor, input);
    revalidatePath("/", "layout");
  });
}
