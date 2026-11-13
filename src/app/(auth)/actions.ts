"use server";

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { clearSessionCookie, clientIp, currentSessionToken, setSessionCookie } from "@/server/auth/context";
import { login } from "@/server/auth/login";
import { deleteSession } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { runForm, text } from "@/server/form";
import { createFirstAdmin } from "@/server/services/users";
import { firstAdminInput } from "@/server/validation";

/** Only same-site paths are followed after sign-in, never another origin. */
function safeNext(next: string): string {
  return /^\/(?![/\\])/.test(next) ? next : "/";
}

async function signIn(username: string, password: string, next = "/"): Promise<FormState> {
  const result = await login(getDb(), { username, password, ip: await clientIp() });
  if (!result.ok) {
    const t = await getTranslations("auth");
    return { error: result.reason === "locked" ? t("locked", { minutes: Math.ceil(result.retryAfter / 60) }) : t("invalid") };
  }
  await setSessionCookie(result.token);
  redirect(safeNext(next));
}

export async function loginAction(form: FormData): Promise<FormState> {
  return signIn(text(form, "username"), text(form, "password"), text(form, "next"));
}

export async function setupAction(form: FormData): Promise<FormState> {
  const password = text(form, "password");
  let username = "";
  const state = await runForm(async () => {
    const input = firstAdminInput.parse({ username: text(form, "username"), name: text(form, "name"), password });
    username = input.username;
    await createFirstAdmin(getDb(), input);
  });
  return state.ok ? signIn(username, password) : state;
}

export async function logoutAction(): Promise<void> {
  deleteSession(getDb(), await currentSessionToken());
  await clearSessionCookie();
  redirect("/login");
}
