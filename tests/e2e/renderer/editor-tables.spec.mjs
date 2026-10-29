import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  createBlankSession,
  expectEditorFocused,
  expectFocusedTableCellBorderToMatch,
  loadTemplatePreview,
  modifierShortcut,
  pastePlainText,
  waitForEditorSelection,
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

  // A second Escape selects the table block, as in Notion, and the editor keeps focus for Cmd+Z.
  await page.keyboard.press("Escape");
  await expect(page.locator(".bn-editor .selectedCell")).toHaveCount(0);
  await expect(page.locator(".bn-editor [data-block-selected] table")).toHaveCount(1);
  await expectEditorFocused(page);
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

test("auto-fits table columns within the editor width", async ({ page }) => {
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
    // Long content can push the table below the viewport, so the double click
    // has to follow the cell instead of its original coordinates.
    await cell.scrollIntoViewIfNeeded();
    const box = await cell.boundingBox();
    await page.mouse.dblclick(
      box.x + box.width - 1,
      box.y + box.height / 2,
    );
  };

  await cell.click();
  await autoFitColumn();

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

// prosemirror-tables shrank a text selection that starts in the first cell to that cell, so
// Command+A in a note that starts with a table selected only the first cell's text.
test("selects a note that starts with a table with Command+A", async ({ page }) => {
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, [
    "| a1 | b1 |", "| --- | --- |", "| a2 | b2 |", "", "middle", "", "- last",
  ].join("\n"));
  const editor = page.locator(".bn-editor");
  await expect(editor.locator("table")).toHaveCount(1);
  await editor.getByText("middle", { exact: true }).click();
  await waitForEditorSelection(page);

  // A second Command+A keeps the whole note rather than cycling into the table.
  for (let press = 0; press < 2; press += 1) {
    await page.keyboard.press(modifierShortcut("A"));
    await waitForEditorSelection(page);
    await expect(editor.locator(".selectedCell")).toHaveCount(0);
    const selectedText = await page.evaluate(() => String(window.getSelection()));
    for (const text of ["a1", "b2", "middle", "last"]) {
      expect(selectedText).toContain(text);
    }
  }

  const copiedText = await page.evaluate(() => {
    const clipboardData = new DataTransfer();
    document.querySelector(".bn-editor").dispatchEvent(
      new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData }),
    );
    return clipboardData.getData("text/plain");
  });
  for (const text of ["a1", "b2", "middle", "last"]) {
    expect(copiedText).toContain(text);
  }

  await page.keyboard.press("Backspace");
  await expect(editor.locator("table")).toHaveCount(0);
  await expect(editor.getByText("middle", { exact: true })).toHaveCount(0);
  await expect(editor.locator(".bn-block-content")).toHaveCount(1);
});

test("keeps the table when the cut shortcut is pressed with the caret in a cell", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const table = page.locator(".bn-editor table").first();
  const rowCount = await table.locator("tr").count();
  await page.getByRole("cell", { name: "Tabs" }).first().getByText("Tabs", { exact: true }).click();

  await page.keyboard.press(modifierShortcut("X"));

  await expect(table).toHaveCount(1);
  await expect(table.locator("tr")).toHaveCount(rowCount);
  await expect(page.getByRole("cell", { name: "Tabs" }).first()).toBeVisible();
  await expectEditorFocused(page);
});

test("keeps the editor focused after a row handle action and Escape, so Cmd+Z undoes it", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const rows = page.locator(".bn-editor table").first().locator("tr");
  const rowCount = await rows.count();
  await page.getByRole("cell", { name: "Tabs" }).first().getByText("Tabs", { exact: true }).click();

  // The row handle sits left of the row, the column handle above the column.
  const handles = page.locator(".bn-table-handle:visible");
  await expect(handles).toHaveCount(2);
  const lefts = await handles.evaluateAll((elements) => (
    elements.map((element) => element.getBoundingClientRect().left)
  ));
  await handles.nth(lefts.indexOf(Math.min(...lefts))).click();
  await page.locator(".bn-table-handle-menu [role='menuitem']")
    .filter({ hasText: "Insert below" })
    .click();
  await expect(rows).toHaveCount(rowCount + 1);

  // Escape clears the row the handle selected.
  await page.keyboard.press("Escape");
  await expectEditorFocused(page);
  await page.keyboard.press(modifierShortcut("Z"));
  await expect(rows).toHaveCount(rowCount);
});

test("shows the formatting toolbar again for text selected by keyboard after Escape on table cells", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  await page.getByRole("cell", { name: "Tabs" }).first().getByText("Tabs", { exact: true }).click();
  const handles = page.locator(".bn-table-handle:visible");
  await expect(handles).toHaveCount(2);
  const lefts = await handles.evaluateAll((elements) => (
    elements.map((element) => element.getBoundingClientRect().left)
  ));
  await handles.nth(lefts.indexOf(Math.min(...lefts))).click();
  await page.locator(".bn-table-handle-menu [role='menuitem']")
    .filter({ hasText: "Insert below" })
    .click();
  await page.keyboard.press("Escape");
  await expectEditorFocused(page);
  const formattingToolbar = page.locator(".bn-formatting-toolbar:visible");
  await expect(formattingToolbar).toHaveCount(0);

  // Back to text by keyboard alone: the editor kept focus, so no focus event brings the toolbar back.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.type(" kept");
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("Shift+ArrowLeft");
  }
  await expect(formattingToolbar).toHaveCount(1);
});

