import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import type { FormState } from "@/lib/form-state";
import { AppError } from "./errors";

/** Runs a server action body and turns validation and domain errors into a
 *  translated FormState. Anything else (including redirects) propagates. */
export async function runForm(body: () => Promise<void>): Promise<FormState> {
  try {
    await body();
    return { ok: true };
  } catch (e) {
    const t = await getTranslations();
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        const field = String(issue.path[0] ?? "");
        const key = `validation.${issue.message}`;
        fieldErrors[field] ??= t.has(key) ? t(key) : t("validation.invalid");
      }
      return { fieldErrors };
    }
    if (e instanceof AppError) return { error: t(`errors.${e.code}`) };
    throw e;
  }
}

export const text = (form: FormData, name: string) => String(form.get(name) ?? "");
export const checked = (form: FormData, name: string) => form.get(name) === "on";
export const numbers = (form: FormData, name: string) => form.getAll(name).map(Number);
