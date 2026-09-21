// Shared helpers for the renderer suites in tests/e2e/renderer/.
import { expect } from "@playwright/test";

export async function expectStickyTableChromeReadable(page) {
  await page.getByRole("table").hover();
  const lastCell = page.getByRole("cell", { name: "Export PDF" }).last();
  await lastCell.hover();
  await lastCell.click();
  await lastCell.hover();

  await expect(page.locator(".bn-extend-button").first()).toBeVisible();
  await expect(page.locator(".bn-table-handle, .bn-table-cell-handle").first())
    .toBeVisible();
  await expect(page.locator(".bn-table-cell-handle").first()).toBeHidden();
  await expect.poll(() => getStickyTableChromeSnapshot(page)).toMatchObject({
    hasExtendButton: true,
    hasTableHandle: true,
    controlTextContrastIsReadable: true,
    controlSurfaceUsesStickyTone: true,
    controlShadowIsVisible: true,
  });

  await page.locator(".bn-table-handle, .bn-table-cell-handle").first().click();
  const tableMenu = page.locator(".bn-table-handle-menu, .bn-menu-dropdown")
    .filter({ has: page.locator("[role='menuitem']") })
    .first();
  await expect(tableMenu).toBeVisible();
  await page.locator(".bn-table-handle-menu [role='menuitem'], .bn-menu-dropdown [role='menuitem']")
    .first()
    .hover();
  await expect.poll(() => getStickyTableMenuSnapshot(page)).toMatchObject({
    menuTextContrastIsReadable: true,
    menuSurfaceUsesPortalTone: true,
    menuHoverUsesPortalTone: true,
    menuShadowIsVisible: true,
  });
  await page.keyboard.press("Escape");
}

export async function expectStickyPlaceholderReadable(page) {
  await clickLastEmptyParagraph(page);

  await expect.poll(() => getStickyPlaceholderSnapshot(page)).toMatchObject({
    hasPlaceholder: true,
    placeholderUsesMutedTone: true,
    placeholderContrastIsReadable: true,
  });
}

