import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No infra hostnames/IPs are ever baked into the client bundle
  // (audit finding B3). All backend access goes through same-origin
  // route handlers.
  transpilePackages: ["@1pacent/core"],
};

export default nextConfig;
