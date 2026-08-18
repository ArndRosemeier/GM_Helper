export function isIntegerDraft(raw: string): boolean {
  return /^-?\d*$/.test(raw);
}

export function parseIntegerField(raw: string): number | null {
  if (raw.length === 0) {
    return 0;
  }
  if (!/^-?\d+$/.test(raw)) {
    return null;
  }
  return Number(raw);
}
