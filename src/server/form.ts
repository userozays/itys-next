import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import type { FormState } from "@/lib/form-state";
import { AppError, FieldErrors, type FieldIssue } from "./errors";

/** Zod's issues as field issues; messages are keys under "validation.*". */
export function zodIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({ field: String(issue.path[0] ?? ""), key: `validation.${issue.message}` }));
}

/** Runs a server action body and turns validation and domain errors into a
 *  translated FormState. Anything else (including redirects) propagates. */
export async function runForm(body: () => Promise<void>): Promise<FormState> {
  try {
    await body();
    return { ok: true };
  } catch (e) {
    const t = await getTranslations();
    const issues = e instanceof ZodError ? zodIssues(e) : e instanceof FieldErrors ? e.issues : null;
    if (issues) {
      // Every field gets its first problem, and all fields are reported in one go.
      const fieldErrors: Record<string, string> = {};
      for (const issue of issues) {
        fieldErrors[issue.field] ??= t.has(issue.key) ? t(issue.key, issue.params) : t("validation.invalid");
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
