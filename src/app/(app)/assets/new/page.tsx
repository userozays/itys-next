import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getActiveCompany, requireActorWho } from "@/server/auth/context";
import { can } from "@/server/auth/permissions";
import { getDb } from "@/server/db/client";
import { listAssignees } from "@/server/services/assets";
import { listLocations } from "@/server/services/locations";
import { AssetForm } from "../asset-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("assets"))("new") };
}

export default async function NewAssetPage() {
  const actor = await requireActorWho(can.editInventory);
  const company = await getActiveCompany(actor);
  if (!company) redirect("/assets");
  const t = await getTranslations("assets");
  const locations = listLocations(getDb(), actor, company.id).map((l) => ({ id: l.id, name: l.name }));
  const assignees = listAssignees(getDb(), actor, company.id);

  return (
    <>
      <PageHeader title={t("new")} description={company.name} />
      <AssetForm locations={locations} assignees={assignees} />
    </>
  );
}
