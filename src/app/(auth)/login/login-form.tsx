"use client";

import { useTranslations } from "next-intl";
import { Field, FormError, useFormAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { loginAction } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("auth");
  const { state, pending, onSubmit } = useFormAction(loginAction);

  return (
    <form method="post" onSubmit={onSubmit} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <FormError state={state} />
      <Field name="username" label={t("username")} state={state} autoComplete="username" autoFocus required />
      <Field
        name="password"
        label={t("password")}
        state={state}
        type="password"
        autoComplete="current-password"
        required
      />
      <Button type="submit" disabled={pending}>
        {pending ? t("signingIn") : t("signIn")}
      </Button>
    </form>
  );
}
