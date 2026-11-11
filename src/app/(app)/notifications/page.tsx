import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { listNotifications } from "@/server/notify/outbox";
import { getNotificationSettings } from "@/server/services/notification-settings";
import { NotificationActions, SettingsPanel } from "./notification-widgets";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("notifications"))("title") };
}

const statusVariant = { pending: "outline", sent: "secondary", failed: "destructive" } as const;

export default async function NotificationsPage() {
  const actor = await requireAdmin();
  const t = await getTranslations("notifications");
  const locale = await getLocale();
  const db = getDb();
  const values = getNotificationSettings(db, actor);
  const history = listNotifications(db, actor);
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <SettingsPanel values={values} />
      <NotificationActions />
      <Card>
        <CardHeader>
          <CardTitle>{t("historyTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead>{t("channel")}</TableHead>
                  <TableHead>{t("subject")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="text-right">{t("attempts")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="tabular-nums">{dateTime.format(new Date(n.createdAt * 1000))}</TableCell>
                    <TableCell>{t(`channels.${n.channel}`)}</TableCell>
                    <TableCell className="max-w-80">
                      <span className="block truncate">{n.subject}</span>
                      {n.status !== "sent" && n.lastError ? (
                        <span className="block truncate text-xs text-destructive">{n.lastError}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[n.status]}>{t(`statuses.${n.status}`)}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{n.attempts}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
