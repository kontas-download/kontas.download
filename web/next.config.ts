import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT_STANDALONE === "true" ? "standalone" : undefined,
  // The proxy buffers request bodies and cuts them at 10 MB by default; document uploads (20 MB) and company packages (120 MB) need more.
  experimental: { proxyClientMaxBodySize: '130mb' },
  serverExternalPackages: ["pdfmake", "nodemailer", "better-sqlite3", "imapflow", "mailparser", "sharp", "heic-convert", "heic-decode", "libheif-js", "pdfjs-dist", "@napi-rs/canvas"],
  // The standalone build traces only statically imported files. pdfjs-dist loads its worker with a dynamic import and reads the
  // standard fonts from disk, so both are copied explicitly; without them PDF pages cannot be rendered to images in the container.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", "./node_modules/pdfjs-dist/standard_fonts/**"],
  },
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
