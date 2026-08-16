export function parseEntityUrl(value: string): URL {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("URL is empty");
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`Not a URL: ${trimmed}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL must be http or https");
  }
  return url;
}

export function titleFromEntityUrl(url: URL): string {
  const parts = url.pathname.split("/").filter((part) => part.length > 0);
  const last = parts[parts.length - 1];
  if (!last) {
    return url.hostname;
  }
  const cleaned = decodeURIComponent(last)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_+]+/g, " ")
    .trim();
  if (cleaned.length === 0) {
    return url.hostname;
  }
  return `${cleaned} (${url.hostname})`;
}
