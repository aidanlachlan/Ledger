import type { NextConfig } from "next";
const config: NextConfig = {
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        // The OCR worker and its files. The worker compiles WebAssembly, so
        // it needs 'wasm-unsafe-eval'; pages keep their stricter policy.
        source: "/ocr/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'",
          },
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
    ];
  },
};
export default config;
