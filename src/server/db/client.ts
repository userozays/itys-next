import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { searchFold, turkishSortKey } from "../../lib/turkish";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;
/** A transaction handle; query helpers accept either. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/** Opens a database, applies pending migrations and returns it. Use ":memory:" in tests. */
export function openDb(file: string): Db {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // Turkish-aware text functions for searching and sorting (src/server/db/turkish-sql.ts).
  const textFn = (fn: (text: string) => string) => (value: unknown) => (typeof value === "string" ? fn(value) : value);
  sqlite.function("tr_fold", { deterministic: true }, textFn(searchFold));
  sqlite.function("tr_sort_key", { deterministic: true }, textFn(turkishSortKey));
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

const globalForDb = globalThis as unknown as { __db?: Db };

/** The application database (one connection per process). */
export function getDb(): Db {
  if (!globalForDb.__db) {
    const file =
      process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
    globalForDb.__db = openDb(file);
  }
  return globalForDb.__db;
}
