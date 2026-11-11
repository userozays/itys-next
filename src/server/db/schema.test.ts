import { describe, expect, it } from "vitest";
import { openDb } from "./client";
import { companies } from "./schema";

describe("database", () => {
  it("applies migrations and stores a company", () => {
    const db = openDb(":memory:");
    db.insert(companies).values({ name: "Örnek A.Ş." }).run();

    const rows = db.select().from(companies).all();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Örnek A.Ş.", active: true });
    expect(rows[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2} /);
  });

  it("rejects two companies with the same name", () => {
    const db = openDb(":memory:");
    db.insert(companies).values({ name: "Aynı Ad" }).run();

    expect(() => db.insert(companies).values({ name: "Aynı Ad" }).run()).toThrow(
      /UNIQUE/,
    );
  });
});
