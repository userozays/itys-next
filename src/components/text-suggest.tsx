"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { useState } from "react";
import { searchFold } from "@/lib/turkish";

const matches = (item: string, query: string) => searchFold(item).includes(searchFold(query.trim()));

/**
 * A free-text field that suggests values already used, so the same person is not
 * written three different ways (QA Ö4). Anything can still be typed. Matching
 * ignores Turkish case and accents ("ayse" finds "Ayşe").
 */
export function TextSuggest({
  id,
  name,
  suggestions,
  defaultValue,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  suggestions: string[];
  defaultValue?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [text, setText] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  // An open popup hides the rest of the page from screen readers, so it only opens
  // when there is something to suggest besides what is already typed.
  const hasSuggestion = suggestions.some((s) => matches(s, text) && searchFold(s) !== searchFold(text.trim()));

  return (
    <Autocomplete.Root
      items={suggestions}
      filter={matches}
      limit={8}
      value={text}
      onValueChange={setText}
      open={open && hasSuggestion}
      onOpenChange={setOpen}
    >
      <Autocomplete.Input
        id={id}
        name={name}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30"
      />
      <Autocomplete.Portal>
        <Autocomplete.Positioner side="bottom" align="start" sideOffset={4} className="isolate z-50">
          <Autocomplete.Popup className="w-(--anchor-width) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 data-empty:hidden">
            <Autocomplete.List className="max-h-[min(18rem,var(--available-height))] overflow-y-auto overscroll-contain p-1">
              {(item: string) => (
                <Autocomplete.Item
                  key={item}
                  value={item}
                  className="flex cursor-default rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  {item}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
