import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const distIndexPath = path.join(projectRoot, "dist", "index.html");
const packagePath = path.join(projectRoot, "package.json");
const rendererRoot = path.join(projectRoot, "src");
const rendererPath = path.join(rendererRoot, "main.jsx");
const mainPath = path.join(projectRoot, "electron", "main.cjs");

assertFile(distIndexPath);
assertFile(packagePath);
assertFile(rendererPath);
assertFile(mainPath);

const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const requiredDependencies = [
  "@blocknote/react",
  "@blocknote/core",
  "@blocknote/mantine",
  "@blocknote/code-block",
  "electron",
];

for (const dependency of requiredDependencies) {
  if (
    !packageJson.dependencies?.[dependency] &&
    !packageJson.devDependencies?.[dependency]
  ) {
    fail(`Missing dependency: ${dependency}`);
  }
}

// Renderer features are spread across src/ by ownership, so check the whole
// tree rather than one file. See the code map in docs/architecture.md.
const renderer = readRendererSources(rendererRoot);
const requiredRendererSnippets = [
  "BlockNoteView",
  "portalElements={{ default: document.body }}",
  "data-testid=\"sticky-header\"",
  "data-testid=\"sticky-editor-surface\"",
  "splitCells: true",
  "cellBackgroundColor: true",
  "cellTextColor: true",
  "headers: true",
  "createCodeBlockSpec(codeBlockOptions)",
  "type: \"toggleListItem\"",
  "props: { isToggleable: true }",
  "aria-label=\"Session name\"",
  "aria-label=\"Preferences window\"",
  "aria-label=\"Close preferences\"",
  "aria-label=\"Theme mode\"",
  "role=\"switch\"",
  "HeaderModeSwitch",
  "LayoutModeSwitch",
  "PreferencesWindow",
  "KeyboardShortcutsSection",
  "TrashPreferencesSection",
  "ColorPanel",
  "StickySettingsWindow",
  "SessionTabContextMenu",
  "ExportPdfButton",
  "TrashButton",
  "AdaptiveTooltipPortal",
  "aria-label=\"Preferences pages\"",
  "aria-label=\"Delete permanently confirmation\"",
  "mergeTrashedNotes",
  "normalizeAppTheme",
  "normalizeLayoutMode",
  "handlePreferencesShortcut",
  "ariaLabel={isStickyVariant ? \"Sticky color\" : \"Session tab color\"}",
  "valueAriaTarget",
  "const valueAriaTarget = isStickyVariant ? \"sticky color\" : \"session tab color\";",
  "aria-label=\"Color brightness\"",
  "aria-label=\"Color opacity\"",
  "aria-label=\"Pastel colors\"",
  "aria-label={isStickyVariant ? \"Sticky color panel\" : \"Session color panel\"}",
  "STICKY_PASTEL_PALETTE",
  "aria-label=\"Eyedropper\"",
  "formatColorValues",
  "parseColorValue",
  "Copy ${entry.label}",
  "aria-label=\"Export\"",
  "aria-label=\"Trash\"",
  "notepane-icon-trash",
  "ExportFormatMenu",
  "editor-font-size-toast",
  "adaptive-tooltip",
  "SidebarToggleIcon",
  "getSessionShortcutLabel",
  "handleSessionShortcut",
  "session-add-button",
  "className=\"session-shortcut\"",
  "aria-label={`Delete session",
  "role=\"tablist\"",
  "data-layout-mode={effectiveLayoutMode}",
  "onDetachNote",
  "onAttachNote",
  "CropDialog",
  "onDownloadImage",
  "useBlockNoteFloatingMenuGuard",
  "BLOCKNOTE_FLOATING_MENU_SELECTOR",
];

for (const snippet of requiredRendererSnippets) {
  if (!renderer.includes(snippet)) {
    fail(`Renderer is missing expected BlockNote demo feature: ${snippet}`);
  }
}

const main = fs.readFileSync(mainPath, "utf8");
const requiredMainSnippets = [
  "alwaysOnTop",
  "transparent: true",
  "New Note",
  "Preferences",
  "Close Window",
  "getMenuAccelerator(\"preferences\")",
  "preferences:open",
  "app-theme:get",
  "app-theme:update",
  "app-theme:changed",
  "layout-mode:get",
  "layout-mode:update",
  "layout-mode:changed",
  "notes:detach",
  "notes:attach",
  "Toggle Always On Top",
  "notes:list",
  "notes:create",
  "notes:delete",
  "trash:list",
  "trash:restore",
  "trash:purge",
  "notes:activate",
  "notes:save-content",
  "notes:update-appearance",
  "printToPDF",
  "assets:save-url",
];

for (const snippet of requiredMainSnippets) {
  if (!main.includes(snippet)) {
    fail(`Electron main is missing expected sticky feature: ${snippet}`);
  }
}

console.log("NotePane verification passed");

function readRendererSources(directory) {
  const parts = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      parts.push(readRendererSources(full));
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      parts.push(fs.readFileSync(full, "utf8"));
    }
  }
  return parts.join("\n");
}

function assertFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing file: ${path.relative(projectRoot, filePath)}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
