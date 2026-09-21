import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  CROP_RESIZE_HANDLES,
} from "../constants.js";
import {
  cropImageToPng,
  getImagePoint,
  moveCrop,
  normalizeCrop,
  resizeCrop,
} from "../editor/images.js";

export function CropDialog({ sourceUrl, initialCrop, onApply, onClose }) {
  const imageRef = useRef(null);
  const cropInteractionRef = useRef(null);
  const [crop, setCrop] = useState(() => normalizeCrop(initialCrop));
  const [error, setError] = useState("");

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const startResize = useCallback((event, handle) => {
    const point = getImagePoint(event, imageRef.current);
    if (!point) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    cropInteractionRef.current = { crop, handle, mode: "resize", point };
  }, [crop]);

  const startMove = useCallback((event) => {
    const point = getImagePoint(event, imageRef.current);
    if (!point) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    cropInteractionRef.current = { crop, mode: "move", point };
  }, [crop]);

  const updateCropInteraction = useCallback((event) => {
    const interaction = cropInteractionRef.current;
    if (!interaction) {
      return;
    }

    const point = getImagePoint(event, imageRef.current);
    if (!point) {
      return;
    }

    setCrop(
      interaction.mode === "move"
        ? moveCrop(interaction, point)
        : resizeCrop(interaction, point),
    );
  }, []);

  const stopCropInteraction = useCallback(() => {
    cropInteractionRef.current = null;
  }, []);

  const applySelectedCrop = useCallback(async () => {
    setError("");
    try {
      const croppedDataUrl = await cropImageToPng(imageRef.current, crop);
      onApply(croppedDataUrl, crop);
    } catch (error) {
      setError(
        error.message ||
          "Crop failed. If this is an external image, download and re-upload it first.",
      );
    }
  }, [crop, onApply]);

  return (
    <div className="crop-dialog" role="dialog" aria-label="Crop image">
      <div className="crop-panel">
        <div
          className="crop-image-frame"
        >
          <div
            className="crop-image-canvas"
          >
            <img
              ref={imageRef}
              src={sourceUrl}
              crossOrigin="anonymous"
              alt=""
              draggable={false}
            />
            <div
              className="crop-selection"
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.width * 100}%`,
                height: `${crop.height * 100}%`,
              }}
              onPointerDown={startMove}
              onPointerMove={updateCropInteraction}
              onPointerUp={stopCropInteraction}
              onPointerCancel={stopCropInteraction}
            >
              {CROP_RESIZE_HANDLES.map((handle) => (
                <button
                  key={handle.id}
                  type="button"
                  className="crop-resize-handle"
                  data-handle={handle.id}
                  aria-label={`Resize crop from ${handle.label}`}
                  onPointerDown={(event) => startResize(event, handle.id)}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="crop-actions">
          <span>Drag the grid to move it, or an edge or corner to resize.</span>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={() => void applySelectedCrop()}>
            Apply crop
          </button>
        </div>
        {error && <div className="crop-error">{error}</div>}
      </div>
    </div>
  );
}
