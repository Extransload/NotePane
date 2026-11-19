import {
  Check,
  ChevronDown,
  Copy,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  useBlockToolPosition,
  useBlockToolTargets,
  useHovered,
} from "../hooks/useBlockTools.js";
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
  rememberCodeLanguage,
} from "../editor/codeLanguages.js";
import {
  writeClipboardText,
} from "../style/colorMath.js";
import { CodeLanguageMenu } from "./CodeLanguageMenu.jsx";

export function CodeBlockTools({ editor, blockId, targetElement }) {
  const [copyStatus, setCopyStatus] = useState("idle");
  const [formatStatus, setFormatStatus] = useState("idle");
  const [isLanguageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [isToolbarHovered, setToolbarHovered] = useState(false);
  const position = useBlockToolPosition(targetElement);
  const isBlockHovered = useHovered(targetElement);
  const toolbarRef = useRef(null);
  const copyResetTimerRef = useRef(null);
  const formatResetTimerRef = useRef(null);
  const block = findBlockById(editor.document, blockId);
  const language = normalizeCodeLanguage(block?.props?.language);
  const languageLabel = getCodeLanguageLabel(language);
  const code = getCodeBlockText(block);
  const hasFormatter = Boolean(getCodeFormatter(language));

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

  const closeLanguageMenu = useCallback(({ returnFocus = false } = {}) => {
    setLanguageMenuOpen(false);
    if (returnFocus) {
      editor.focus();
    }
  }, [editor]);

  const pickLanguage = (nextLanguage) => {
    rememberCodeLanguage(nextLanguage);
    setLanguageMenuOpen(false);
    if (findBlockById(editor.document, blockId)?.props?.language !== nextLanguage) {
      editor.updateBlock(blockId, { props: { language: nextLanguage } });
    }
    editor.focus();
  };

  const formatLabel = formatStatus === "working"
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
      ref={toolbarRef}
      className={`code-block-tools${isLanguageMenuOpen ? " is-menu-open" : ""}`}
      role="toolbar"
      aria-label={`${languageLabel} code block actions`}
      data-shown={isBlockHovered || isToolbarHovered || isLanguageMenuOpen ? "true" : undefined}
      contentEditable={false}
      onPointerEnter={() => setToolbarHovered(true)}
      onPointerLeave={() => setToolbarHovered(false)}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
    >
      <button
        type="button"
        className="code-block-tool-button code-block-language-button"
        aria-label={`Code language: ${languageLabel}`}
        aria-haspopup="dialog"
        aria-expanded={isLanguageMenuOpen}
        onMouseDown={preventFocusLoss}
        onClick={() => setLanguageMenuOpen((isOpen) => !isOpen)}
      >
        <span>{languageLabel}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {hasFormatter ? (
        <button
          type="button"
          className={`code-block-tool-button code-block-prettify-button is-${formatStatus}`}
          aria-label={formatLabel}
          data-tooltip={formatLabel}
          disabled={!code.trim() || formatStatus === "working"}
          onMouseDown={preventFocusLoss}
          onClick={() => void prettifyCodeBlock()}
        >
          {formatButtonText}
        </button>
      ) : null}
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
      {isLanguageMenuOpen ? (
        <CodeLanguageMenu
          language={language}
          toolbarRef={toolbarRef}
          onPick={pickLanguage}
          onClose={closeLanguageMenu}
        />
      ) : null}
    </div>
  );
}

const CODE_BLOCK_TYPES = ["codeBlock"];

export function useCodeBlockToolTargets() {
  return useBlockToolTargets(CODE_BLOCK_TYPES);
}
