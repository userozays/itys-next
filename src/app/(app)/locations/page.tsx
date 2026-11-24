import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getActiveCompany, requireActor } from "@/server/auth/context";
import { can } from "@/server/auth/permissions";
import { getDb } from "@/server/db/client";
import { listLocations } from "@/server/services/locations";
import { deleteLocationAction } from "./actions";
import { LocationDialog } from "./location-dialog";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("locations"))("title") };
}

export default async function LocationsPage() {
  const actor = await requireActor();
  const t = await getTranslations();
  const company = await getActiveCompany(actor);
  if (!company) {
    return (
      <>
        <PageHeader title={t("locations.title")} />
        <EmptyState title={t("noCompany.title")} description={t("noCompany.description")} />
      </>
    );
  }
  const locations = listLocations(getDb(), actor, company.id);
  const canEdit = can.editInventory(actor);

  return (
    <>
      <PageHeader
        title={t("locations.title")}
        description={t("locations.description", { company: company.name })}
        action={canEdit ? <LocationDialog trigger={<Button>{t("locations.new")}</Button>} /> : null}
      />
      {locations.length === 0 ? (
        <EmptyState title={t("locations.empty")} />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("locations.name")}</TableHead>
                <TableHead>{t("locations.assetCount")}</TableHead>
                {canEdit ? <TableHead className="text-right">{t("common.actions")}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    {/* Opens the device list filtered to this location (QA Ö3). */}
                    <Link href={`/assets?location=${l.id}`} className="underline-offset-4 hover:underline">
                      {l.name}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {l.assetCount > 0 ? (
                      <Link href={`/assets?location=${l.id}`} className="underline underline-offset-4">
                        {l.assetCount}
                      </Link>
                    ) : (
                      0
                    )}
                  </TableCell>
                  {canEdit ? (
                    <TableCell className="text-right">
                      <LocationDialog
                        location={{ id: l.id, name: l.name }}
                        trigger={
                          <Button variant="ghost" size="sm" aria-label={`${t("common.edit")}: ${l.name}`}>
                            {t("common.edit")}
                          </Button>
                        }
                      />
                      {actor.role === "admin" ? (
                        <ConfirmDelete
                          title={t("locations.deleteTitle")}
                          description={t("locations.deleteDescription", {
                            name: l.name,
                            count: l.assetCount,
                          })}
                          action={deleteLocationAction.bind(null, l.id)}
                          trigger={
                            <Button variant="ghost" size="sm" aria-label={`${t("common.delete")}: ${l.name}`}>
                              {t("common.delete")}
                            </Button>
                          }
                        />
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
