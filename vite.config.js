import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Applied to the packaged renderer only. The dev server injects inline scripts
// for HMR and React refresh, which this policy would block.
// Styles stay inline-capable because React, Mantine and BlockNote set style
// attributes and inject <style> tags. Note media can be pasted from the web, so
// images and media also allow http(s). The renderer fetches data: URLs to turn
// them into asset files. The code block formatters compile WebAssembly, which needs
// 'wasm-unsafe-eval' (it allows WebAssembly compilation only, not eval).
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
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

// The code block formatters' WebAssembly (src/editor/codeFormatEngines.js). The packaged renderer
// loads from file://, where fetch() of a file beside the page fails, so each .wasm, and each
// brotli-compressed .wasm.br, is inlined as a data: URL into the lazy chunk that imports it.
const WEBASSEMBLY_ASSET = /\.wasm(?:\.br)?$/;

// Packages that find their .wasm through `new URL(..., import.meta.url)` or a `?init` import. The
// dev server's dependency pre-bundling moves a package's code away from its files, so these are
// served as they are.
const WEBASSEMBLY_FORMATTER_PACKAGES = [
  "@wasm-fmt/clang-format",
  "@wasm-fmt/ruff_fmt",
  "@wasm-fmt/lua_fmt",
  "@wasm-fmt/shfmt",
  "@scalar/rust-fmt",
  "@scalar/swift-fmt",
  "@scalar/ruby-fmt",
  "brotli-dec-wasm",
];

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: (filePath) => (WEBASSEMBLY_ASSET.test(filePath) ? true : undefined),
  },
  optimizeDeps: {
    exclude: WEBASSEMBLY_FORMATTER_PACKAGES,
  },
  server: {
    host: "127.0.0.1",
  },
});
