import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { LicenseExpiryBadge } from "@/components/asset-badges";
import { EmptyState } from "@/components/empty-state";
import { FilterForm } from "@/components/filter-form";
import { RememberListUrl } from "@/components/list-memory";
import { PageHeader } from "@/components/page-header";
import { SeatUsage } from "@/components/seat-usage";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, todayIso } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getActiveCompany, requireActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { listLicenses } from "@/server/services/licenses";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("licenses"))("title") };
}

export default async function LicensesPage({ searchParams }: PageProps<"/licenses">) {
  const actor = await requireActor();
  const t = await getTranslations();
  const company = await getActiveCompany(actor);
  if (!company) {
    return (
      <>
        <PageHeader title={t("licenses.title")} />
        <EmptyState title={t("noCompany.title")} description={t("noCompany.description")} />
      </>
    );
  }

  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const rows = listLicenses(getDb(), actor, company.id, q);
  const locale = await getLocale();
  const today = todayIso();

  return (
    <>
      <RememberListUrl list="licenses" />
      <PageHeader
        title={t("licenses.title")}
        description={t("licenses.description", { company: company.name })}
        action={
          <Link href="/licenses/new" className={buttonVariants()}>
            {t("licenses.new")}
          </Link>
        }
      />
      <FilterForm action="/licenses" className="flex flex-wrap items-center gap-2">
        <Input
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t("licenses.searchPlaceholder")}
          aria-label={t("licenses.search")}
          className="w-full sm:w-64"
        />
        {q ? (
          <button type="button" data-filter-clear className={buttonVariants({ variant: "ghost" })}>
            {t("assets.clear")}
          </button>
        ) : null}
      </FilterForm>

      {rows.length === 0 ? (
        <EmptyState
          title={q ? t("licenses.emptyFiltered") : t("licenses.empty")}
          action={
            q ? null : (
              <Link href="/licenses/new" className={buttonVariants()}>
                {t("licenses.addFirst")}
              </Link>
            )
          }
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("licenses.name")}</TableHead>
                <TableHead>{t("licenses.seatsUsage")}</TableHead>
                <TableHead>{t("licenses.expiryDate")}</TableHead>
                <TableHead className="text-right">{t("licenses.cost")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    <Link href={`/licenses/${l.id}`} className="underline-offset-4 hover:underline">
                      {l.name}
                    </Link>
                    {l.vendor ? <span className="block text-xs font-normal text-muted-foreground">{l.vendor}</span> : null}
                  </TableCell>
                  <TableCell>
                    <SeatUsage used={l.usedSeats} seats={l.seats} />
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-1.5 tabular-nums">
                      {l.expiryDate ? formatDate(l.expiryDate, locale) : t("licenses.perpetual")}
                      <LicenseExpiryBadge end={l.expiryDate} today={today} />
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(l.costMinor, l.currency, locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
