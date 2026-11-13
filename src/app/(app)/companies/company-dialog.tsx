"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";
import { CheckField, Field, FormError, useFormAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { saveCompanyAction } from "./actions";

export type CompanyRow = {
  id: number;
  name: string;
  contact: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
};

export function CompanyDialog({ company, trigger }: { company?: CompanyRow; trigger: ReactElement }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const { state, pending, onSubmit } = useFormAction(saveCompanyAction, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{company ? t("companies.edit") : t("companies.new")}</DialogTitle>
        </DialogHeader>
        <form method="post" onSubmit={onSubmit} className="grid gap-4">
          {company ? <input type="hidden" name="id" value={company.id} /> : null}
          <FormError state={state} />
          <Field name="name" label={t("companies.name")} state={state} defaultValue={company?.name} required />
          <Field name="contact" label={t("companies.contact")} state={state} defaultValue={company?.contact ?? ""} />
          <Field name="phone" label={t("companies.phone")} state={state} defaultValue={company?.phone ?? ""} type="tel" />
          <Field name="notes" label={t("companies.notes")} state={state} defaultValue={company?.notes ?? ""} />
          <CheckField name="active" label={t("companies.active")} defaultChecked={company?.active ?? true} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