test("selects a row from its handle, then duplicates and clears it in one undo step each", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const rows = page.locator(".bn-editor table").first().locator("tr");
  const rowCount = await rows.count();
  const tabsRowText = await rows.nth(1).textContent();
  const openRowMenu = async () => {
    await page.getByRole("cell", { name: "Tabs" }).first().getByText("Tabs", { exact: true }).click();
    const handles = page.locator(".bn-table-handle:visible");
    await expect(handles).toHaveCount(2);
    const lefts = await handles.evaluateAll((elements) => (
      elements.map((element) => element.getBoundingClientRect().left)
    ));
    await handles.nth(lefts.indexOf(Math.min(...lefts))).click();
  };
  const menuItem = (name) => page.locator(".bn-table-handle-menu [role='menuitem']")
    .filter({ hasText: name });

  // The whole row is selected and outlined as one rectangle: only the end cells draw the sides.
  await openRowMenu();
  const selectedCells = page.locator(".bn-editor .selectedCell");
  await expect(selectedCells).toHaveCount(3);
  await expect(selectedCells.first()).toHaveText("Tabs");
  await expect(selectedCells.nth(0)).toHaveClass(/notepane-cell-range-left/);
  await expect(selectedCells.nth(1)).not.toHaveClass(/notepane-cell-range-(left|right)/);
  await expect(selectedCells.nth(2)).toHaveClass(/notepane-cell-range-right/);
  for (const index of [0, 1, 2]) {
    await expect(selectedCells.nth(index)).toHaveClass(/notepane-cell-range-top/);
    await expect(selectedCells.nth(index)).toHaveClass(/notepane-cell-range-bottom/);
  }

  await menuItem("Duplicate").click();
  await expect(rows).toHaveCount(rowCount + 1);
  await expect(rows.nth(2)).toHaveText(tabsRowText);
  await page.keyboard.press(modifierShortcut("Z"));
  await expect(rows).toHaveCount(rowCount);

  await openRowMenu();
  await menuItem("Clear contents").click();
  await expect(rows.nth(1)).toHaveText("");
  await expect(rows).toHaveCount(rowCount);
  await page.keyboard.press(modifierShortcut("Z"));
  await expect(rows.nth(1)).toHaveText(tabsRowText);
});

test("toggles table headers and fits the table to the editor width from the six-dot menu", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const table = page.locator(".bn-editor table").first();
  const firstCell = table.locator("td, th").first();
  const openBlockMenu = async () => {
    await table.locator("xpath=ancestor::div[contains(@class, 'bn-block-outer')][1]").hover();
    await page.locator(".bn-side-menu [data-test='dragHandle']:visible").last().click();
  };

  // A header switch keeps the menu open and shows the new state; after the menu closes, the
  // editor has focus again and Cmd+Z undoes the switch.
  await openBlockMenu();
  const headerColumn = page.locator(".bn-drag-handle-menu [role='menuitem']")
    .filter({ hasText: "Header column" });
  const headerCellsInSecondRow = table.locator("tr").nth(1).locator("th");
  const headerColumnWasOn = await headerCellsInSecondRow.count() > 0;
  await headerColumn.click();
  await expect(headerCellsInSecondRow).toHaveCount(headerColumnWasOn ? 0 : 1);
  await expect(headerColumn.locator(".notepane-menu-switch"))
    .toHaveAttribute("data-checked", headerColumnWasOn ? "false" : "true");
  await page.keyboard.press("Escape");
  await expectEditorFocused(page);
  await page.keyboard.press(modifierShortcut("Z"));
  await expect(headerCellsInSecondRow).toHaveCount(headerColumnWasOn ? 1 : 0);

  // A column dragged wider than the editor scrolls the table; Fit to width brings it back.
  const wrapper = page.locator(".bn-editor [data-content-type='table'] .tableWrapper").first();
  // The undo above scrolls to the selection it restores, which may be away from the table.
  await firstCell.scrollIntoViewIfNeeded();
  const cellBox = await firstCell.boundingBox();
  await page.mouse.move(cellBox.x + cellBox.width - 1, cellBox.y + cellBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cellBox.x + cellBox.width + 500, cellBox.y + cellBox.height / 2, { steps: 6 });
  await page.mouse.up();
  const isOverflowing = () => wrapper.evaluate((element) => element.scrollWidth > element.clientWidth);
  await expect.poll(isOverflowing).toBe(true);

  await openBlockMenu();
  await page.locator(".bn-drag-handle-menu [role='menuitem']")
    .filter({ hasText: "Fit to width" })
    .click();
  await expect.poll(isOverflowing).toBe(false);
  await page.keyboard.press(modifierShortcut("Z"));
  await expect.poll(isOverflowing).toBe(true);
});
