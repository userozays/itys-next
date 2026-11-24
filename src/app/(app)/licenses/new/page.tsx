import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getActiveCompany, requireActorWho } from "@/server/auth/context";
import { can } from "@/server/auth/permissions";
import { LicenseForm } from "../license-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("licenses"))("new") };
}

export default async function NewLicensePage() {
  const actor = await requireActorWho(can.manageLicenses);
  const company = await getActiveCompany(actor);
  if (!company) redirect("/licenses");
  const t = await getTranslations("licenses");

  return (
    <>
      <PageHeader title={t("new")} description={company.name} />
      <LicenseForm />
    </>
  );
}
