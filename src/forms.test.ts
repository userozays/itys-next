import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : full.endsWith(".tsx") ? [full] : [];
  });
}

describe("forms (QA K4)", () => {
  // A form without a method is sent with GET when the page's script has not
  // loaded yet, which writes every field, passwords included, into the address.
  it("every <form> states its method", () => {
    const missing = sourceFiles(path.join(__dirname)).flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      return [...source.matchAll(/<form\b[^>]*>/g)]
        .filter((tag) => !/\bmethod=/.test(tag[0]))
        .map(() => path.relative(__dirname, file));
    });
    expect(missing).toEqual([]);
  });
});
