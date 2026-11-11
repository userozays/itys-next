"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { FilterContext } from "@/components/select-box";

const TYPING_DELAY_MS = 350;

/**
 * A GET filter form that applies itself: choosing from a drop-down updates the
 * list at once, typing in a search box updates it shortly after the last key.
 * Filters live in the URL, so the result can be bookmarked or shared.
 */
export function FilterForm({ action, className, children }: { action: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [clearEpoch, setClearEpoch] = useState(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const context = useMemo(() => {
    function go(query: URLSearchParams) {
      clearTimeout(timer.current);
      const qs = query.toString();
      router.replace(qs ? `${action}?${qs}` : action, { scroll: false });
    }
    function currentQuery(): URLSearchParams {
      const query = new URLSearchParams();
      if (!form.current) return query;
      for (const [key, value] of new FormData(form.current)) {
        if (typeof value === "string" && value.trim() !== "") query.set(key, value.trim());
      }
      return query;
    }
    return {
      clearEpoch,
      apply: () => go(currentQuery()),
      applyWith(name: string, value: string) {
        const query = currentQuery();
        if (value) query.set(name, value);
        else query.delete(name);
        go(query);
      },
      /** Empties every visible control; hidden fields such as the sort order stay. */
      clear() {
        const query = new URLSearchParams();
        for (const control of form.current?.elements ?? []) {
          if (!(control instanceof HTMLInputElement)) continue;
          if (control.type !== "hidden") control.value = "";
          else if (!("selectValue" in control.dataset) && control.value) query.set(control.name, control.value);
        }
        setClearEpoch((n) => n + 1);
        go(query);
      },
    };
  }, [action, clearEpoch, router]);

  function onChange() {
    clearTimeout(timer.current);
    timer.current = setTimeout(context.apply, TYPING_DELAY_MS);
  }

  /** A button marked data-filter-clear resets the filters. */
  function onClick(event: SyntheticEvent<HTMLFormElement>) {
    if (event.target instanceof Element && event.target.closest("[data-filter-clear]")) context.clear();
  }

  return (
    <FilterContext value={context}>
      <form
        ref={form}
        method="get"
        action={action}
        className={className}
        onChange={onChange}
        onClick={onClick}
        onSubmit={(event) => {
          event.preventDefault();
          context.apply();
        }}
      >
        {children}
      </form>
    </FilterContext>
  );
}
