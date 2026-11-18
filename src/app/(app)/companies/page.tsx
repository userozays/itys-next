import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { companyRecordCounts, listCompanies } from "@/server/services/companies";
import { CompanyDialog } from "./company-dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { deleteCompanyAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("companies"))("title") };
}

export default async function CompaniesPage() {
  const actor = await requireActor();
  const t = await getTranslations();
  const companies = listCompanies(getDb(), actor);
  const isAdmin = actor.role === "admin";
  const recordCounts = isAdmin ? companyRecordCounts(getDb(), actor) : new Map<number, number>();

  return (
    <>
      <PageHeader
        title={t("companies.title")}
        description={t("companies.description")}
        action={isAdmin ? <CompanyDialog trigger={<Button>{t("companies.new")}</Button>} /> : null}
      />
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("companies.name")}</TableHead>
              <TableHead>{t("companies.contact")}</TableHead>
              <TableHead>{t("companies.phone")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              {isAdmin ? <TableHead className="text-right">{t("common.actions")}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 5 : 4} className="h-24 text-center text-muted-foreground">
                  {t("companies.empty")}
                </TableCell>
              </TableRow>
            ) : (
              companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.contact ?? "—"}</TableCell>
                  <TableCell>{c.phone ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={c.active ? "secondary" : "outline"}>
                      {c.active ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </TableCell>
                  {isAdmin ? (
                    <TableCell className="text-right">
                      <CompanyDialog
                        company={{ id: c.id, name: c.name, contact: c.contact, phone: c.phone, notes: c.notes, active: c.active }}
                        trigger={
                          <Button variant="ghost" size="sm" aria-label={`${t("common.edit")}: ${c.name}`}>
                            {t("common.edit")}
                          </Button>
                        }
                      />
                      {/* Only empty companies can be deleted; others are made inactive (QA Ö8). */}
                      {(recordCounts.get(c.id) ?? 0) === 0 ? (
                        <ConfirmDelete
                          title={t("companies.deleteTitle")}
                          description={t("companies.deleteDescription", { name: c.name })}
                          action={deleteCompanyAction.bind(null, c.id)}
                          trigger={
                            <Button variant="ghost" size="sm" aria-label={`${t("common.delete")}: ${c.name}`}>
                              {t("common.delete")}
                            </Button>
                          }
                        />
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
