import { describe, expect, it } from "vitest";
import { isWeakPassword } from "./password-strength";

describe("isWeakPassword", () => {
  it.each(["1111111111", "abababababab", "1234567890", "0987654321", "abcdefghij", "qwertyuiop", "Password123", "PAROLA1234", "1q2w3e4r5t"])(
    "rejects %s",
    (password) => expect(isWeakPassword(password)).toBe(true),
  );

  it.each(["correct-horse-battery", "admin-password-1", "Kış.Bahçe.2026", "tech-password-1", "demo-admin-2026"])(
    "accepts %s",
    (password) => expect(isWeakPassword(password)).toBe(false),
  );
});
