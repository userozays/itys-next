import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveCompany, requireActorWho } from "@/server/auth/context";
import { can } from "@/server/auth/permissions";
import { UploadForm } from "./import-widgets";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("import"))("title") };
}

export default async function ImportPage() {
  const actor = await requireActorWho(can.editInventory);
  const t = await getTranslations();
  const company = await getActiveCompany(actor);
  if (!company) {
    return (
      <>
        <PageHeader title={t("import.title")} />
        <EmptyState title={t("noCompany.title")} description={t("noCompany.description")} />
      </>
    );
  }

  return (
    <>
      <Link href="/assets" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("assets.title")}
      </Link>
      <PageHeader title={t("import.title")} description={t("import.description", { company: company.name })} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent>
            <UploadForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("import.howTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            <ol className="grid list-decimal gap-1.5 pl-5">
              <li>{t("import.how1")}</li>
              <li>{t("import.how2")}</li>
              <li>{t("import.how3")}</li>
            </ol>
            <a href="/assets/import/template" download className="font-medium text-foreground underline underline-offset-4">
              {t("import.template")}
            </a>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
