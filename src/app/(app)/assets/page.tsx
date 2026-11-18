import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { StatusBadge, WarrantyBadge } from "@/components/asset-badges";
import { EmptyState } from "@/components/empty-state";
import { FilterForm } from "@/components/filter-form";
import { RememberListUrl } from "@/components/list-memory";
import { PageHeader } from "@/components/page-header";
import { SelectBox } from "@/components/select-box";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { expiryFilters, formatDate, todayIso, type ExpiryFilter } from "@/lib/dates";
import { getActiveCompany, requireActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { assetStatuses, assetTypes, type AssetStatus, type AssetType } from "@/server/db/schema";
import { assetSortKeys, listAssets, type AssetSortKey } from "@/server/services/assets";
import { listLocations } from "@/server/services/locations";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("assets"))("title") };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const oneOf = <T extends string>(allowed: readonly T[], v: string): T | undefined =>
  allowed.includes(v as T) ? (v as T) : undefined;

export default async function AssetsPage({ searchParams }: PageProps<"/assets">) {
  const actor = await requireActor();
  const t = await getTranslations();
  const company = await getActiveCompany(actor);
  if (!company) {
    return (
      <>
        <PageHeader title={t("assets.title")} />
        <EmptyState title={t("noCompany.title")} description={t("noCompany.description")} />
      </>
    );
  }

  const params = await searchParams;
  const filter = {
    q: one(params.q).trim(),
    type: oneOf<AssetType>(assetTypes, one(params.type)),
    status: oneOf<AssetStatus>(assetStatuses, one(params.status)),
    locationId: Number(one(params.location)) || undefined,
    sort: oneOf<AssetSortKey>(assetSortKeys, one(params.sort)) ?? "name",
    dir: one(params.dir) === "desc" ? ("desc" as const) : ("asc" as const),
    page: Number(one(params.page)) || 1,
    warranty: oneOf<ExpiryFilter>(expiryFilters, one(params.warranty)),
  };
  const db = getDb();
  const { rows, total, page, pageCount } = listAssets(db, actor, company.id, filter);
  const locations = listLocations(db, actor, company.id);
  const locale = await getLocale();
  const today = todayIso();
  const filtered = Boolean(filter.q || filter.type || filter.status || filter.locationId || filter.warranty);

  /** Current filter as a query string, with some keys replaced. */
  const href = (changes: Record<string, string | number | undefined>) => {
    const query = new URLSearchParams();
    const merged = {
      q: filter.q,
      type: filter.type,
      status: filter.status,
      location: filter.locationId,
      warranty: filter.warranty,
      sort: filter.sort === "name" ? undefined : filter.sort,
      dir: filter.dir === "asc" ? undefined : filter.dir,
      page: page === 1 ? undefined : page,
      ...changes,
    };
    for (const [key, value] of Object.entries(merged)) if (value) query.set(key, String(value));
    const qs = query.toString();
    return qs ? `/assets?${qs}` : "/assets";
  };

  const sortHead = (column: AssetSortKey, label: string) => {
    const active = filter.sort === column;
    const nextDir = active && filter.dir === "asc" ? "desc" : "asc";
    const Icon = !active ? ArrowUpDown : filter.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead key={column} aria-sort={active ? (filter.dir === "asc" ? "ascending" : "descending") : undefined}>
        <Link
          href={href({ sort: column === "name" ? undefined : column, dir: nextDir === "asc" ? undefined : nextDir, page: undefined })}
          aria-label={t("assets.sortBy", { column: label })}
          className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground"
        >
          {label}
          <Icon className={active ? "size-3.5" : "size-3.5 opacity-40"} aria-hidden />
        </Link>
      </TableHead>
    );
  };

  return (
    <>
      <RememberListUrl list="assets" />
      <PageHeader
        title={t("assets.title")}
        description={t("assets.description", { company: company.name })}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={href({ page: undefined }).replace("/assets", "/assets/labels")} className={buttonVariants({ variant: "outline" })}>
              {t("assets.printLabels")}
            </Link>
            <Link href="/assets/import" className={buttonVariants({ variant: "outline" })}>
              {t("assets.import")}
            </Link>
            <Link href="/assets/new" className={buttonVariants()}>
              {t("assets.new")}
            </Link>
          </div>
        }
      />

      <FilterForm action="/assets" className="flex flex-wrap items-center gap-2">
        <Input
          name="q"
          type="search"
          defaultValue={filter.q}
          placeholder={t("assets.searchPlaceholder")}
          aria-label={t("assets.search")}
          className="w-full sm:w-64"
        />
        <SelectBox
          name="type"
          ariaLabel={t("assets.type")}
          defaultValue={filter.type ?? ""}
          options={[{ value: "", label: t("assets.allTypes") }, ...assetTypes.map((v) => ({ value: v, label: t(`assets.types.${v}`) }))]}
        />
        <SelectBox
          name="status"
          ariaLabel={t("assets.status")}
          defaultValue={filter.status ?? ""}
          options={[{ value: "", label: t("assets.allStatuses") }, ...assetStatuses.map((v) => ({ value: v, label: t(`assets.statuses.${v}`) }))]}
        />
        <SelectBox
          name="location"
          ariaLabel={t("assets.location")}
          defaultValue={filter.locationId ?? ""}
          options={[{ value: "", label: t("assets.allLocations") }, ...locations.map((l) => ({ value: String(l.id), label: l.name }))]}
        />
        {filter.sort !== "name" ? <input type="hidden" name="sort" value={filter.sort} /> : null}
        {filter.dir === "desc" ? <input type="hidden" name="dir" value="desc" /> : null}
        <SelectBox
          name="warranty"
          ariaLabel={t("assets.warrantyFilter.label")}
          defaultValue={filter.warranty ?? ""}
          options={[
            { value: "", label: t("assets.warrantyFilter.all") },
            ...expiryFilters.map((v) => ({ value: v, label: t(`assets.warrantyFilter.${v}`) })),
          ]}
        />
        {filtered ? (
          <button type="button" data-filter-clear className={buttonVariants({ variant: "ghost" })}>
            {t("assets.clear")}
          </button>
        ) : null}
      </FilterForm>

      {total === 0 ? (
        <EmptyState
          title={filtered ? t("assets.emptyFiltered") : t("assets.empty")}
          action={
            filtered ? null : (
              <Link href="/assets/new" className={buttonVariants()}>
                {t("dashboard.addFirst")}
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  {sortHead("tag", t("assets.tag"))}
                  {sortHead("name", t("assets.name"))}
                  {sortHead("type", t("assets.type"))}
                  {sortHead("status", t("assets.status"))}
                  <TableHead>{t("assets.location")}</TableHead>
                  <TableHead>{t("assets.assignedTo")}</TableHead>
                  {sortHead("warrantyEnd", t("assets.warrantyEnd"))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.tag}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/assets/${a.id}`} className="underline-offset-4 hover:underline">
                        {a.name}
                      </Link>
                      {a.brand || a.model ? (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {[a.brand, a.model].filter(Boolean).join(" ")}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{t(`assets.types.${a.type}`)}</TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                    </TableCell>
                    <TableCell>{a.locationName ?? "—"}</TableCell>
                    <TableCell>{a.assignedTo ?? "—"}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-1.5 tabular-nums">
                        {formatDate(a.warrantyEnd, locale)}
                        <WarrantyBadge end={a.warrantyEnd} today={today} status={a.status} />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <p>{t("assets.count", { total })}</p>
            {pageCount > 1 ? (
              <nav className="flex items-center gap-2" aria-label={t("assets.page", { page, pageCount })}>
                {page > 1 ? (
                  <Link href={href({ page: page - 1 === 1 ? undefined : page - 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    {t("assets.previous")}
                  </Link>
                ) : null}
                <span className="tabular-nums">{t("assets.page", { page, pageCount })}</span>
                {page < pageCount ? (
                  <Link href={href({ page: page + 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    {t("assets.next")}
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
