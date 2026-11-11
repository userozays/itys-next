import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { warrantyState } from "@/lib/dates";
import type { AssetStatus } from "@/server/db/schema";

const statusVariant = { in_use: "secondary", in_stock: "outline", in_repair: "default", retired: "ghost" } as const;

export function StatusBadge({ status }: { status: AssetStatus }) {
  const t = useTranslations("assets.statuses");
  return <Badge variant={statusVariant[status]}>{t(status)}</Badge>;
}

export function WarrantyBadge({ end, today }: { end: string | null; today: string }) {
  const t = useTranslations("assets.warranty");
  const state = warrantyState(end, today);
  if (state === "expired") return <Badge variant="destructive">{t("expired")}</Badge>;
  if (state === "soon") return <Badge variant="default">{t("soon")}</Badge>;
  return null;
}

export function LicenseExpiryBadge({ end, today }: { end: string | null; today: string }) {
  const t = useTranslations("licenses.expiry");
  const state = warrantyState(end, today);
  if (state === "expired") return <Badge variant="destructive">{t("expired")}</Badge>;
  if (state === "soon") return <Badge variant="default">{t("soon")}</Badge>;
  return null;
}
