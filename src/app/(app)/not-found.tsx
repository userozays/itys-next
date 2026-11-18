import { getTranslations } from "next-intl/server";
import { StatusPage } from "@/components/status-page";

export default async function NotFound() {
  const t = await getTranslations("pages");
  return <StatusPage code="404" title={t("notFoundTitle")} text={t("notFoundText")} homeLabel={t("home")} />;
}
