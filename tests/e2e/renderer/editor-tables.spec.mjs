import { expect, test } from "@playwright/test";
import {
  expectFocusedTableCellBorderToMatch,
  loadTemplatePreview,
  modifierShortcut,
} from "../support/renderer-helpers.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

test("focuses table cells without changing their drag selection behavior", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const activeCell = page.getByRole("cell", { name: "Tabs" }).first();
  const tableCellCount = await page.locator(".bn-editor table td, .bn-editor table th").count();
  await activeCell.getByText("Tabs", { exact: true }).click();

  const focusedCellStyle = await activeCell.evaluate((cell) => {
      const style = getComputedStyle(cell);
      return {
        backgroundColor: style.backgroundColor,
        borderWidth: style.borderWidth,
        boxShadow: style.boxShadow,
        transitionDuration: style.transitionDuration,
      };
    });
  expect(focusedCellStyle).toEqual({
    backgroundColor: "rgba(0, 0, 0, 0)",
    borderWidth: "1px",
    boxShadow: "rgba(139, 92, 246, 0.58) 0px 0px 0px 2px inset",
    transitionDuration: "0s",
  });

  await expect(page.locator(".bn-table-handle, .bn-table-cell-handle").first())
    .toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator(".bn-editor .selectedCell"))
    .toHaveText("Tabs");
  const singleCellSelectionStyle = await page.locator(".bn-editor .selectedCell")
    .evaluate((cell) => {
      const style = getComputedStyle(cell, "::after");
      return {
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
      };
    });
  expect(singleCellSelectionStyle).toEqual({
    backgroundColor: "rgba(139, 92, 246, 0.12)",
    boxShadow: "none",
  });

  await page.keyboard.press("Escape");
  await expect(page.locator(".bn-editor"))
    .not.toHaveClass(/ProseMirror-focused/);
  await expect.poll(() => page.locator(".bn-editor .selectedCell").evaluate((cell) => (
    getComputedStyle(cell, "::after").backgroundColor
  ))).toBe("rgba(0, 0, 0, 0)");
  await expect(page.locator(".bn-formatting-toolbar:visible")).toHaveCount(0);

  await activeCell.getByText("Tabs", { exact: true }).click();
  await page.keyboard.press("Escape");
  const nextCell = page.getByRole("cell", {
    name: "Drafting, comparing, and organizing sessions",
  }).first();
  await nextCell.click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("sticky-editor-surface"))
    .toHaveClass(/has-multi-table-cell-selection/);
  const multiCellSelectionStyle = await page.locator(".bn-editor .selectedCell")
    .first()
    .evaluate((cell) => {
      const style = getComputedStyle(cell, "::after");
      return {
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
      };
    });
  expect(multiCellSelectionStyle).toEqual({
    backgroundColor: "rgba(139, 92, 246, 0.12)",
    boxShadow: "none",
  });

  await activeCell.getByText("Tabs", { exact: true }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".bn-editor .selectedCell"))
    .toHaveText("Drafting, comparing, and organizing sessions");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".bn-editor .selectedCell"))
    .toHaveText("Keeping an active note above other windows");

  await activeCell.getByText("Tabs", { exact: true }).click();
  await page.keyboard.insertText("한글");
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() => {
    const selection = window.getSelection();
    const node = selection?.focusNode;
    const cell = (node instanceof Element ? node : node?.parentElement)?.closest("td, th");
    return {
      cellText: cell?.textContent,
      offset: selection?.focusOffset,
      textLength: node?.textContent?.length,
    };
  })).toMatchObject({
    cellText: "Drafting, comparing, and organizing sessions",
    offset: "Drafting, comparing, and organizing sessions".length,
    textLength: "Drafting, comparing, and organizing sessions".length,
  });

  await page.keyboard.press(modifierShortcut("A"));
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("Drafting, comparing, and organizing sessions");
  await expect(page.locator(".bn-editor .selectedCell")).toHaveCount(0);

  await page.keyboard.press(modifierShortcut("A"));
  await expect(page.locator(".bn-editor .selectedCell")).toHaveCount(1);

  await page.keyboard.press(modifierShortcut("A"));
  await expect.poll(() => page.evaluate(() => {
    return {
      selectedCellCount: document.querySelectorAll(".bn-editor .selectedCell").length,
    };
  })).toMatchObject({
    selectedCellCount: tableCellCount,
  });

  await page.keyboard.press(modifierShortcut("A"));
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toContain("NotePane");
});

