"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";

const storageKey = (list: string) => `list-url:${list}`;

/** Placed on a list page: remembers its current address, filters included, for this browser tab. */
export function RememberListUrl({ list }: { list: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    sessionStorage.setItem(storageKey(list), search ? `${pathname}?${search}` : pathname);
  }, [list, pathname, search]);
  return null;
}

const noSubscription = () => () => {};

/** A "back to the list" link that returns to the list as it was last seen (same filters, sort and page). */
export function BackToList({ list, fallback, className, children }: { list: string; fallback: string; className?: string; children: ReactNode }) {
  const href = useSyncExternalStore(
    noSubscription,
    () => sessionStorage.getItem(storageKey(list)) ?? fallback,
    () => fallback,
  );
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
