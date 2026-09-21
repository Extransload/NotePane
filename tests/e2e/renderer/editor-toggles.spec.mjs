import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  createBlankSession,
  loadTemplatePreview,
  modifierShortcut,
  pastePlainText,
} from "../support/renderer-helpers.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

test("creates four toggle heading levels with Notion-style shortcuts", async ({ page }) => {
  await clickLastEmptyParagraph(page);

  for (const [headingShortcut, level, text] of [
    ["#", 1, "Toggle heading one"],
    ["##", 2, "Toggle heading two"],
    ["###", 3, "Toggle heading three"],
    ["####", 4, "Toggle heading four"],
  ]) {
    await page.keyboard.type(headingShortcut);
    await page.keyboard.press("Space");
    await expect(page.locator(`[data-content-type='heading'] h${level}`).last())
      .toBeVisible();
    await page.keyboard.type(">");
    await page.keyboard.press("Space");
    const emptyToggleHeading = page.locator(
      `[data-content-type='heading'][data-is-toggleable='true']:has(h${level})`,
    ).last();
    await expect(emptyToggleHeading.locator(".bn-toggle-wrapper"))
      .toHaveAttribute("data-show-children", "false");
    await expect(emptyToggleHeading.locator(
      "xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]",
    ).getByRole("button", {
      name: "Empty toggle. Click to add a block.",
    })).toHaveCount(0);
    await expect.poll(() => emptyToggleHeading.evaluate((element) => {
      const style = getComputedStyle(element, "::after");
      return {
        content: style.content,
        position: style.position,
        fontStyle: style.fontStyle,
      };
    })).toEqual({
      content: `"Heading ${level}"`,
      position: "absolute",
      fontStyle: "normal",
    });
    await page.keyboard.type(text);
    await page.keyboard.press("Enter");

    const heading = page.getByRole("heading", { name: text, level });
    await expect(heading).toBeVisible();
    await expect(heading.locator("xpath=ancestor::*[@data-content-type='heading'][1]"))
      .toHaveAttribute("data-is-toggleable", "true");
  }

  const headingFontSizes = await Promise.all([
    "Toggle heading one",
    "Toggle heading two",
    "Toggle heading three",
    "Toggle heading four",
  ].map((name) => page.getByRole("heading", { name }).evaluate(
    (heading) => Number.parseFloat(getComputedStyle(heading).fontSize),
  )));
  expect(headingFontSizes).toEqual([30, 24, 20, 16]);
});

