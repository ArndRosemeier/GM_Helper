export type MigrationWarning = {
  store: string;
  id: string;
  message: string;
};

export type MigrationReport = {
  from: number;
  to: number;
  warnings: ReadonlyArray<MigrationWarning>;
};

export function formatMigrationWarnings(warnings: ReadonlyArray<MigrationWarning>): string {
  if (warnings.length === 0) {
    throw new Error("formatMigrationWarnings called with no warnings");
  }
  const shown = warnings.slice(0, 5).map((item) => `${item.store}:${item.id} — ${item.message}`);
  const extra = warnings.length > 5 ? ` (+${String(warnings.length - 5)} more)` : "";
  return `Could not fully read ${String(warnings.length)} stored record(s). ${shown.join("; ")}${extra}`;
}
