import os from "node:os";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/** This machine's addresses on the local network, so a phone can open the dev server. */
const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((address) => address?.family === "IPv4" && !address.internal)
  .map((address) => address!.address);

const dev = process.env.NODE_ENV === "development";

// Scripts stay 'unsafe-inline': Next's hydration data and the theme switcher are
// inline scripts, and nonces would need a proxy rewrite on every request. The
// parts that matter most here are frame-ancestors (no clickjacking) and the
// locked-down form-action/base-uri/object-src. Dev adds eval and the HMR socket.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self' blob:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  // The camera is used for scanning serial numbers and QR codes, nothing else.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: lanAddresses,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Cache Components stays off: every screen depends on the signed-in user and
  // must show current data, so there is no static shell worth prerendering.
  output: "standalone",
  // Lets the e2e server run next to a developer's own `next dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  serverExternalPackages: ["better-sqlite3", "exceljs"],
  // Import files are capped at 2 MB (src/server/import/parse.ts); leave room for form overhead.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
