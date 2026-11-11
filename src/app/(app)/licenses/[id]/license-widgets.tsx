"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError, useFormAction } from "@/components/form";
import { SelectBox } from "@/components/select-box";
import { Button } from "@/components/ui/button";
import { assignLicenseAction, revealLicenseKeyAction, unassignLicenseAction } from "../actions";

/** Fetches the key only when asked, and forgets it again on "hide". */
export function KeyReveal({ licenseId }: { licenseId: number }) {
  const t = useTranslations();
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  if (key === null) {
    return (
      <div className="grid justify-items-start gap-2">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await revealLicenseKeyAction(licenseId);
              setError(result.error);
              setKey(result.key);
            })
          }
        >
          {t("licenses.showKey")}
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <code data-testid="license-key" className="rounded-lg bg-muted px-3 py-2 font-mono text-sm break-all select-all">
        {key}
      </code>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(key);
            setCopied(true);
          }}
        >
          {copied ? t("common.copied") : t("common.copy")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setKey(null);
            setCopied(false);
          }}
        >
          {t("common.hide")}
        </Button>
      </div>
    </div>
  );
}

export function AssignForm({ licenseId, options }: { licenseId: number; options: { id: number; label: string }[] }) {
  const t = useTranslations("licenses");
  const { state, pending, onSubmit } = useFormAction(assignLicenseAction.bind(null, licenseId));

  if (options.length === 0) return <p className="text-sm text-muted-foreground">{t("noFreeDevices")}</p>;

  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      <FormError state={state} />
      <div className="flex gap-2">
        <SelectBox
          key={options.map((o) => o.id).join(",")}
          name="assetId"
          ariaLabel={t("assignTo")}
          options={options.map((o) => ({ value: String(o.id), label: o.label }))}
          className="flex-1"
        />
        <Button type="submit" disabled={pending}>
          {t("assign")}
        </Button>
      </div>
    </form>
  );
}

export function UnassignButton({ licenseId, assetId, name }: { licenseId: number; assetId: number; name: string }) {
  const t = useTranslations("licenses");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={t("unassign", { name })}
      title={t("unassign", { name })}
      onClick={() => startTransition(async () => void (await unassignLicenseAction(licenseId, assetId)))}
    >
      <X aria-hidden />
    </Button>
  );
}
