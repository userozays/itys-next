"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { StatusPage } from "@/components/status-page";
import { Button } from "@/components/ui/button";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("pages");
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage code={digest ? t("errorCode", { code: digest }) : "500"} title={t("errorTitle")} text={t("errorText")} homeLabel={t("home")}>
      <Button onClick={() => retry()}>{t("retry")}</Button>
    </StatusPage>
  );
}
