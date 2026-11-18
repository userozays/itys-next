import { expiryFilters, type ExpiryFilter } from "./dates";
import { assetStatuses, assetTypes, type AssetStatus, type AssetType } from "../server/db/schema";
import { assetSortKeys, type AssetFilter, type AssetSortKey } from "../server/services/assets";

type Params = Record<string, string | string[] | undefined>;

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
export const oneOf = <T extends string>(allowed: readonly T[], v: string): T | undefined =>
  allowed.includes(v as T) ? (v as T) : undefined;

/** The device list filter in the address, read the same way by the list, labels and export. */
export function assetFilterFromParams(params: Params) {
  return {
    q: one(params.q).trim(),
    type: oneOf<AssetType>(assetTypes, one(params.type)),
    status: oneOf<AssetStatus>(assetStatuses, one(params.status)),
    locationId: Number(one(params.location)) || undefined,
    sort: oneOf<AssetSortKey>(assetSortKeys, one(params.sort)) ?? "name",
    dir: one(params.dir) === "desc" ? ("desc" as const) : ("asc" as const),
    page: Number(one(params.page)) || 1,
    warranty: oneOf<ExpiryFilter>(expiryFilters, one(params.warranty)),
  } satisfies AssetFilter;
}

/** The license list filter in the address. */
export function licenseFilterFromParams(params: Params) {
  return { q: one(params.q).trim(), expiry: oneOf<ExpiryFilter>(expiryFilters, one(params.expiry)) };
}
