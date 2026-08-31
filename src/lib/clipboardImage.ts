import { isImageFileLike, normalizeImageBlob } from "./imagePng";

const CLIPBOARD_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;

function isImageMime(type: string): boolean {
  const lower = type.toLowerCase();
  return lower.startsWith("image/") && lower !== "image/svg+xml";
}

/** Image from a paste event. iOS Safari fills this when Photos is copied, even if clipboard.read is empty. */
export function imageFromPasteEvent(event: { clipboardData: DataTransfer | null }): File | Blob | null {
  const data = event.clipboardData;
  if (!data) {
    return null;
  }
  for (const file of Array.from(data.files)) {
    if (isImageFileLike(file, file.name)) {
      return file;
    }
  }
  for (const item of Array.from(data.items)) {
    if (item.kind !== "file") {
      continue;
    }
    if (!isImageMime(item.type) && item.type.length > 0) {
      continue;
    }
    const file = item.getAsFile();
    if (file && isImageFileLike(file, file.name)) {
      return file;
    }
  }
  return null;
}

/** Read an image from the clipboard. Must run from a user gesture on iOS Safari. */
export async function readClipboardImage(): Promise<Blob> {
  if (!navigator.clipboard?.read) {
    throw new Error("Paste onto the card, or use Add image");
  }
  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch {
    throw new Error("Could not read the clipboard. On iPad, paste onto the card or use Add image");
  }
  for (const item of items) {
    const types: string[] = [];
    for (const type of item.types) {
      if (isImageMime(type)) {
        types.push(type);
      }
    }
    for (const type of CLIPBOARD_IMAGE_TYPES) {
      if (!types.includes(type)) {
        types.push(type);
      }
    }
    for (const type of types) {
      try {
        const blob = await item.getType(type);
        return await normalizeImageBlob(blob);
      } catch {
        // Try the next type. iOS often lists image/png but serves jpeg, or the reverse.
      }
    }
  }
  throw new Error("Clipboard has no image. On iPad, paste onto the card or use Add image");
}

/** Copy an image to the clipboard. Must run from a user gesture on iOS Safari. */
export async function writeClipboardImage(blob: Blob): Promise<void> {
  if (!clipboardWriteSupported()) {
    throw new Error("This browser cannot copy images to the clipboard");
  }
  const png = blob.type === "image/png" ? blob : new Blob([blob], { type: "image/png" });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

export function clipboardReadSupported(): boolean {
  return typeof navigator.clipboard?.read === "function";
}

export function clipboardWriteSupported(): boolean {
  return typeof navigator.clipboard?.write === "function" && typeof ClipboardItem !== "undefined";
}
