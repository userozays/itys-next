"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";
import { CheckField, Field, FormError, SelectField, useFormAction } from "@/components/form";
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
import type { Role } from "@/server/db/schema";
import { resetPasswordAction, saveUserAction } from "./actions";

export type UserRow = { id: number; username: string; name: string; role: Role; active: boolean; companyIds: number[] };
type CompanyOption = { id: number; name: string };

function Footer({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  const t = useTranslations("common");
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        {t("cancel")}
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </DialogFooter>
  );
}

export function UserDialog({
  user,
  companies,
  trigger,
}: {
  user?: UserRow;
  companies: CompanyOption[];
  trigger: ReactElement;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(user?.role ?? "technician");
  const { state, pending, onSubmit } = useFormAction(saveUserAction, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? t("users.edit") : t("users.new")}</DialogTitle>
        </DialogHeader>
        <form method="post" onSubmit={onSubmit} className="grid gap-4">
          {user ? <input type="hidden" name="id" value={user.id} /> : null}
          <FormError state={state} />
          <Field name="name" label={t("users.name")} state={state} defaultValue={user?.name} required />
          {user ? null : (
            <>
              <Field
                name="username"
                label={t("users.username")}
                hint={t("auth.usernameHint")}
                state={state}
                autoCapitalize="none"
                autoComplete="off"
                required
              />
              <Field
                name="password"
                label={t("users.password")}
                hint={t("auth.passwordHint")}
                state={state}
                type="password"
                autoComplete="new-password"
                required
              />
            </>
          )}
          <SelectField
            name="role"
            label={t("users.role")}
            state={state}
            defaultValue={role}
            onValueChange={(value) => setRole(value as Role)}
            options={[
              { value: "technician", label: t("users.roles.technician") },
              { value: "admin", label: t("users.roles.admin") },
            ]}
          />
          {role === "technician" ? (
            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-medium">{t("users.companies")}</legend>
              {companies.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("users.noCompaniesToAssign")}</p>
              ) : (
                <div className="grid max-h-40 gap-2 overflow-y-auto rounded-lg border p-2.5">
                  {companies.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="companyIds"
                        value={c.id}
                        defaultChecked={user?.companyIds.includes(c.id)}
                        className="size-4 accent-primary"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          ) : null}
          {user ? <CheckField name="active" label={t("users.active")} defaultChecked={user.active} /> : null}
          <Footer pending={pending} onCancel={() => setOpen(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ResetPasswordDialog({ user, trigger }: { user: UserRow; trigger: ReactElement }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const { state, pending, onSubmit } = useFormAction(resetPasswordAction, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("users.resetPasswordFor", { username: user.username })}</DialogTitle>
          <DialogDescription>{t("users.resetPasswordHint")}</DialogDescription>
        </DialogHeader>
        <form method="post" onSubmit={onSubmit} className="grid gap-4">
          <input type="hidden" name="id" value={user.id} />
          <FormError state={state} />
          <Field
            name="password"
            label={t("users.newPassword")}
            hint={t("auth.passwordHint")}
            state={state}
            type="password"
            autoComplete="new-password"
            required
          />
          <Footer pending={pending} onCancel={() => setOpen(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