test("creates and focuses the first child when Enter ends a toggle heading", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("#");
  await page.keyboard.press("Space");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.type("Toggle parent");
  await page.keyboard.press("Enter");
  await page.keyboard.type("First child");

  const toggleOuter = page.getByRole("heading", {
    name: "Toggle parent",
    level: 1,
  }).locator("xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]");
  const child = page.getByText("First child", { exact: true });
  await expect(child).toBeVisible();
  await expect(toggleOuter.evaluate((outer, childElement) => (
    outer.contains(childElement)
  ), await child.elementHandle())).resolves.toBe(true);
  await expect(page.locator(
    ".bn-editor > .bn-block-group > .bn-block-outer > .bn-block-content",
  ).filter({ hasText: /^First child$/ })).toHaveCount(0);

  await page.getByRole("heading", { name: "Toggle parent", level: 1 })
    .evaluate((heading) => {
      heading.closest(".ProseMirror").focus();
      const range = document.createRange();
      range.selectNodeContents(heading);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
  await page.keyboard.press("Enter");
  await page.keyboard.type("New first child");
  const newFirstChild = page.getByText("New first child", { exact: true });
  await expect(newFirstChild).toBeVisible();
  await expect(toggleOuter.evaluate((outer, elements) => {
    const [newChildElement, retainedChildElement] = elements;
    return outer.contains(newChildElement) &&
      outer.contains(retainedChildElement) &&
      Boolean(newChildElement.compareDocumentPosition(retainedChildElement) &
        Node.DOCUMENT_POSITION_FOLLOWING);
  }, [await newFirstChild.elementHandle(), await child.elementHandle()]))
    .resolves.toBe(true);
});

test("uses identical Enter behavior for ordinary and heading toggles", async ({ page }) => {
  for (const { shortcut, title, selector } of [
    {
      shortcut: ">",
      title: "Ordinary parent",
      selector: "[data-content-type='toggleListItem']",
    },
    {
      shortcut: "# >",
      title: "Heading parent",
      selector: "[data-content-type='heading'][data-is-toggleable='true']",
    },
  ]) {
    await clickLastEmptyParagraph(page);
    for (const token of shortcut.split(" ")) {
      await page.keyboard.type(token);
      await page.keyboard.press("Space");
    }
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
    await page.keyboard.type(`${title} child`);

    const toggle = page.locator(selector).filter({ hasText: title }).last();
    const child = page.getByText(`${title} child`, { exact: true });
    await expect(child).toBeVisible();
    await expect(toggle.evaluate((element, childElement) => (
      element.closest(".bn-block-outer").contains(childElement)
    ), await child.elementHandle())).resolves.toBe(true);

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
  }
});

test("removes empty ordinary and heading toggles without losing heading format", async ({ page }) => {
  for (const { shortcut, selector, typedText, resultSelector } of [
    {
      shortcut: ">",
      selector: "[data-content-type='toggleListItem']",
      typedText: "After ordinary toggle",
      resultSelector: "[data-content-type='paragraph']",
    },
    {
      shortcut: "# >",
      selector: "[data-content-type='heading'][data-is-toggleable='true']",
      typedText: "After heading toggle",
      resultSelector: "[data-content-type='heading']:has(h1):not([data-is-toggleable='true'])",
    },
  ]) {
    await clickLastEmptyParagraph(page);
    for (const token of shortcut.split(" ")) {
      await page.keyboard.type(token);
      await page.keyboard.press("Space");
    }
    const toggleBlocks = page.locator(selector);
    const toggleCount = await toggleBlocks.count();
    await expect(toggleBlocks.last()).toBeVisible();
    await page.keyboard.press("Enter");
    await page.keyboard.type(typedText);

    await expect(toggleBlocks).toHaveCount(toggleCount - 1);
    await expect(page.locator(selector).filter({ hasText: typedText }))
      .toHaveCount(0);
    await expect(page.locator(resultSelector).filter({ hasText: typedText }))
      .toBeVisible();
    await page.keyboard.press("Enter");
  }
});

test("backs out of an empty heading toggle one format at a time", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("#");
  await page.keyboard.press("Space");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");

  const headingToggle = page.locator(
    "[data-content-type='heading'][data-is-toggleable='true']:has(h1)",
  );
  await expect(headingToggle).toBeVisible();

  await page.keyboard.press("Backspace");

  const heading = page.locator(
    "[data-content-type='heading']:has(h1):not([data-is-toggleable='true'])",
  );
  await expect(headingToggle).toHaveCount(0);
  await expect(heading).toBeVisible();

  await page.keyboard.press("Backspace");

  await expect(heading).toHaveCount(0);
  const paragraph = page.locator("[data-content-type='paragraph']").last();
  await expect(paragraph).toBeVisible();

  await page.keyboard.type(">");
  await page.keyboard.press("Space");

  const ordinaryToggle = page.locator("[data-content-type='toggleListItem']").last();
  await expect(ordinaryToggle).toBeVisible();
  await expect(ordinaryToggle.locator(".bn-toggle-wrapper"))
    .toHaveAttribute("data-show-children", "false");
  await expect(ordinaryToggle.locator(
    "xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]",
  ).getByRole("button", {
    name: "Empty toggle. Click to add a block.",
  })).toHaveCount(0);

  await page.keyboard.press("Backspace");
  await expect(ordinaryToggle).toHaveCount(0);
  await expect(page.locator("[data-content-type='paragraph']").last()).toBeVisible();
});

