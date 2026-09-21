import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  createBlankSession,
  expectBlockNoteFloatingMenuInsideViewport,
  expectEditorFocused,
  getInlineStyledTextBackground,
  getInlineStyledTextColor,
  loadTemplatePreview,
  modifierShortcut,
  pasteClipboardText,
  pastePlainText,
} from "../support/renderer-helpers.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

test("prettifies supported code blocks and copies code from upper-right actions", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, [
    "```javascript",
    "const answer={value:42,items:[1,2]}",
    "```",
  ].join("\n"));

  const codeBlock = page
    .locator("[data-content-type='codeBlock']")
    .filter({ hasText: "const answer" });
  const code = codeBlock.locator("code");
  const toolbar = page.getByRole("toolbar", {
    name: "JavaScript code block actions",
  });
  await expect(toolbar).toBeVisible();
  const prettifyButton = toolbar.getByRole("button", {
    name: "Prettify JavaScript code",
  });
  await expect(prettifyButton).toBeEnabled();
  await expect(prettifyButton).toHaveText("Prettify");
  await expect(toolbar.getByRole("button", { name: "Copy JavaScript code" }))
    .toBeEnabled();

  const geometry = await page.evaluate(() => {
    const block = [...document.querySelectorAll("[data-content-type='codeBlock']")]
      .find((element) => element.textContent.includes("const answer"));
    const toolbar = document.querySelector(
      ".code-block-tools[aria-label='JavaScript code block actions']",
    );
    const code = block.querySelector("code");
    const blockRect = block.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const codeRect = code.getBoundingClientRect();
    return {
      rightGap: blockRect.right - toolbarRect.right,
      topGap: toolbarRect.top - blockRect.top,
      codeClearance: codeRect.top - toolbarRect.bottom,
    };
  });
  expect(geometry.rightGap).toBeGreaterThanOrEqual(6);
  expect(geometry.rightGap).toBeLessThanOrEqual(12);
  expect(geometry.topGap).toBeGreaterThanOrEqual(6);
  expect(geometry.topGap).toBeLessThanOrEqual(11);
  expect(geometry.codeClearance).toBeGreaterThanOrEqual(3);

  await prettifyButton.click();
  const formattedCode = "const answer = { value: 42, items: [1, 2] };";
  await expect(code).toHaveText(formattedCode);
  const formattedButton = toolbar.getByRole("button", {
    name: "JavaScript code prettified",
  });
  await expect(formattedButton).toHaveText("Formatted");

  await expect(toolbar.getByRole("button", { name: "Prettify JavaScript code" }))
    .toHaveText("Prettify", { timeout: 2500 });
  await toolbar.getByRole("button", { name: "Prettify JavaScript code" }).click();
  await expect(toolbar.getByRole("button", {
    name: "JavaScript code is already formatted",
  })).toHaveText("Already formatted");

  await toolbar.getByRole("button", { name: "Copy JavaScript code" }).click();
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(formattedCode);
  await expect(toolbar.getByRole("button", { name: "JavaScript code copied" }))
    .toBeVisible();
});

test("keeps copy available when a code language has no browser formatter", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, [
    "```python",
    "result={'value':42}",
    "```",
  ].join("\n"));
  const pythonToolbar = page.getByRole("toolbar", {
    name: "Python code block actions",
  });
  await expect(pythonToolbar).toBeVisible();
  await expect(
    pythonToolbar.getByRole("button", { name: "Prettify unavailable for Python" }),
  ).toBeDisabled();
  await expect(
    pythonToolbar.getByRole("button", { name: "Prettify unavailable for Python" }),
  ).toHaveText("Prettify");
  await expect(pythonToolbar.getByRole("button", { name: "Copy Python code" }))
    .toBeEnabled();
});

test("selects only the current code block with Command+A", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, [
    "Before code block",
    "",
    "```javascript",
    "const first = 1;",
    "const second = 2;",
    "```",
    "",
    "After code block",
  ].join("\n"));

  const code = page.locator("[data-content-type='codeBlock'] code").first();
  await code.click();
  await page.keyboard.press(modifierShortcut("A"));

  const selectedText = await page.evaluate(
    () => window.getSelection()?.toString() ?? "",
  );
  expect(selectedText).toBe("const first = 1;\nconst second = 2;");
  expect(selectedText).not.toContain("Before code block");
  expect(selectedText).not.toContain("After code block");

  await page.keyboard.press(modifierShortcut("C"));
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("const first = 1;\nconst second = 2;");
  const editorSurface = page.getByTestId("sticky-editor-surface");
  await expect(editorSurface.getByText("Before code block", { exact: true }))
    .toBeVisible();
  await expect(editorSurface.getByText("After code block", { exact: true }))
    .toBeVisible();
});

