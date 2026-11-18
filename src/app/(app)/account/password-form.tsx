"use client";

import { useTranslations } from "next-intl";
import { Field, FormError, useFormAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { changePasswordAction } from "./actions";

export function PasswordForm() {
  const t = useTranslations();
  const { state, pending, onSubmit } = useFormAction(changePasswordAction);

  return (
    <form method="post" onSubmit={onSubmit} className="grid max-w-sm gap-4">
      <FormError state={state} />
      {state.ok ? (
        <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
          {t("account.changed")}
        </p>
      ) : null}
      <Field
        name="currentPassword"
        label={t("account.currentPassword")}
        state={state}
        type="password"
        autoComplete="current-password"
        required
      />
      <Field
        name="newPassword"
        label={t("account.newPassword")}
        hint={t("auth.passwordHint")}
        state={state}
        type="password"
        autoComplete="new-password"
        required
      />
      <Field
        name="newPasswordRepeat"
        label={t("account.newPasswordRepeat")}
        state={state}
        type="password"
        autoComplete="new-password"
        required
      />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? t("common.saving") : t("account.change")}
      </Button>
    </form>
  );
}
