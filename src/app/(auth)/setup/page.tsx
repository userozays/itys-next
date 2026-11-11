import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/server/db/client";
import { needsSetup } from "@/server/services/users";
import { SetupForm } from "./setup-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth"))("setupTitle") };
}

export default async function SetupPage() {
  await connection();
  if (!needsSetup(getDb())) redirect("/login");
  const t = await getTranslations();

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <p className="text-xs font-medium tracking-wide text-muted-foreground">{t("app.title")}</p>
        <CardTitle>
          <h1>{t("auth.setupTitle")}</h1>
        </CardTitle>
        <CardDescription>{t("auth.setupDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <SetupForm />
      </CardContent>
    </Card>
  );
}