test("keeps Enter and Shift+Enter behavior in the editor", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("first line");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("second line");
  await page.keyboard.press("Enter");
  await page.keyboard.type("next block");

  const editorSurface = page.getByTestId("sticky-editor-surface");
  await expect(editorSurface.getByText("first line")).toBeVisible();
  await expect(editorSurface.getByText("second line")).toBeVisible();
  await expect(editorSurface.getByText("next block")).toBeVisible();

  const blockCount = await page
    .locator(".bn-block-outer")
    .filter({ hasText: "next block" })
    .count();
  expect(blockCount).toBeGreaterThan(0);
});

test("copies Shift+Enter line breaks without markdown escape characters", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("first copied line");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("second copied line");
  await page.keyboard.press(modifierShortcut("A"));

  const copiedPlainText = await page.evaluate(() => {
    const editor = document.querySelector(".bn-editor");
    const clipboardData = new DataTransfer();
    editor.dispatchEvent(
      new ClipboardEvent("copy", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
    return clipboardData.getData("text/plain");
  });

  expect(copiedPlainText).toBe("first copied line\nsecond copied line");
  expect(copiedPlainText).not.toContain("first copied line\\\nsecond copied line");
});

test("copies editor blocks without a structural trailing newline", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("first copied block");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second copied block");
  await page.keyboard.press(modifierShortcut("A"));

  const copiedPlainText = await page.evaluate(() => {
    const editor = document.querySelector(".bn-editor");
    const clipboardData = new DataTransfer();
    editor.dispatchEvent(
      new ClipboardEvent("copy", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
    return clipboardData.getData("text/plain");
  });

  expect(copiedPlainText).toBe("first copied block\n\nsecond copied block");
});

test("pastes markdown headings from a rich clipboard as native headings", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await pasteClipboardText(page, {
    plainText:
      "# Heading one\n## Heading two\n### Heading three\n\n[Explicit link](https://example.com/explicit)",
    html:
      "<p># Heading one</p><p>## Heading two</p><p>### Heading three</p><p>[Explicit link](https://example.com/explicit)</p>",
  });

  await expect(page.getByRole("heading", { name: "Heading one", level: 1 }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "Heading two", level: 2 }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "Heading three", level: 3 }))
    .toBeVisible();
  await expect(page.getByText("# Heading one", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Explicit link" }))
    .toHaveAttribute("href", "https://example.com/explicit");
});

test("replaces selected text when pasting a URL instead of turning it into link text", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("replace this selected text");
  await page.keyboard.press(modifierShortcut("A"));
  await pastePlainText(page, "https://example.com/replacement");

  const editorSurface = page.getByTestId("sticky-editor-surface");
  await expect(editorSurface.getByText("https://example.com/replacement"))
    .toBeVisible();
  await expect(editorSurface.getByText("replace this selected text"))
    .toHaveCount(0);
});

test("pastes wrapped markdown tables without breaking table cells into paragraphs", async ({ page }) => {
  const wrappedMarkdown = `ZDR을 적용할 수 있고 입력과 출력을 모델 학습에 사용하지 않는 provider를 정리했다.

## 직접 호출 가능한 Provider

| Provider | ZDR | Data Collection | 결과 |
| --- | --- | --- | --- |
| Amazon Bedrock | 가능: data_retention_mode=none | Prompt·response를 durable storage에 기록하지 않음
Model provider에 전달하지 않음
Usage metadata 수집 여부는 현재 링크에서 확인되지 않음 | **Training 근거 필요** |
| Together AI | 가능: 입력·출력 기본 미저장 | Input·output 기본 미저장
Training opt-in을 켜지 않음 | **사용 가능** |`;

  await clickLastEmptyParagraph(page);
  await pastePlainText(page, wrappedMarkdown);

  await expect(page.getByRole("heading", { name: "직접 호출 가능한 Provider" }))
    .toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    return [...document.querySelectorAll(".bn-editor table")]
      .some((table) => table.textContent.includes("Amazon Bedrock"));
  })).toBe(true);

  const pastedTable = await page.evaluate(() => {
    const tables = [...document.querySelectorAll(".bn-editor table")];
    const table = tables.find((candidate) =>
      candidate.textContent.includes("Amazon Bedrock"),
    );
    const tableRows = [...table.querySelectorAll("tr")];
    const headers = [...tableRows[0].cells].map((cell) => cell.textContent.trim());
    const rows = tableRows.slice(1).map((row) =>
      [...row.cells].map((cell) => cell.textContent.trim()),
    );

    return {
      headers,
      rows,
      text: table.textContent,
      tableCount: tables.length,
    };
  });

  expect(pastedTable.tableCount).toBeGreaterThanOrEqual(1);
  expect(pastedTable.headers).toEqual([
    "Provider",
    "ZDR",
    "Data Collection",
    "결과",
  ]);
  expect(pastedTable.rows).toHaveLength(2);
  expect(pastedTable.rows[0]).toHaveLength(4);
  expect(pastedTable.rows[1]).toHaveLength(4);
  expect(pastedTable.text).toContain("Amazon Bedrock");
  expect(pastedTable.text).toContain("Model provider에 전달하지 않음");
  expect(pastedTable.text).toContain("Usage metadata 수집 여부는 현재 링크에서 확인되지 않음");
  expect(pastedTable.text).toContain("Training opt-in을 켜지 않음");
});

