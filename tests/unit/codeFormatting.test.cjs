const test = require("node:test");
const assert = require("node:assert/strict");

const load = async () => {
  const { codeBlockOptions } = await import("@blocknote/code-block");
  const formatting = await import("../../src/editor/codeFormatting.js");
  const { CODE_FORMAT_ENGINE_LOADERS } = await import("../../src/editor/codeFormatEngines.js");
  return {
    languages: Object.keys(codeBlockOptions.supportedLanguages),
    CODE_FORMAT_ENGINE_LOADERS,
    ...formatting,
  };
};

// A language added to the code block must be given a formatter or a reason it has none.
test("every code block language has Prettify or a recorded reason for none", async () => {
  const { languages, getCodeFormatter, CODE_LANGUAGES_WITHOUT_FORMATTER } = await load();
  assert.ok(languages.length > 0);
  for (const language of languages) {
    const reason = CODE_LANGUAGES_WITHOUT_FORMATTER[language];
    if (getCodeFormatter(language)) {
      assert.equal(reason, undefined, `${language} has a formatter and a reason for none`);
    } else {
      assert.equal(typeof reason, "string", `${language} has neither a formatter nor a reason`);
      assert.ok(reason.length > 0, `${language} has an empty reason`);
    }
  }
  for (const language of Object.keys(CODE_LANGUAGES_WITHOUT_FORMATTER)) {
    assert.ok(languages.includes(language), `${language} is not a code block language`);
  }
});

test("every formatter names a plugin or engine that has a loader", async () => {
  const { CODE_FORMATTERS, CODE_FORMAT_PLUGIN_LOADERS, CODE_FORMAT_ENGINE_LOADERS } = await load();
  for (const [language, formatter] of Object.entries(CODE_FORMATTERS)) {
    if (formatter.custom) {
      continue;
    }
    if (formatter.engine) {
      assert.equal(typeof CODE_FORMAT_ENGINE_LOADERS[formatter.engine], "function", language);
      continue;
    }
    assert.equal(typeof formatter.parser, "string", language);
    for (const plugin of formatter.plugins) {
      assert.equal(typeof CODE_FORMAT_PLUGIN_LOADERS[plugin], "function", `${language}: ${plugin}`);
    }
  }
});
