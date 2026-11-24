import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { requireActorWho } from "@/server/auth/context";
import { can } from "@/server/auth/permissions";
import { getDb } from "@/server/db/client";
import { listAssignees } from "@/server/services/assets";
import { listLocations } from "@/server/services/locations";
import { AssetForm } from "../../asset-form";
import { loadAsset } from "../load";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("assets"))("edit") };
}

export default async function EditAssetPage({ params }: PageProps<"/assets/[id]/edit">) {
  const actor = await requireActorWho(can.editInventory);
  const asset = loadAsset(actor, (await params).id);
  const t = await getTranslations("assets");
  const locations = listLocations(getDb(), actor, asset.companyId).map((l) => ({ id: l.id, name: l.name }));
  const assignees = listAssignees(getDb(), actor, asset.companyId);

  return (
    <>
      <PageHeader title={t("edit")} description={`${asset.name} · ${asset.tag}`} />
      <AssetForm asset={asset} locations={locations} assignees={assignees} />
    </>
  );
}
