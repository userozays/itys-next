import { useTranslations } from "next-intl";

/** "3 / 5" with a bar, or "3 cihaz · Sınırsız" for an unlimited license. */
export function SeatUsage({ used, seats }: { used: number; seats: number | null }) {
  const t = useTranslations("licenses");
  if (seats === null) {
    return (
      <span className="text-sm tabular-nums">
        {t("seatsUsed", { used })} <span className="text-muted-foreground">· {t("unlimited")}</span>
      </span>
    );
  }
  const full = used >= seats;
  return (
    <span className="flex items-center gap-2 text-sm tabular-nums">
      <span className="h-1.5 w-16 rounded-full bg-muted" aria-hidden>
        <span
          className={`block h-1.5 rounded-full ${full ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${Math.min(100, (used / seats) * 100)}%` }}
        />
      </span>
      {t("seatsOf", { used, total: seats })}
    </span>
  );
}
