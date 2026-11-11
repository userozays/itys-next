import { createTranslator } from "next-intl";
import tr from "../../../messages/tr.json";
import { formatDate } from "../../lib/dates";
import type { ExpiryKind } from "../db/schema";

export type DueItem = {
  kind: ExpiryKind;
  refId: number;
  companyName: string;
  /** Device or software name, with the tag for devices. */
  label: string;
  dueDate: string;
  daysLeft: number;
};

export type Message = { subject: string; body: string };

// Notifications are not tied to a browser session, so they use the default language.
const locale = "tr";
const t = createTranslator({ locale, messages: tr, namespace: "notify" });

function line(item: DueItem): string {
  const when =
    item.daysLeft > 0
      ? t("daysLeft", { days: item.daysLeft })
      : item.daysLeft === 0
        ? t("today")
        : t("daysAgo", { days: -item.daysLeft });
  return `• ${t(`kind.${item.kind}`)}: ${item.label} — ${when} (${formatDate(item.dueDate, locale)})`;
}

/** One plain-text message covering every item, grouped by company, soonest first. */
export function buildDigest(items: DueItem[]): Message {
  const byCompany = new Map<string, DueItem[]>();
  for (const item of [...items].sort((a, b) => a.daysLeft - b.daysLeft || a.label.localeCompare(b.label, locale))) {
    byCompany.set(item.companyName, [...(byCompany.get(item.companyName) ?? []), item]);
  }
  const sections = [...byCompany.entries()]
    .sort(([a], [b]) => a.localeCompare(b, locale))
    .map(([company, list]) => [company, ...list.map(line)].join("\n"));
  return { subject: t("subject", { count: items.length }), body: [t("intro"), ...sections].join("\n\n") };
}

export function buildTestMessage(): Message {
  return { subject: t("testSubject"), body: t("testBody") };
}
