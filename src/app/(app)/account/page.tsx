import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActor } from "@/server/auth/context";
import { PasswordForm } from "./password-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account"))("title") };
}

export default async function AccountPage() {
  const actor = await requireActor();
  const t = await getTranslations();

  return (
    <>
      <PageHeader title={t("account.title")} description={`${actor.name} · ${actor.username} · ${t(`users.roles.${actor.role}`)}`} />
      <Card>
        <CardHeader>
          <CardTitle>{t("account.changePassword")}</CardTitle>
          <CardDescription>{t("account.changePasswordHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </>
  );
}
