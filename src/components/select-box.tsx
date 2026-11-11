"use client";

import { createContext, useContext, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Provided by FilterForm so that a choice applies the filter immediately. */
export const FilterContext = createContext<{
  /** Applies the filter with this field set to the given value. */
  applyWith: (name: string, value: string) => void;
  /** Goes up by one every time the filters are cleared. */
  clearEpoch: number;
} | null>(null);

// The underlying component reserves the empty value for "nothing chosen".
const EMPTY = "__empty__";

export type SelectOption = { value: string; label: string };

/**
 * A drop-down that opens below its control (the browser's own select opens
 * over it on macOS). Submits with forms like a normal field through a hidden input.
 */
export function SelectBox({
  name,
  id,
  options,
  defaultValue,
  ariaLabel,
  invalid,
  className,
  onValueChange,
}: {
  name: string;
  id?: string;
  options: SelectOption[];
  defaultValue?: string | number | null;
  ariaLabel?: string;
  invalid?: boolean;
  className?: string;
  onValueChange?: (value: string) => void;
}) {
  const filter = useContext(FilterContext);
  const epoch = filter?.clearEpoch ?? 0;
  const [state, setState] = useState({ value: String(defaultValue ?? options[0]?.value ?? ""), epoch });
  // After "clear", the choice made before it no longer counts.
  const value = state.epoch === epoch ? state.value : "";
  const items = options.map((o) => ({ value: o.value === "" ? EMPTY : o.value, label: o.label }));

  return (
    <>
      <input type="hidden" name={name} value={value} data-select-value />
      <Select
        value={value === "" ? EMPTY : value}
        items={items}
        onValueChange={(chosen) => {
          const next = chosen === null || chosen === EMPTY ? "" : String(chosen);
          setState({ value: next, epoch });
          onValueChange?.(next);
          filter?.applyWith(name, next);
        }}
      >
        <SelectTrigger id={id} aria-label={ariaLabel} aria-invalid={invalid || undefined} className={cn("min-w-0", className)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="start">
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
