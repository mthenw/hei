import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Keep the dev badge off the rail's Settings button and the phone tab bar.
  devIndicators: { position: "top-right" },
  // Config redirects, not redirect() in a page: under Cache Components a page
  // that only redirects fails prerender validation.
  redirects: async () => [
    { source: "/", destination: "/chat", permanent: false },
    { source: "/settings", destination: "/settings/profile", permanent: false },
  ],
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