export async function getStickyTableChromeSnapshot(page) {
  return await page.evaluate(() => {
    const shell = document.querySelector("[data-testid='sticky-shell']");
    const controls = [...document.querySelectorAll(
      ".bn-table-handle, .bn-table-cell-handle, .bn-extend-button",
    )].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity) > 0.01
      );
    });
    const firstControl = controls[0];
    const firstExtendButton = controls.find((element) =>
      element.classList.contains("bn-extend-button"),
    );
    const firstTableHandle = controls.find((element) =>
      element.classList.contains("bn-table-handle") ||
      element.classList.contains("bn-table-cell-handle"),
    );
    const parseColor = (color) => {
      const normalizedColor = color.trim();
      if (/^#[0-9a-f]{6}$/i.test(normalizedColor)) {
        return {
          r: Number.parseInt(normalizedColor.slice(1, 3), 16),
          g: Number.parseInt(normalizedColor.slice(3, 5), 16),
          b: Number.parseInt(normalizedColor.slice(5, 7), 16),
          a: 1,
        };
      }
      const channels = color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
      return {
        r: channels[0] ?? 0,
        g: channels[1] ?? 0,
        b: channels[2] ?? 0,
        a: channels[3] ?? 1,
      };
    };
    const formatRgb = ({ r, g, b }) =>
      `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    const compositeColor = (foregroundColor, backgroundColor) => {
      const foreground = parseColor(foregroundColor);
      const background = parseColor(backgroundColor);
      const alpha = foreground.a;
      return formatRgb({
        r: foreground.r * alpha + background.r * (1 - alpha),
        g: foreground.g * alpha + background.g * (1 - alpha),
        b: foreground.b * alpha + background.b * (1 - alpha),
      });
    };
    const luminance = (color) => {
      const { r, g, b } = parseColor(color);
      const [red, green, blue] = [r, g, b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const contrastRatio = (foreground, background) => {
      const first = luminance(foreground);
      const second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const colorDistance = (firstColor, secondColor) => {
      const first = parseColor(firstColor);
      const second = parseColor(secondColor);
      return Math.hypot(first.r - second.r, first.g - second.g, first.b - second.b);
    };
    const shellStyle = getComputedStyle(shell);
    const shellBackground =
      shellStyle.getPropertyValue("--sticky-effective-bg").trim() ||
      shellStyle.backgroundColor;
    const controlStyle = firstControl ? getComputedStyle(firstControl) : null;
    const controlBackground = controlStyle?.backgroundColor ?? shellBackground;
    const visibleControlBackground = compositeColor(controlBackground, shellBackground);

    return {
      controlCount: controls.length,
      hasExtendButton: Boolean(firstExtendButton),
      hasTableHandle: Boolean(firstTableHandle),
      controlTextContrastIsReadable:
        contrastRatio(controlStyle?.color ?? "transparent", visibleControlBackground) >= 4.5,
      controlSurfaceUsesStickyTone:
        colorDistance(visibleControlBackground, shellBackground) >= 4 &&
        colorDistance(visibleControlBackground, shellBackground) <= 64,
      controlShadowIsVisible:
        Boolean(controlStyle) && controlStyle.boxShadow !== "none",
    };
  });
}

export async function getStickyTableMenuSnapshot(page) {
  return await page.evaluate(() => {
    const shell = document.querySelector("[data-testid='sticky-shell']");
    const menus = [...document.querySelectorAll(
      ".bn-table-handle-menu, .bn-menu-dropdown, .mantine-Menu-dropdown",
    )].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity) > 0.01
      );
    });
    const menu = menus[0];
    const item = menu?.querySelector("[role='menuitem'], .mantine-Menu-item");
    const parseColor = (color) => {
      const normalizedColor = color.trim();
      if (/^#[0-9a-f]{6}$/i.test(normalizedColor)) {
        return {
          r: Number.parseInt(normalizedColor.slice(1, 3), 16),
          g: Number.parseInt(normalizedColor.slice(3, 5), 16),
          b: Number.parseInt(normalizedColor.slice(5, 7), 16),
          a: 1,
        };
      }
      const channels = color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
      return {
        r: channels[0] ?? 0,
        g: channels[1] ?? 0,
        b: channels[2] ?? 0,
        a: channels[3] ?? 1,
      };
    };
    const luminance = (color) => {
      const { r, g, b } = parseColor(color);
      const [red, green, blue] = [r, g, b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const contrastRatio = (foreground, background) => {
      const first = luminance(foreground);
      const second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const colorDistance = (firstColor, secondColor) => {
      const first = parseColor(firstColor);
      const second = parseColor(secondColor);
      return Math.hypot(first.r - second.r, first.g - second.g, first.b - second.b);
    };
    const shellStyle = getComputedStyle(shell);
    const bodyStyle = getComputedStyle(document.body);
    const menuStyle = menu ? getComputedStyle(menu) : null;
    const itemStyle = item ? getComputedStyle(item) : null;
    const expectedMenuBackground = bodyStyle
      .getPropertyValue("--sticky-portal-menu-bg")
      .trim();
    const expectedMenuHoverBackground = bodyStyle
      .getPropertyValue("--sticky-portal-menu-hover-bg")
      .trim();
    const shellBackground = shellStyle
      .getPropertyValue("--sticky-effective-bg")
      .trim();

    return {
      menuTextContrastIsReadable:
        Boolean(menuStyle) &&
        contrastRatio(itemStyle?.color ?? menuStyle.color, menuStyle.backgroundColor) >= 4.5,
      menuSurfaceUsesPortalTone:
        Boolean(menuStyle) &&
        colorDistance(menuStyle.backgroundColor, expectedMenuBackground) <= 2,
      menuHoverUsesPortalTone:
        Boolean(itemStyle) &&
        colorDistance(itemStyle.backgroundColor, expectedMenuHoverBackground) <= 2,
      menuShadowIsVisible:
        Boolean(menuStyle) && menuStyle.boxShadow !== "none",
      menuSeparatesFromShell:
        Boolean(menuStyle) &&
        colorDistance(menuStyle.backgroundColor, shellBackground) >= 4,
    };
  });
}

export async function getStickyPlaceholderSnapshot(page) {
  return await page.evaluate(() => {
    const shell = document.querySelector("[data-testid='sticky-shell']");
    const shellStyle = getComputedStyle(shell);
    const shellBackground = shellStyle
      .getPropertyValue("--sticky-effective-bg")
      .trim();
    const expectedPlaceholderColor = shellStyle
      .getPropertyValue("--sticky-muted-color")
      .trim();
    const placeholders = [...document.querySelectorAll(".bn-editor .bn-block-content")]
      .map((element) => {
        const style = getComputedStyle(element, "::after");
        return {
          color: style.color,
          content: style.content,
        };
      })
      .filter(({ content }) => content && content !== "none" && content !== "\"\"");
    const placeholder = placeholders[0];
    const parseColor = (color) => {
      const normalizedColor = color.trim();
      if (/^#[0-9a-f]{6}$/i.test(normalizedColor)) {
        return {
          r: Number.parseInt(normalizedColor.slice(1, 3), 16),
          g: Number.parseInt(normalizedColor.slice(3, 5), 16),
          b: Number.parseInt(normalizedColor.slice(5, 7), 16),
          a: 1,
        };
      }
      const channels = color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
      return {
        r: channels[0] ?? 0,
        g: channels[1] ?? 0,
        b: channels[2] ?? 0,
        a: channels[3] ?? 1,
      };
    };
    const formatRgb = ({ r, g, b }) =>
      `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    const compositeColor = (foregroundColor, backgroundColor) => {
      const foreground = parseColor(foregroundColor);
      const background = parseColor(backgroundColor);
      const alpha = foreground.a;
      return formatRgb({
        r: foreground.r * alpha + background.r * (1 - alpha),
        g: foreground.g * alpha + background.g * (1 - alpha),
        b: foreground.b * alpha + background.b * (1 - alpha),
      });
    };
    const luminance = (color) => {
      const { r, g, b } = parseColor(color);
      const [red, green, blue] = [r, g, b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const contrastRatio = (foreground, background) => {
      const first = luminance(foreground);
      const second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const colorDistance = (firstColor, secondColor) => {
      const first = parseColor(firstColor);
      const second = parseColor(secondColor);
      return Math.hypot(first.r - second.r, first.g - second.g, first.b - second.b);
    };
    const visiblePlaceholderColor = placeholder
      ? compositeColor(placeholder.color, shellBackground)
      : "transparent";

    return {
      hasPlaceholder: Boolean(placeholder),
      placeholderUsesMutedTone:
        Boolean(placeholder) &&
        colorDistance(placeholder.color, expectedPlaceholderColor) <= 2,
      placeholderContrastIsReadable:
        Boolean(placeholder) &&
        contrastRatio(visiblePlaceholderColor, shellBackground) >= 3,
    };
  });
}

