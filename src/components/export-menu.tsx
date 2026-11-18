"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** "Export" button offering the current list as Excel or CSV. `href` already carries the list's filters. */
export function ExportMenu({ href }: { href: string }) {
  const t = useTranslations("export");
  const withFormat = (format: string) => `${href}${href.includes("?") ? "&" : "?"}format=${format}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <Download aria-hidden />
        {t("button")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {/* Plain links: the browser downloads the file. */}
        <DropdownMenuItem render={<a href={withFormat("xlsx")} download />}>{t("xlsx")}</DropdownMenuItem>
        <DropdownMenuItem render={<a href={withFormat("csv")} download />}>{t("csv")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