test("preserves toggle children when an empty title removes its toggle format", async ({ page }) => {
  for (const { shortcut, title, selector, resultSelector } of [
    {
      shortcut: ">",
      title: "Ordinary with child",
      selector: "[data-content-type='toggleListItem']",
      resultSelector: "[data-content-type='paragraph']",
    },
    {
      shortcut: "# >",
      title: "Heading with child",
      selector: "[data-content-type='heading'][data-is-toggleable='true']",
      resultSelector: "[data-content-type='heading']:has(h1):not([data-is-toggleable='true'])",
    },
  ]) {
    await createBlankSession(page);
    await clickLastEmptyParagraph(page);
    for (const token of shortcut.split(" ")) {
      await page.keyboard.type(token);
      await page.keyboard.press("Space");
    }
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
    await page.keyboard.type(`${title} retained child`);

    const toggle = page.locator(selector).filter({ hasText: title }).last();
    const titleElement = toggle.locator(":scope .bn-inline-content").first();
    await titleElement.evaluate((element) => {
      element.closest(".ProseMirror").focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Enter");
    await page.keyboard.type(`${title} title`);

    await expect(page.locator(selector).filter({ hasText: title })).toHaveCount(0);
    const resultBlock = page.locator(resultSelector).filter({
      hasText: `${title} title`,
    });
    await expect(resultBlock).toBeVisible();
    const resultOuter = resultBlock.locator(
      "xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]",
    );
    await expect(resultOuter.getByText(`${title} retained child`, { exact: true }))
      .toBeVisible();
  }
});

test("keeps regular heading Enter and toggle heading Shift+Enter behavior", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("# Regular heading");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Regular sibling");
  const regularHeadingOuter = page.getByRole("heading", {
    name: "Regular heading",
    level: 1,
  }).locator("xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]");
  const regularSibling = page.getByText("Regular sibling", { exact: true });
  await expect(regularSibling).toBeVisible();
  await expect(regularHeadingOuter.evaluate((outer, siblingElement) => (
    outer.contains(siblingElement)
  ), await regularSibling.elementHandle())).resolves.toBe(false);

  await page.keyboard.press("Enter");
  await page.keyboard.type("#");
  await page.keyboard.press("Space");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.type("Toggle line");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("break");
  await expect(page.getByRole("heading", { name: /Toggle line\s*break/, level: 1 }))
    .toBeVisible();
});

test("top-aligns multiline toggle heading arrows", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("#");
  await page.keyboard.press("Space");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.type("First line");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Second line");

  const toggleHeading = page.locator(
    "[data-content-type='heading'][data-is-toggleable='true']:has(h1)",
  ).last();
  await expect(toggleHeading).toBeVisible();
  const alignment = await toggleHeading.evaluate((content) => {
    const wrapper = content.querySelector(".bn-toggle-wrapper");
    const button = content.querySelector(".bn-toggle-button");
    const heading = content.querySelector("h1");
    const wrapperRect = wrapper.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    return {
      buttonTopOffset: Math.round(buttonRect.top - wrapperRect.top),
      buttonCenter: buttonRect.top + buttonRect.height / 2,
      headingCenter: headingRect.top + headingRect.height / 2,
    };
  });
  expect(alignment.buttonTopOffset).toBeLessThanOrEqual(1);
  expect(alignment.buttonCenter).toBeLessThan(alignment.headingCenter);
});

test("top-aligns multiline ordinary toggle arrows with the empty child action", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.type("First line");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Second line");

  const toggle = page.locator("[data-content-type='toggleListItem']").last();
  await expect(toggle).toBeVisible();
  const outer = toggle.locator(
    "xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]",
  );
  await toggle.locator(".bn-toggle-button").click();
  await expect(outer.getByRole("button", {
    name: "Empty toggle. Click to add a block.",
  })).toBeVisible();

  const alignment = await toggle.evaluate((content) => {
    const wrapper = content.querySelector(".bn-toggle-wrapper");
    const button = content.querySelector(".bn-toggle-button");
    const title = content.querySelector(".bn-inline-content");
    const wrapperRect = wrapper.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    return {
      buttonTopOffset: Math.round(buttonRect.top - wrapperRect.top),
      buttonCenter: buttonRect.top + buttonRect.height / 2,
      titleCenter: titleRect.top + titleRect.height / 2,
    };
  });
  expect(alignment.buttonTopOffset).toBeLessThanOrEqual(1);
  expect(alignment.buttonCenter).toBeLessThan(alignment.titleCenter);
});

