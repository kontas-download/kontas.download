import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT_STANDALONE === "true" ? "standalone" : undefined,
  // The proxy buffers request bodies and cuts them at 10 MB by default; document uploads (20 MB) and company packages (120 MB) need more.
  experimental: { proxyClientMaxBodySize: '130mb' },
  serverExternalPackages: ["pdfmake", "nodemailer", "better-sqlite3", "imapflow", "mailparser", "sharp", "heic-convert", "heic-decode", "libheif-js"],
  distDir: process.env.NEXT_BUILD_DIR || ".next",
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
