/**
 * Picks the client's address out of an X-Forwarded-For header.
 *
 * Each reverse proxy appends the address it received the request from, so only
 * the entries added by our own proxies can be believed; anything further left
 * was written by the client and may be invented. With `trustedProxies` proxies
 * in front of the app, the client is the entry that many places from the right.
 *
 * With no proxy (0), Next.js fills the header from the socket when the client
 * sent none, so the last entry is used. A client talking to the app directly
 * can still send its own header: put a reverse proxy in front and set
 * TRUSTED_PROXY_COUNT for an address that cannot be forged.
 */
export function pickClientIp(forwardedFor: string | null | undefined, trustedProxies: number): string {
  const entries = (forwardedFor ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const fromRight = Math.max(1, Math.trunc(trustedProxies) || 0);
  return entries[entries.length - fromRight] ?? "unknown";
}
