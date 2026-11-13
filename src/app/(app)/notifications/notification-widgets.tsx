"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { CheckField, Field, FormError, useFormAction } from "@/components/form";
import { useSafeCall } from "@/components/safe-call";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FormState } from "@/lib/form-state";
import { checkNowAction, saveNotificationSettingsAction, sendTestNotificationAction } from "./actions";

export type SettingsValues = {
  emailEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  hasSmtpPassword: boolean;
  smtpFrom: string;
  emailTo: string[];
  telegramEnabled: boolean;
  hasTelegramToken: boolean;
  telegramChatId: string;
};

/** Keeps the "saved" note while the form below is rebuilt from the freshly saved values. */
export function SettingsPanel({ values }: { values: SettingsValues }) {
  const [saved, setSaved] = useState(false);
  return <SettingsForm key={JSON.stringify(values)} values={values} saved={saved} setSaved={setSaved} />;
}

function SettingsForm({
  values,
  saved,
  setSaved,
}: {
  values: SettingsValues;
  saved: boolean;
  setSaved: (saved: boolean) => void;
}) {
  const t = useTranslations();
  const { state, pending, onSubmit } = useFormAction(saveNotificationSettingsAction, () => setSaved(true));

  return (
    // Secret fields are cleared by the form reset after a successful save.
    <form method="post" onSubmit={onSubmit} onChange={() => setSaved(false)} className="grid gap-4">
      <FormError state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("notifications.emailTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <CheckField name="emailEnabled" label={t("notifications.emailEnabled")} defaultChecked={values.emailEnabled} />
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <Field name="smtpHost" label={t("notifications.smtpHost")} state={state} defaultValue={values.smtpHost} autoComplete="off" />
              <Field name="smtpPort" label={t("notifications.smtpPort")} state={state} defaultValue={values.smtpPort} inputMode="numeric" />
            </div>
            <CheckField name="smtpSecure" label={t("notifications.smtpSecure")} defaultChecked={values.smtpSecure} />
            <Field
              name="smtpUser"
              label={t("notifications.smtpUser")}
              hint={t("notifications.smtpUserHint")}
              state={state}
              defaultValue={values.smtpUser}
              autoComplete="off"
            />
            <Field
              name="smtpPassword"
              label={t("notifications.smtpPassword")}
              hint={values.hasSmtpPassword ? t("notifications.passwordKeepHint") : t("notifications.passwordHint")}
              state={state}
              type="password"
              autoComplete="new-password"
            />
            <Field name="smtpFrom" label={t("notifications.smtpFrom")} state={state} defaultValue={values.smtpFrom} type="email" />
            <Field
              name="emailTo"
              label={t("notifications.emailTo")}
              hint={t("notifications.emailToHint")}
              state={state}
              defaultValue={values.emailTo.join(", ")}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("notifications.telegramTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <CheckField name="telegramEnabled" label={t("notifications.telegramEnabled")} defaultChecked={values.telegramEnabled} />
            <Field
              name="telegramToken"
              label={t("notifications.telegramToken")}
              hint={values.hasTelegramToken ? t("notifications.tokenKeepHint") : t("notifications.tokenHint")}
              state={state}
              type="password"
              autoComplete="new-password"
            />
            <Field
              name="telegramChatId"
              label={t("notifications.telegramChatId")}
              hint={t("notifications.telegramChatIdHint")}
              state={state}
              defaultValue={values.telegramChatId}
              autoComplete="off"
            />
          </CardContent>
        </Card>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("common.save")}
        </Button>
        {saved ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t("notifications.saved")}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** "Send test" and "Check now": each reports what it did. */
export function NotificationActions() {
  const t = useTranslations("notifications");
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const call = useSafeCall();
  const run = (action: () => Promise<FormState>) =>
    startTransition(async () => setState(await call(action, (error): FormState => ({ error }))));

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={() => run(sendTestNotificationAction)}>
          {t("sendTest")}
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => run(checkNowAction)}>
          {t("checkNow")}
        </Button>
      </div>
      <FormError state={state} />
      {state.message ? (
        <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