test("shows level-specific placeholders for empty headings", async ({ page }) => {
  await clickLastEmptyParagraph(page);

  for (const [shortcut, level] of [
    ["#", 1],
    ["##", 2],
    ["###", 3],
    ["####", 4],
  ]) {
    await page.keyboard.type(shortcut);
    await page.keyboard.press("Space");
    const heading = page.locator(`[data-content-type='heading']:has(h${level})`).last();
    await expect(heading).toBeVisible();
    await expect.poll(() => heading.evaluate((element) =>
      getComputedStyle(element, "::after").content
    )).toBe(`"Heading ${level}"`);
    await page.keyboard.type(`Level ${level}`);
    await page.keyboard.press("Enter");
  }
});

test("creates a Notion-style toggle with greater-than and Space", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.type("Shortcut toggle");

  const toggle = page
    .locator("[data-content-type='toggleListItem']")
    .filter({ hasText: "Shortcut toggle" });
  await expect(toggle).toBeVisible();
  await expect(toggle.locator(".bn-inline-content")).toHaveText("Shortcut toggle");

  const toggleButton = toggle.locator(".bn-toggle-button");
  const buttonTopBeforeLineBreak = (await toggleButton.boundingBox())?.y;
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Second toggle line");
  await expect.poll(() =>
    toggle.locator(".bn-inline-content").evaluate((element) => element.innerText),
  ).toBe("Shortcut toggle\nSecond toggle line");

  const alignment = await toggle.evaluate((element) => {
    const button = element.querySelector(".bn-toggle-button");
    const content = element.querySelector(".bn-inline-content");
    const firstTextNode = document
      .createTreeWalker(content, NodeFilter.SHOW_TEXT)
      .nextNode();
    const firstLineRange = document.createRange();
    firstLineRange.selectNodeContents(firstTextNode);
    const buttonRect = button.getBoundingClientRect();
    const firstLineRect = firstLineRange.getBoundingClientRect();
    return {
      buttonTop: buttonRect.top,
      firstLineCenterDelta: Math.abs(
        buttonRect.top + buttonRect.height / 2 -
          (firstLineRect.top + firstLineRect.height / 2),
      ),
    };
  });
  expect(Math.abs(alignment.buttonTop - buttonTopBeforeLineBreak))
    .toBeLessThanOrEqual(1);
  expect(alignment.firstLineCenterDelta).toBeLessThanOrEqual(2);
  await expect(
    page.locator("[data-content-type='quote']").filter({ hasText: "Shortcut toggle" }),
  ).toHaveCount(0);
});

test("converts greater-than at the start of an existing line into a toggle", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("Existing line");
  await page.keyboard.press("Home");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");

  const toggle = page
    .locator("[data-content-type='toggleListItem']")
    .filter({ hasText: "Existing line" });
  await expect(toggle).toBeVisible();
  await expect(toggle.locator(".bn-inline-content")).toHaveText("Existing line");
  await expect(
    page.locator("[data-content-type='quote']").filter({ hasText: "Existing line" }),
  ).toHaveCount(0);
});

test("undoes toggle conversion without consuming its shortcut marker", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("Existing undo line");
  await page.keyboard.press("Home");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");

  const ordinaryToggle = page.locator("[data-content-type='toggleListItem']")
    .filter({ hasText: "Existing undo line" });
  await expect(ordinaryToggle).toBeVisible();

  await page.keyboard.press(modifierShortcut("Z"));

  const restoredParagraph = page.locator("[data-content-type='paragraph']")
    .filter({ hasText: "> Existing undo line" });
  await expect(ordinaryToggle).toHaveCount(0);
  await expect(restoredParagraph.locator(".bn-inline-content"))
    .toHaveText("> Existing undo line");

  await page.keyboard.press(modifierShortcut("Shift+Z"));
  await expect(ordinaryToggle).toBeVisible();

  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("##");
  await page.keyboard.press("Space");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");

  const headingToggle = page.locator(
    "[data-content-type='heading'][data-is-toggleable='true']:has(h2)",
  ).last();
  await expect(headingToggle).toBeVisible();

  await page.keyboard.press(modifierShortcut("Z"));

  const restoredHeading = page.locator(
    "[data-content-type='heading']:has(h2):not([data-is-toggleable='true'])",
  ).last();
  await expect(headingToggle).toHaveCount(0);
  await expect(restoredHeading.locator(".bn-inline-content")).toHaveText("> ");

  await page.keyboard.press(modifierShortcut("Shift+Z"));
  await expect(headingToggle).toBeVisible();
});