test("shows floating formatting toolbar after text selection", async ({ page }) => {
  await loadTemplatePreview(page);
  const styledText = page.getByText("Styled Text");
  await styledText.scrollIntoViewIfNeeded();
  await styledText.dblclick();

  const formattingToolbar = page.locator(".bn-formatting-toolbar");
  await expect(formattingToolbar).toBeVisible();
  await expect(formattingToolbar).toHaveClass(/notepane-formatting-toolbar/);

  const blockTypeButton = formattingToolbar
    .locator(".notepane-formatting-type-row")
    .getByRole("button");
  await expect(blockTypeButton).toHaveText(/paragraph/i);

  const textFormatting = formattingToolbar.getByRole("group", {
    name: "Text formatting",
  });
  for (const buttonName of [
    "Colors",
    "Bold",
    "Italic",
    "Underline",
    "Strike",
    "Create link",
    "Code",
    "Align text left",
    "Align text center",
    "Align text right",
  ]) {
    await expect(textFormatting.getByRole("button", { name: buttonName }))
      .toBeVisible();
  }

  const geometry = await formattingToolbar.evaluate((toolbar) => {
    const toolbarRect = toolbar.getBoundingClientRect();
    const blockTypeRect = toolbar
      .querySelector(".notepane-formatting-type-row button")
      .getBoundingClientRect();
    const actionButtons = [...toolbar.querySelectorAll(
      ".notepane-formatting-actions button",
    )];
    const rowTops = [...new Set(actionButtons.map((button) =>
      Math.round(button.getBoundingClientRect().top),
    ))];

    return {
      toolbarWidth: toolbarRect.width,
      blockTypeWidth: blockTypeRect.width,
      actionButtonCount: actionButtons.length,
      actionRowCount: rowTops.length,
    };
  });
  expect(geometry.toolbarWidth).toBeGreaterThanOrEqual(180);
  expect(geometry.toolbarWidth).toBeLessThanOrEqual(200);
  expect(geometry.blockTypeWidth).toBeGreaterThanOrEqual(160);
  expect(geometry.actionButtonCount).toBe(10);
  expect(geometry.actionRowCount).toBe(2);

  await textFormatting.getByRole("button", { name: "Bold" }).hover();
  const tooltip = page.locator(".mantine-Tooltip-tooltip:visible .bn-tooltip");
  await expect(tooltip).toBeVisible();
  const tooltipStyle = await tooltip.evaluate((element) => ({
    backgroundColor: getComputedStyle(element).backgroundColor,
    fontSize: getComputedStyle(element.querySelector(".mantine-Text-root")).fontSize,
  }));
  expect(tooltipStyle.backgroundColor).toBe("rgb(47, 52, 55)");
  expect(Number.parseFloat(tooltipStyle.fontSize)).toBeLessThanOrEqual(10);

  await page.mouse.move(20, 20);
  await blockTypeButton.click();
  const blockTypeMenu = page.locator(".bn-select:visible");
  await expect(blockTypeMenu).toBeVisible();
  const headingTwo = blockTypeMenu.getByRole("menuitem", {
    name: "Heading 2",
    exact: true,
  });
  const iconLabelGap = await headingTwo.evaluate((item) => {
    const icon = item.querySelector(".mantine-Menu-itemSection[data-position='left']");
    const label = item.querySelector(".mantine-Menu-itemLabel");
    return label.getBoundingClientRect().left - icon.getBoundingClientRect().right;
  });
  expect(iconLabelGap).toBeGreaterThanOrEqual(8);

  await expect(blockTypeMenu.getByRole("menuitem", {
    name: "Heading 5",
    exact: true,
  })).toHaveCount(0);
  await blockTypeMenu.getByRole("menuitem", {
    name: "Heading 4",
    exact: true,
  }).click();
  await expect(blockTypeButton).toHaveText(/Heading 4/);
  const selectedTypeGap = await blockTypeButton.evaluate((button) => {
    const icon = button.querySelector(
      ".mantine-Button-section[data-position='left']",
    );
    const label = button.querySelector(".mantine-Button-label");
    return label.getBoundingClientRect().left - icon.getBoundingClientRect().right;
  });
  expect(selectedTypeGap).toBeGreaterThanOrEqual(8);
});

