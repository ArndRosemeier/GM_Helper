type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
};

/**
 * Save a Blob via the File System Access API when available, otherwise trigger a download.
 *
 * The save picker is opened before `produce()` runs so Chrome still has a user gesture
 * (exporting a large archive can take longer than transient activation lasts).
 */
export async function saveBlobAsFile(
  produce: () => Promise<Blob>,
  suggestedName: string,
  accept: { description: string; accept: Record<string, string[]> },
): Promise<"saved" | "cancelled"> {
  const w = window as SaveFilePickerWindow;
  const picker = w.showSaveFilePicker;
  if (typeof picker === "function") {
    let handle: FileSystemFileHandle;
    try {
      handle = await picker.call(w, {
        suggestedName,
        types: [accept],
      });
    } catch (error: unknown) {
      if (isAbortError(error)) {
        return "cancelled";
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
    const blob = await produce();
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
    } finally {
      await writable.close();
    }
    return "saved";
  }

  const blob = await produce();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  link.click();
  URL.revokeObjectURL(url);
  return "saved";
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
