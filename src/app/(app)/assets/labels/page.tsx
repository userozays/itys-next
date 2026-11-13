import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AssetLabel } from "@/components/asset-label";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { appOrigin, getActiveCompany, requireActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { assetStatuses, assetTypes, type AssetStatus, type AssetType } from "@/server/db/schema";
import { expiryFilters, type ExpiryFilter } from "@/lib/dates";
import { assetLabelUrl, qrSvg } from "@/server/qr";
import { getAsset, listAssetsForLabels, MAX_LABELS } from "@/server/services/assets";
import { getCompany } from "@/server/services/companies";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("labels"))("title") };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const oneOf = <T extends string>(allowed: readonly T[], v: string): T | undefined =>
  allowed.includes(v as T) ? (v as T) : undefined;

/** Labels for one device (?id=) or for everything matching the device list's filter. */
export default async function LabelsPage({ searchParams }: PageProps<"/assets/labels">) {
  const actor = await requireActor();
  const t = await getTranslations();
  const params = await searchParams;
  const db = getDb();

  let companyId: number;
  let items: { id: number; tag: string; name: string }[];
  const singleId = Number(one(params.id));
  if (singleId) {
    let asset;
    try {
      asset = getAsset(db, actor, singleId);
    } catch {
      asset = null;
    }
    if (!asset) return <EmptyState title={t("labels.empty")} />;
    companyId = asset.companyId;
    items = [asset];
  } else {
    const company = await getActiveCompany(actor);
    if (!company) return <EmptyState title={t("noCompany.title")} description={t("noCompany.description")} />;
    companyId = company.id;
    items = listAssetsForLabels(db, actor, company.id, {
      q: one(params.q).trim(),
      type: oneOf<AssetType>(assetTypes, one(params.type)),
      status: oneOf<AssetStatus>(assetStatuses, one(params.status)),
      locationId: Number(one(params.location)) || undefined,
      warranty: oneOf<ExpiryFilter>(expiryFilters, one(params.warranty)),
    });
  }

  const company = getCompany(db, actor, companyId);
  const origin = await appOrigin();
  const labels = await Promise.all(
    items.map(async (a) => ({ ...a, svg: await qrSvg(assetLabelUrl(origin, companyId, a.tag)) })),
  );

  return (
    <>
      <div className="grid gap-6 print:hidden">
        <Link href={singleId ? `/assets/${singleId}` : "/assets"} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← {t("assets.title")}
        </Link>
        <PageHeader
          title={t("labels.title")}
          description={`${t("labels.description", { count: labels.length })} ${t("labels.scanHint")}`}
          action={labels.length > 0 ? <PrintButton label={t("labels.print")} /> : null}
        />
        {labels.length >= MAX_LABELS ? <p className="text-sm text-muted-foreground">{t("labels.limited", { max: MAX_LABELS })}</p> : null}
      </div>
      {labels.length === 0 ? (
        <EmptyState title={t("labels.empty")} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2 print:grid-cols-3">
          {labels.map((l) => (
            <AssetLabel key={l.id} svg={l.svg} tag={l.tag} name={l.name} company={company.name} />
          ))}
        </div>
      )}
    </>
  );
}