test("moves one table cell when Tab completes a Korean IME composition", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const activeCell = page.getByRole("cell", { name: "Tabs" }).first();
  await activeCell.getByText("Tabs", { exact: true }).click();
  await page.keyboard.insertText("ㄱ");

  await page.locator(".bn-editor").evaluate((editor) => {
    editor.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: "Tab",
    }));
    editor.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  });
  await page.keyboard.press("Tab");

  await expect.poll(() => page.evaluate(() => {
    const selection = window.getSelection();
    const node = selection?.focusNode;
    return (node instanceof Element ? node : node?.parentElement)
      ?.closest("td, th")?.textContent;
  })).toBe("Drafting, comparing, and organizing sessions");
});

test("merges and splits selected table cells with Command+Shift+M", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const firstCell = page.getByRole("cell", { name: "Tabs" }).first();
  const nextCell = page.getByRole("cell", {
    name: "Drafting, comparing, and organizing sessions",
  }).first();
  await firstCell.click();
  await page.keyboard.press("Escape");
  await nextCell.click({ modifiers: ["Shift"] });

  const formattingToolbar = page.locator(".bn-formatting-toolbar:visible");
  await expect(formattingToolbar).toBeVisible();
  await expect(formattingToolbar.locator(".notepane-formatting-type-row"))
    .toHaveCount(0);
  const mergeButton = formattingToolbar.getByRole("button", {
    name: "Merge selected cells",
  });
  await expect(mergeButton).toBeVisible();
  const mergeIconSize = await mergeButton.locator("svg").evaluate((icon) => {
    const rect = icon.getBoundingClientRect();
    return { height: rect.height, width: rect.width };
  });
  expect(mergeIconSize).toEqual({ height: 21, width: 21 });
  await mergeButton.hover();
  const mergeTooltip = page.locator(".bn-tooltip:visible");
  await expect(mergeTooltip).toContainText("Merge selected cells");
  await expect(mergeTooltip).toContainText(/M/);

  const firstTableRow = page.getByRole("table").getByRole("row").nth(1);
  await expect(firstTableRow.getByRole("cell")).toHaveCount(3);
  await page.keyboard.press(modifierShortcut("Shift+M"));
  await expect(firstTableRow.getByRole("cell")).toHaveCount(2);

  const mergedCell = firstTableRow.getByRole("cell").first();
  await mergedCell.click();
  await page.keyboard.press("Escape");
  const splitButton = page.locator(".bn-formatting-toolbar:visible").getByRole(
    "button",
    { name: "Split merged cell" },
  );
  await expect(splitButton).toBeVisible();
  await splitButton.hover();
  const splitTooltip = page.locator(".bn-tooltip:visible");
  await expect(splitTooltip).toContainText("Split merged cell");
  await expect(splitTooltip).toContainText(/M/);
  await page.keyboard.press(modifierShortcut("Shift+M"));
  await expect(firstTableRow.getByRole("cell")).toHaveCount(3);
});