test("returns focus to the editor after Escape closes the text selection toolbar", async ({ page }) => {
  await loadTemplatePreview(page);
  const styledText = page.getByText("Styled Text");
  await styledText.scrollIntoViewIfNeeded();
  await styledText.dblclick();

  const formattingToolbar = page.locator(".bn-formatting-toolbar");
  await expect(formattingToolbar).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(formattingToolbar).toBeHidden();
  await expectEditorFocused(page);
});

test("shows an opaque compact link form and creates the selected-text link", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("Link target");
  await page.keyboard.press(modifierShortcut("A"));

  const formattingToolbar = page.locator(".bn-formatting-toolbar");
  await formattingToolbar.getByRole("button", { name: "Create link" }).click();

  const linkForm = page.locator(".bn-form-popover:visible");
  const urlInput = linkForm.getByPlaceholder("Edit URL");
  await expect(urlInput).toBeVisible();
  const formStyle = await linkForm.evaluate((element) => ({
    backgroundColor: getComputedStyle(element).backgroundColor,
    borderStyle: getComputedStyle(element).borderStyle,
    boxShadow: getComputedStyle(element).boxShadow,
    inputFontSize: getComputedStyle(element.querySelector("input")).fontSize,
    inputPaddingLeft: getComputedStyle(element.querySelector("input")).paddingLeft,
  }));
  expect(formStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(formStyle.borderStyle).toBe("solid");
  expect(formStyle.boxShadow).not.toBe("none");
  expect(Number.parseFloat(formStyle.inputFontSize)).toBeLessThanOrEqual(11);
  expect(Number.parseFloat(formStyle.inputPaddingLeft)).toBeGreaterThanOrEqual(28);

  await urlInput.fill("example.com");
  await urlInput.press("Enter");
  await expect(page.getByRole("link", { name: "Link target" }))
    .toHaveAttribute("href", "https://example.com");
});

test("renders Command+E inline code with Notion-like styling and composable colors", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("InlineCode");
  await page.keyboard.press(modifierShortcut("A"));
  await page.keyboard.press(modifierShortcut("E"));

  const inlineCode = page.locator(".bn-inline-content code", { hasText: "InlineCode" });
  await expect(inlineCode).toBeVisible();

  const lightStyle = await inlineCode.evaluate((element) => {
    const style = getComputedStyle(element);
    const parentStyle = getComputedStyle(element.parentElement);
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: Number.parseFloat(style.borderRadius),
      color: style.color,
      fontScale: Number.parseFloat(style.fontSize) / Number.parseFloat(parentStyle.fontSize),
      fontWeight: style.fontWeight,
      paddingLeft: Number.parseFloat(style.paddingLeft),
    };
  });
  expect(lightStyle.backgroundColor).toBe("rgba(135, 131, 120, 0.16)");
  expect(lightStyle.borderRadius).toBe(3);
  expect(lightStyle.color).toBe("rgb(189, 63, 63)");
  expect(lightStyle.fontScale).toBeCloseTo(0.85, 2);
  expect(lightStyle.fontWeight).toBe("500");
  expect(lightStyle.paddingLeft).toBeGreaterThanOrEqual(3);

  await inlineCode.dblclick();
  const formattingToolbar = page.locator(".bn-formatting-toolbar");
  await expect(formattingToolbar).toBeVisible();
  await formattingToolbar.getByRole("button", { name: "Colors" }).click();
  await page.locator(".bn-color-picker-dropdown:visible [data-test='text-color-blue']")
    .click();
  await expect.poll(async () =>
    getInlineStyledTextColor(page, "InlineCode", "textColor", "blue"),
  ).toBe("rgb(11, 110, 153)");
  await expect(inlineCode).toBeVisible();

  await page.keyboard.press("Escape");
  await inlineCode.dblclick();
  await expect(formattingToolbar).toBeVisible();
  await formattingToolbar.getByRole("button", { name: "Colors" }).click();
  await page.locator(".bn-color-picker-dropdown:visible [data-test='background-color-yellow']")
    .click();
  await expect.poll(async () =>
    getInlineStyledTextBackground(page, "InlineCode", "backgroundColor", "yellow"),
  ).toBe("rgb(251, 243, 219)");
  await expect(inlineCode).toBeVisible();

  await page.keyboard.press(modifierShortcut("Shift+L"));
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute("data-theme-mode", "dark");
  await expect.poll(async () => await inlineCode.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
    };
  })).toEqual({
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    color: "rgb(255, 138, 128)",
  });

  const exportStyle = await inlineCode.evaluate((element) => {
    document.body.classList.add("is-exporting");
    const style = getComputedStyle(element);
    const values = {
      backgroundColor: style.backgroundColor,
      color: style.color,
    };
    document.body.classList.remove("is-exporting");
    return values;
  });
  expect(exportStyle).toEqual({
    backgroundColor: "rgba(135, 131, 120, 0.16)",
    color: "rgb(189, 63, 63)",
  });
});

