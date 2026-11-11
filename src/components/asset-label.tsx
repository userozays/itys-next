/** One printable label: QR code, tag, device name and company. `svg` comes from src/server/qr.ts. */
export function AssetLabel({ svg, tag, name, company }: { svg: string; tag: string; name: string; company: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-neutral-300 bg-white p-2 text-black print:break-inside-avoid">
      <div className="size-16 shrink-0 [&>svg]:size-full" role="img" aria-label={`QR ${tag}`} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="grid min-w-0 gap-0.5 leading-tight">
        <span className="font-mono text-sm font-semibold">{tag}</span>
        <span className="truncate text-xs">{name}</span>
        <span className="truncate text-[10px] text-neutral-600">{company}</span>
      </div>
    </div>
  );
}
