/** Safe download / export filename stem from a display title. */
export function safeFileStem(title: string, fallback: string): string {
  const stem = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return stem.length > 0 ? stem : fallback;
}
