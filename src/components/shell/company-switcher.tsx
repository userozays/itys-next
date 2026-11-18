"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { switchCompanyAction } from "@/app/(app)/actions";
import { useSafeCall } from "@/components/safe-call";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Option = { id: number; name: string };

export function CompanySwitcher({ companies, activeId }: { companies: Option[]; activeId: number | null }) {
  const t = useTranslations("nav");
  const [pending, startTransition] = useTransition();
  const call = useSafeCall();

  if (companies.length === 0) {
    return <span className="text-sm text-muted-foreground">{t("noCompany")}</span>;
  }

  return (
    <Select
      value={activeId === null ? null : String(activeId)}
      items={companies.map((c) => ({ value: String(c.id), label: c.name }))}
      disabled={pending}
      onValueChange={(value) => {
        if (value !== null) startTransition(() => call(() => switchCompanyAction(Number(value)), () => undefined));
      }}
    >
      <SelectTrigger aria-label={t("company")} data-company-id={activeId ?? ""} className="w-auto min-w-0 flex-1 font-medium sm:max-w-[16rem] sm:flex-none">
        <SelectValue />
      </SelectTrigger>
      {/* Opens below the control instead of over it. */}
      <SelectContent alignItemWithTrigger={false} align="start">
        {companies.map((c) => (
          <SelectItem key={c.id} value={String(c.id)} data-company-id={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
