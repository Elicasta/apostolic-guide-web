import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" }
];

const nextConfig: NextConfig = {
  experimental: { optimizePackageImports: ["lucide-react"] },
  async headers() {
    // Permissions-Policy is set per request in proxy.ts so Studio live
    // sessions and the guest green room can capture camera and microphone.
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  async redirects() {
    return [
      {
        source: "/index",
        destination: "/",
        permanent: true
      },
      {
        source: "/app",
        destination: process.env.NEXT_PUBLIC_APP_URL ?? "https://app.apostolicguide.com",
        permanent: false
      }
    ];
  }
};

export default nextConfig;
