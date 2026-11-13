"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";
import { Field, FormError, useFormAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { saveLocationAction } from "./actions";

export function LocationDialog({ location, trigger }: { location?: { id: number; name: string }; trigger: ReactElement }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const { state, pending, onSubmit } = useFormAction(saveLocationAction, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{location ? t("locations.edit") : t("locations.new")}</DialogTitle>
        </DialogHeader>
        <form method="post" onSubmit={onSubmit} className="grid gap-4">
          {location ? <input type="hidden" name="id" value={location.id} /> : null}
          <FormError state={state} />
          <Field name="name" label={t("locations.name")} state={state} defaultValue={location?.name} required />
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
