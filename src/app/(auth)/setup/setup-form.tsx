"use client";

import { useTranslations } from "next-intl";
import { Field, FormError, useFormAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { setupAction } from "../actions";

export function SetupForm() {
  const t = useTranslations();
  const { state, pending, onSubmit } = useFormAction(setupAction);

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <FormError state={state} />
      <Field name="name" label={t("auth.name")} state={state} autoComplete="name" autoFocus required />
      <Field
        name="username"
        label={t("auth.username")}
        hint={t("auth.usernameHint")}
        state={state}
        autoComplete="username"
        autoCapitalize="none"
        required
      />
      <Field
        name="password"
        label={t("auth.password")}
        hint={t("auth.passwordHint")}
        state={state}
        type="password"
        autoComplete="new-password"
        required
      />
      <Button type="submit" disabled={pending}>
        {pending ? t("common.saving") : t("auth.createAdmin")}
      </Button>
    </form>
  );
}
