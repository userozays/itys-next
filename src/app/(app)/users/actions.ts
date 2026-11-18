"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requireActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { checked, numbers, runForm, text } from "@/server/form";
import { createUser, deleteUser, resetPassword, updateUser } from "@/server/services/users";
import { z } from "zod";
import { newUserInput, password, userUpdateInput } from "@/server/validation";

const resetInput = z.object({ password });

export async function saveUserAction(form: FormData): Promise<FormState> {
  const actor = await requireActor();
  return runForm(async () => {
    const shared = { name: text(form, "name"), role: text(form, "role"), companyIds: numbers(form, "companyIds") };
    const id = Number(form.get("id"));
    if (id) {
      updateUser(getDb(), actor, id, userUpdateInput.parse({ ...shared, active: checked(form, "active") }));
    } else {
      const input = newUserInput.parse({ ...shared, username: text(form, "username"), password: text(form, "password") });
      await createUser(getDb(), actor, input);
    }
    revalidatePath("/users");
  });
}

export async function resetPasswordAction(form: FormData): Promise<FormState> {
  const actor = await requireActor();
  return runForm(async () => {
    const input = resetInput.parse({ password: text(form, "password") });
    await resetPassword(getDb(), actor, Number(form.get("id")), input.password);
  });
}

export async function deleteUserAction(userId: number): Promise<FormState> {
  const actor = await requireActor();
  return runForm(async () => {
    deleteUser(getDb(), actor, userId);
    revalidatePath("/users");
  });
}
