import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Domain rules live in /domain (outside src) so the same pure TS is shared by tests, jobs and UI.
  experimental: { externalDir: true },
};

export default nextConfig;