test("resizes selected table cells live and auto-fits columns on double click", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const cell = page.getByRole("cell", { name: "Tabs" }).first();
  await cell.click();

  const dragColumnEdge = async (distance) => {
    const box = await cell.boundingBox();
    await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width - 1 + distance,
      box.y + box.height / 2,
      { steps: 5 },
    );
  };

  const initialWidth = (await cell.boundingBox()).width;
  await dragColumnEdge(60);
  const liveFocusedWidth = (await cell.boundingBox()).width;
  expect(liveFocusedWidth).toBeGreaterThan(initialWidth + 40);
  await expect.poll(async () => (
    await cell.boundingBox()
  )?.width).toBeCloseTo(liveFocusedWidth, 0);
  await page.mouse.up();

  await page.keyboard.press("Escape");
  await expect(cell).toHaveClass(/selectedCell/);
  const selectedWidthBeforeDrag = (await cell.boundingBox()).width;
  await expect(page.locator(".bn-formatting-toolbar:visible"))
    .toHaveClass(/is-table-context/);
  const selectedBox = await cell.boundingBox();
  await expect(page.evaluate(({ x, y }) => (
    document.elementFromPoint(x, y)?.closest("td, th") !== null
  ), {
    x: selectedBox.x + selectedBox.width - 1,
    y: selectedBox.y + selectedBox.height / 2,
  })).resolves.toBe(true);
  await dragColumnEdge(40);
  expect((await cell.boundingBox()).width)
    .toBeGreaterThan(selectedWidthBeforeDrag + 25);
  await page.mouse.up();

  const widenedWidth = (await cell.boundingBox()).width;
  const widenedBox = await cell.boundingBox();
  await page.mouse.dblclick(
    widenedBox.x + widenedBox.width - 1,
    widenedBox.y + widenedBox.height / 2,
  );
  await expect.poll(async () => (await cell.boundingBox()).width)
    .toBeLessThan(widenedWidth - 40);
  expect((await cell.boundingBox()).width).toBeLessThan(90);
});

test("copies a table when its block is selected from the six-dot handle", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();

  const table = page.getByRole("table").first();
  const tableBlock = table.locator("xpath=ancestor::div[contains(@class, 'bn-block-outer')][1]");
  await tableBlock.hover();
  const dragHandle = page.locator(".bn-side-menu [data-test='dragHandle']:visible").last();
  await expect(dragHandle).toBeVisible();
  await dragHandle.click();
  await page.keyboard.press(modifierShortcut("C"));

  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("Tabs");
});

test("keeps the focused table cell border attached through scroll and column resize", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const cell = page.getByRole("cell", {
    name: "Drafting, comparing, and organizing sessions",
  }).first();
  await cell.click();
  await expectFocusedTableCellBorderToMatch(page, cell);

  await page.getByTestId("sticky-editor-surface").evaluate((surface) => {
    surface.scrollTop += 120;
    surface.dispatchEvent(new Event("scroll"));
  });
  await expectFocusedTableCellBorderToMatch(page, cell);

  const cellBox = await cell.boundingBox();
  await page.mouse.move(cellBox.x + cellBox.width - 1, cellBox.y + cellBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cellBox.x + cellBox.width + 35, cellBox.y + cellBox.height / 2);
  await page.mouse.up();
  await expectFocusedTableCellBorderToMatch(page, cell);
});

test("keeps the focused cell when extending table rows or columns", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  await page.getByRole("button", { name: "Switch to Sticky windows mode" }).click();
  const focusedCell = page.getByRole("cell", {
    name: "Drafting, comparing, and organizing sessions",
  }).first();
  await focusedCell.click();
  const lastCell = page.getByRole("cell", { name: "Export PDF" }).last();
  await lastCell.hover();

  const addColumnButton = page.locator(
    ".bn-extend-button-add-remove-columns",
  ).first();
  await expect(addColumnButton).toBeVisible();
  const addColumnButtonBox = await addColumnButton.boundingBox();
  await page.mouse.move(
    addColumnButtonBox.x + addColumnButtonBox.width / 2,
    addColumnButtonBox.y + addColumnButtonBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    addColumnButtonBox.x + addColumnButtonBox.width + 220,
    addColumnButtonBox.y + addColumnButtonBox.height / 2,
    { steps: 4 },
  );
  await expectFocusedTableCellBorderToMatch(page, focusedCell);
  await page.mouse.up();
  await expectFocusedTableCellBorderToMatch(page, focusedCell);

  await lastCell.hover();
  const addRowButton = page.locator(
    ".bn-extend-button-add-remove-rows",
  ).first();
  await expect(addRowButton).toBeVisible();
  await addRowButton.click();
  await expectFocusedTableCellBorderToMatch(page, focusedCell);
});

