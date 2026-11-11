import { describe, expect, it } from "vitest";
import { sessions } from "../db/schema";
import { addUser, PASSWORD, testDb } from "../testing/fixtures";
import { login } from "./login";
import { hashPassword, verifyPassword } from "./password";
import { createSession, deleteSession, getSessionActor } from "./sessions";
import { updateUser } from "../services/users";

const at = (iso: string) => new Date(iso);
const T0 = at("2026-01-01T10:00:00Z");
const ip = "10.0.0.1";

describe("password", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("s3cret-password");
    expect(hash).not.toContain("s3cret-password");
    expect(await verifyPassword("s3cret-password", hash)).toBe(true);
    expect(await verifyPassword("s3cret-passwore", hash)).toBe(false);
  });

  it("rejects a malformed stored hash instead of throwing", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
});

describe("sessions", () => {
  it("resolves a token to its user and stores only a hash of it", async () => {
    const db = testDb();
    const user = await addUser(db, "ayse", "admin");
    const token = createSession(db, user.id, T0);

    expect(getSessionActor(db, token, T0)).toEqual(user);
    expect(db.select().from(sessions).get()?.tokenHash).not.toBe(token);
    expect(getSessionActor(db, "wrong-token", T0)).toBeNull();
    expect(getSessionActor(db, undefined, T0)).toBeNull();
  });

  it("expires after 30 days even when used daily", async () => {
    const db = testDb();
    const user = await addUser(db, "ayse");
    const token = createSession(db, user.id, T0);
    for (let day = 1; day <= 29; day++) {
      expect(getSessionActor(db, token, new Date(T0.getTime() + day * 86_400_000))).not.toBeNull();
    }
    expect(getSessionActor(db, token, at("2026-01-31T10:00:01Z"))).toBeNull();
  });

  it("expires after 7 idle days", async () => {
    const db = testDb();
    const user = await addUser(db, "ayse");
    const token = createSession(db, user.id, T0);
    expect(getSessionActor(db, token, at("2026-01-08T09:59:00Z"))).not.toBeNull();

    const idle = createSession(db, user.id, T0);
    expect(getSessionActor(db, idle, at("2026-01-08T10:00:01Z"))).toBeNull();
  });

  it("ends when the user signs out or is deactivated", async () => {
    const db = testDb();
    const admin = await addUser(db, "admin", "admin");
    const user = await addUser(db, "ayse");
    const a = createSession(db, user.id, T0);
    const b = createSession(db, user.id, T0);

    deleteSession(db, a);
    expect(getSessionActor(db, a, T0)).toBeNull();
    expect(getSessionActor(db, b, T0)).not.toBeNull();

    updateUser(db, admin, user.id, { name: "Ayşe", role: "technician", active: false, companyIds: [] });
    expect(getSessionActor(db, b, T0)).toBeNull();
  });
});

describe("login", () => {
  it("opens a session for correct credentials, ignoring username case", async () => {
    const db = testDb();
    const user = await addUser(db, "ayse");
    const result = await login(db, { username: " Ayse ", password: PASSWORD, ip }, T0);

    expect(result.ok).toBe(true);
    if (result.ok) expect(getSessionActor(db, result.token, T0)).toEqual(user);
  });

  it("gives the same answer for wrong password, unknown user and inactive user", async () => {
    const db = testDb();
    await addUser(db, "ayse");
    await addUser(db, "pasif", "technician", { active: false });

    const invalid = { ok: false, reason: "invalid" };
    expect(await login(db, { username: "ayse", password: "wrong-password", ip }, T0)).toEqual(invalid);
    expect(await login(db, { username: "nobody", password: PASSWORD, ip }, T0)).toEqual(invalid);
    expect(await login(db, { username: "pasif", password: PASSWORD, ip }, T0)).toEqual(invalid);
  });

  it("locks a username after 5 failures, even for the right password, then unlocks after 15 minutes", async () => {
    const db = testDb();
    await addUser(db, "ayse");
    for (let i = 0; i < 5; i++) {
      await login(db, { username: "ayse", password: "wrong-password", ip: `10.0.0.${i}` }, T0);
    }

    expect(await login(db, { username: "ayse", password: PASSWORD, ip }, at("2026-01-01T10:14:00Z"))).toEqual({
      ok: false,
      reason: "locked",
    });
    expect((await login(db, { username: "ayse", password: PASSWORD, ip }, at("2026-01-01T10:15:01Z"))).ok).toBe(true);
  });

  it("locks an IP after 20 failures across different usernames", async () => {
    const db = testDb();
    await addUser(db, "ayse");
    for (let i = 0; i < 20; i++) {
      await login(db, { username: `guess${i}`, password: "wrong-password", ip }, T0);
    }

    expect(await login(db, { username: "ayse", password: PASSWORD, ip }, T0)).toEqual({ ok: false, reason: "locked" });
    expect((await login(db, { username: "ayse", password: PASSWORD, ip: "10.9.9.9" }, T0)).ok).toBe(true);
  });

  it("forgets earlier failures after a successful sign-in", async () => {
    const db = testDb();
    await addUser(db, "ayse");
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 4; i++) {
        await login(db, { username: "ayse", password: "wrong-password", ip: `10.${round}.0.${i}` }, T0);
      }
      expect((await login(db, { username: "ayse", password: PASSWORD, ip: "10.9.9.9" }, T0)).ok).toBe(true);
    }
  });
});
