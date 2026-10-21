const fs = require("fs");
const path = require("path");
const { builtinModules } = require("module");
const test = require("node:test");
const assert = require("node:assert/strict");

const projectRoot = path.join(__dirname, "../..");
const packageInfo = require("../../package.json");

// electron-builder copies every `dependencies` entry into the app, while Vite
// already bundles the renderer's libraries into dist/. So `dependencies` must
// hold exactly what the main process loads at run time, and everything else
// belongs in `devDependencies`.
function readMainProcessPackages() {
  const electronDirectory = path.join(projectRoot, "electron");
  const packages = new Set();
  for (const name of fs.readdirSync(electronDirectory)) {
    if (!name.endsWith(".cjs")) {
      continue;
    }
    const source = fs.readFileSync(path.join(electronDirectory, name), "utf8");
    for (const [, specifier] of source.matchAll(/require\("([^"]+)"\)/g)) {
      if (specifier.startsWith(".") || specifier === "electron") {
        continue;
      }
      const bare = specifier.replace(/^node:/, "");
      if (builtinModules.includes(bare)) {
        continue;
      }
      const parts = specifier.split("/");
      packages.add(specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]);
    }
  }
  return packages;
}

test("ships only the packages the main process loads", () => {
  const required = [...readMainProcessPackages()].sort();
  assert.deepEqual(Object.keys(packageInfo.dependencies).sort(), required);
});

test("keeps the renderer libraries available to the build", () => {
  for (const name of ["react", "react-dom", "@blocknote/core", "@blocknote/react", "@mantine/core"]) {
    assert.ok(packageInfo.devDependencies[name], `${name} is missing from devDependencies`);
  }
});
