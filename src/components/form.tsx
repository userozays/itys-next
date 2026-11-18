"use client";

import { useState, useTransition, type ComponentProps, type ReactNode, type SubmitEvent } from "react";
import { Input } from "@/components/ui/input";
import { useSafeCall } from "@/components/safe-call";
import { SelectBox, type SelectOption } from "@/components/select-box";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/form-state";
import { TextSuggest } from "@/components/text-suggest";

/** Submits a form to a server action without resetting the fields on error. */
export function useFormAction(action: (form: FormData) => Promise<FormState>, onSuccess?: () => void) {
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const call = useSafeCall();

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    startTransition(async () => {
      const result = await call(() => action(new FormData(form)), (error): FormState => ({ error }));
      setState(result);
      if (result.ok) {
        form.reset();
        onSuccess?.();
      }
    });
  }

  return { state, pending, onSubmit };
}

export function FormError({ state }: { state: FormState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {state.error}
    </p>
  );
}

type FieldProps = ComponentProps<typeof Input> & {
  name: string;
  label: string;
  hint?: ReactNode;
  /** Shown instead of the hint, highlighted, when a value needs attention. */
  warning?: ReactNode;
  state: FormState;
};

export function Field({ name, label, hint, warning, state, ...props }: FieldProps) {
  const error = state.fieldErrors?.[name];
  const describedBy = error ? `${name}-error` : warning ? `${name}-warning` : hint ? `${name}-hint` : undefined;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...props} />
      {error ? (
        <p id={`${name}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : warning ? (
        <p id={`${name}-warning`} role="status" className="text-xs font-medium text-amber-700 dark:text-amber-400">
          {warning}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function CheckField({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 accent-primary" />
      {label}
    </label>
  );
}

const controlClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30";

function FieldShell({ name, label, error, children }: { name: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label id={`${name}-label`} htmlFor={name}>
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${name}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type SelectFieldProps = {
  name: string;
  label: string;
  state: FormState;
  options: SelectOption[];
  defaultValue?: string | number | null;
  onValueChange?: (value: string) => void;
};

export function SelectField({ name, label, state, options, defaultValue, onValueChange }: SelectFieldProps) {
  const error = state.fieldErrors?.[name];
  return (
    <FieldShell name={name} label={label} error={error}>
      <SelectBox
        id={name}
        labelId={`${name}-label`}
        name={name}
        options={options}
        defaultValue={defaultValue}
        invalid={Boolean(error)}
        onValueChange={onValueChange}
        className="w-full"
      />
    </FieldShell>
  );
}

/** A text field with suggestions from earlier values (`TextSuggest`). */
export function SuggestField({
  name,
  label,
  state,
  suggestions,
  defaultValue,
}: {
  name: string;
  label: string;
  state: FormState;
  suggestions: string[];
  defaultValue?: string;
}) {
  const error = state.fieldErrors?.[name];
  return (
    <FieldShell name={name} label={label} error={error}>
      <TextSuggest
        id={name}
        name={name}
        suggestions={suggestions}
        defaultValue={defaultValue}
        invalid={Boolean(error)}
        describedBy={error ? `${name}-error` : undefined}
      />
    </FieldShell>
  );
}

type TextareaFieldProps = ComponentProps<"textarea"> & { name: string; label: string; state: FormState };

export function TextareaField({ name, label, state, ...props }: TextareaFieldProps) {
  const error = state.fieldErrors?.[name];
  return (
    <FieldShell name={name} label={label} error={error}>
      <textarea id={name} name={name} rows={3} aria-invalid={error ? true : undefined} className={`${controlClass} py-1.5`} {...props} />
    </FieldShell>
  );
}