export async function getStickyContrastSnapshot(page) {
  return await page.evaluate(() => {
    const shell = document.querySelector("[data-testid='sticky-shell']");
    const header = document.querySelector("[data-testid='sticky-header']");
    const settingsButton = document.querySelector(".sticky-settings-button");
    const editor = document.querySelector(".bn-editor");
    const codeBlock = document.querySelector(
      ".bn-editor [data-content-type='codeBlock']",
    );
    const codeBlockPre = codeBlock?.querySelector("pre");
    const code =
      codeBlock?.querySelector("code") ?? document.querySelector(".bn-editor code");
    const tableCell = document.querySelector(
      ".bn-editor td, .bn-editor th, .bn-editor .bn-table-cell",
    );
    const codeBlockStyle = codeBlock ? getComputedStyle(codeBlock) : null;
    const codeBlockPreStyle = codeBlockPre ? getComputedStyle(codeBlockPre) : null;
    const codeStyle = code ? getComputedStyle(code) : null;
    const tableCellStyle = tableCell ? getComputedStyle(tableCell) : null;
    const parseColor = (color) => {
      const normalizedColor = color.trim();
      if (normalizedColor === "transparent") {
        return { r: 0, g: 0, b: 0, a: 0 };
      }
      if (/^#[0-9a-f]{6}$/i.test(normalizedColor)) {
        return {
          r: Number.parseInt(normalizedColor.slice(1, 3), 16),
          g: Number.parseInt(normalizedColor.slice(3, 5), 16),
          b: Number.parseInt(normalizedColor.slice(5, 7), 16),
          a: 1,
        };
      }
      const channels = color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
      return {
        r: channels[0] ?? 0,
        g: channels[1] ?? 0,
        b: channels[2] ?? 0,
        a: channels[3] ?? 1,
      };
    };
    const formatRgb = ({ r, g, b }) =>
      `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    const compositeColor = (foregroundColor, backgroundColor) => {
      const foreground = parseColor(foregroundColor);
      const background = parseColor(backgroundColor);
      const alpha = foreground.a;
      return formatRgb({
        r: foreground.r * alpha + background.r * (1 - alpha),
        g: foreground.g * alpha + background.g * (1 - alpha),
        b: foreground.b * alpha + background.b * (1 - alpha),
      });
    };
    const luminance = (color) => {
      const { r, g, b } = parseColor(color);
      const [red, green, blue] = [r, g, b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const contrastRatio = (foreground, background) => {
      const first = luminance(foreground);
      const second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const shellStyle = getComputedStyle(shell);
    const shellBackground =
      shellStyle.getPropertyValue("--sticky-effective-bg").trim() ||
      shellStyle.backgroundColor;
    const codeBackgroundColor = [
      codeBlockStyle?.backgroundColor,
      codeBlockPreStyle?.backgroundColor,
      codeStyle?.backgroundColor,
    ].find((backgroundColor) => backgroundColor && parseColor(backgroundColor).a > 0) ??
      shellBackground;
    const codeBackground = compositeColor(codeBackgroundColor, shellBackground);
    const codeBlockRadius = Number.parseFloat(
      codeBlockStyle?.borderTopLeftRadius ?? "0",
    );
    const codeBlockPreRadius = Number.parseFloat(
      codeBlockPreStyle?.borderTopLeftRadius ?? "0",
    );
    const codeTextColor = codeStyle?.color ?? codeBlockStyle?.color ?? shellStyle.color;
    const codeTokenElements = codeBlock
      ? [
          codeBlock,
          ...codeBlock.querySelectorAll(
            "pre, code, span, [style*='color'], [class*='token'], [class*='hljs'], [class*='cm-']",
          ),
        ].filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return Boolean(
            element.textContent?.trim() &&
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              rect.width > 0 &&
              rect.height > 0,
          );
        })
      : [];
    const codeTokenContrasts = codeTokenElements.map((element) =>
      contrastRatio(getComputedStyle(element).color, codeBackground),
    );
    const codeTokenContrastMin = codeTokenContrasts.length > 0
      ? Math.min(...codeTokenContrasts)
      : 0;
    const codeTokenDistinctColorCount = new Set(
      codeTokenElements.map((element) => getComputedStyle(element).color),
    ).size;
    const tableBorderColor = tableCellStyle?.borderTopColor ?? shellStyle
      .getPropertyValue("--sticky-table-border-color");
    const visibleTableBorderColor = compositeColor(tableBorderColor, shellBackground);
    const settingsButtonColor = getComputedStyle(settingsButton).color;
    const headerBackgroundColor = getComputedStyle(header).backgroundColor;

    return {
      textColor: shellStyle.getPropertyValue("--sticky-text-color").trim(),
      settingsButtonColor,
      headerIsOpaque: parseColor(headerBackgroundColor).a >= 0.96,
      editorTextContrastIsReadable:
        contrastRatio(getComputedStyle(editor).color, shellBackground) >= 4.5,
      codeTextContrastIsReadable:
        contrastRatio(codeTextColor, codeBackground) >= 4.5,
      codeBackgroundIsDark: luminance(codeBackground) <= 0.04,
      codeBlockClipsRoundedBackground:
        codeBlockStyle?.overflow === "hidden" &&
        codeBlockRadius >= 8 &&
        Math.abs(codeBlockRadius - codeBlockPreRadius) <= 1,
      codeTokenContrastMin: Number(codeTokenContrastMin.toFixed(2)),
      codeTokenContrastIsReadable: codeTokenContrastMin >= 4.5,
      codeTokenDistinctColorCount,
      codeSyntaxHighlightingIsPreserved: codeTokenDistinctColorCount >= 3,
      tableBorderColor,
      visibleTableBorderColor,
      tableBorderContrastIsReadable:
        contrastRatio(visibleTableBorderColor, shellBackground) >= 3,
      settingsButtonContrastIsReadable:
        contrastRatio(settingsButtonColor, shellBackground) >= 4.5,
    };
  });
}

export async function expectAdaptiveTooltipPlacement(page, label, expectedPlacement) {
  await page.getByRole("button", { name: label }).hover();

  await expect(page.locator(".adaptive-tooltip")).toBeVisible();
  await expect.poll(async () =>
    await page.evaluate(() => {
      const tooltip = document.querySelector(".adaptive-tooltip");
      if (!tooltip) {
        return null;
      }

      const rect = tooltip.getBoundingClientRect();
      return {
        bottomInsideViewport: rect.bottom <= window.innerHeight - 1,
        leftInsideViewport: rect.left >= 1,
        placement: tooltip.getAttribute("data-placement"),
        rightInsideViewport: rect.right <= window.innerWidth - 1,
        topInsideViewport: rect.top >= 1,
      };
    }),
  ).toMatchObject({
    bottomInsideViewport: true,
    leftInsideViewport: true,
    placement: expectedPlacement,
    rightInsideViewport: true,
    topInsideViewport: true,
  });
}

export async function getHeaderHeight(page) {
  return await page.evaluate(() => {
    return document.querySelector("[data-testid='sticky-header']")
      ?.getBoundingClientRect().height;
  });
}

export async function expectActiveTabColor(page, property, expectedValue) {
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const activeTab = document.querySelector(".session-tab-row.active");
      return activeTab ? getComputedStyle(activeTab) : null;
    });
  }).not.toBeNull();

  await expect.poll(async () => {
    return await page.evaluate((styleProperty) => {
      const activeTab = document.querySelector(".session-tab-row.active");
      return getComputedStyle(activeTab)[styleProperty];
    }, property);
  }).toBe(expectedValue);
}

export async function getTabCssValue(page, tabIndex, property) {
  return await page.evaluate(
    ({ targetTabIndex, styleProperty }) => {
      const tab = document.querySelectorAll(".session-tab-row")[targetTabIndex];
      return getComputedStyle(tab)[styleProperty];
    },
    { targetTabIndex: tabIndex, styleProperty: property },
  );
}

export async function getSessionTabNoteIds(page) {
  return await page.evaluate(() =>
    [...document.querySelectorAll(".session-tab-row")]
      .map((row) => row.getAttribute("data-note-id"))
      .filter(Boolean),
  );
}

export async function getActiveSessionTabNoteId(page) {
  return await page.evaluate(() => {
    const activeTab = document.querySelector("[role='tab'][aria-selected='true']");
    return activeTab?.closest(".session-tab-row")?.getAttribute("data-note-id") ?? null;
  });
}

export async function expectSessionTabReorderAnimation(page) {
  const animatedRowCount = await page.evaluate(() =>
    new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve(document.querySelectorAll(".session-tab-row.is-reorder-animating").length);
        });
      });
    }),
  );
  expect(animatedRowCount).toBeGreaterThan(0);
  await expect(page.locator(".session-tab-row.is-reorder-animating")).toHaveCount(0);
}

export async function dragSessionTab(page, sourceIndex, targetIndex, placement = "after") {
  const rows = page.locator(".session-tab-row");
  await rows.nth(sourceIndex).locator(".session-tab-button").hover();
  await expect(page.locator(".adaptive-tooltip")).toBeVisible();

  const sourceBox = await rows.nth(sourceIndex).boundingBox();
  const targetBox = await rows.nth(targetIndex).boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("Could not measure session tabs for drag reorder.");
  }

  const targetY =
    placement === "before"
      ? targetBox.y + targetBox.height * 0.25
      : targetBox.y + targetBox.height * 0.75;

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await expect(page.locator(".adaptive-tooltip")).toHaveCount(0);
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetY,
    { steps: 8 },
  );
  await expectSessionTabReorderAnimation(page);
  await page.mouse.up();
}

export async function moveSessionToTrash(page, tabIndex) {
  await page.locator(".session-tab-row").nth(tabIndex).hover();
  await page.locator(".session-delete-button").nth(tabIndex).click();
  const moveConfirmDialog = page.getByRole("dialog", {
    name: "Move session to trash confirmation",
  });
  await expect(moveConfirmDialog).toBeVisible();
  await moveConfirmDialog.getByRole("button", { name: /Yes, move .* to trash/ })
    .click();
  await expect(moveConfirmDialog).toHaveCount(0);
}

export async function expectNewSessionButtonBelowLastTab(page) {
  await expect(page.locator(".session-tab-row.is-entering")).toHaveCount(0);

  const layout = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".session-tab-row")];
    const lastRow = rows.at(-1);
    const addButton = document.querySelector(".session-add-button");
    const sidebar = document.querySelector("[data-testid='session-sidebar']");

    if (!lastRow || !addButton || !sidebar) {
      return null;
    }

    const lastRowRect = lastRow.getBoundingClientRect();
    const addButtonRect = addButton.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();

    return {
      gapFromLastTab: Math.round(addButtonRect.top - lastRowRect.bottom),
      distanceFromSidebarBottom: Math.round(sidebarRect.bottom - addButtonRect.bottom),
    };
  });

  expect(layout).not.toBeNull();
  expect(layout.gapFromLastTab).toBeGreaterThanOrEqual(0);
  expect(layout.gapFromLastTab).toBeLessThanOrEqual(14);
  expect(layout.distanceFromSidebarBottom).toBeGreaterThan(160);
}

export async function clickLastEmptyParagraph(page) {
  const emptyParagraphs = page.getByRole("paragraph").filter({ hasText: /^$/ });
  await emptyParagraphs.last().scrollIntoViewIfNeeded();
  await emptyParagraphs.last().click();
}

export async function expectEditorFocused(page) {
  await expect.poll(async () =>
    await page.evaluate(() => {
      const activeElement = document.activeElement;
      return Boolean(activeElement?.closest?.(".bn-editor"));
    }),
  ).toBe(true);
}

export async function expectFocusedTableCellBorderToMatch(page, cell) {
  await expect.poll(async () => {
    return await cell.evaluate((element) => (
      getComputedStyle(element).boxShadow.includes("0px 0px 0px 2px")
    ));
  }).toBe(true);
}

export async function getBulletItemDepth(page, text) {
  return await page.evaluate((targetText) => {
    const content = [...document.querySelectorAll("[data-content-type='bulletListItem']")]
      .find((element) => element.textContent?.trim() === targetText);
    const outer = content?.closest(".bn-block-outer");
    let depth = 0;
    let current = outer?.parentElement;
    while (current) {
      if (current.classList?.contains("bn-block-group")) {
        depth += 1;
      }
      current = current.parentElement;
    }
    return depth;
  }, text);
}

export async function pastePlainText(page, text) {
  await pasteClipboardText(page, { plainText: text });
}

export async function pasteClipboardText(page, { plainText, html = "" }) {
  await page.evaluate((clipboardText) => {
    const editor = document.querySelector(".bn-editor");
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", clipboardText.plainText);
    if (clipboardText.html) {
      clipboardData.setData("text/html", clipboardText.html);
    }
    editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
  }, { plainText, html });
}

export async function getInlineStyledTextColor(page, text, styleType, value) {
  return await page.evaluate(({ text, styleType, value }) => {
    const styledElement = [...document.querySelectorAll(
      `[data-style-type='${styleType}'][data-value='${value}']`,
    )].find((element) => element.textContent === text);

    return styledElement ? getComputedStyle(styledElement).color : "";
  }, { styleType, text, value });
}

export async function getInlineStyledTextBackground(page, text, styleType, value) {
  return await page.evaluate(({ text, styleType, value }) => {
    const styledElement = [...document.querySelectorAll(
      `[data-style-type='${styleType}'][data-value='${value}']`,
    )].find((element) => element.textContent === text);

    return styledElement ? getComputedStyle(styledElement).backgroundColor : "";
  }, { styleType, text, value });
}

export async function getActionIconColors(page) {
  return await page.evaluate(() => {
    const readColor = (selector) => {
      const element = document.querySelector(selector);

      return element ? getComputedStyle(element).color : "";
    };

    return {
      export: readColor(
        "[data-testid='session-sidebar-footer'] .export-icon-button .notepane-action-icon",
      ),
      layout: readColor(
        "[data-testid='session-sidebar-footer'] .layout-mode-button .notepane-action-icon",
      ),
      sidebar: readColor(".sidebar-toggle .notepane-action-icon"),
      preferences: readColor(
        "[data-testid='session-sidebar-footer'] .settings-icon-button .notepane-action-icon",
      ),
      trash: readColor(
        "[data-testid='session-sidebar-footer'] .trash-icon-button .notepane-action-icon",
      ),
    };
  });
}

export async function getStickyHeaderActionChrome(page) {
  return await page.evaluate(() => {
    const actionList = document.querySelector(".sticky-header-action-list");
    const preview = document.querySelector(".sticky-header-action-preview");
    const previewIcon = preview?.querySelector(".notepane-action-icon");
    const previewPin = preview?.querySelector(".notepane-icon-pin");
    const actionListStyle = actionList ? getComputedStyle(actionList) : null;
    const previewStyle = preview ? getComputedStyle(preview) : null;
    const previewPinStyle = previewPin ? getComputedStyle(previewPin) : null;
    const header = document.querySelector("[data-testid='sticky-header']");

    return {
      actionListOpacity: actionListStyle?.opacity ?? "",
      actionListPointerEvents: actionListStyle?.pointerEvents ?? "",
      previewActionLabel: preview?.getAttribute("aria-label") ?? "",
      previewIconClass: previewIcon?.getAttribute("class") ?? "",
      previewOpacity: previewStyle?.opacity ?? "",
      previewRightGap:
        header && preview
          ? Math.round(
              header.getBoundingClientRect().right -
                preview.getBoundingClientRect().right,
            )
          : -1,
      previewWidth: preview ? Math.round(preview.getBoundingClientRect().width) : -1,
      previewPinCount: previewPin ? 1 : 0,
      previewPinFill: previewPinStyle?.fill ?? "",
      previewPinState: previewPin?.getAttribute("data-pin-state") ?? "",
    };
  });
}

export async function openStickyActionBar(page) {
  const actionToggle = page.locator(".sticky-header-action-preview");
  if ((await actionToggle.getAttribute("aria-expanded")) !== "true") {
    await actionToggle.click();
  }
  await expect(actionToggle).toHaveAttribute("aria-expanded", "true");
}

export function expectDistinctIconColors(iconColors) {
  expect(new Set(Object.values(iconColors)).size).toBe(Object.keys(iconColors).length);
  expect(iconColors.export).not.toBe(iconColors.trash);
  expect(iconColors.preferences).not.toBe(iconColors.export);
  expect(iconColors.layout).not.toBe(iconColors.sidebar);
}

export async function expectSystemSymbolIcons(page) {
  const iconAudit = await page.evaluate(() => {
    return [...document.querySelectorAll(".notepane-action-icon")].map((icon) => ({
      family: icon.getAttribute("data-icon-family"),
      pack: icon.getAttribute("data-icon-pack"),
      className: icon.getAttribute("class") ?? "",
      fill: getComputedStyle(icon).fill,
      strokeLinecap: getComputedStyle(icon).strokeLinecap,
      strokeLinejoin: getComputedStyle(icon).strokeLinejoin,
    }));
  });

  expect(iconAudit.length).toBeGreaterThanOrEqual(2);
  for (const icon of iconAudit) {
    expect(icon.family).toBe("system-symbol");
    expect(icon.pack).toBe("lucide");
    expect(icon.className).toContain("lucide");
    expect(icon.fill).toBe("none");
    expect(icon.strokeLinecap).toBe("round");
    expect(icon.strokeLinejoin).toBe("round");
  }
}

export async function expectFloatingTypographyMenu(page, ariaLabel, options = {}) {
  await expect.poll(async () => {
    return await page.evaluate(({ label, maxWidth }) => {
      const menu = document.querySelector(`[role='listbox'][aria-label='${label}']`);
      const editorSurface = document.querySelector("[data-testid='sticky-editor-surface']");
      if (!menu || !editorSurface) {
        return null;
      }

      const menuRect = menu.getBoundingClientRect();
      return {
        bottomInsideViewport: menuRect.bottom <= window.innerHeight,
        escapesEditorSurface: !editorSurface.contains(menu),
        leftInsideViewport: menuRect.left >= 0,
        parentTag: menu.parentElement?.tagName ?? "",
        position: getComputedStyle(menu).position,
        rightInsideViewport: menuRect.right <= window.innerWidth,
        topInsideViewport: menuRect.top >= 0,
        widthInsideLimit: maxWidth == null || menuRect.width <= maxWidth,
      };
    }, {
      label: ariaLabel,
      maxWidth: options.maxWidth ?? null,
    });
  }).toMatchObject({
    bottomInsideViewport: true,
    escapesEditorSurface: true,
    leftInsideViewport: true,
    parentTag: "BODY",
    position: "fixed",
    rightInsideViewport: true,
    topInsideViewport: true,
    widthInsideLimit: true,
  });
}

export async function expectBlockNoteFloatingMenuInsideViewport(
  page,
  selector,
  minimumHeight = 1,
  expectedPosition = "fixed",
) {
  await expect.poll(async () => {
    return await page.evaluate(({ menuSelector, minimumHeight }) => {
      const visibleMenu = [...document.querySelectorAll(menuSelector)].find((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0.01 &&
          rect.width > 0 &&
          rect.height > 0
        );
      });

      if (!visibleMenu) {
        return null;
      }

      const rect = visibleMenu.getBoundingClientRect();
      return {
        bottomInsideViewport: rect.bottom <= window.innerHeight,
        heightEnough: rect.height >= minimumHeight,
        height: Math.round(rect.height),
        leftInsideViewport: rect.left >= 0,
        position: getComputedStyle(visibleMenu).position,
        rightInsideViewport: rect.right <= window.innerWidth,
        topInsideViewport: rect.top >= 0,
      };
    }, { menuSelector: selector, minimumHeight });
  }).toMatchObject({
    bottomInsideViewport: true,
    heightEnough: true,
    leftInsideViewport: true,
    position: expectedPosition,
    rightInsideViewport: true,
    topInsideViewport: true,
  });
}

export async function getEditorScaleMetrics(page) {
  return await page.evaluate(() => {
    const shell = document.querySelector("[data-testid='sticky-shell']");
    const header = document.querySelector("[data-testid='sticky-header']");
    const sidebar = document.querySelector("[data-testid='session-sidebar']");
    const editorSurface = document.querySelector("[data-testid='sticky-editor-surface']");
    const editor = document.querySelector(".bn-editor");

    return {
      editorFontScale: getComputedStyle(shell)
        .getPropertyValue("--editor-font-scale")
        .trim() || "1",
      appFontFamily: getComputedStyle(shell)
        .getPropertyValue("--notepane-ui-font")
        .trim(),
      sidebarFontFamily: getComputedStyle(sidebar).fontFamily,
      editorFontFamily: getComputedStyle(editor).fontFamily,
      shellFontSize: Math.round(Number.parseFloat(getComputedStyle(shell).fontSize)),
      headerHeight: Math.round(header.getBoundingClientRect().height),
      sidebarWidth: Math.round(sidebar.getBoundingClientRect().width),
      editorFontSize: Math.round(Number.parseFloat(getComputedStyle(editor).fontSize) * 100) / 100,
      editorSurfaceFontSize: Math.round(Number.parseFloat(getComputedStyle(editorSurface).fontSize) * 100) / 100,
    };
  });
}

export async function loadTemplatePreview(page) {
  await page.goto("/?template=1");
  await expect(page.getByRole("heading", { name: "NotePane", exact: true }))
    .toBeVisible();
}

export async function createBlankSession(page) {
  await page.getByRole("button", { name: "New session" }).click();
  await chooseBlankSessionTemplate(page);
}

export async function chooseBlankSessionTemplate(page) {
  const templateDialog = page.getByRole("dialog", { name: "Create new session" });
  await expect(templateDialog).toHaveCount(0);
}

export async function expectEditorToBeFocused(page) {
  await expect.poll(() => page.evaluate(() => {
    return Boolean(document.activeElement?.closest(".bn-editor"));
  })).toBe(true);
}

export function modifierShortcut(key) {
  return `${process.platform === "darwin" ? "Meta" : "Control"}+${key}`;
}

export function modifierOptionShortcut(key) {
  return `${process.platform === "darwin" ? "Meta" : "Control"}+Alt+${key}`;
}
