"use server";

import { revalidatePath } from "next/cache";
import { requireActor, setCompanyCookie } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { getCompany } from "@/server/services/companies";

export async function switchCompanyAction(companyId: number): Promise<void> {
  const actor = await requireActor();
  const company = getCompany(getDb(), actor, companyId); // throws unless accessible
  await setCompanyCookie(company.id);
  revalidatePath("/", "layout");
}
