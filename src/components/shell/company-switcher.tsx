"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { switchCompanyAction } from "@/app/(app)/actions";
import { useSafeCall } from "@/components/safe-call";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { id: number; name: string; active: boolean };

export function CompanySwitcher({ companies, activeId }: { companies: Option[]; activeId: number | null }) {
  const t = useTranslations("nav");
  const [pending, startTransition] = useTransition();
  const call = useSafeCall();

  const open = companies.filter((c) => c.active || c.id === activeId);
  const closed = companies.filter((c) => !c.active && c.id !== activeId);
  const item = (c: Option) => (
    <SelectItem key={c.id} value={String(c.id)} data-company-id={c.id}>
      {c.name}
      {c.active ? null : <span className="text-xs text-muted-foreground">{t("inactiveSuffix")}</span>}
    </SelectItem>
  );

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
      <SelectContent alignItemWithTrigger={false} align="start" className="w-auto min-w-(--anchor-width) max-w-[min(26rem,var(--available-width))]">
        {open.map(item)}
        {closed.length > 0 ? (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>{t("inactiveCompanies")}</SelectLabel>
              {closed.map(item)}
            </SelectGroup>
          </>
        ) : null}
      </SelectContent>
    </Select>
  );
}
