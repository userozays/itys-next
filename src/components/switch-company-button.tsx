"use client";

import { useTransition } from "react";
import { switchCompanyAction } from "@/app/(app)/actions";
import { useSafeCall } from "@/components/safe-call";
import { Button } from "@/components/ui/button";

export function SwitchCompanyButton({ companyId, label }: { companyId: number; label: string }) {
  const [pending, startTransition] = useTransition();
  const call = useSafeCall();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(() => call(() => switchCompanyAction(companyId), () => undefined))}
    >
      {label}
    </Button>
  );
}