test("changes heading levels inside toggle mode as nested format layers", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.type("Nested parent");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Retained nested child");

  const focusTitleStart = async (selector) => {
    await page.locator(selector).last().locator(".bn-inline-content")
      .evaluate((element) => {
        element.closest(".ProseMirror").focus();
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });
  };

  await focusTitleStart("[data-content-type='toggleListItem']");
  await page.keyboard.type("##");
  await page.keyboard.press("Space");

  const headingTwoToggle = page.locator(
    "[data-content-type='heading'][data-is-toggleable='true']:has(h2)",
  ).last();
  await expect(headingTwoToggle.locator(".bn-inline-content"))
    .toHaveText("Nested parent");
  const headingTwoOuter = headingTwoToggle.locator(
    "xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]",
  );
  await expect(headingTwoOuter.getByText("Retained nested child", { exact: true }))
    .toBeVisible();
  await expect(headingTwoToggle.locator(".bn-toggle-wrapper"))
    .toHaveAttribute("data-show-children", "true");

  await page.keyboard.press(modifierShortcut("Z"));
  const restoredOrdinaryToggle = page.locator("[data-content-type='toggleListItem']")
    .filter({ hasText: "## Nested parent" });
  await expect(restoredOrdinaryToggle.locator(".bn-inline-content"))
    .toHaveText("## Nested parent");
  await expect(restoredOrdinaryToggle.locator(
    "xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]",
  ).getByText("Retained nested child", { exact: true })).toBeVisible();

  await page.keyboard.press(modifierShortcut("Shift+Z"));
  await expect(headingTwoToggle.locator(".bn-inline-content"))
    .toHaveText("Nested parent");

  await focusTitleStart(
    "[data-content-type='heading'][data-is-toggleable='true']:has(h2)",
  );
  await page.keyboard.type("###");
  await page.keyboard.press("Space");

  const headingThreeToggle = page.locator(
    "[data-content-type='heading'][data-is-toggleable='true']:has(h3)",
  ).last();
  await expect(headingThreeToggle.locator(".bn-inline-content"))
    .toHaveText("Nested parent");

  await page.keyboard.press(modifierShortcut("Z"));
  await expect(headingTwoToggle.locator(".bn-inline-content"))
    .toHaveText("### Nested parent");

  await page.keyboard.press(modifierShortcut("Shift+Z"));
  await expect(headingThreeToggle.locator(".bn-inline-content"))
    .toHaveText("Nested parent");
});

test("adds toggle mode without flattening heading base format", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, "# Existing heading\n- [ ] Existing checkbox");

  const heading = page.getByRole("heading", {
    name: "Existing heading",
    level: 1,
  });
  await heading.click();
  await page.keyboard.press("Home");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");

  const checkboxText = page.getByText("Existing checkbox", { exact: true });
  await checkboxText.click();
  await page.keyboard.press("Home");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");

  const headingToggle = page.locator(
    "[data-content-type='heading'][data-is-toggleable='true']:has(h1)",
  ).filter({ hasText: "Existing heading" });
  await expect(headingToggle).toBeVisible();
  await expect(headingToggle.locator(".bn-inline-content"))
    .toHaveText("Existing heading");
  await expect(page.getByRole("heading", {
    name: "Existing heading",
    level: 1,
  })).toBeVisible();

  const checkboxToggle = page.locator("[data-content-type='toggleListItem']")
    .filter({ hasText: "Existing checkbox" });
  await expect(checkboxToggle).toBeVisible();
  await expect(checkboxToggle.locator(".bn-inline-content"))
    .toHaveText("Existing checkbox");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("toggles checklist and toggle heading without shell interference", async ({ page }) => {
  await loadTemplatePreview(page);
  const checkbox = page.getByRole("checkbox").first();
  await expect(checkbox).not.toBeChecked();
  await checkbox.click();
  await expect(checkbox).toBeChecked();

  const toggleHeadingButton = page
    .locator(".bn-block-outer")
    .filter({ hasText: "Launch checklist" })
    .locator("button")
    .first();
  await toggleHeadingButton.click();
  await expect(page.getByText("Use this template when the workspace is clear"))
    .toBeVisible();
});
