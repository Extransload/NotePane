import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const projectRoot = process.cwd();
const dryRun = process.env.NOTEPANE_RUN_DRY_RUN === "1";

if (isWsl() && process.env.NOTEPANE_RUN_TARGET !== "linux") {
  runWindowsUnpackedFromWsl();
} else {
  runLocalElectron();
}

function runWindowsUnpackedFromWsl() {
  assertCommand("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "$PSVersionTable.PSVersion.ToString()",
  ]);
  assertCommand("wslpath", ["-w", projectRoot]);

  console.log("[NotePane] WSL detected; launching the Windows app build.");
  // This is a packaged build run for development, so it must not install
  // published releases over itself.
  run(
    "npx",
    [
      "electron-builder",
      "--win",
      "dir",
      "--config",
      "electron-builder.config.cjs",
      "-c.win.signAndEditExecutable=false",
      "-c.win.signExecutable=false",
    ],
    { env: { ...process.env, NOTEPANE_DISABLE_UPDATES: "1" } },
  );

  const exePath = path.join(projectRoot, "release", "win-unpacked", "NotePane.exe");
  const sourceAppDir = convertToWindowsPath(path.dirname(exePath));
  const powershellCommand = [
    "$ErrorActionPreference = 'Stop'",
    "$targetRoot = Join-Path $env:LOCALAPPDATA 'NotePane\\wsl-run'",
    "$targetDir = Join-Path $targetRoot 'win-unpacked'",
    "New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null",
    `robocopy ${quotePowerShellString(sourceAppDir)} $targetDir /MIR /NFL /NDL /NJH /NJS /NP`,
    "if ($LASTEXITCODE -gt 7) { exit $LASTEXITCODE }",
    "$exePath = Join-Path $targetDir 'NotePane.exe'",
    "Start-Process -FilePath $exePath -WorkingDirectory $targetDir -ArgumentList '--disable-gpu' -Wait",
  ].join("; ");

  run(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      powershellCommand,
    ],
  );
}

function runLocalElectron() {
  const electronBinary = require("electron");
  const args = [];
  if (shouldDisableSandbox()) {
    args.push("--no-sandbox");
  }
  args.push(".");
  run(electronBinary, args);
}

function isWsl() {
  return (
    Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) ||
    /microsoft|wsl/i.test(os.release())
  );
}

function shouldDisableSandbox() {
  return (
    process.env.NOTEPANE_ELECTRON_NO_SANDBOX === "1" ||
    (typeof process.getuid === "function" && process.getuid() === 0)
  );
}

function convertToWindowsPath(sourcePath) {
  const result = spawnSync("wslpath", ["-w", sourcePath], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Failed to convert path for Windows: ${sourcePath}`);
  }
  return result.stdout.trim();
}

function assertCommand(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr?.trim() || "command failed";
    throw new Error(`${command} is required to run NotePane from WSL: ${detail}`);
  }
}

function quotePowerShellString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function run(command, args, options = {}) {
  const commandText = [command, ...args].join(" ");
  if (dryRun) {
    console.log(`[dry-run] ${commandText}`);
    return;
  }

  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: options.env ?? process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