test("does not focus the first cell when clicking blank table surface", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const focusedCell = page.getByRole("cell", {
    name: "Drafting, comparing, and organizing sessions",
  }).first();
  await focusedCell.click();
  await expectFocusedTableCellBorderToMatch(page, focusedCell);

  await page.getByRole("table").evaluate((table) => {
    table.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
    }));
    table.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
    }));
    table.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
    }));
  });

  await expect.poll(() => focusedCell.evaluate((cell) => (
    getComputedStyle(cell).boxShadow
  ))).not.toContain("0px 0px 0px 2px");
});

test("auto-fits table columns from the current font size within the editor width", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const tableCells = page.locator(".bn-editor table td");
  const tabsCellIndex = await tableCells.evaluateAll((cells) => (
    cells.findIndex((cellElement) => cellElement.textContent.trim() === "Tabs")
  ));
  const cell = tableCells.nth(tabsCellIndex);
  await expect(cell).toContainText("Tabs");
  const initialTableBounds = await page.evaluate(() => ({
    tableWidth: document.querySelector(".bn-editor table")?.getBoundingClientRect().width ?? 0,
    innerWidth: document.querySelector(".bn-editor .tableWrapper-inner")?.getBoundingClientRect().width ?? 0,
  }));
  expect(initialTableBounds.tableWidth).toBeGreaterThanOrEqual(
    initialTableBounds.innerWidth - 1,
  );
  const autoFitColumn = async () => {
    const box = await cell.boundingBox();
    await page.mouse.dblclick(
      box.x + box.width - 1,
      box.y + box.height / 2,
    );
  };

  await cell.click();
  await autoFitColumn();
  const defaultFontWidth = (await cell.boundingBox()).width;

  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press(modifierShortcut("+"));
  }
  await expect.poll(() => page.locator(".bn-editor").evaluate((editor) => (
    Number.parseFloat(getComputedStyle(editor).fontSize)
  ))).toBeGreaterThan(20);
  await autoFitColumn();
  await expect.poll(async () => (await cell.boundingBox()).width)
    .toBeGreaterThan(defaultFontWidth + 8);

  await cell.click();
  await page.keyboard.press(modifierShortcut("A"));
  await page.keyboard.type("unbroken-value-".repeat(80));
  await autoFitColumn();

  const bounds = await page.evaluate(() => ({
    columnWidth: document.querySelector(".bn-editor td").getBoundingClientRect().width,
    editorWidth: document.querySelector(".bn-editor").clientWidth,
  }));
  expect(bounds.columnWidth).toBeLessThanOrEqual(bounds.editorWidth + 1);
});

test("keeps resized tables inside a local horizontal scroller", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();

  const geometry = await page.getByRole("table").first().evaluate((table) => {
    const wrapper = table.closest(".tableWrapper");
    const surface = table.closest("[data-testid='sticky-editor-surface']");
    for (const cell of table.querySelectorAll("td, th")) {
      cell.setAttribute("data-colwidth", "520");
    }
    for (const column of table.querySelectorAll("col")) {
      column.style.width = "520px";
    }
    table.style.setProperty("width", "1560px", "important");

    return {
      wrapperClientWidth: wrapper?.clientWidth ?? 0,
      wrapperScrollWidth: wrapper?.scrollWidth ?? 0,
      surfaceClientWidth: surface?.clientWidth ?? 0,
      surfaceScrollWidth: surface?.scrollWidth ?? 0,
    };
  });

  expect(geometry.wrapperScrollWidth).toBeGreaterThan(geometry.wrapperClientWidth);
  expect(geometry.surfaceScrollWidth).toBeLessThanOrEqual(
    geometry.surfaceClientWidth + 1,
  );
});
