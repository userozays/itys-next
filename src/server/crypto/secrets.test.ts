import { describe, expect, it } from "vitest";
import { decryptSecret, deriveKey, encryptSecret } from "./secrets";

const key = deriveKey("a-test-key-that-is-long-enough-000");

describe("secret encryption", () => {
  it("round-trips text, including Turkish characters and the empty string", () => {
    for (const plain of ["XXXXX-YYYYY-ZZZZZ", "şifre: ğüİı 🔑", ""]) {
      expect(decryptSecret(encryptSecret(plain, key), key)).toBe(plain);
    }
  });

  it("never contains the plaintext and differs on every call", () => {
    const a = encryptSecret("XXXXX-YYYYY-ZZZZZ", key);
    const b = encryptSecret("XXXXX-YYYYY-ZZZZZ", key);
    expect(a).not.toContain("XXXXX");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
  });

  it("refuses a different key", () => {
    const stored = encryptSecret("secret", key);
    expect(() => decryptSecret(stored, deriveKey("another-key-that-is-long-enough-00"))).toThrow();
  });

  it("refuses a tampered or malformed value", () => {
    const [v, iv, tag, data] = encryptSecret("secret-value", key).split(".");
    const flipped = Buffer.from(data, "base64url");
    flipped[0] ^= 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64url")].join("."), key)).toThrow();
    expect(() => decryptSecret("plain text in the column", key)).toThrow();
  });
});