test("shows recent colors and reapplies the latest color with Command+Shift+H", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("First");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second");

  const editor = page.locator(".bn-editor");
  const first = editor.getByText("First", { exact: true });
  const second = editor.getByText("Second", { exact: true });
  const formattingToolbar = page.locator(".bn-formatting-toolbar");

  await first.dblclick();
  await expect(formattingToolbar).toBeVisible();
  await formattingToolbar.getByRole("button", { name: "Colors" }).click();
  const colorMenu = page.locator(".notion-color-picker-dropdown:visible");
  await expect(colorMenu.getByText("Text color", { exact: true })).toBeVisible();
  await expect(colorMenu.getByText("Background color", { exact: true })).toBeVisible();
  await expect(colorMenu.locator("[data-test^='text-color-']")).toHaveCount(10);
  await expect(colorMenu.locator("[data-test^='background-color-']")).toHaveCount(10);
  const paletteColors = await colorMenu.evaluate((element) => {
    const textColors = [...element.querySelectorAll(
      ".notion-color-swatch[data-color-kind='text'] .notepane-editor-color-icon",
    )].map((icon) => getComputedStyle(icon).color);
    const backgroundColors = [...element.querySelectorAll(
      ".notion-color-swatch[data-color-kind='background'] .notepane-editor-color-icon",
    )].map((icon) => getComputedStyle(icon).backgroundColor);
    const yellowBackground = getComputedStyle(element.querySelector(
      ".notion-color-swatch[data-color-kind='background'][data-color-value='yellow'] .notepane-editor-color-icon",
    )).backgroundColor;
    return {
      distinctBackgroundColors: new Set(backgroundColors).size,
      distinctTextColors: new Set(textColors).size,
      yellowBackground,
    };
  });
  expect(paletteColors.distinctTextColors).toBeGreaterThanOrEqual(9);
  expect(paletteColors.distinctBackgroundColors).toBeGreaterThanOrEqual(9);
  expect(paletteColors.yellowBackground).toBe("rgb(251, 243, 219)");
  await colorMenu.locator("[data-test='background-color-yellow']").click();

  await expect.poll(async () =>
    getInlineStyledTextBackground(page, "First", "backgroundColor", "yellow"),
  ).toBe("rgb(251, 243, 219)");

  await second.dblclick();
  await page.keyboard.press(modifierShortcut("Shift+H"));
  await expect.poll(async () =>
    getInlineStyledTextBackground(page, "Second", "backgroundColor", "yellow"),
  ).toBe("rgb(251, 243, 219)");

  await second.dblclick();
  await expect(formattingToolbar).toBeVisible();
  await formattingToolbar.getByRole("button", { name: "Colors" }).click();
  await expect(colorMenu.getByText("Recently used", { exact: true })).toBeVisible();
  await expect(colorMenu.getByTestId("recent-editor-color-0"))
    .toHaveAttribute("aria-label", "Recent: Yellow background color");
  await colorMenu.locator("[data-test='text-color-blue']").click();

  await expect.poll(async () =>
    getInlineStyledTextColor(page, "Second", "textColor", "blue"),
  ).toBe("rgb(11, 110, 153)");

  await createBlankSession(page);
  await page.keyboard.type("Third");
  const third = page.locator(".bn-editor").getByText("Third", { exact: true });
  await third.dblclick();
  await expect(formattingToolbar).toBeVisible();
  await formattingToolbar.getByRole("button", { name: "Colors" }).click();
  await expect(colorMenu).toBeVisible();
  await expect(colorMenu.getByTestId("recent-editor-color-0"))
    .toHaveAttribute("aria-label", "Recent: Blue text color");
  await expect(colorMenu.getByTestId("recent-editor-color-1"))
    .toHaveAttribute("aria-label", "Recent: Yellow background color");

  await page.keyboard.press("Escape");
  await third.dblclick();
  await page.keyboard.press(modifierShortcut("Shift+H"));
  await expect.poll(async () =>
    getInlineStyledTextColor(page, "Third", "textColor", "blue"),
  ).toBe("rgb(11, 110, 153)");
});

