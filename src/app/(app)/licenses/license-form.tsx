"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { CheckField, Field, FormError, SelectField, TextareaField, useFormAction } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { currencies } from "@/server/db/schema";
import { saveLicenseAction } from "./actions";

export type LicenseFormValues = {
  id: number;
  name: string;
  vendor: string | null;
  seats: number | null;
  hasKey: boolean;
  expiryDate: string | null;
  /** Already formatted for the input, e.g. "1250,50". */
  cost: string;
  currency: string;
  notes: string | null;
};

export function LicenseForm({ license }: { license?: LicenseFormValues }) {
  const t = useTranslations();
  const { state, pending, onSubmit } = useFormAction(saveLicenseAction);

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {license ? <input type="hidden" name="id" value={license.id} /> : null}
      <FormError state={state} />

      <Card>
        <CardHeader>
          <CardTitle>{t("licenses.sections.details")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label={t("licenses.name")} state={state} defaultValue={license?.name} required autoFocus={!license} />
          <Field name="vendor" label={t("licenses.vendor")} state={state} defaultValue={license?.vendor ?? ""} />
          <Field
            name="seats"
            label={t("licenses.seats")}
            hint={t("licenses.seatsHint")}
            state={state}
            defaultValue={license?.seats ?? ""}
            inputMode="numeric"
          />
          <Field name="expiryDate" label={t("licenses.expiryDate")} state={state} type="date" defaultValue={license?.expiryDate ?? ""} />
          <Field name="cost" label={t("licenses.cost")} state={state} defaultValue={license?.cost ?? ""} inputMode="decimal" />
          <SelectField
            name="currency"
            label={t("licenses.currency")}
            state={state}
            defaultValue={license?.currency ?? "TRY"}
            options={currencies.map((c) => ({ value: c, label: c }))}
          />
          <div className="sm:col-span-2">
            <TextareaField name="notes" label={t("licenses.notes")} state={state} defaultValue={license?.notes ?? ""} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("licenses.sections.key")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Field
            name="key"
            label={t("licenses.key")}
            hint={license?.hasKey ? t("licenses.keyKeepHint") : t("licenses.keyHint")}
            state={state}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
          {license?.hasKey ? <CheckField name="clearKey" label={t("licenses.clearKey")} /> : null}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Link href={license ? `/licenses/${license.id}` : "/licenses"} className={buttonVariants({ variant: "outline" })}>
          {t("common.cancel")}
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
