import { describe, expect, it } from "vitest";
import { login } from "../auth/login";
import { createSession, getSessionActor } from "../auth/sessions";
import { addCompany, addUser, PASSWORD, testDb } from "../testing/fixtures";
import { listCompanies } from "./companies";
import {
  changeOwnPassword,
  createFirstAdmin,
  createUser,
  listUsers,
  needsSetup,
  resetPassword,
  updateUser,
} from "./users";

const ip = "10.0.0.1";
const NEW_PASSWORD = "another-long-password";

describe("first-time setup", () => {
  it("creates the first admin exactly once", async () => {
    const db = testDb();
    expect(needsSetup(db)).toBe(true);

    await createFirstAdmin(db, { username: "admin", name: "Yönetici", password: PASSWORD });

    expect(needsSetup(db)).toBe(false);
    expect((await login(db, { username: "admin", password: PASSWORD, ip })).ok).toBe(true);
    await expect(createFirstAdmin(db, { username: "intruder", name: "X", password: PASSWORD })).rejects.toThrow(
      "setupDone",
    );
  });
});

describe("user management", () => {
  it("admin creates a technician who then sees only the assigned company", async () => {
    const db = testDb();
    const a = addCompany(db, "A");
    addCompany(db, "B");
    const admin = await addUser(db, "admin", "admin");

    const id = await createUser(db, admin, {
      username: "tech",
      name: "Teknisyen",
      password: PASSWORD,
      role: "technician",
      companyIds: [a, a],
    });

    expect(listUsers(db, admin).find((u) => u.id === id)).toMatchObject({ role: "technician", companyIds: [a] });
    const tech = { id, username: "tech", name: "Teknisyen", role: "technician" as const };
    expect(listCompanies(db, tech).map((c) => c.name)).toEqual(["A"]);
  });

  it("rejects a duplicate username", async () => {
    const db = testDb();
    const admin = await addUser(db, "admin", "admin");
    await expect(
      createUser(db, admin, { username: "admin", name: "X", password: PASSWORD, role: "technician", companyIds: [] }),
    ).rejects.toThrow("usernameTaken");
  });

  it("technician cannot list, create, change users or reset passwords", async () => {
    const db = testDb();
    const admin = await addUser(db, "admin", "admin");
    const tech = await addUser(db, "tech");

    expect(() => listUsers(db, tech)).toThrow("forbidden");
    await expect(
      createUser(db, tech, { username: "x-user", name: "X", password: PASSWORD, role: "admin", companyIds: [] }),
    ).rejects.toThrow("forbidden");
    expect(() => updateUser(db, tech, tech.id, { name: "T", role: "admin", active: true, companyIds: [] })).toThrow(
      "forbidden",
    );
    await expect(resetPassword(db, tech, admin.id, NEW_PASSWORD)).rejects.toThrow("forbidden");
    expect((await login(db, { username: "admin", password: PASSWORD, ip })).ok).toBe(true);
  });

  it("refuses to demote or deactivate the last active admin", async () => {
    const db = testDb();
    const admin = await addUser(db, "admin", "admin");
    await addUser(db, "old-admin", "admin", { active: false });

    expect(() =>
      updateUser(db, admin, admin.id, { name: "A", role: "technician", active: true, companyIds: [] }),
    ).toThrow("lastAdmin");
    expect(() => updateUser(db, admin, admin.id, { name: "A", role: "admin", active: false, companyIds: [] })).toThrow(
      "lastAdmin",
    );

    const second = await addUser(db, "second", "admin");
    updateUser(db, second, admin.id, { name: "A", role: "technician", active: true, companyIds: [] });
    expect(listUsers(db, second).find((u) => u.id === admin.id)?.role).toBe("technician");
  });

  it("drops company assignments when a technician becomes admin", async () => {
    const db = testDb();
    const a = addCompany(db, "A");
    const admin = await addUser(db, "admin", "admin");
    const tech = await addUser(db, "tech", "technician", { companyIds: [a] });

    updateUser(db, admin, tech.id, { name: "T", role: "admin", active: true, companyIds: [a] });

    expect(listUsers(db, admin).find((u) => u.id === tech.id)?.companyIds).toEqual([]);
  });

  it("password reset by admin ends the user's sessions and replaces the password", async () => {
    const db = testDb();
    const admin = await addUser(db, "admin", "admin");
    const tech = await addUser(db, "tech");
    const token = createSession(db, tech.id);

    await resetPassword(db, admin, tech.id, NEW_PASSWORD);

    expect(getSessionActor(db, token)).toBeNull();
    expect((await login(db, { username: "tech", password: PASSWORD, ip })).ok).toBe(false);
    expect((await login(db, { username: "tech", password: NEW_PASSWORD, ip })).ok).toBe(true);
  });

  it("changing your own password requires the current one", async () => {
    const db = testDb();
    const tech = await addUser(db, "tech");
    const token = createSession(db, tech.id);

    await expect(changeOwnPassword(db, tech, "wrong-password", NEW_PASSWORD)).rejects.toThrow("wrongPassword");
    expect(getSessionActor(db, token)).not.toBeNull();

    await changeOwnPassword(db, tech, PASSWORD, NEW_PASSWORD);
    expect(getSessionActor(db, token)).toBeNull();
    expect((await login(db, { username: "tech", password: NEW_PASSWORD, ip })).ok).toBe(true);
  });
});
