import { useEffect, useState } from "react";

/** True when the clipboard currently holds an image the Clipboard API can read. */
export function useClipboardHasImage(active: boolean): boolean {
  const [hasImage, setHasImage] = useState(false);

  useEffect(() => {
    if (!active) {
      setHasImage(false);
      return;
    }

    let cancelled = false;

    const refresh = (): void => {
      void clipboardHasImage().then((next) => {
        if (!cancelled) {
          setHasImage(next);
        }
      });
    };

    refresh();
    const onFocus = (): void => {
      refresh();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(refresh, 1500);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [active]);

  return hasImage;
}

export async function clipboardHasImage(): Promise<boolean> {
  if (!navigator.clipboard?.read) {
    return false;
  }
  try {
    const items = await navigator.clipboard.read();
    return items.some((item) => item.types.some((type) => type.startsWith("image/")));
  } catch {
    return false;
  }
}

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
