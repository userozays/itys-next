import { sql, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

/** Column value folded for searching; compare with searchFold() of the query (src/lib/turkish.ts). */
export const trFold = (column: AnySQLiteColumn): SQL => sql`tr_fold(${column})`;

/** Column value as a Turkish sort key, for ORDER BY. */
export const trKey = (column: AnySQLiteColumn): SQL => sql`tr_sort_key(${column})`;
