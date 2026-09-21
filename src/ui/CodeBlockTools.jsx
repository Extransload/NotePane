import {
  Check,
  Copy,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  findBlockById,
} from "../editor/blocks.js";
import {
  formatCodeForLanguage,
  getCodeBlockText,
  getCodeFormatter,
  getCodeLanguageLabel,
  normalizeCodeLanguage,
} from "../editor/codeFormatting.js";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  writeClipboardText,
} from "../style/colorMath.js";

export function CodeBlockTools({ editor, blockId, targetElement }) {
  const [copyStatus, setCopyStatus] = useState("idle");
  const [formatStatus, setFormatStatus] = useState("idle");
  const [position, setPosition] = useState(null);
  const copyResetTimerRef = useRef(null);
  const formatResetTimerRef = useRef(null);
  const block = findBlockById(editor.document, blockId);
  const language = normalizeCodeLanguage(block?.props?.language);
  const languageLabel = getCodeLanguageLabel(language);
  const code = getCodeBlockText(block);
  const canPrettify = Boolean(code.trim() && getCodeFormatter(language));

  useLayoutEffect(() => {
    const editorSurface = targetElement?.closest(
      "[data-testid='sticky-editor-surface']",
    );
    if (!editorSurface) {
      return undefined;
    }

    const updatePosition = () => {
      const blockRect = targetElement.getBoundingClientRect();
      const surfaceRect = editorSurface.getBoundingClientRect();
      const nextPosition = {
        top: blockRect.top - surfaceRect.top + editorSurface.scrollTop + 8,
        left: blockRect.right - surfaceRect.left + editorSurface.scrollLeft - 9,
      };
      setPosition((currentPosition) =>
        currentPosition &&
        Math.abs(currentPosition.top - nextPosition.top) < 0.5 &&
        Math.abs(currentPosition.left - nextPosition.left) < 0.5
          ? currentPosition
          : nextPosition,
      );
    };

    updatePosition();
    const editorDocument = targetElement.closest(".bn-editor");
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(targetElement);
    resizeObserver.observe(editorSurface);
    if (editorDocument) {
      resizeObserver.observe(editorDocument);
    }
    const layoutObserver = new MutationObserver(updatePosition);
    if (editorDocument) {
      layoutObserver.observe(editorDocument, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    window.addEventListener("resize", updatePosition);
    return () => {
      resizeObserver.disconnect();
      layoutObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [targetElement]);

  useEffect(() => () => {
    if (copyResetTimerRef.current) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    if (formatResetTimerRef.current) {
      window.clearTimeout(formatResetTimerRef.current);
    }
  }, []);

  const scheduleStatusReset = (timerRef, setter) => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => setter("idle"), 1600);
  };

  const copyCode = async () => {
    const currentBlock = findBlockById(editor.document, blockId);
    const copied = await writeClipboardText(getCodeBlockText(currentBlock));
    setCopyStatus(copied ? "success" : "error");
    scheduleStatusReset(copyResetTimerRef, setCopyStatus);
  };

  const prettifyCodeBlock = async () => {
    const currentBlock = findBlockById(editor.document, blockId);
    const currentLanguage = normalizeCodeLanguage(currentBlock?.props?.language);
    const code = getCodeBlockText(currentBlock);
    if (!currentBlock || !code.trim() || !getCodeFormatter(currentLanguage)) {
      return;
    }

    setFormatStatus("working");
    try {
      const formattedCode = await formatCodeForLanguage(code, currentLanguage);
      if (formattedCode !== code) {
        editor.updateBlock(blockId, { content: formattedCode });
        setFormatStatus("success");
      } else {
        setFormatStatus("unchanged");
      }
    } catch {
      setFormatStatus("error");
    }
    scheduleStatusReset(formatResetTimerRef, setFormatStatus);
  };

  const formatLabel = !getCodeFormatter(language)
    ? `Prettify unavailable for ${languageLabel}`
    : formatStatus === "working"
      ? `Prettifying ${languageLabel} code`
      : formatStatus === "success"
        ? `${languageLabel} code prettified`
        : formatStatus === "unchanged"
          ? `${languageLabel} code is already formatted`
        : formatStatus === "error"
          ? `Could not prettify ${languageLabel} code`
          : `Prettify ${languageLabel} code`;
  const formatButtonText = formatStatus === "working"
    ? "Formatting…"
    : formatStatus === "success"
      ? "Formatted"
      : formatStatus === "unchanged"
        ? "Already formatted"
        : formatStatus === "error"
          ? "Failed"
          : "Prettify";
  const copyLabel = copyStatus === "success"
    ? `${languageLabel} code copied`
    : copyStatus === "error"
      ? `Could not copy ${languageLabel} code`
      : `Copy ${languageLabel} code`;

  return (
    <div
      className="code-block-tools"
      role="toolbar"
      aria-label={`${languageLabel} code block actions`}
      contentEditable={false}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
    >
      <button
        type="button"
        className={`code-block-tool-button code-block-prettify-button is-${formatStatus}`}
        aria-label={formatLabel}
        data-tooltip={formatLabel}
        title={!getCodeFormatter(language) ? formatLabel : undefined}
        disabled={!canPrettify || formatStatus === "working"}
        onMouseDown={preventFocusLoss}
        onClick={() => void prettifyCodeBlock()}
      >
        {formatButtonText}
      </button>
      <button
        type="button"
        className={`code-block-tool-button code-block-copy-button is-${copyStatus}`}
        aria-label={copyLabel}
        data-tooltip={copyLabel}
        onMouseDown={preventFocusLoss}
        onClick={() => void copyCode()}
      >
        {copyStatus === "success" ? (
          <Check aria-hidden="true" />
        ) : copyStatus === "error" ? (
          <X aria-hidden="true" />
        ) : (
          <Copy aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export function useCodeBlockToolTargets() {
  const [targets, setTargets] = useState([]);

  useLayoutEffect(() => {
    const editorSurface = document.querySelector(
      "[data-testid='sticky-editor-surface']",
    );
    if (!editorSurface) {
      return undefined;
    }

    let animationFrame = null;
    const syncTargets = () => {
      animationFrame = null;
      const nextTargets = [...editorSurface.querySelectorAll(
        ".bn-block-content[data-content-type='codeBlock']",
      )].flatMap((element) => {
        const blockId = element.closest(".bn-block-outer[data-id]")?.dataset.id;
        return blockId ? [{ blockId, element }] : [];
      });

      setTargets((currentTargets) => {
        const unchanged =
          currentTargets.length === nextTargets.length &&
          currentTargets.every(
            (target, index) =>
              target.blockId === nextTargets[index].blockId &&
              target.element === nextTargets[index].element,
          );
        return unchanged ? currentTargets : nextTargets;
      });
    };
    const scheduleSync = () => {
      if (animationFrame !== null) {
        return;
      }
      animationFrame = window.requestAnimationFrame(syncTargets);
    };

    syncTargets();
    const observer = new MutationObserver(scheduleSync);
    observer.observe(editorSurface, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, []);

  return targets;
}