test("keeps BlockNote color and delete menus usable inside the app window", async ({ page }) => {
  await loadTemplatePreview(page);
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("FormatTarget");
  const formattingTarget = page.getByText("FormatTarget");
  await formattingTarget.dblclick();
  const formattingToolbar = page.locator(".bn-formatting-toolbar");
  await expect(formattingToolbar).toBeVisible();
  const colorsButton = formattingToolbar.getByRole("button", { name: "Colors" });
  await colorsButton.click();
  await expect(colorsButton).toHaveAttribute("aria-expanded", "true");

  const colorMenu = page.locator(".bn-color-picker-dropdown:visible");
  await expect(colorMenu).toBeVisible();
  await expectBlockNoteFloatingMenuInsideViewport(
    page,
    ".bn-color-picker-dropdown",
    140,
  );
  await page.locator(".bn-color-picker-dropdown:visible [data-test='text-color-red']").click();

  await expect.poll(async () =>
    getInlineStyledTextColor(page, "FormatTarget", "textColor", "red"),
  ).toBe("rgb(224, 62, 62)");
  await page.keyboard.press("Escape");
  await formattingTarget.dblclick();
  await expect(formattingToolbar).toBeVisible();
  await formattingToolbar.getByRole("button", { name: "Colors" }).click();
  await expect(page.locator(".bn-color-picker-dropdown:visible")).toBeVisible();
  await page.locator(".bn-color-picker-dropdown:visible [data-test='background-color-blue']")
    .click();

  await expect.poll(async () =>
    getInlineStyledTextBackground(page, "FormatTarget", "backgroundColor", "blue"),
  ).toBe("rgb(221, 235, 241)");

  const paragraph = page.locator(".bn-editor").getByText("Objective:", { exact: true });
  await page.keyboard.press("Escape");
  await paragraph.scrollIntoViewIfNeeded();
  await paragraph.click();
  const paragraphBox = await paragraph.boundingBox();
  await page.mouse.move(paragraphBox.x - 24, paragraphBox.y + paragraphBox.height / 2);
  const openBlockMenuButton = page.getByRole("button", { name: "Open block menu" });
  await expect(openBlockMenuButton).toBeVisible();
  await openBlockMenuButton.click();

  const blockMenu = page.locator(".bn-drag-handle-menu:visible");
  await expect(blockMenu).toBeVisible();
  await expect(blockMenu.getByRole("menuitem")).toHaveCount(3);
  await expect(blockMenu.locator(".notepane-block-menu-item-content svg"))
    .toHaveCount(3);
  await expect(blockMenu.getByRole("menuitem").last()).toHaveAccessibleName("Delete");
  await expect.poll(() => blockMenu.locator(".notepane-block-menu-icon").evaluateAll((icons) =>
    icons.map((icon) => getComputedStyle(icon).color),
  )).toEqual(["rgb(77, 121, 184)", "rgb(164, 91, 185)", "rgb(193, 74, 74)"]);
  await expectBlockNoteFloatingMenuInsideViewport(page, ".bn-drag-handle-menu", 60);
  await page.getByRole("menuitem", { name: "Turn into" }).click();
  const blockTypeMenu = page.locator(
    ".notepane-block-menu-subpanel[data-panel='turn-into']:visible",
  );
  await expect(blockTypeMenu).toBeVisible();
  await expectBlockNoteFloatingMenuInsideViewport(
    page,
    ".notepane-block-menu-subpanel[data-panel='turn-into']",
    220,
    "absolute",
  );
  await expect.poll(async () => {
    const [parentZIndex, submenuZIndex] = await Promise.all([
      blockMenu.evaluate((element) => Number(getComputedStyle(element).zIndex)),
      blockTypeMenu.evaluate((element) => Number(getComputedStyle(element).zIndex)),
    ]);
    return submenuZIndex > parentZIndex;
  }).toBe(true);
  await blockTypeMenu.getByRole("menuitem", { name: "Heading 2", exact: true }).click();
  await expect(paragraph.locator("xpath=ancestor::h2")).toHaveCount(1);
  await expect(blockMenu).toHaveCount(0);
  await paragraph.click();
  const convertedParagraphBox = await paragraph.boundingBox();
  await page.mouse.move(
    convertedParagraphBox.x - 24,
    convertedParagraphBox.y + convertedParagraphBox.height / 2,
  );
  await openBlockMenuButton.click();
  await expect(blockMenu).toBeVisible();
  const blockMenuTopBeforeColors = await blockMenu.evaluate((element) =>
    Math.round(element.getBoundingClientRect().top),
  );
  await page.getByRole("menuitem", { name: "Colors" }).first().click();
  await expect(page.locator(".notepane-block-menu-subpanel[data-panel='colors']:visible"))
    .toBeVisible();
  await expect.poll(async () => {
    const [parentZIndex, submenuZIndex] = await Promise.all([
      blockMenu.evaluate((element) => Number(getComputedStyle(element).zIndex)),
      page.locator(".notepane-block-menu-subpanel[data-panel='colors']:visible")
        .evaluate((element) => Number(getComputedStyle(element).zIndex)),
    ]);
    return submenuZIndex > parentZIndex;
  }).toBe(true);
  await expectBlockNoteFloatingMenuInsideViewport(
    page,
    ".notepane-block-menu-subpanel[data-panel='colors']",
    140,
    "absolute",
  );
  await expect.poll(async () =>
    await blockMenu.evaluate((element) =>
      Math.round(element.getBoundingClientRect().top),
    ),
  ).toBe(blockMenuTopBeforeColors);
  await expect.poll(async () =>
    await blockMenu.evaluate((element) => getComputedStyle(element).overflow),
  ).toBe("visible");
  await page.locator(".notepane-block-menu-subpanel[data-panel='colors']:visible [data-test='text-color-red']")
    .first()
    .click();

  await expect.poll(async () =>
    paragraph.evaluate((element) => getComputedStyle(element).color),
  ).toBe("rgb(224, 62, 62)");

  await paragraph.click();
  const coloredParagraphBox = await paragraph.boundingBox();
  await page.mouse.move(
    coloredParagraphBox.x - 24,
    coloredParagraphBox.y + coloredParagraphBox.height / 2,
  );
  await openBlockMenuButton.click();
  await page.getByRole("menuitem", { name: "Colors" }).first().click();
  await expect(page.locator(".notepane-block-menu-subpanel[data-panel='colors']:visible"))
    .toBeVisible();
  await page.locator(".notepane-block-menu-subpanel[data-panel='colors']:visible [data-test='background-color-blue']")
    .first()
    .click();

  await expect.poll(async () =>
    paragraph.evaluate((element) =>
      getComputedStyle(element.closest(".bn-block-content")).backgroundColor,
    ),
  ).toBe("rgb(221, 235, 241)");

  await paragraph.click();
  const recoloredParagraphBox = await paragraph.boundingBox();
  await page.mouse.move(
    recoloredParagraphBox.x - 24,
    recoloredParagraphBox.y + recoloredParagraphBox.height / 2,
  );
  await openBlockMenuButton.click();
  await page.getByRole("menuitem", { name: "Colors" }).first().click();
  const openColorMenu = page.locator(
    ".notepane-block-menu-subpanel[data-panel='colors']:visible",
  );
  await expect(openColorMenu).toBeVisible();
  await page.getByRole("menuitem", { name: "Turn into" }).hover();
  await expect(blockTypeMenu).toBeVisible();
  await expect(openColorMenu).toHaveCount(0);
  await expect(page.locator(".notepane-block-menu-subpanel")).toHaveCount(1);

  await paragraph.click();
  const finalParagraphBox = await paragraph.boundingBox();
  await page.mouse.move(
    finalParagraphBox.x - 24,
    finalParagraphBox.y + finalParagraphBox.height / 2,
  );
  await openBlockMenuButton.click();
  await page.keyboard.press("Delete");

  await expect(page.locator(".bn-editor").getByText("Objective:", { exact: true }))
    .toHaveCount(0);

  const table = page.getByRole("table");
  const tableBox = await table.boundingBox();
  await page.mouse.move(tableBox.x + 20, tableBox.y + 20);
  await expect(openBlockMenuButton).toBeVisible();
  await openBlockMenuButton.click();
  await expect(page.locator(".bn-drag-handle-menu:visible").getByRole("menuitem"))
    .toHaveCount(3);
  await expect(page.getByRole("menuitem", { name: /header/i })).toHaveCount(0);
});

