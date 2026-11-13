"use client";

import { unstable_rethrow } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

/**
 * Calls a server action from the browser. When the request itself fails
 * (connection lost, server error), the caller gets a translated message
 * instead of a promise that rejects and leaves a button busy forever (QA O1).
 * Redirects and other navigation signals from the action pass through.
 */
export function useSafeCall() {
  const t = useTranslations("errors");
  return useCallback(
    async <T,>(call: () => Promise<T>, onError: (message: string) => T): Promise<T> => {
      try {
        return await call();
      } catch (e) {
        unstable_rethrow(e);
        console.error(e);
        return onError(t("unexpected"));
      }
    },
    [t],
  );
}
