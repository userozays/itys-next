"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError, useFormAction } from "@/components/form";
import { useSafeCall } from "@/components/safe-call";
import { SelectBox } from "@/components/select-box";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/form-state";
import { runImportAction, saveMappingAction, uploadImportAction } from "./actions";

export function UploadForm() {
  const t = useTranslations("import");
  const { state, pending, onSubmit } = useFormAction(uploadImportAction);

  return (
    <form method="post" onSubmit={onSubmit} className="grid gap-4">
      <FormError state={state} />
      <div className="grid gap-1.5">
        <Label htmlFor="file">{t("file")}</Label>
        <input
          id="file"
          name="file"
          type="file"
          required
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-describedby="file-hint"
          className="rounded-lg border border-input text-sm file:mr-3 file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
        />
        <p id="file-hint" className="text-xs text-muted-foreground">
          {t("fileHint")}
        </p>
      </div>
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? t("uploading") : t("upload")}
      </Button>
    </form>
  );
}

type FieldOption = { field: string; label: string; column: number | undefined };

/** One select per asset field; changing any of them re-runs the preview. */
export function MappingForm({ jobId, fields, headers }: { jobId: number; fields: FieldOption[]; headers: string[] }) {
  const t = useTranslations("import");
  const { state, pending, onSubmit } = useFormAction(saveMappingAction.bind(null, jobId));

  return (
    <form method="post" onSubmit={onSubmit} className="grid gap-4">
      <FormError state={state} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <div key={f.field} className="grid gap-1.5">
            <Label htmlFor={`map-${f.field}`}>{f.label}</Label>
            <SelectBox
              id={`map-${f.field}`}
              name={f.field}
              defaultValue={f.column ?? ""}
              options={[{ value: "", label: t("notMapped") }, ...headers.map((h, i) => ({ value: String(i), label: h }))]}
              className="w-full"
            />
          </div>
        ))}
      </div>
      <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">
        {t("updatePreview")}
      </Button>
    </form>
  );
}

export function RunImportButton({ jobId, count }: { jobId: number; count: number }) {
  const t = useTranslations("import");
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const call = useSafeCall();

  return (
    <div className="grid justify-items-start gap-2">
      <FormError state={state} />
      <Button disabled={pending || count === 0} onClick={() => startTransition(async () => setState(await call(() => runImportAction(jobId), (error): FormState => ({ error }))))}>
        {pending ? t("running") : t("run", { count })}
      </Button>
    </div>
  );
}
