"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import Link from "next/link";
import { ScanIntoField } from "@/components/barcode-scan";
import { Field, FormError, SelectField, TextareaField, useFormAction } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assetStatuses, assetTypes } from "@/server/db/schema";
import type { ModelSpecs } from "@/server/services/assets";
import { saveAssetAction, suggestModelSpecsAction } from "./actions";

const SPEC_FIELDS = ["cpu", "ramGb", "storage", "os"] as const;

const input = (id: string) => document.getElementById(id) as HTMLInputElement | null;

export type AssetFormValues = {
  id: number;
  tag: string;
  name: string;
  type: string;
  status: string;
  brand: string | null;
  model: string | null;
  serial: string | null;
  locationId: number | null;
  assignedTo: string | null;
  purchaseDate: string | null;
  warrantyEnd: string | null;
  notes: string | null;
  cpu: string | null;
  ramGb: number | null;
  storage: string | null;
  os: string | null;
  hostname: string | null;
  ipAddress: string | null;
  macAddress: string | null;
};

export function AssetForm({ asset, locations }: { asset?: AssetFormValues; locations: { id: number; name: string }[] }) {
  const t = useTranslations();
  const { state, pending, onSubmit } = useFormAction(saveAssetAction);
  // Specifications found on another device of the same model, and whether they were applied.
  const [suggestion, setSuggestion] = useState<{ specs: ModelSpecs; applied: boolean }>();
  const lastLookup = useRef("");

  function applySpecs(specs: ModelSpecs) {
    for (const field of SPEC_FIELDS) {
      const target = input(field);
      if (target && specs[field] != null) target.value = String(specs[field]);
    }
    setSuggestion({ specs, applied: true });
  }

  /** When brand and model are both known, look for a device of the same model. */
  async function lookUpModel() {
    const brand = input("brand")?.value.trim() ?? "";
    const model = input("model")?.value.trim() ?? "";
    const key = `${brand}|${model}`;
    if (!brand || !model || key === lastLookup.current) return;
    lastLookup.current = key;
    const specs = await suggestModelSpecsAction(brand, model, asset?.id);
    if (!specs) return setSuggestion(undefined);
    // Fill straight away only when nothing would be overwritten; otherwise offer it.
    if (SPEC_FIELDS.every((field) => !input(field)?.value.trim())) applySpecs(specs);
    else setSuggestion({ specs, applied: false });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {asset ? <input type="hidden" name="id" value={asset.id} /> : null}
      <FormError state={state} />

      <Card>
        <CardHeader>
          <CardTitle>{t("assets.sections.identity")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label={t("assets.name")} state={state} defaultValue={asset?.name} required autoFocus={!asset} />
          <Field name="tag" label={t("assets.tag")} hint={t("assets.tagHint")} state={state} defaultValue={asset?.tag} autoCapitalize="characters" />
          <SelectField
            name="type"
            label={t("assets.type")}
            state={state}
            defaultValue={asset?.type ?? "computer"}
            options={assetTypes.map((v) => ({ value: v, label: t(`assets.types.${v}`) }))}
          />
          <SelectField
            name="status"
            label={t("assets.status")}
            state={state}
            defaultValue={asset?.status ?? "in_use"}
            options={assetStatuses.map((v) => ({ value: v, label: t(`assets.statuses.${v}`) }))}
          />
          <Field name="brand" label={t("assets.brand")} state={state} defaultValue={asset?.brand ?? ""} onBlur={lookUpModel} />
          <Field name="model" label={t("assets.model")} state={state} defaultValue={asset?.model ?? ""} onBlur={lookUpModel} />
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field name="serial" label={t("assets.serial")} state={state} defaultValue={asset?.serial ?? ""} autoCapitalize="characters" />
            </div>
            <ScanIntoField targetId="serial" label={t("scan.serial")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("assets.sections.specs")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {suggestion ? (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm sm:col-span-2">
              <span>
                {t(suggestion.applied ? "assets.specsFilled" : "assets.specsFound", {
                  name: suggestion.specs.sourceName,
                  tag: suggestion.specs.sourceTag,
                })}
              </span>
              {suggestion.applied ? null : (
                <Button type="button" variant="outline" size="sm" onClick={() => applySpecs(suggestion.specs)}>
                  {t("assets.specsApply")}
                </Button>
              )}
            </div>
          ) : null}
          <Field name="cpu" label={t("assets.cpu")} state={state} defaultValue={asset?.cpu ?? ""} placeholder="Intel Core i5-13500" />
          <Field name="ramGb" label={t("assets.ramGb")} state={state} defaultValue={asset?.ramGb ?? ""} inputMode="numeric" placeholder="16" />
          <Field name="storage" label={t("assets.storage")} state={state} defaultValue={asset?.storage ?? ""} placeholder="512 GB SSD" />
          <Field name="os" label={t("assets.os")} state={state} defaultValue={asset?.os ?? ""} placeholder="Windows 11 Pro" />
          <Field name="hostname" label={t("assets.hostname")} state={state} defaultValue={asset?.hostname ?? ""} autoCapitalize="none" />
          <Field name="ipAddress" label={t("assets.ipAddress")} state={state} defaultValue={asset?.ipAddress ?? ""} inputMode="decimal" />
          <Field name="macAddress" label={t("assets.macAddress")} state={state} defaultValue={asset?.macAddress ?? ""} autoCapitalize="characters" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("assets.sections.placement")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="locationId"
            label={t("assets.location")}
            state={state}
            defaultValue={asset?.locationId ?? ""}
            options={[{ value: "", label: t("assets.noLocation") }, ...locations.map((l) => ({ value: String(l.id), label: l.name }))]}
          />
          <Field name="assignedTo" label={t("assets.assignedTo")} state={state} defaultValue={asset?.assignedTo ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("assets.sections.purchase")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field name="purchaseDate" label={t("assets.purchaseDate")} state={state} type="date" defaultValue={asset?.purchaseDate ?? ""} />
          <Field name="warrantyEnd" label={t("assets.warrantyEnd")} state={state} type="date" defaultValue={asset?.warrantyEnd ?? ""} />
          <div className="sm:col-span-2">
            <TextareaField name="notes" label={t("assets.notes")} state={state} defaultValue={asset?.notes ?? ""} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Link href={asset ? `/assets/${asset.id}` : "/assets"} className={buttonVariants({ variant: "outline" })}>
          {t("common.cancel")}
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