test("highlights the active block while its six-dot menu is open", async ({ page }) => {
  await loadTemplatePreview(page);
  const paragraph = page.locator(".bn-editor").getByText("Objective:", {
    exact: true,
  });
  const blockId = await paragraph.evaluate((element) =>
    element.closest(".bn-block-outer").dataset.id,
  );
  const block = page.locator(
    `.bn-block-outer[data-id="${blockId}"] > .bn-block`,
  );

  const openBlockMenu = async () => {
    await paragraph.scrollIntoViewIfNeeded();
    await paragraph.click();
    const paragraphBox = await paragraph.boundingBox();
    await page.mouse.move(
      paragraphBox.x - 24,
      paragraphBox.y + paragraphBox.height / 2,
    );
    await page.getByRole("button", { name: "Open block menu" }).click();
    await expect(page.locator(".bn-drag-handle-menu:visible")).toBeVisible();
    await expect(page.locator("style[data-block-menu-highlight]"))
      .toHaveAttribute("data-block-menu-highlight", blockId);
    return await block.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationName: style.animationName,
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
      };
    });
  };

  const lightHighlight = await openBlockMenu();
  expect(lightHighlight.animationName).toBe("blockMenuSelectionIn");
  expect(lightHighlight.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(lightHighlight.boxShadow).not.toBe("none");

  await paragraph.click();
  await expect(page.locator(".bn-drag-handle-menu:visible")).toHaveCount(0);
  await expect(page.locator("style[data-block-menu-highlight]")).toHaveCount(0);
  await page.keyboard.press(modifierShortcut("Shift+L"));
  await expect(page.getByTestId("sticky-shell"))
    .toHaveAttribute("data-theme-mode", "dark");

  const darkHighlight = await openBlockMenu();
  expect(darkHighlight.backgroundColor).not.toBe(lightHighlight.backgroundColor);
  expect(darkHighlight.boxShadow).not.toBe(lightHighlight.boxShadow);
});

