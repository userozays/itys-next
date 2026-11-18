"use server";

import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { requireActor, setSessionCookie } from "@/server/auth/context";
import { createSession } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { runForm, text } from "@/server/form";
import { changeOwnPassword } from "@/server/services/users";
import { password } from "@/server/validation";

const input = z
  .object({ currentPassword: z.string().min(1, "required"), newPassword: password, newPasswordRepeat: z.string() })
  .refine((v) => v.newPassword === v.newPasswordRepeat, {
    message: "passwordMismatch",
    path: ["newPasswordRepeat"],
    when: ({ value }) => typeof (value as { newPasswordRepeat?: unknown })?.newPasswordRepeat === "string",
  });

export async function changePasswordAction(form: FormData): Promise<FormState> {
  const actor = await requireActor();
  return runForm(async () => {
    const data = input.parse({
      currentPassword: text(form, "currentPassword"),
      newPassword: text(form, "newPassword"),
      newPasswordRepeat: text(form, "newPasswordRepeat"),
    });
    await changeOwnPassword(getDb(), actor, data.currentPassword, data.newPassword);
    // Every session was ended; keep this browser signed in with a fresh one.
    await setSessionCookie(createSession(getDb(), actor.id));
  });
}
