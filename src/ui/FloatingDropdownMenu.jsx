import {
  Check,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  createPortal,
} from "react-dom";
import {
  FLOATING_EDITOR_MENU_GAP,
  FLOATING_EDITOR_MENU_MARGIN,
} from "../editor/floatingMenus.js";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  clamp,
} from "../utils/values.js";

export function FloatingDropdownMenu({
  anchorRef,
  ariaLabel,
  children,
  className = "",
  id,
  isOpen,
  maxHeight = 220,
  maxWidth = 260,
  minWidth = 120,
  onRequestClose,
  preferredWidth = 180,
  align = "start",
}) {
  const [style, setStyle] = useState(null);
  const menuRef = useRef(null);

  const updatePosition = useCallback(() => {
    const anchorElement = anchorRef.current;
    if (!isOpen || !anchorElement) {
      setStyle(null);
      return;
    }

    setStyle(
      getFloatingDropdownMenuStyle(anchorElement, {
        align,
        maxHeight,
        maxWidth,
        minWidth,
        preferredWidth,
      }),
    );
  }, [
    align,
    anchorRef,
    isOpen,
    maxHeight,
    maxWidth,
    minWidth,
    preferredWidth,
  ]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setStyle(null);
      return undefined;
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen || !onRequestClose) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        menuRef.current?.contains(target) ||
        anchorRef.current?.contains(target)
      ) {
        return;
      }

      onRequestClose();
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onRequestClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [anchorRef, isOpen, onRequestClose]);

  if (!isOpen || !style || typeof document === "undefined") {
    return null;
  }
  const { placement, ...positionStyle } = style;

  return createPortal(
    <div
      ref={menuRef}
      id={id}
      className={`notepane-dropdown-menu ${className} editor-floating-menu`.trim()}
      role="listbox"
      aria-label={ariaLabel}
      data-placement={placement}
      style={positionStyle}
      onMouseDown={preventFocusLoss}
    >
      {children}
    </div>,
    document.body,
  );
}

export function DropdownMenuOption({
  children,
  className = "",
  meta = null,
  selected = false,
  style,
  onClick,
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected ? "true" : "false"}
      className={`notepane-dropdown-option ${className}`.trim()}
      style={style}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={onClick}
    >
      <span className="notepane-dropdown-option-check" aria-hidden="true">
        {selected && <Check className="notepane-action-icon" />}
      </span>
      <span className="notepane-dropdown-option-label">{children}</span>
      {meta && <span className="notepane-dropdown-option-meta">{meta}</span>}
    </button>
  );
}

export function getFloatingDropdownMenuStyle(
  anchorElement,
  { align, maxHeight, maxWidth, minWidth, preferredWidth },
) {
  const anchorRect = anchorElement.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = FLOATING_EDITOR_MENU_MARGIN;
  const viewportAvailableWidth = Math.max(1, viewportWidth - margin * 2);
  const resolvedMaxWidth = clamp(maxWidth, 1, viewportAvailableWidth);
  const resolvedMinWidth = Math.min(
    resolvedMaxWidth,
    Math.max(1, minWidth, anchorRect.width),
  );
  const width = clamp(preferredWidth, resolvedMinWidth, resolvedMaxWidth);
  const spaceBelow = viewportHeight - anchorRect.bottom - margin;
  const spaceAbove = anchorRect.top - margin;
  const shouldOpenAbove =
    spaceBelow < Math.min(maxHeight, 132) && spaceAbove > spaceBelow;
  const availableHeight = shouldOpenAbove ? spaceAbove : spaceBelow;
  const height = Math.max(72, Math.min(maxHeight, availableHeight));
  const rawLeft =
    align === "end"
      ? anchorRect.right - width
      : align === "center"
        ? anchorRect.left + anchorRect.width / 2 - width / 2
        : anchorRect.left;
  const left = clamp(
    rawLeft,
    margin,
    Math.max(margin, viewportWidth - width - margin),
  );
  const top = shouldOpenAbove
    ? clamp(
        anchorRect.top - height - FLOATING_EDITOR_MENU_GAP,
        margin,
        Math.max(margin, viewportHeight - height - margin),
      )
    : clamp(
        anchorRect.bottom + FLOATING_EDITOR_MENU_GAP,
        margin,
        Math.max(margin, viewportHeight - height - margin),
      );

  return {
    left: `${left}px`,
    maxHeight: `${height}px`,
    placement: shouldOpenAbove ? "top" : "bottom",
    top: `${top}px`,
    width: `${width}px`,
  };
}
