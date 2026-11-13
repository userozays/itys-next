import { describe, expect, it } from "vitest";
import { sessions } from "../db/schema";
import { addUser, PASSWORD, testDb } from "../testing/fixtures";
import { pickClientIp } from "./client-ip";
import { LIMITS, login } from "./login";
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

  it("locks one username from one address after 5 failures, and says for how long", async () => {
    const db = testDb();
    await addUser(db, "ayse");
    for (let i = 0; i < 5; i++) await login(db, { username: "ayse", password: "wrong-password", ip }, T0);

    // Even the right password is refused, without being checked.
    expect(await login(db, { username: "ayse", password: PASSWORD, ip }, at("2026-01-01T10:05:00Z"))).toEqual({
      ok: false,
      reason: "locked",
      retryAfter: 10 * 60,
    });
    expect((await login(db, { username: "ayse", password: PASSWORD, ip }, at("2026-01-01T10:15:00Z"))).ok).toBe(true);
  });

  it("someone guessing from another address cannot lock the user out (QA K3)", async () => {
    const db = testDb();
    await addUser(db, "admin", "admin");
    for (let i = 0; i < 12; i++) await login(db, { username: "admin", password: "wrong-password", ip: "203.0.113.9" }, T0);

    expect((await login(db, { username: "admin", password: PASSWORD, ip: "203.0.113.9" }, T0)).ok).toBe(false);
    expect((await login(db, { username: "admin", password: PASSWORD, ip }, T0)).ok).toBe(true);
  });

  it("one person's mistakes do not lock colleagues at the same address", async () => {
    const db = testDb();
    await addUser(db, "ayse");
    await addUser(db, "can");
    for (let i = 0; i < 5; i++) await login(db, { username: "ayse", password: "wrong-password", ip }, T0);

    expect((await login(db, { username: "ayse", password: PASSWORD, ip }, T0)).ok).toBe(false);
    expect((await login(db, { username: "can", password: PASSWORD, ip }, T0)).ok).toBe(true);
  });

  it("guessing one username from many addresses stops after 30 failures", async () => {
    const db = testDb();
    await addUser(db, "ayse");
    for (let i = 0; i < LIMITS.username; i++) {
      expect(await login(db, { username: "ayse", password: "wrong-password", ip: `198.51.100.${i}` }, T0)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(await login(db, { username: "ayse", password: PASSWORD, ip: "198.51.100.200" }, T0)).toMatchObject({ reason: "locked" });
    expect((await login(db, { username: "ayse", password: PASSWORD, ip }, at("2026-01-01T10:15:00Z"))).ok).toBe(true);
  });

  it("guessing many usernames from one address stops after 100 failures", async () => {
    const db = testDb();
    await addUser(db, "ayse");
    for (let i = 0; i < LIMITS.ip; i++) await login(db, { username: `guess${i}`, password: "wrong-password", ip }, T0);

    expect(await login(db, { username: "ayse", password: PASSWORD, ip }, T0)).toMatchObject({ reason: "locked" });
    expect((await login(db, { username: "ayse", password: PASSWORD, ip: "10.9.9.9" }, T0)).ok).toBe(true);
  }, 30_000); // a hundred password checks take a few seconds

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

describe("client address (QA K3)", () => {
  it("without a proxy, uses the address Next.js took from the socket", () => {
    expect(pickClientIp("::ffff:192.168.1.40", 0)).toBe("::ffff:192.168.1.40");
    expect(pickClientIp(null, 0)).toBe("unknown");
    expect(pickClientIp("", 0)).toBe("unknown");
  });

  it("behind proxies, ignores what the client wrote and takes the entry our proxy added", () => {
    // The client claims to be 1.1.1.1; nginx appended the address it really came from.
    expect(pickClientIp("1.1.1.1, 203.0.113.7", 1)).toBe("203.0.113.7");
    expect(pickClientIp("9.9.9.9, 1.1.1.1, 203.0.113.7", 1)).toBe("203.0.113.7");
    // Two proxies: load balancer, then nginx.
    expect(pickClientIp("1.1.1.1, 203.0.113.7, 10.0.0.2", 2)).toBe("203.0.113.7");
  });

  it("falls back safely on a short header or a bad setting", () => {
    expect(pickClientIp("203.0.113.7", 3)).toBe("unknown");
    expect(pickClientIp("1.1.1.1, 203.0.113.7", Number.NaN)).toBe("203.0.113.7");
    expect(pickClientIp(" 203.0.113.7 ,, ", 1)).toBe("203.0.113.7");
  });
});
