"use client";

import { Camera, ScanBarcode } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type ScanError = "unavailable" | "denied" | "failed";

const PHOTO_SIZES = [1600, 900]; // longest side in pixels; a smaller copy sometimes reads when the large one does not

/** Reads a barcode or QR code from a photo. Returns null when none can be found. */
async function readFromPhoto(file: File): Promise<string | null> {
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const bitmap = await createImageBitmap(file);
  const reader = new BrowserMultiFormatReader();
  for (const size of PHOTO_SIZES) {
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    try {
      const text = reader.decodeFromCanvas(canvas).getText().trim();
      if (text) return text;
    } catch {
      // Not found at this size; try the next one.
    }
  }
  return null;
}

/**
 * Reads a barcode or QR code in the browser, two ways:
 * - live from the camera, where the browser allows it (HTTPS or localhost);
 * - from a photo, which on a phone opens the camera app and works on any address.
 */
function Scanner({ onResult }: { onResult: (text: string) => void }) {
  const t = useTranslations("scan");
  const video = useRef<HTMLVideoElement>(null);
  const [liveError, setLiveError] = useState<ScanError>();
  const [photo, setPhoto] = useState<"idle" | "reading" | "unreadable">("idle");
  // The latest callback, without restarting the camera when the parent re-renders.
  const report = useRef(onResult);
  useEffect(() => {
    report.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      // Browsers only offer the live camera on HTTPS or localhost.
      if (!navigator.mediaDevices?.getUserMedia) return setLiveError("unavailable");
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const controls = await new BrowserMultiFormatReader().decodeFromConstraints(
          { video: { facingMode: "environment" } },
          video.current ?? undefined,
          (result, _error, scanner) => {
            const text = result?.getText().trim();
            if (!text) return;
            scanner.stop();
            report.current(text);
          },
        );
        if (cancelled) controls.stop();
        else stop = () => controls.stop();
      } catch (e) {
        if (!cancelled) setLiveError(e instanceof DOMException && e.name === "NotAllowedError" ? "denied" : "failed");
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhoto("reading");
    const text = await readFromPhoto(file).catch(() => null);
    if (text) report.current(text);
    else setPhoto("unreadable");
  }

  return (
    <div className="grid gap-3">
      {liveError ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{t(`errors.${liveError}`)}</p>
      ) : (
        <video ref={video} muted playsInline className="aspect-video w-full rounded-lg bg-black object-cover" />
      )}
      <label className={buttonVariants({ variant: liveError ? "default" : "outline" })}>
        <Camera aria-hidden />
        {photo === "reading" ? t("reading") : t("takePhoto")}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            void onPhoto(event.target.files?.[0]);
            event.target.value = ""; // the same photo can be chosen again
          }}
        />
      </label>
      {photo === "unreadable" ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t("errors.unreadable")}
        </p>
      ) : null}
    </div>
  );
}

/** A button that opens the camera and puts what it reads into the input with the given id. */
export function ScanIntoField({ targetId, label }: { targetId: string; label: string }) {
  const t = useTranslations("scan");
  const [open, setOpen] = useState(false);

  function fill(text: string) {
    const input = document.getElementById(targetId);
    if (input instanceof HTMLInputElement) {
      input.value = text;
      input.focus();
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="icon" aria-label={label} title={label}>
            <ScanBarcode aria-hidden />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>
        {open ? <Scanner onResult={fill} /> : null}
      </DialogContent>
    </Dialog>
  );
}
