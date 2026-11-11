import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { getAssetByTag } from "@/server/services/assets";

/** Target of the QR code on a device label: opens that device's record. */
export default async function LabelScanPage({ params }: PageProps<"/a/[company]/[tag]">) {
  const actor = await requireActor();
  const { company, tag } = await params;
  let id: number;
  try {
    id = getAssetByTag(getDb(), actor, Number(company) || 0, decodeURIComponent(tag)).id;
  } catch (e) {
    if (e instanceof AppError && e.code === "notFound") notFound();
    throw e;
  }
  redirect(`/assets/${id}`);
}
