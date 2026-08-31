/** Decode an image URL and re-encode as PNG. */
export async function imageUrlToPngBlob(url: string): Promise<Blob> {
  const image = await loadHtmlImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  if (canvas.width < 1 || canvas.height < 1) {
    throw new Error("Image has no pixels to export");
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not open a 2D canvas for PNG export");
  }
  ctx.drawImage(image, 0, 0);
  return await canvasToPngBlob(canvas);
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode the image for export"));
    image.src = url;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not encode the image as PNG"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

const NAME_MIME: ReadonlyArray<[string, string]> = [
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".heic", "image/heic"],
  [".heif", "image/heif"],
  [".bmp", "image/bmp"],
];

function mimeFromFileName(name: string): string | null {
  const lower = name.toLowerCase();
  for (const [suffix, mime] of NAME_MIME) {
    if (lower.endsWith(suffix)) {
      return mime;
    }
  }
  return null;
}

function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function isUsableImageMime(type: string): boolean {
  const lower = type.toLowerCase();
  return lower.startsWith("image/") && lower !== "image/svg+xml";
}

/** Fill in a missing MIME type so iOS Photos blobs (often type "") still display. */
export async function normalizeImageBlob(blob: Blob, fileName = ""): Promise<Blob> {
  if (isUsableImageMime(blob.type)) {
    return blob;
  }
  const named = mimeFromFileName(fileName);
  if (named) {
    return blob.type === named ? blob : new Blob([blob], { type: named });
  }
  const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const sniffed = sniffImageMime(header);
  const mime = sniffed ?? "image/jpeg";
  return new Blob([blob], { type: mime });
}

export function isImageFileLike(blob: Blob, fileName = ""): boolean {
  if (isUsableImageMime(blob.type) || mimeFromFileName(fileName) !== null) {
    return true;
  }
  // iOS Photos paste often has an empty MIME type.
  return blob.type.length === 0 && blob.size > 0;
}
