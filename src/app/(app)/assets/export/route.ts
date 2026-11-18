import { getTranslations } from "next-intl/server";
import type { NextRequest } from "next/server";
import { todayIso } from "@/lib/dates";
import { assetFilterFromParams } from "@/lib/list-params";
import { getActiveCompany, getActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { assetSheet } from "@/server/export/rows";
import { sheetResponse } from "@/server/export/sheet";
import { listAssetsForExport } from "@/server/services/assets";

/** The device list as Excel or CSV, with the filters and order of the list page (QA Ö1). */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  const company = await getActiveCompany(actor);
  if (!company) return new Response(null, { status: 404 });

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const format = params.format === "csv" ? "csv" : "xlsx";
  const t = await getTranslations();
  const { rows } = listAssetsForExport(getDb(), actor, company.id, assetFilterFromParams(params));
  const sheet = assetSheet(rows, t as (key: string) => string, t("assets.title"));
  return sheetResponse(sheet, format, `${t("export.assetsFile")}-${company.name}-${todayIso()}`);
}
