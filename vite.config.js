import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Applied to the packaged renderer only. The dev server injects inline scripts
// for HMR and React refresh, which this policy would block.
// Styles stay inline-capable because React, Mantine and BlockNote set style
// attributes and inject <style> tags. Note media can be pasted from the web, so
// images and media also allow http(s). The renderer fetches data: URLs to turn
// them into asset files.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: notepane-asset: https: http:",
  "media-src 'self' data: blob: notepane-asset: https: http:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob: notepane-asset:",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function contentSecurityPolicy() {
  return {
    name: "notepane-content-security-policy",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content: CONTENT_SECURITY_POLICY,
          },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
  },
});
