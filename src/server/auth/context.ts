import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { COMPANY_COOKIE, SESSION_COOKIE } from "@/lib/cookies";
import { getDb } from "../db/client";
import type { Company } from "../db/schema";
import { resolveActiveCompany } from "../services/companies";
import { pickClientIp } from "./client-ip";
import { getSessionActor, SESSION_MAX_AGE, type Actor } from "./sessions";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  // Plain-HTTP deployments on a LAN must opt out explicitly.
  secure: process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_COOKIE !== "1",
};

/** The signed-in user for this request, or null. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const store = await cookies();
  return getSessionActor(getDb(), store.get(SESSION_COOKIE)?.value);
});

export async function requireActor(): Promise<Actor> {
  return (await getActor()) ?? redirect("/login");
}

export async function requireAdmin(): Promise<Actor> {
  const actor = await requireActor();
  if (actor.role !== "admin") redirect("/");
  return actor;
}

/** For pages whose only purpose is a change the user may not make (forms, import). */
export async function requireActorWho(allowed: (actor: Actor) => boolean): Promise<Actor> {
  const actor = await requireActor();
  if (!allowed(actor)) redirect("/");
  return actor;
}

/** The company the user is working in; the cookie is only a preference and is
 *  re-checked against the user's access on every request. */
export async function getActiveCompany(actor: Actor): Promise<Company | null> {
  const store = await cookies();
  const preferred = Number(store.get(COMPANY_COOKIE)?.value);
  return resolveActiveCompany(getDb(), actor, Number.isInteger(preferred) ? preferred : null);
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_MAX_AGE });
}

export async function currentSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(COMPANY_COOKIE);
}

export async function setCompanyCookie(companyId: number): Promise<void> {
  (await cookies()).set(COMPANY_COOKIE, String(companyId), { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 });
}

export async function clientIp(): Promise<string> {
  return pickClientIp((await headers()).get("x-forwarded-for"), Number(process.env.TRUSTED_PROXY_COUNT));
}

/** Public address of the app, for links that leave the browser (QR labels). */
export async function appOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
