import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { yieldToUi } from "./yieldToUi";
import { awaitPdfRender, startPdfPageRender } from "./pdfPage";

export type PdfPageImage = {
  id: string;
  objectName: string;
  /** CSS-pixel box relative to the page canvas/text layer. */
  left: number;
  top: number;
  width: number;
  height: number;
};

type Matrix = readonly [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const MIN_CSS_SIDE = 28;

export async function listPdfPageImages(
  page: PDFPageProxy,
  cssScale: number,
  minCssSide = MIN_CSS_SIDE,
): Promise<ReadonlyArray<PdfPageImage>> {
  const { OPS } = await import("pdfjs-dist");
  const viewport = page.getViewport({ scale: cssScale });
  const operatorList = await page.getOperatorList();
  const images: PdfPageImage[] = [];
  const seen = new Set<string>();
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;

  for (let i = 0; i < operatorList.fnArray.length; i += 1) {
    const fn = operatorList.fnArray[i];
    const args = operatorList.argsArray[i] as unknown[];
    if (fn === OPS.save) {
      stack.push(ctm);
      continue;
    }
    if (fn === OPS.restore) {
      ctm = stack.pop() ?? IDENTITY;
      continue;
    }
    if (fn === OPS.transform) {
      const next = args as unknown as Matrix;
      ctm = multiply(next, ctm);
      continue;
    }
    if (fn !== OPS.paintImageXObject && fn !== OPS.paintImageXObjectRepeat) {
      continue;
    }
    const objectName = typeof args[0] === "string" ? args[0] : null;
    if (objectName === null || seen.has(objectName)) {
      continue;
    }
    const box = imageBox(ctm, viewport);
    if (box.width < minCssSide || box.height < minCssSide) {
      continue;
    }
    seen.add(objectName);
    images.push({
      id: `${objectName}:${String(images.length)}`,
      objectName,
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
    });
  }

  return images;
}

export async function extractPdfPagesImages(
  document: PDFDocumentProxy,
  pageNumbers: ReadonlyArray<number>,
): Promise<ReadonlyArray<Blob>> {
  const pngs: Blob[] = [];
  for (const pageNumber of pageNumbers) {
    if (pageNumber < 1 || pageNumber > document.numPages) {
      throw new Error(`PDF has no page ${String(pageNumber)}`);
    }
    await yieldToUi();
    const canvas = window.document.createElement("canvas");
    const task = await startPdfPageRender(document, pageNumber, canvas, 800);
    await awaitPdfRender(task);
    const page = await document.getPage(pageNumber);
    const listed = await listPdfPageImages(page, 1, 0);
    for (const image of listed) {
      pngs.push(await extractPdfImagePng(page, image.objectName));
    }
  }
  return pngs;
}

export async function shrinkPngHalf(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const width = Math.max(1, Math.round(bitmap.width / 2));
    const height = Math.max(1, Math.round(bitmap.height / 2));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not open a 2D canvas to shrink the PDF image");
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvasToPng(canvas);
  } finally {
    bitmap.close();
  }
}

export async function extractPdfImagePng(page: PDFPageProxy, objectName: string): Promise<Blob> {
  await page.getOperatorList();
  return rasterToPng(readPageObject(page, objectName));
}

function imageBox(
  ctm: Matrix,
  viewport: {
    width: number;
    height: number;
    convertToViewportPoint: (x: number, y: number) => number[];
  },
): { left: number; top: number; width: number; height: number } {
  const corners: Array<readonly [number, number]> = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of corners) {
    const [ux, uy] = apply(ctm, x, y);
    const view = viewport.convertToViewportPoint(ux, uy);
    const vx = view[0];
    const vy = view[1];
    if (vx === undefined || vy === undefined) {
      throw new Error("PDF viewport conversion failed");
    }
    minX = Math.min(minX, vx);
    minY = Math.min(minY, vy);
    maxX = Math.max(maxX, vx);
    maxY = Math.max(maxY, vy);
  }
  return {
    left: Math.max(0, minX),
    top: Math.max(0, minY),
    width: Math.max(0, Math.min(maxX, viewport.width) - Math.max(0, minX)),
    height: Math.max(0, Math.min(maxY, viewport.height) - Math.max(0, minY)),
  };
}

function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

function apply(m: Matrix, x: number, y: number): readonly [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function readPageObject(page: PDFPageProxy, objectName: string): unknown {
  // pdf.js 6: get(id, callback) inserts an unresolved object and waits forever
  // unless a paint is in flight. Only read objects that are already resolved.
  if (!page.objs.has(objectName)) {
    throw new Error(`PDF image “${objectName}” is not loaded`);
  }
  const image = page.objs.get(objectName);
  if (image === null || image === undefined) {
    throw new Error(`PDF image “${objectName}” is missing`);
  }
  return image;
}

async function rasterToPng(image: unknown): Promise<Blob> {
  if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    return drawableToPng(image, image.width, image.height);
  }
  if (typeof image !== "object" || image === null) {
    throw new Error("PDF image payload is not a bitmap");
  }
  const record = image as Record<string, unknown>;
  if (typeof ImageBitmap !== "undefined" && record.bitmap instanceof ImageBitmap) {
    return drawableToPng(record.bitmap, record.bitmap.width, record.bitmap.height);
  }
  const width = typeof record.width === "number" ? record.width : null;
  const height = typeof record.height === "number" ? record.height : null;
  const data = record.data;
  if (width === null || height === null || !(data instanceof Uint8ClampedArray || data instanceof Uint8Array)) {
    throw new Error("PDF image payload has no pixel buffer");
  }
  const pixels = document.createElement("canvas");
  pixels.width = width;
  pixels.height = height;
  const pixelCtx = pixels.getContext("2d");
  if (!pixelCtx) {
    throw new Error("Could not open a 2D canvas for the PDF image");
  }
  const rgba = toRgbaBytes(data, width, height, typeof record.kind === "number" ? record.kind : null);
  pixelCtx.putImageData(new ImageData(rgba, width, height), 0, 0);
  return drawableToPng(pixels, width, height);
}

function toRgbaBytes(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  kind: number | null,
): Uint8ClampedArray<ArrayBuffer> {
  const pixelCount = width * height;
  if (data.length === pixelCount * 4 || kind === 3 /* ImageKind.RGBA_32BPP */) {
    const copy = new Uint8ClampedArray(new ArrayBuffer(pixelCount * 4));
    copy.set(data.subarray(0, pixelCount * 4));
    return copy;
  }
  const out = new Uint8ClampedArray(new ArrayBuffer(pixelCount * 4));
  if (data.length >= pixelCount * 3 && (kind === 2 /* ImageKind.RGB_24BPP */ || kind === null)) {
    for (let i = 0, j = 0; i < pixelCount; i += 1, j += 3) {
      const o = i * 4;
      out[o] = data[j] ?? 0;
      out[o + 1] = data[j + 1] ?? 0;
      out[o + 2] = data[j + 2] ?? 0;
      out[o + 3] = 255;
    }
    return out;
  }
  if (data.length >= pixelCount) {
    for (let i = 0; i < pixelCount; i += 1) {
      const value = data[i] ?? 0;
      const o = i * 4;
      out[o] = value;
      out[o + 1] = value;
      out[o + 2] = value;
      out[o + 3] = 255;
    }
    return out;
  }
  throw new Error("PDF image pixel buffer size does not match width and height");
}

async function drawableToPng(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not open a 2D canvas for the PDF image");
  }
  ctx.drawImage(source, 0, 0);
  return canvasToPng(canvas);
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not encode the PDF image as PNG"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}
