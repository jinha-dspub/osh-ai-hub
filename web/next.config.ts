import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/demo/:path*",
        destination: "https://tools.osh.ai.kr/demo/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/demo/voice/:path*",
        headers: [{
          key: "Permissions-Policy",
          value: "camera=(), microphone=(self), geolocation=()",
        }],
      },
    ];
  },
};
export default config;
