import type { FactItem, Track } from "../host/types";
import { awaitPdfRender, loadPdf, startPdfPageRender } from "./pdfPage";

const POSTER_WIDTH = 1200;
const PAD = 48;
const CONTENT = POSTER_WIDTH - PAD * 2;
const MAX_HEIGHT = 8000;

export type CardPosterInput = {
  title: string;
  tags: ReadonlyArray<string>;
  text: string;
  facts: ReadonlyArray<FactItem>;
  tracks: ReadonlyArray<Track>;
  imageUrls: ReadonlyArray<string>;
  pdfBytes: Blob | null;
  pdfPage: number | null;
};

export async function rasterizeCardPoster(input: CardPosterInput): Promise<Blob> {
  const images = await Promise.all(input.imageUrls.map((url) => loadHtmlImage(url)));
  const pdfCanvas = await renderPdfPage(input.pdfBytes, input.pdfPage);
  const canvas = document.createElement("canvas");
  canvas.width = POSTER_WIDTH;
  canvas.height = MAX_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not open a 2D canvas for the card poster");
  }
  ctx.fillStyle = "#261f18";
  ctx.fillRect(0, 0, POSTER_WIDTH, MAX_HEIGHT);
  let y = PAD + 56;
  ctx.fillStyle = "#d4a45a";
  ctx.font = '700 56px "Iowan Old Style", Palatino, "Times New Roman", serif';
  y = drawWrapped(ctx, input.title, PAD, y, CONTENT, 64);
  if (input.tags.length > 0) {
    ctx.fillStyle = "#b7a894";
    ctx.font = "22px Segoe UI, system-ui, sans-serif";
    y = drawWrapped(ctx, input.tags.join(" · "), PAD, y + 8, CONTENT, 30);
  }
  if (input.text.length > 0) {
    ctx.fillStyle = "#f3ead8";
    ctx.font = "28px Segoe UI, system-ui, sans-serif";
    y = drawWrapped(ctx, input.text, PAD, y + 24, CONTENT, 38);
  }
  if (input.facts.length > 0) {
    ctx.font = "26px Segoe UI, system-ui, sans-serif";
    y += 20;
    for (const fact of input.facts) {
      ctx.fillStyle = "#d4a45a";
      y = drawWrapped(ctx, fact.label, PAD, y + 10, CONTENT, 34);
      ctx.fillStyle = "#f3ead8";
      y = drawWrapped(ctx, fact.value, PAD, y + 4, CONTENT, 34);
    }
  }
  if (input.tracks.length > 0) {
    ctx.fillStyle = "#b7a894";
    ctx.font = "24px Segoe UI, system-ui, sans-serif";
    y += 16;
    for (const track of input.tracks) {
      const max = track.max === null ? "" : ` / ${String(track.max)}`;
      y = drawWrapped(ctx, `${track.label} ${String(track.current)}${max}`, PAD, y + 8, CONTENT, 32);
    }
  }
  for (const image of images) {
    y = drawContained(ctx, image, PAD, y + 28, CONTENT);
  }
  if (pdfCanvas) {
    y = drawContained(ctx, pdfCanvas, PAD, y + 28, CONTENT);
  }
  const used = Math.min(MAX_HEIGHT, Math.max(PAD * 2 + 80, Math.ceil(y + PAD)));
  const out = document.createElement("canvas");
  out.width = POSTER_WIDTH;
  out.height = used;
  const outCtx = out.getContext("2d");
  if (!outCtx) {
    throw new Error("Could not crop the card poster");
  }
  outCtx.drawImage(canvas, 0, 0, POSTER_WIDTH, used, 0, 0, POSTER_WIDTH, used);
  return canvasToPng(out);
}

export function cropImageToPng(
  image: CanvasImageSource,
  source: { x: number; y: number; size: number },
): Promise<Blob> {
  if (source.size < 1) {
    throw new Error("Token crop is empty");
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.size);
  canvas.height = Math.round(source.size);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not open a 2D canvas for the token crop");
  }
  ctx.drawImage(
    image,
    source.x,
    source.y,
    source.size,
    source.size,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvasToPng(canvas);
}

function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.trim().split(/\s+/);
  let line = "";
  let cursor = y;
  for (const word of words) {
    const next = line.length === 0 ? word : `${line} ${word}`;
    if (ctx.measureText(next).width > maxWidth && line.length > 0) {
      ctx.fillText(line, x, cursor);
      cursor += lineHeight;
      line = word;
    } else {
      line = next;
    }
  }
  if (line.length > 0) {
    ctx.fillText(line, x, cursor);
    cursor += lineHeight;
  }
  return cursor;
}

function drawContained(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  maxWidth: number,
): number {
  const width = sourceWidth(image);
  const height = sourceHeight(image);
  if (width < 1 || height < 1) {
    throw new Error("Card image has no size");
  }
  const drawWidth = maxWidth;
  const drawHeight = (height / width) * drawWidth;
  ctx.drawImage(image, x, y, drawWidth, drawHeight);
  return y + drawHeight;
}

function sourceWidth(image: CanvasImageSource): number {
  if (image instanceof HTMLImageElement) {
    return image.naturalWidth;
  }
  if (image instanceof HTMLCanvasElement) {
    return image.width;
  }
  throw new Error("Unsupported card image source");
}

function sourceHeight(image: CanvasImageSource): number {
  if (image instanceof HTMLImageElement) {
    return image.naturalHeight;
  }
  if (image instanceof HTMLCanvasElement) {
    return image.height;
  }
  throw new Error("Unsupported card image source");
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load card image ${url}`));
    image.src = url;
  });
}

async function renderPdfPage(bytes: Blob | null, page: number | null): Promise<HTMLCanvasElement | null> {
  if (bytes === null || page === null) {
    return null;
  }
  const pdf = await loadPdf(bytes);
  const canvas = document.createElement("canvas");
  const task = await startPdfPageRender(pdf.document, page, canvas, CONTENT);
  await awaitPdfRender(task);
  return canvas;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not encode the card poster as a PNG"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}
