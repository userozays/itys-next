import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";

/** Body of the 404 and error screens: a title, a short explanation and a way out. */
export function StatusPage({
  code,
  title,
  text,
  homeLabel,
  children,
}: {
  code: string;
  title: string;
  text: string;
  homeLabel: string;
  children?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-3 px-4 py-16 text-center">
      <p className="font-mono text-sm text-muted-foreground">{code}</p>
      <h1 className="font-heading text-xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {children}
        <Link href="/" className={buttonVariants({ variant: children ? "outline" : "default" })}>
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
