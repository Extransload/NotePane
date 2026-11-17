#!/usr/bin/env node
// The Homebrew cask, Casks/notepane.rb in the Extransload/homebrew-tap
// repository, written from a published release's Apple silicon disk image;
// NotePane has no Intel Mac build.
// .github/workflows/homebrew.yml pushes it to the tap when a stable release is
// published:
//
//   brew install --cask extransload/tap/notepane
//
//   node scripts/homebrew-cask.mjs <tag> <dir> [--base-url <url>]
//
// <dir> holds NotePane-<version>-arm64.dmg, the name electron-builder gives
// it. The cask downloads it from the release unless --base-url names another
// place (a local folder as file:///…, to try the cask out).

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_URL = "https://github.com/Extransload/NotePane";
// The disk image the cask installs.
const IMAGE = (version) => `NotePane-${version}-arm64.dmg`;

function fail(message) {
  console.error(`homebrew-cask: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const positional = [];
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    if (i + 1 >= args.length) fail(`${args[i]} needs a value`);
    options[args[i].slice(2)] = args[++i];
  } else {
    positional.push(args[i]);
  }
}
const [tag, dir] = positional;
if (!tag || !dir || positional.length > 2) {
  fail("usage: homebrew-cask.mjs <tag> <dir> [--base-url <url>]");
}
// Prereleases stay out of the tap: it follows the latest stable release.
if (!/^v\d+\.\d+\.\d+$/.test(tag)) fail(`not a stable release tag: ${tag}`);
for (const name of Object.keys(options)) {
  if (name !== "base-url") fail(`unknown option --${name}`);
}

const version = tag.slice(1);
const image = join(dir, IMAGE(version));
if (!existsSync(image)) fail(`${image} is missing`);
const sha256 = createHash("sha256").update(readFileSync(image)).digest("hex");
// The cask's own interpolation, so an edit of the version alone would still
// point at the right files.
const baseUrl = (options["base-url"] ?? `${REPO_URL}/releases/download/v#{version}`).replace(/\/+$/, "");

process.stdout.write(`# Written by scripts/homebrew-cask.mjs in ${REPO_URL} on each
# stable release; edits here are replaced by the next one.
cask "notepane" do
  version "${version}"
  sha256 "${sha256}"

  url "${baseUrl}/${IMAGE("#{version}")}"
  name "NotePane"
  desc "Local-first note pane with tabbed sessions and sticky windows"
  homepage "${REPO_URL}"

  livecheck do
    url :url
    strategy :github_latest
  end

  # The app downloads each release and swaps it in itself (electron/macSelfUpdate.cjs), so
  # \`brew upgrade\` leaves it alone unless asked with --greedy.
  auto_updates true
  depends_on arch: :arm64
  depends_on macos: :monterey

  app "NotePane.app"

  # The app carries an ad-hoc signature only, no Developer ID: without the
  # download quarantine Gatekeeper lets it open.
  postflight_steps do
    run "/usr/bin/xattr",
        args:         ["-dr", "com.apple.quarantine", "{{appdir}}/NotePane.app"],
        must_succeed: false
  end

  uninstall quit: "com.gyu.notepane"

  # ~/Library/Application Support/NotePane stays: it holds the notes.
  zap trash: [
    "~/Library/Preferences/com.gyu.notepane.plist",
    "~/Library/Saved Application State/com.gyu.notepane.savedState",
  ]
end
`);
