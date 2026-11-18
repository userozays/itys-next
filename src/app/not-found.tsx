import { getTranslations } from "next-intl/server";
import { StatusPage } from "@/components/status-page";

// Shown outside the app shell, for example when notFound() runs on a sign-in page.
// Unknown addresses of signed-in users land in (app)/[...missing] and get the shell.
export default async function NotFound() {
  const t = await getTranslations("pages");
  return (
    <main className="flex flex-1 items-center justify-center">
      <StatusPage code="404" title={t("notFoundTitle")} text={t("notFoundText")} homeLabel={t("home")} />
    </main>
  );
}
