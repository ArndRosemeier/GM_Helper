export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  return `Unexpected error: ${String(error)}`;
}

export function isRenderCancelled(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }
  return error.name === "RenderingCancelledException";
}

export function isDeadPdfTextLayer(error: unknown): boolean {
  return errorMessage(error) === "Cannot convert undefined or null to object";
}
