"use client";

import { Bell, Building2, KeyRound, LayoutDashboard, MapPin, Monitor, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", key: "dashboard", icon: LayoutDashboard, adminOnly: false },
  { href: "/assets", key: "assets", icon: Monitor, adminOnly: false },
  { href: "/licenses", key: "licenses", icon: KeyRound, adminOnly: false },
  { href: "/locations", key: "locations", icon: MapPin, adminOnly: false },
  { href: "/companies", key: "companies", icon: Building2, adminOnly: false },
  { href: "/users", key: "users", icon: Users, adminOnly: true },
  { href: "/notifications", key: "notifications", icon: Bell, adminOnly: true },
] as const;

export function NavLinks({ isAdmin, orientation }: { isAdmin: boolean; orientation: "vertical" | "horizontal" }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav className={cn("flex gap-1", orientation === "vertical" ? "flex-col" : "overflow-x-auto")}>
      {items
        .filter((item) => isAdmin || !item.adminOnly)
        .map(({ href, key, icon: Icon }) => {
          const current = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                current && "bg-accent text-accent-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {t(key)}
            </Link>
          );
        })}
    </nav>
  );
}
