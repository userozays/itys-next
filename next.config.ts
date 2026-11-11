import os from "node:os";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/** This machine's addresses on the local network, so a phone can open the dev server. */
const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((address) => address?.family === "IPv4" && !address.internal)
  .map((address) => address!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanAddresses,
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
