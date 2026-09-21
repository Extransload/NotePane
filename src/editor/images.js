import {
  DEFAULT_CROP,
  MIN_CROP_SIZE,
} from "../constants.js";
import {
  clamp,
} from "../utils/values.js";

export function urlsMatch(left, right) {
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  try {
    return new URL(left, window.location.href).href === new URL(right, window.location.href).href;
  } catch {
    return false;
  }
}

export function imageFileName(name, url) {
  const fallbackExtension = extensionFromSource(url);
  const sourceName =
    name ||
    (() => {
      try {
        const pathname = new URL(url, window.location.href).pathname;
        return decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
      } catch {
        return "";
      }
    })() ||
    `image.${fallbackExtension}`;

  const sanitized = sourceName
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return /\.[a-z0-9]{2,5}$/i.test(sanitized)
    ? sanitized
    : `${sanitized || "image"}.${fallbackExtension}`;
}

export function ensurePngName(name) {
  return name.replace(/\.[a-z0-9]{2,5}$/i, "") + ".png";
}

export function extensionFromSource(source) {
  if (/^data:image\/jpeg/i.test(source)) {
    return "jpg";
  }
  if (/^data:image\/gif/i.test(source)) {
    return "gif";
  }
  if (/^data:image\/webp/i.test(source)) {
    return "webp";
  }
  if (/\.(jpe?g)(?:[?#]|$)/i.test(source)) {
    return "jpg";
  }
  if (/\.(gif)(?:[?#]|$)/i.test(source)) {
    return "gif";
  }
  if (/\.(webp)(?:[?#]|$)/i.test(source)) {
    return "webp";
  }
  return "png";
}

export function downloadInBrowser(url, fileName) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function preventFocusLoss(event) {
  event.preventDefault();
}

export function getStoredImageCrop(props = {}) {
  const crop = {
    x: props.cropX,
    y: props.cropY,
    width: props.cropWidth,
    height: props.cropHeight,
  };
  return Object.values(crop).every(Number.isFinite)
    ? normalizeCrop(crop)
    : { ...DEFAULT_CROP };
}

export function normalizeCrop(crop = DEFAULT_CROP) {
  const x = clamp(Number(crop.x), 0, 1 - MIN_CROP_SIZE, DEFAULT_CROP.x);
  const y = clamp(Number(crop.y), 0, 1 - MIN_CROP_SIZE, DEFAULT_CROP.y);
  const width = clamp(
    Number(crop.width),
    MIN_CROP_SIZE,
    1 - x,
    DEFAULT_CROP.width,
  );
  const height = clamp(
    Number(crop.height),
    MIN_CROP_SIZE,
    1 - y,
    DEFAULT_CROP.height,
  );
  return { x, y, width, height };
}

export function resizeCrop({ crop, handle }, point) {
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.width;
  let bottom = crop.y + crop.height;

  if (handle.includes("w")) {
    left = clamp(point.x, 0, right - MIN_CROP_SIZE, left);
  }
  if (handle.includes("e")) {
    right = clamp(point.x, left + MIN_CROP_SIZE, 1, right);
  }
  if (handle.includes("n")) {
    top = clamp(point.y, 0, bottom - MIN_CROP_SIZE, top);
  }
  if (handle.includes("s")) {
    bottom = clamp(point.y, top + MIN_CROP_SIZE, 1, bottom);
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function moveCrop({ crop, point: startPoint }, point) {
  return {
    ...crop,
    x: clamp(point.x - startPoint.x + crop.x, 0, 1 - crop.width, crop.x),
    y: clamp(point.y - startPoint.y + crop.y, 0, 1 - crop.height, crop.y),
  };
}

export function getImagePoint(event, image) {
  if (!image) {
    return null;
  }

  const rect = image.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1, 0),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1, 0),
  };
}

export async function cropImageToPng(image, crop) {
  await waitForImage(image);

  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const sx = Math.floor(crop.x * sourceWidth);
  const sy = Math.floor(crop.y * sourceHeight);
  const sw = Math.max(1, Math.floor(crop.width * sourceWidth));
  const sh = Math.max(1, Math.floor(crop.height * sourceHeight));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext("2d");
  context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL("image/png");
}

export function waitForImage(image) {
  if (!image) {
    return Promise.reject(new Error("No image selected."));
  }

  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error("Image could not be loaded for cropping.")),
      { once: true },
    );
  });
}

export function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Could not read selected file."));
    });
    reader.readAsDataURL(file);
  });
}
