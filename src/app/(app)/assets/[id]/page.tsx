import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { LicenseExpiryBadge, StatusBadge, WarrantyBadge } from "@/components/asset-badges";
import { AssetLabel } from "@/components/asset-label";
import { ConfirmDelete } from "@/components/confirm-delete";
import { OtherCompanyNotice } from "@/components/other-company-notice";
import { BackToList } from "@/components/list-memory";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, todayIso } from "@/lib/dates";
import { appOrigin, requireActor } from "@/server/auth/context";
import { can } from "@/server/auth/permissions";
import { getDb } from "@/server/db/client";
import { assetLabelUrl, qrSvg } from "@/server/qr";
import { devicesSharingIp } from "@/server/services/assets";
import { getCompany } from "@/server/services/companies";
import { listLicensesForAsset } from "@/server/services/licenses";
import { deleteAssetAction } from "../actions";
import { loadAsset } from "./load";

export async function generateMetadata({ params }: PageProps<"/assets/[id]">): Promise<Metadata> {
  const asset = loadAsset(await requireActor(), (await params).id);
  return { title: asset.name };
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children || "—"}</dd>
    </div>
  );
}

export default async function AssetPage({ params }: PageProps<"/assets/[id]">) {
  const actor = await requireActor();
  const asset = loadAsset(actor, (await params).id);
  const t = await getTranslations();
  const locale = await getLocale();
  const company = getCompany(getDb(), actor, asset.companyId);
  const licenses = listLicensesForAsset(getDb(), actor, asset.id);
  const today = todayIso();
  const sharedIp = devicesSharingIp(getDb(), actor, asset.id);
  const hasSpecs = [asset.cpu, asset.ramGb, asset.storage, asset.os, asset.hostname, asset.ipAddress, asset.macAddress].some(Boolean);
  const qr = await qrSvg(assetLabelUrl(await appOrigin(), asset.companyId, asset.tag));

  return (
    <>
      <OtherCompanyNotice actor={actor} companyId={asset.companyId} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <BackToList list="assets" fallback="/assets" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            ← {t("assets.title")}
          </BackToList>
          <h1 className="font-heading text-xl font-semibold tracking-tight">{asset.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs">{asset.tag}</span>
            <StatusBadge status={asset.status} />
            <WarrantyBadge end={asset.warrantyEnd} today={todayIso()} status={asset.status} />
          </div>
        </div>
        <div className="flex gap-2">
          {can.editInventory(actor) ? (
            <Link href={`/assets/${asset.id}/edit`} className={buttonVariants({ variant: "outline" })}>
              {t("common.edit")}
            </Link>
          ) : null}
          {actor.role === "admin" ? (
            <ConfirmDelete
              title={t("assets.deleteTitle")}
              description={t("assets.deleteDescription", { name: asset.name, tag: asset.tag })}
              action={deleteAssetAction.bind(null, asset.id)}
              trigger={<Button variant="destructive">{t("common.delete")}</Button>}
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("assets.sections.identity")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Item label={t("assets.type")}>{t(`assets.types.${asset.type}`)}</Item>
              <Item label={t("assets.status")}>{t(`assets.statuses.${asset.status}`)}</Item>
              <Item label={t("assets.brand")}>{asset.brand}</Item>
              <Item label={t("assets.model")}>{asset.model}</Item>
              <Item label={t("assets.serial")}>{asset.serial}</Item>
              <Item label={t("assets.company")}>{company.name}</Item>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("assets.sections.specs")}</CardTitle>
          </CardHeader>
          <CardContent>
            {hasSpecs ? (
              <dl className="grid grid-cols-2 gap-4">
                <Item label={t("assets.cpu")}>{asset.cpu}</Item>
                <Item label={t("assets.ramGb")}>{asset.ramGb ? `${asset.ramGb} GB` : null}</Item>
                <Item label={t("assets.storage")}>{asset.storage}</Item>
                <Item label={t("assets.os")}>{asset.os}</Item>
                <Item label={t("assets.hostname")}>{asset.hostname}</Item>
                <Item label={t("assets.ipAddress")}>{asset.ipAddress ? <span className="font-mono text-xs">{asset.ipAddress}</span> : null}</Item>
                <Item label={t("assets.macAddress")}>{asset.macAddress ? <span className="font-mono text-xs">{asset.macAddress}</span> : null}</Item>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">{t("assets.noSpecs")}</p>
            )}
            {sharedIp.length > 0 ? (
              <p role="status" className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
                {t("assets.sharedIp")}{" "}
                {sharedIp.map((other, i) => (
                  <span key={other.id}>
                    {i > 0 ? ", " : ""}
                    <Link href={`/assets/${other.id}`} className="underline underline-offset-4">
                      {other.tag} ({other.name})
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("assets.sections.placement")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Item label={t("assets.location")}>{asset.locationName}</Item>
              <Item label={t("assets.assignedTo")}>{asset.assignedTo}</Item>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("assets.sections.purchase")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Item label={t("assets.purchaseDate")}>{formatDate(asset.purchaseDate, locale)}</Item>
              <Item label={t("assets.warrantyEnd")}>{formatDate(asset.warrantyEnd, locale)}</Item>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("assets.notes")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm whitespace-pre-wrap">{asset.notes ?? "—"}</p>
            <dl className="grid grid-cols-3 gap-4 border-t pt-4">
              <Item label={t("assets.source")}>{t(`assets.sources.${asset.source}`)}</Item>
              <Item label={t("assets.createdAt")}>{formatDate(asset.createdAt, locale)}</Item>
              <Item label={t("assets.updatedAt")}>{formatDate(asset.updatedAt, locale)}</Item>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("assets.label")}</CardTitle>
          </CardHeader>
          <CardContent className="grid justify-items-start gap-3">
            <div className="w-full max-w-64">
              <AssetLabel svg={qr} tag={asset.tag} name={asset.name} company={company.name} />
            </div>
            {can.editInventory(actor) ? (
              <Link href={`/assets/labels?id=${asset.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                {t("assets.printLabels")}
              </Link>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("licenses.onDevice")}</CardTitle>
          </CardHeader>
          <CardContent>
            {licenses.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("licenses.noneOnDevice")}</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {licenses.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <Link href={`/licenses/${l.id}`} className="underline-offset-4 hover:underline">
                      {l.name}
                    </Link>
                    <span className="flex items-center gap-1.5 text-muted-foreground tabular-nums">
                      {l.expiryDate ? formatDate(l.expiryDate, locale) : t("licenses.perpetual")}
                      <LicenseExpiryBadge end={l.expiryDate} today={today} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
