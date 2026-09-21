import {
  size,
} from "@floating-ui/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  hsvToHex,
  hsvToRgb,
} from "../style/colorMath.js";
import {
  clamp,
} from "../utils/values.js";

export function ColorWheel({ hsv, ariaLabel, onChange }) {
  const wheelRef = useRef(null);
  const canvasRef = useRef(null);
  const isDraggingRef = useRef(false);
  const thumb = useMemo(() => {
    const angle = (hsv.h * Math.PI) / 180;
    const radius = hsv.s * 50;
    return {
      x: 50 + Math.sin(angle) * radius,
      y: 50 - Math.cos(angle) * radius,
    };
  }, [hsv.h, hsv.s]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const size = 320;
    const center = size / 2;
    const radius = center - 1;
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d", { willReadFrequently: false });
    const image = context.createImageData(size, size);

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const deltaX = x - center;
        const deltaY = y - center;
        const distance = Math.hypot(deltaX, deltaY);
        const index = (y * size + x) * 4;

        if (distance > radius) {
          image.data[index + 3] = 0;
          continue;
        }

        const saturation = clamp(distance / radius, 0, 1, 0);
        const hue = ((Math.atan2(deltaX, -deltaY) * 180) / Math.PI + 360) % 360;
        const [red, green, blue] = hsvToRgb(hue, saturation, 1);
        image.data[index] = red;
        image.data[index + 1] = green;
        image.data[index + 2] = blue;
        image.data[index + 3] = 255;
      }
    }

    context.putImageData(image, 0, 0);
  }, []);

  const updateFromPointer = useCallback(
    (event) => {
      const rect = wheelRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = event.clientX - centerX;
      const deltaY = event.clientY - centerY;
      const radius = rect.width / 2;
      const saturation = clamp(Math.hypot(deltaX, deltaY) / radius, 0, 1, 0);
      const hue = (Math.atan2(deltaX, -deltaY) * 180) / Math.PI;

      onChange({
        h: (hue + 360) % 360,
        s: saturation,
      });
    },
    [onChange],
  );

  const startDrag = useCallback(
    (event) => {
      event.preventDefault();
      isDraggingRef.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      updateFromPointer(event);
    },
    [updateFromPointer],
  );

  const moveDrag = useCallback(
    (event) => {
      if (!isDraggingRef.current) {
        return;
      }
      updateFromPointer(event);
    },
    [updateFromPointer],
  );

  const stopDrag = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const nudgeHue = useCallback(
    (delta) => {
      onChange({ h: (hsv.h + delta + 360) % 360 });
    },
    [hsv.h, onChange],
  );

  return (
    <div
      ref={wheelRef}
      className="color-wheel"
      role="slider"
      aria-label={ariaLabel}
      aria-valuetext={hsvToHex(hsv.h, hsv.s, hsv.v)}
      tabIndex={0}
      style={{
        "--wheel-color": hsvToHex(hsv.h, hsv.s, hsv.v),
        "--wheel-thumb-x": `${thumb.x}%`,
        "--wheel-thumb-y": `${thumb.y}%`,
      }}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          nudgeHue(8);
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          nudgeHue(-8);
        }
      }}
    >
      <canvas ref={canvasRef} className="color-wheel-canvas" aria-hidden="true" />
      <span className="color-wheel-crosshair" />
      <span className="color-wheel-thumb" />
    </div>
  );
}