test("promotes a cross-block text drag into a block selection", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();

  const start = page.getByText("A focused workspace for persistent notes", { exact: false }).first();
  const end = page.getByText("Create one session per meeting", { exact: false }).first();
  const startBox = await start.boundingBox();
  const endBox = await end.boundingBox();
  expect(startBox).not.toBeNull();
  expect(endBox).not.toBeNull();

  await page.mouse.move(startBox.x + 8, startBox.y + startBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(endBox.x + endBox.width - 8, endBox.y + endBox.height / 2, { steps: 8 });
  const selectedBlocks = page.locator('.bn-editor [data-block-selected="true"]');
  await expect(selectedBlocks).not.toHaveCount(0);
  const expandedCount = await selectedBlocks.count();
  expect(expandedCount).toBeGreaterThan(1);
  await page.mouse.move(startBox.x + 20, startBox.y + startBox.height / 2, { steps: 4 });
  await expect(selectedBlocks).toHaveCount(1);
  await page.mouse.move(endBox.x + 30, endBox.y + endBox.height / 2, { steps: 8 });
  await expect(selectedBlocks).toHaveCount(expandedCount);
  await page.mouse.up();
  await expect(selectedBlocks).toHaveCount(expandedCount);
  await expect(page.locator('.bn-editor')).toHaveAttribute('data-block-selection', 'true');
  expect(await selectedBlocks.first().locator(':scope > .bn-block').evaluate(el => getComputedStyle(el).backgroundColor))
    .not.toBe("rgba(0, 0, 0, 0)");
  await page.keyboard.press(modifierShortcut("C"));

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("A focused workspace for persistent notes");
  expect(copied).toContain("Create one session per meeting");
  expect(copied).not.toContain("Pin a sticky window");
  expect(await start.evaluate(el => getComputedStyle(el, '::selection').backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await start.click();
  await expect(selectedBlocks).toHaveCount(0);
});

test("deletes the current block with Command+X when no text is selected", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("delete this block");
  await page.keyboard.press(modifierShortcut("X"));

  await expect(page.getByText("delete this block")).toHaveCount(0);
  await expect(page.getByRole("paragraph").filter({ hasText: /^$/ }).last())
    .toBeVisible();
});
