"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactElement } from "react";
import { useSafeCall } from "@/components/safe-call";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { FormState } from "@/lib/form-state";

/** A delete button that asks first. `action` is a server action already bound to its target. */
export function ConfirmDelete({
  title,
  description,
  action,
  trigger,
}: {
  title: string;
  description: string;
  action: () => Promise<FormState>;
  trigger: ReactElement;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const call = useSafeCall();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await call(action, (message): FormState => ({ error: message }));
                if (result.ok) setOpen(false);
                else setError(result.error);
              })
            }
          >
            {pending ? t("deleting") : t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
