import { getTranslations } from "next-intl/server";
import type { Actor } from "@/server/auth/sessions";
import { getActiveCompany } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { getCompany } from "@/server/services/companies";
import { SwitchCompanyButton } from "./switch-company-button";

/**
 * Shown on a record that belongs to another company than the one the user is
 * working in (opened from a link, a QR label or the dashboard), with a button
 * to switch to it (QA O8).
 */
export async function OtherCompanyNotice({ actor, companyId }: { actor: Actor; companyId: number }) {
  const active = await getActiveCompany(actor);
  if (!active || active.id === companyId) return null;
  const record = getCompany(getDb(), actor, companyId);
  const t = await getTranslations("otherCompany");

  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <p>{t("notice", { company: record.name, active: active.name })}</p>
      <SwitchCompanyButton companyId={record.id} label={t("switch", { company: record.name })} />
    </div>
  );
}
