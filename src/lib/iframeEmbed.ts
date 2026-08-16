export function iframeEmbedStatus(frame: HTMLIFrameElement): "embedded" | "blocked" {
  const win = frame.contentWindow;
  if (!win) {
    return "blocked";
  }
  try {
    const href = win.location.href;
    if (
      href === "about:blank" ||
      href.startsWith("chrome-error://") ||
      href.startsWith("about:neterror") ||
      href.startsWith("edge-error://")
    ) {
      return "blocked";
    }
    return "embedded";
  } catch {
    return "embedded";
  }
}

export function openExternalTab(href: string): boolean {
  const opened = window.open(href, "_blank", "noopener,noreferrer");
  return opened !== null;
}
