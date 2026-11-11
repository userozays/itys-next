import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { requireActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { importFields } from "@/server/import/mapping";
import { getImportJob, previewImport, type ImportJob, type SkippedRow } from "@/server/services/imports";
import { MappingForm, RunImportButton } from "../import-widgets";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("import"))("title") };
}

const SHOWN_SKIPPED = 100;
const SHOWN_SAMPLE = 5;

export default async function ImportJobPage({ params }: PageProps<"/assets/import/[id]">) {
  const actor = await requireActor();
  const t = await getTranslations();
  const locale = await getLocale();
  const db = getDb();

  let job: ImportJob;
  try {
    job = getImportJob(db, actor, Number((await params).id) || 0);
  } catch (e) {
    if (e instanceof AppError && e.code === "notFound") notFound();
    throw e;
  }

  const skippedList = (skipped: SkippedRow[]) => (
    <ul className="grid gap-1 text-sm">
      {skipped.slice(0, SHOWN_SKIPPED).map((s) => (
        <li key={s.row}>
          <span className="font-medium tabular-nums">
            {t("import.row")} {s.row}:
          </span>{" "}
          <span className="text-muted-foreground">
            {s.issues.map((i) => `${t(`assets.${i.field}`)} — ${t(`import.issues.${i.code}`)}`).join("; ")}
          </span>
        </li>
      ))}
      {skipped.length > SHOWN_SKIPPED ? (
        <li className="text-muted-foreground">{t("import.skippedMore", { count: skipped.length - SHOWN_SKIPPED })}</li>
      ) : null}
    </ul>
  );

  if (job.status === "done") {
    return (
      <>
        <PageHeader
          title={t("import.doneTitle")}
          description={`${job.filename} · ${t("import.doneSummary", { imported: job.importedCount, skipped: job.report.length })}`}
          action={
            <div className="flex flex-wrap gap-2">
              <Link href="/assets/import" className={buttonVariants({ variant: "outline" })}>
                {t("import.another")}
              </Link>
              <Link href="/assets?sort=updatedAt&dir=desc" className={buttonVariants()}>
                {t("import.viewAssets")}
              </Link>
            </div>
          }
        />
        {job.report.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("import.skippedTitle")}</CardTitle>
            </CardHeader>
            <CardContent>{skippedList(job.report)}</CardContent>
          </Card>
        ) : null}
      </>
    );
  }

  const preview = previewImport(db, actor, job.id);
  const nameMapped = job.mapping.name !== undefined;
  const stats = [
    { label: t("import.total"), value: preview.total },
    { label: t("import.valid"), value: preview.valid.length },
    { label: t("import.skipped"), value: preview.skipped.length },
  ];

  return (
    <>
      <Link href="/assets/import" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("import.title")}
      </Link>
      <PageHeader title={t("import.summaryTitle")} description={job.filename} />

      <Card>
        <CardHeader>
          <CardTitle>{t("import.mappingTitle")}</CardTitle>
          <CardDescription>{t("import.mappingHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <MappingForm
            key={JSON.stringify(job.mapping)}
            jobId={job.id}
            headers={job.headers}
            fields={importFields.map((field) => ({ field, label: t(`assets.${field}`), column: job.mapping[field] }))}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {preview.valid.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("import.sampleTitle")}</CardTitle>
            {preview.newLocations.length > 0 ? (
              <CardDescription>
                {t("import.newLocations")}: {preview.newLocations.join(", ")}
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("import.row")}</TableHead>
                  <TableHead>{t("assets.tag")}</TableHead>
                  <TableHead>{t("assets.name")}</TableHead>
                  <TableHead>{t("assets.type")}</TableHead>
                  <TableHead>{t("assets.status")}</TableHead>
                  <TableHead>{t("assets.location")}</TableHead>
                  <TableHead>{t("assets.warrantyEnd")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.valid.slice(0, SHOWN_SAMPLE).map(({ row, value }) => (
                  <TableRow key={row}>
                    <TableCell className="tabular-nums">{row}</TableCell>
                    <TableCell className="font-mono text-xs">{value.input.tag ?? t("import.autoTag")}</TableCell>
                    <TableCell className="font-medium">{value.input.name}</TableCell>
                    <TableCell>{t(`assets.types.${value.input.type}`)}</TableCell>
                    <TableCell>{t(`assets.statuses.${value.input.status}`)}</TableCell>
                    <TableCell>{value.locationName ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{formatDate(value.input.warrantyEnd ?? null, locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {preview.skipped.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("import.skippedTitle")}</CardTitle>
          </CardHeader>
          <CardContent>{skippedList(preview.skipped)}</CardContent>
        </Card>
      ) : null}

      {nameMapped ? (
        <RunImportButton jobId={job.id} count={preview.valid.length} />
      ) : (
        <p className="text-sm text-destructive">{t("import.nameRequired")}</p>
      )}
    </>
  );
}
