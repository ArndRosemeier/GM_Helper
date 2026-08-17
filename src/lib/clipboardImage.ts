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

export function clipboardReadSupported(): boolean {
  return typeof navigator.clipboard?.read === "function";
}
