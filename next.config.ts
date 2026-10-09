import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: let phones on the same Wi-Fi load dev assets via the Mac's LAN IP.
  allowedDevOrigins: ["192.168.0.150"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
