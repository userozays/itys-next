"use client";

import "./globals.css";

// Replaces the root layout when that layout itself fails, so translations and the
// theme are not available here. Kept in Turkish (the app's language) and plain.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="tr">
      <body className="flex min-h-dvh items-center justify-center p-4 font-sans">
        <title>Hata</title>
        <div className="grid justify-items-center gap-3 text-center">
          <h1 className="text-xl font-semibold">Bir şeyler ters gitti</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Uygulama açılırken beklenmeyen bir hata oldu. Birazdan tekrar dene.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => retry()} className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground">
              Tekrar dene
            </button>
            {/* A full page load: the client router is not usable after a root failure. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="rounded-lg border px-3 py-1.5 text-sm">
              Panoya dön
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
