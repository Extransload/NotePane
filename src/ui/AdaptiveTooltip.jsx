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
  clamp,
} from "../utils/values.js";

export function AdaptiveTooltipPortal() {
  const [tooltip, setTooltip] = useState(null);
  const targetRef = useRef(null);
  const isPointerDownRef = useRef(false);

  const showTooltip = useCallback((target) => {
    if (isPointerDownRef.current) {
      return;
    }

    const text = target?.getAttribute?.("data-tooltip")?.trim();
    if (!text) {
      return;
    }

    targetRef.current = target;
    setTooltip({ target, text });
  }, []);

  const hideTooltip = useCallback((target) => {
    if (target && targetRef.current !== target) {
      return;
    }

    targetRef.current = null;
    setTooltip(null);
  }, []);

  useEffect(() => {
    const handlePointerOver = (event) => {
      if (isPointerDownRef.current) {
        return;
      }

      const target = getTooltipTarget(event.target);
      if (!target) {
        return;
      }

      if (
        event.relatedTarget instanceof Node &&
        target.contains(event.relatedTarget)
      ) {
        return;
      }

      showTooltip(target);
    };

    const handlePointerOut = (event) => {
      const target = getTooltipTarget(event.target);
      if (!target) {
        return;
      }

      if (
        event.relatedTarget instanceof Node &&
        target.contains(event.relatedTarget)
      ) {
        return;
      }

      hideTooltip(target);
    };

    const handleFocusIn = (event) => {
      if (isPointerDownRef.current) {
        return;
      }

      const target = getTooltipTarget(event.target);
      if (target) {
        showTooltip(target);
      }
    };

    const handleFocusOut = (event) => {
      const target = getTooltipTarget(event.target);
      if (target) {
        hideTooltip(target);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        hideTooltip();
      }
    };

    const handlePointerDown = () => {
      isPointerDownRef.current = true;
      hideTooltip();
    };

    const handlePointerUp = () => {
      isPointerDownRef.current = false;
    };

    const handleDragStart = () => {
      isPointerDownRef.current = true;
      hideTooltip();
    };

    const handleDragEnd = () => {
      isPointerDownRef.current = false;
      hideTooltip();
    };

    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointercancel", handleDragEnd, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("dragstart", handleDragStart, true);
    document.addEventListener("dragend", handleDragEnd, true);
    document.addEventListener("drop", handleDragEnd, true);

    return () => {
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", handleDragEnd, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("dragstart", handleDragStart, true);
      document.removeEventListener("dragend", handleDragEnd, true);
      document.removeEventListener("drop", handleDragEnd, true);
    };
  }, [hideTooltip, showTooltip]);

  if (!tooltip || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AdaptiveTooltip target={tooltip.target} text={tooltip.text} />,
    document.body,
  );
}

export function AdaptiveTooltip({ target, text }) {
  const tooltipRef = useRef(null);
  const [style, setStyle] = useState({
    left: 0,
    top: 0,
    visibility: "hidden",
  });
  const { placement, ...positionStyle } = style;

  const updatePosition = useCallback(() => {
    const tooltipElement = tooltipRef.current;
    if (!tooltipElement || !target || !document.documentElement.contains(target)) {
      return;
    }

    const anchorRect = target.getBoundingClientRect();
    const tooltipRect = tooltipElement.getBoundingClientRect();
    setStyle(
      getAdaptiveTooltipStyle(anchorRect, {
        width: tooltipRect.width,
        height: tooltipRect.height,
      }),
    );
  }, [target]);

  useLayoutEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition, text]);

  return (
    <div
      ref={tooltipRef}
      className="adaptive-tooltip"
      data-placement={placement}
      role="tooltip"
      style={positionStyle}
    >
      {text}
    </div>
  );
}

export function getTooltipTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest(".has-tooltip[data-tooltip]");
}

export const ADAPTIVE_TOOLTIP_MARGIN = 8;

export const ADAPTIVE_TOOLTIP_GAP = 8;

export function getAdaptiveTooltipStyle(anchorRect, tooltipSize) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.max(1, tooltipSize.width);
  const height = Math.max(1, tooltipSize.height);
  const margin = ADAPTIVE_TOOLTIP_MARGIN;
  const gap = ADAPTIVE_TOOLTIP_GAP;
  const centeredLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
  const clampLeft = (left) =>
    clamp(left, margin, Math.max(margin, viewportWidth - width - margin));
  const clampTop = (top) =>
    clamp(top, margin, Math.max(margin, viewportHeight - height - margin));
  const verticalCandidates = [
    {
      placement: "bottom",
      left: clampLeft(centeredLeft),
      top: anchorRect.bottom + gap,
    },
    {
      placement: "top",
      left: clampLeft(centeredLeft),
      top: anchorRect.top - height - gap,
    },
  ];
  const selectedVertical = verticalCandidates.find(
    (candidate) =>
      candidate.top >= margin &&
      candidate.top + height <= viewportHeight - margin,
  );
  const sidePlacement =
    anchorRect.left + anchorRect.width / 2 < viewportWidth / 2
      ? "right"
      : "left";
  const sideLeft =
    sidePlacement === "right"
      ? anchorRect.right + gap
      : anchorRect.left - width - gap;
  const selected =
    selectedVertical ?? {
      placement: sidePlacement,
      left: clampLeft(sideLeft),
      top: clampTop(anchorRect.top + anchorRect.height / 2 - height / 2),
    };

  return {
    left: `${selected.left}px`,
    top: `${clampTop(selected.top)}px`,
    placement: selected.placement,
    visibility: "visible",
  };
}
