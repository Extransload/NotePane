// The code block formatters that are not Prettier plugins. Each loader runs the first time its
// language is prettified, imports its formatter as its own chunk, and resolves to a function
// `(code, formatter) => string | Promise<string>`, where `formatter` is the language's entry in
// CODE_FORMATTERS (src/editor/codeFormatting.js).
//
// Most of them are WebAssembly. The packaged renderer runs from file://, where fetch() of a file
// beside the page fails, so vite.config.js inlines every .wasm (and brotli-compressed .wasm.br)
// into the chunk that imports it as a data: URL, and the CSP allows 'wasm-unsafe-eval'.
export const CODE_FORMAT_ENGINE_LOADERS = {
  // C, C++, Objective-C, Java and C#. `fileName` picks the language, `style` the clang-format
  // base style. The web entry, not the vite one: both name the .wasm, and the vite entry imports
  // the web one, so it would inline the 3.4 MB twice.
  clangFormat: async () => {
    const { default: init, format } = await import("@wasm-fmt/clang-format/web");
    await init();
    return (code, { fileName, style }) => format(code, fileName, style);
  },
  ruff: async () => {
    const { default: init, format } = await import("@wasm-fmt/ruff_fmt/vite");
    await init();
    return (code) => format(code);
  },
  stylua: async () => {
    const { default: init, format } = await import("@wasm-fmt/lua_fmt/vite");
    await init();
    return (code) => format(code, { indent_style: "space", indent_width: 2 });
  },
  shfmt: async () => {
    const { default: init, format } = await import("@wasm-fmt/shfmt/vite");
    await init();
    return (code) => format(code, "main.sh", { indent: 2 });
  },
  texFmt: async () => {
    // tex-fmt's package exports only its bundler entry, which imports the .wasm as an ES module,
    // and Vite cannot. So its wasm-bindgen glue and its .wasm are imported by path, and the
    // module is instantiated here the way that entry would.
    const [glue, { default: instantiate }] = await Promise.all([
      import("../../node_modules/tex-fmt/tex_fmt_bg.js"),
      import("../../node_modules/tex-fmt/tex_fmt_bg.wasm?init"),
    ]);
    const instance = await instantiate({ "./tex_fmt_bg.js": glue });
    glue.__wbg_set_wasm(instance.exports);
    instance.exports.__wbindgen_start();
    return (code) => glue.main(code, "").output;
  },
  rustfmt: async () => {
    const { format, init } = await import("@scalar/rust-fmt");
    await init(scalarArtifactOptions());
    return (code) => format(code, { edition: "2024", styleEdition: "2024" });
  },
  swiftFormat: async () => {
    const { format, init } = await import("@scalar/swift-fmt");
    await init(scalarArtifactOptions());
    return (code) => format(code);
  },
  syntaxTree: async () => {
    const { format, init } = await import("@scalar/ruby-fmt");
    await init(scalarArtifactOptions());
    return (code) => format(code);
  },
  sqlFormatter: async () => {
    const { formatDialect, sql } = await import("sql-formatter");
    return (code) => formatDialect(code, { dialect: sql, tabWidth: 2 });
  },
  sassFormatter: async () => {
    const { SassFormatter } = await import("sass-formatter");
    return (code) => SassFormatter.Format(code, { tabSize: 2, insertSpaces: true });
  },
};

// The @scalar formatters ship brotli-compressed .wasm.br artifacts. In a build the artifact is a
// data: URL of those compressed bytes, which the package expands itself; the dev server sends the
// file with `Content-Encoding: br`, so the browser has expanded it already.
function scalarArtifactOptions() {
  return import.meta.env.DEV ? { encoding: "none" } : {};
}

const loadedCodeFormatEngines = new Map();

export function loadCodeFormatEngine(engineName) {
  if (!loadedCodeFormatEngines.has(engineName)) {
    const loader = CODE_FORMAT_ENGINE_LOADERS[engineName];
    if (!loader) {
      throw new Error(`Unknown code format engine: ${engineName}`);
    }
    // A failed load is not kept, so the next Prettify tries again.
    const engine = loader().catch((error) => {
      loadedCodeFormatEngines.delete(engineName);
      throw error;
    });
    loadedCodeFormatEngines.set(engineName, engine);
  }
  return loadedCodeFormatEngines.get(engineName);
}
