import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { LicenseExpiryBadge } from "@/components/asset-badges";
import { ConfirmDelete } from "@/components/confirm-delete";
import { OtherCompanyNotice } from "@/components/other-company-notice";
import { BackToList } from "@/components/list-memory";
import { SeatUsage } from "@/components/seat-usage";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, todayIso } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requireActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { listAssetOptions } from "@/server/services/assets";
import { listAssignedAssets } from "@/server/services/licenses";
import { deleteLicenseAction } from "../actions";
import { AssignForm, KeyReveal, UnassignButton } from "./license-widgets";
import { loadLicense } from "./load";

export async function generateMetadata({ params }: PageProps<"/licenses/[id]">): Promise<Metadata> {
  return { title: loadLicense(await requireActor(), (await params).id).name };
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children || "—"}</dd>
    </div>
  );
}

export default async function LicensePage({ params }: PageProps<"/licenses/[id]">) {
  const actor = await requireActor();
  const license = loadLicense(actor, (await params).id);
  const t = await getTranslations();
  const locale = await getLocale();
  const db = getDb();
  const assigned = listAssignedAssets(db, actor, license.id);
  const assignedIds = new Set(assigned.map((a) => a.id));
  const options = listAssetOptions(db, actor, license.companyId)
    .filter((a) => !assignedIds.has(a.id))
    .map((a) => ({ id: a.id, label: `${a.name} (${a.tag})` }));

  return (
    <>
      <OtherCompanyNotice actor={actor} companyId={license.companyId} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <BackToList list="licenses" fallback="/licenses" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            ← {t("licenses.title")}
          </BackToList>
          <h1 className="font-heading text-xl font-semibold tracking-tight">{license.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {license.vendor ? <span>{license.vendor}</span> : null}
            <LicenseExpiryBadge end={license.expiryDate} today={todayIso()} />
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/licenses/${license.id}/edit`} className={buttonVariants({ variant: "outline" })}>
            {t("common.edit")}
          </Link>
          {actor.role === "admin" ? (
            <ConfirmDelete
              title={t("licenses.deleteTitle")}
              description={t("licenses.deleteDescription", { name: license.name })}
              action={deleteLicenseAction.bind(null, license.id)}
              trigger={<Button variant="destructive">{t("common.delete")}</Button>}
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("licenses.sections.details")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid grid-cols-2 gap-4">
              <Item label={t("licenses.seatsUsage")}>
                <SeatUsage used={license.usedSeats} seats={license.seats} />
              </Item>
              <Item label={t("licenses.expiryDate")}>
                {license.expiryDate ? formatDate(license.expiryDate, locale) : t("licenses.perpetual")}
              </Item>
              <Item label={t("licenses.cost")}>{formatMoney(license.costMinor, license.currency, locale)}</Item>
              <Item label={t("assets.updatedAt")}>{formatDate(license.updatedAt, locale)}</Item>
            </dl>
            {license.notes ? <p className="border-t pt-4 text-sm whitespace-pre-wrap">{license.notes}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("licenses.sections.key")}</CardTitle>
          </CardHeader>
          <CardContent>
            {license.hasKey ? (
              <KeyReveal licenseId={license.id} />
            ) : (
              <p className="text-sm text-muted-foreground">{t("licenses.noKey")}</p>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t("licenses.sections.devices")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {assigned.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("licenses.noDevices")}</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {assigned.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <Link href={`/assets/${a.id}`} className="min-w-0 truncate text-sm underline-offset-4 hover:underline">
                      {a.name} <span className="font-mono text-xs text-muted-foreground">{a.tag}</span>
                    </Link>
                    <UnassignButton licenseId={license.id} assetId={a.id} name={a.name} />
                  </li>
                ))}
              </ul>
            )}
            <AssignForm licenseId={license.id} options={options} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
