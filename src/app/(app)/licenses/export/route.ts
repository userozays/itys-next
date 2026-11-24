import { getTranslations } from "next-intl/server";
import type { NextRequest } from "next/server";
import { todayIso } from "@/lib/dates";
import { licenseFilterFromParams } from "@/lib/list-params";
import { getActiveCompany, getActor } from "@/server/auth/context";
import { can } from "@/server/auth/permissions";
import { getDb } from "@/server/db/client";
import { licenseSheet } from "@/server/export/rows";
import { sheetResponse } from "@/server/export/sheet";
import { listLicenses } from "@/server/services/licenses";

/** The license list as Excel or CSV, with the list page's search and filter (QA Ö1). Keys are not included. */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  const company = await getActiveCompany(actor);
  if (!company) return new Response(null, { status: 404 });

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const format = params.format === "csv" ? "csv" : "xlsx";
  const { q, expiry } = licenseFilterFromParams(params);
  const t = await getTranslations();
  const rows = listLicenses(getDb(), actor, company.id, q, expiry);
  const sheet = licenseSheet(rows, t as (key: string) => string, t("licenses.title"), can.seeCosts(actor));
  return sheetResponse(sheet, format, `${t("export.licensesFile")}-${company.name}-${todayIso()}`);
}
