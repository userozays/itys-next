"use client";

import { KeyRound, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const t = useTranslations("nav");
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("theme")}
      title={t("theme")}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="dark:hidden" aria-hidden />
      <Moon className="hidden dark:block" aria-hidden />
    </Button>
  );
}

export function UserMenu({ name, roleLabel }: { name: string; roleLabel: string }) {
  const t = useTranslations("nav");
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label={t("userMenu")} />}>
        <UserRound aria-hidden />
        {/* Only the icon on phones, leaving room for the company name. */}
        <span className="hidden max-w-[10rem] truncate sm:inline">{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{roleLabel}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/account")}>
          <KeyRound aria-hidden />
          {t("account")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => logoutAction()}>
          <LogOut aria-hidden />
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
