import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { listCompanies } from "@/server/services/companies";
import { listUsers } from "@/server/services/users";
import { ResetPasswordDialog, UserDialog } from "./user-dialogs";
import { ConfirmDelete } from "@/components/confirm-delete";
import { deleteUserAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("users"))("title") };
}

export default async function UsersPage() {
  const actor = await requireAdmin();
  const t = await getTranslations();
  const db = getDb();
  const users = listUsers(db, actor);
  const companies = listCompanies(db, actor).map((c) => ({ id: c.id, name: c.name, active: c.active }));
  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader
        title={t("users.title")}
        description={t("users.description")}
        action={<UserDialog companies={companies} trigger={<Button>{t("users.new")}</Button>} />}
      />
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("users.username")}</TableHead>
              <TableHead>{t("users.name")}</TableHead>
              <TableHead>{t("users.role")}</TableHead>
              <TableHead>{t("users.companies")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.username}</TableCell>
                <TableCell>{u.name}</TableCell>
                <TableCell>
                  {t(`users.roles.${u.role}`)}
                  {u.role === "technician" && u.canSeeLicenseKeys ? (
                    <span className="block text-xs text-muted-foreground">{t("users.keyAccess")}</span>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-64 truncate text-muted-foreground">
                  {u.role === "admin"
                    ? t("users.allCompanies")
                    : u.companyIds.map((id) => companyName.get(id)).join(", ") || t("users.noCompanies")}
                </TableCell>
                <TableCell>
                  <Badge variant={u.active ? "secondary" : "outline"}>
                    {u.active ? t("common.active") : t("common.inactive")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <UserDialog
                    user={u}
                    companies={companies}
                    trigger={
                      <Button variant="ghost" size="sm" aria-label={`${t("common.edit")}: ${u.username}`}>
                        {t("common.edit")}
                      </Button>
                    }
                  />
                  <ResetPasswordDialog
                    user={u}
                    trigger={
                      <Button variant="ghost" size="sm" aria-label={`${t("users.resetPassword")}: ${u.username}`}>
                        {t("users.resetPassword")}
                      </Button>
                    }
                  />
                  {u.id === actor.id ? null : (
                    <ConfirmDelete
                      title={t("users.deleteTitle")}
                      description={t("users.deleteDescription", { name: u.username })}
                      action={deleteUserAction.bind(null, u.id)}
                      trigger={
                        <Button variant="ghost" size="sm" aria-label={`${t("common.delete")}: ${u.username}`}>
                          {t("common.delete")}
                        </Button>
                      }
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
