import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { moneyInputValue } from "@/lib/money";
import { requireActor } from "@/server/auth/context";
import { LicenseForm } from "../../license-form";
import { loadLicense } from "../load";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("licenses"))("edit") };
}

export default async function EditLicensePage({ params }: PageProps<"/licenses/[id]/edit">) {
  const actor = await requireActor();
  const license = loadLicense(actor, (await params).id);
  const t = await getTranslations("licenses");
  const locale = await getLocale();

  return (
    <>
      <PageHeader title={t("edit")} description={license.name} />
      <LicenseForm license={{ ...license, cost: moneyInputValue(license.costMinor, locale) }} />
    </>
  );
}
