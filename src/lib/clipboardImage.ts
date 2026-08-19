/** Read an image from the clipboard. Must run from a user gesture on iOS Safari. */
export async function readClipboardImage(): Promise<Blob> {
  if (!navigator.clipboard?.read) {
    throw new Error("This browser cannot read the clipboard");
  }
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((entry) => entry.startsWith("image/"));
    if (type) {
      return item.getType(type);
    }
  }
  throw new Error("Clipboard has no image");
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
