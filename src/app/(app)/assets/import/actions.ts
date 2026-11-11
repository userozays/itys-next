"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { getActiveCompany, requireActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { runForm } from "@/server/form";
import { importFields } from "@/server/import/mapping";
import { parseSpreadsheet } from "@/server/import/parse";
import { createImportJob, runImport, setImportMapping } from "@/server/services/imports";

export async function uploadImportAction(form: FormData): Promise<FormState> {
  const actor = await requireActor();
  let jobId = 0;
  const state = await runForm(async () => {
    const company = await getActiveCompany(actor);
    if (!company) throw new AppError("notFound");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("importEmpty");
    const sheet = await parseSpreadsheet(file.name, new Uint8Array(await file.arrayBuffer()));
    jobId = createImportJob(getDb(), actor, company.id, file.name, sheet);
  });
  if (state.ok) redirect(`/assets/import/${jobId}`);
  return state;
}

export async function saveMappingAction(jobId: number, form: FormData): Promise<FormState> {
  const actor = await requireActor();
  return runForm(async () => {
    setImportMapping(getDb(), actor, jobId, Object.fromEntries(importFields.map((f) => [f, form.get(f)])));
    revalidatePath(`/assets/import/${jobId}`);
  });
}

export async function runImportAction(jobId: number): Promise<FormState> {
  const actor = await requireActor();
  return runForm(async () => {
    runImport(getDb(), actor, jobId);
    revalidatePath("/", "layout");
  });
}
