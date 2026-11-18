"use client";

import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { searchFold } from "@/lib/turkish";
import { cn } from "@/lib/utils";

export type PickerItem = { value: string; label: string };
export type PickerGroup = { value: string; items: PickerItem[] };

const matches = (item: PickerItem, query: string) => searchFold(item.label).includes(searchFold(query.trim()));

/**
 * A searchable device list for long lists (a company can have hundreds of devices).
 * Nothing is chosen at first, so a quick "Assign" cannot hit the wrong device.
 * Submits the chosen value under `name` like a normal field.
 */
export function AssetPicker({
  name,
  groups,
  placeholder,
  emptyText,
  ariaLabel,
  onValueChange,
  className,
}: {
  name: string;
  groups: PickerGroup[];
  placeholder: string;
  emptyText: string;
  ariaLabel: string;
  onValueChange?: (value: string | null) => void;
  className?: string;
}) {
  const nonEmpty = groups.filter((g) => g.items.length > 0);
  return (
    <Combobox.Root
      name={name}
      items={nonEmpty}
      filter={matches}
      autoHighlight
      onValueChange={(item: PickerItem | null) => onValueChange?.(item?.value ?? null)}
    >
      <Combobox.InputGroup className={cn("relative flex h-8 min-w-0 items-center", className)}>
        <Combobox.Input
          aria-label={ariaLabel}
          placeholder={placeholder}
          className="h-full w-full min-w-0 rounded-lg border border-input bg-transparent pr-8 pl-2.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
        />
        <Combobox.Trigger
          aria-label={ariaLabel}
          className="absolute right-1 flex size-6 items-center justify-center text-muted-foreground"
        >
          <ChevronDownIcon className="size-4" aria-hidden />
        </Combobox.Trigger>
      </Combobox.InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner side="bottom" align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="max-h-[min(22rem,var(--available-height))] w-(--anchor-width) min-w-56 overflow-y-auto overscroll-contain rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
            <Combobox.Empty>
              <p className="px-2 py-3 text-sm text-muted-foreground">{emptyText}</p>
            </Combobox.Empty>
            <Combobox.List>
              {(group: PickerGroup) => (
                <Combobox.Group key={group.value} items={group.items} className="pb-1 last:pb-0">
                  <Combobox.GroupLabel className="px-2 py-1 text-xs text-muted-foreground">{group.value}</Combobox.GroupLabel>
                  <Combobox.Collection>
                    {(item: PickerItem) => (
                      <Combobox.Item
                        key={item.value}
                        value={item}
                        className="relative flex cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                      >
                        <span className="min-w-0 truncate">{item.label}</span>
                        <Combobox.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
                          <CheckIcon className="size-4" aria-hidden />
                        </Combobox.ItemIndicator>
                      </Combobox.Item>
                    )}
                  </Combobox.Collection>
                </Combobox.Group>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
