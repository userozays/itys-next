import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CompanySwitcher } from "@/components/shell/company-switcher";
import { NavLinks } from "@/components/shell/nav-links";
import { ThemeToggle, UserMenu } from "@/components/shell/user-menu";
import { getActiveCompany, requireActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { listCompanies } from "@/server/services/companies";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const t = await getTranslations();
  const companies = listCompanies(getDb(), actor)
    .filter((c) => c.active)
    .map((c) => ({ id: c.id, name: c.name }));
  const active = await getActiveCompany(actor);
  const isAdmin = actor.role === "admin";

  return (
    <div className="flex min-h-dvh flex-1">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-background px-3 py-2 text-sm font-medium shadow-md ring-1 ring-ring focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t("pages.skipToContent")}
      </a>
      <aside className="hidden w-56 print:!hidden shrink-0 flex-col gap-4 border-r bg-muted/30 p-3 md:flex">
        <Link href="/" className="px-3 pt-1 font-heading text-base font-semibold tracking-tight">
          {t("app.name")}
        </Link>
        <NavLinks isAdmin={isAdmin} orientation="vertical" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 print:hidden items-center gap-2 border-b px-4">
          <Link href="/" className="font-heading font-semibold md:hidden">
            {t("app.name")}
          </Link>
          <CompanySwitcher companies={companies} activeId={active?.id ?? null} />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu name={actor.name} roleLabel={t(`users.roles.${actor.role}`)} />
          </div>
        </header>
        <div className="border-b px-4 py-1.5 md:hidden print:hidden">
          <NavLinks isAdmin={isAdmin} orientation="horizontal" />
        </div>
        <main id="main" tabIndex={-1} className="mx-auto outline-none grid w-full max-w-5xl grid-cols-[minmax(0,1fr)] content-start gap-6 p-4 md:p-6 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}
