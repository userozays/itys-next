import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { needsSetup } from "@/server/services/users";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth"))("loginTitle") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const raw = (await searchParams).next;
  const next = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  if (await getActor()) redirect("/");
  if (needsSetup(getDb())) redirect("/setup");
  const t = await getTranslations();

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <p className="text-xs font-medium tracking-wide text-muted-foreground">{t("app.title")}</p>
        <CardTitle>
          <h1>{t("auth.loginTitle")}</h1>
        </CardTitle>
        <CardDescription>{t("auth.loginDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={next} />
      </CardContent>
    </Card>
  );
}
