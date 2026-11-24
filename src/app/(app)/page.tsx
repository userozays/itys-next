import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveCompany, requireActor } from "@/server/auth/context";
import { formatDate, todayIso } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getDb } from "@/server/db/client";
import { assetStatuses, assetTypes, currencies } from "@/server/db/schema";
import { upcomingExpiries } from "@/server/notify/expiry";
import { assetSummary } from "@/server/services/assets";
import { listCompanies } from "@/server/services/companies";
import { licenseSummary, type LicenseSummary, type MoneyByCurrency } from "@/server/services/licenses";

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl tabular-nums break-words sm:text-2xl">{value}</CardTitle>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </CardHeader>
    </Card>
  );
}

/** Seat usage, licenses ending soon and what licenses cost, per currency (QA Ö6). */
async function LicenseSummaryCard({ summary, locale }: { summary: LicenseSummary; locale: string }) {
  const t = await getTranslations("dashboard.licenseSummary");
  const money = (amounts: MoneyByCurrency) => {
    const parts = currencies.filter((c) => amounts[c]).map((c) => formatMoney(amounts[c]!, c, locale));
    return parts.length > 0 ? parts.join(" · ") : t("none");
  };
  const percent = summary.seatsTotal > 0 ? Math.round((summary.seatsUsed / summary.seatsTotal) * 100) : 0;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{t("title")}</CardTitle>
        <Link href="/licenses" className="text-sm underline underline-offset-4">
          {t("seeAll")}
        </Link>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid content-start gap-1">
            <dt className="text-xs text-muted-foreground">{t("seats")}</dt>
            {summary.seatsTotal > 0 ? (
              <dd className="grid gap-1.5">
                <span className="font-medium tabular-nums">
                  {t("seatsValue", { used: summary.seatsUsed, total: summary.seatsTotal })} (%{percent})
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                </span>
                <span className="text-xs text-muted-foreground">{t("full", { count: summary.fullCount })}</span>
              </dd>
            ) : (
              <dd className="text-sm text-muted-foreground">{t("seatsNone")}</dd>
            )}
          </div>
          <div className="grid content-start gap-1">
            <dt className="text-xs text-muted-foreground">{t("endingSoon")}</dt>
            <dd>
              <Link href="/licenses?expiry=soon" className="font-medium tabular-nums underline-offset-4 hover:underline">
                {summary.endingSoon}
              </Link>
            </dd>
          </div>
          <div className="grid content-start gap-1">
            <dt className="text-xs text-muted-foreground">{t("yearly")}</dt>
            <dd className="font-medium tabular-nums">{money(summary.yearlySubscriptions)}</dd>
          </div>
          <div className="grid content-start gap-1">
            <dt className="text-xs text-muted-foreground">{t("perpetual")}</dt>
            <dd className="font-medium tabular-nums">{money(summary.perpetualPurchases)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

/** Counts as horizontal bars; each row links to the filtered device list. */
function Breakdown({ title, rows }: { title: string; rows: { label: string; count: number; href: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {rows.map((r) => (
          <Link key={r.href} href={r.href} className="group grid grid-cols-[7rem_1fr_2rem] items-center gap-3 text-sm">
            <span className="truncate text-muted-foreground group-hover:text-foreground">{r.label}</span>
            <span className="h-2 rounded-full bg-muted">
              <span className="block h-2 rounded-full bg-primary" style={{ width: `${(r.count / max) * 100}%` }} />
            </span>
            <span className="text-right tabular-nums">{r.count}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

const SHOWN_EXPIRIES = 10;

export default async function DashboardPage() {
  const actor = await requireActor();
  const t = await getTranslations("dashboard");
  const ta = await getTranslations("assets");
  const db = getDb();
  const active = await getActiveCompany(actor);
  const companyCount = listCompanies(db, actor).filter((c) => c.active).length;
  const isAdmin = actor.role === "admin";
  const summary = active ? assetSummary(db, actor, active.id) : null;
  const licenses = active ? licenseSummary(db, actor, active.id) : null;
  const expiries = active ? upcomingExpiries(db, actor, active.id, todayIso()) : [];
  const tn = await getTranslations("notify");
  const locale = await getLocale();

  return (
    <>
      <PageHeader title={t("title")} description={t("welcome", { name: actor.name })} />
      {/* Two by two on phones (QA UX note). */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={t("activeCompany")} value={active?.name ?? "—"} />
        <Stat
          label={t("assetCount")}
          value={summary?.total ?? 0}
          note={summary ? t("activeAssets", { count: summary.total - (summary.byStatus.retired ?? 0) }) : undefined}
        />
        <Stat label={t("licenseCount")} value={licenses?.count ?? 0} />
        <Stat label={t("companyCount")} value={companyCount} />
      </div>
      {!summary ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{t("noCompany")}</p>
            <p>{isAdmin ? t("noCompanyAdminHint") : t("noCompanyTechnicianHint")}</p>
          </CardContent>
        </Card>
      ) : summary.total === 0 ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            {t("noAssets")}
            <Link href="/assets/new" className={buttonVariants()}>
              {t("addFirst")}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Breakdown
            title={t("byType")}
            rows={assetTypes
              .filter((v) => summary.byType[v])
              .map((v) => ({ label: ta(`types.${v}`), count: summary.byType[v], href: `/assets?type=${v}` }))}
          />
          <Breakdown
            title={t("byStatus")}
            rows={assetStatuses
              .filter((v) => summary.byStatus[v])
              .map((v) => ({ label: ta(`statuses.${v}`), count: summary.byStatus[v], href: `/assets?status=${v}` }))}
          />
        </div>
      )}
      {licenses && licenses.count > 0 ? <LicenseSummaryCard summary={licenses} locale={locale} /> : null}
      {active ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("expiriesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {expiries.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("expiriesEmpty")}</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {expiries.slice(0, SHOWN_EXPIRIES).map((item) => (
                  <li key={`${item.kind}-${item.refId}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <Link
                      href={item.kind === "warranty" ? `/assets/${item.refId}` : `/licenses/${item.refId}`}
                      className="min-w-0 truncate underline-offset-4 hover:underline"
                    >
                      <span className="text-muted-foreground">{tn(`kind.${item.kind}`)}:</span> {item.label}
                    </Link>
                    <span className="flex items-center gap-2 text-muted-foreground tabular-nums">
                      {formatDate(item.dueDate, locale)}
                      <Badge variant={item.daysLeft <= 0 ? "destructive" : item.daysLeft <= 7 ? "default" : "secondary"}>
                        {item.daysLeft > 0
                          ? tn("daysLeft", { days: item.daysLeft })
                          : item.daysLeft === 0
                            ? tn("today")
                            : tn("daysAgo", { days: -item.daysLeft })}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {expiries.length > SHOWN_EXPIRIES ? (
              <p className="mt-3 text-sm text-muted-foreground">{t("expiriesMore", { total: expiries.length, shown: SHOWN_EXPIRIES })}</p>
            ) : null}
            <nav aria-label={t("expiriesTitle")} className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link href="/assets?warranty=soon" className="underline underline-offset-4">
                {t("seeWarrantySoon")}
              </Link>
              <Link href="/assets?warranty=expired" className="underline underline-offset-4">
                {t("seeWarrantyExpired")}
              </Link>
              <Link href="/licenses?expiry=soon" className="underline underline-offset-4">
                {t("seeLicensesSoon")}
              </Link>
              <Link href="/licenses?expiry=expired" className="underline underline-offset-4">
                {t("seeLicensesExpired")}
              </Link>
            </nav>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
