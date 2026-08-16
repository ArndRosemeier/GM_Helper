import type { PDFDocumentProxy, PDFPageProxy, RenderTask, TextLayer } from "pdfjs-dist";
import { isDeadPdfTextLayer, isRenderCancelled } from "../host/errors";
import { openPdfDocument } from "./pdfjsRuntime";

export type LoadedPdf = {
  document: PDFDocumentProxy;
  pageCount: number;
};

export type PdfPagePaint = {
  renderTask: RenderTask;
  textLayer: TextLayer;
  layerContainer: HTMLDivElement;
};

const canvasLock = new WeakMap<HTMLCanvasElement, Promise<void>>();
const canvasTask = new WeakMap<HTMLCanvasElement, RenderTask>();

export async function loadPdf(bytes: Blob): Promise<LoadedPdf> {
  const document = await openPdfDocument(await bytes.arrayBuffer());
  return { document, pageCount: document.numPages };
}

function requirePage(document: PDFDocumentProxy, pageNumber: number): Promise<PDFPageProxy> {
  if (pageNumber < 1 || pageNumber > document.numPages) {
    throw new Error(`PDF has no page ${String(pageNumber)}`);
  }
  return document.getPage(pageNumber);
}

function renderCancelled(): Error {
  const error = new Error("PDF render was cancelled");
  error.name = "RenderingCancelledException";
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw renderCancelled();
  }
}

function lockCanvas(canvas: HTMLCanvasElement): Promise<() => void> {
  const previous = canvasLock.get(canvas) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  canvasLock.set(canvas, previous.then(() => held));
  return previous.then(() => release);
}

export function cancelPdfCanvas(canvas: HTMLCanvasElement): void {
  canvasTask.get(canvas)?.cancel();
}

export async function startPdfPageRender(
  document: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  cssWidth = canvas.parentElement?.clientWidth ?? 800,
  signal?: AbortSignal,
): Promise<RenderTask> {
  const page = await requirePage(document, pageNumber);
  throwIfAborted(signal);
  const unlock = await lockCanvas(canvas);
  try {
    throwIfAborted(signal);
    const base = page.getViewport({ scale: 1 });
    const cssScale = cssWidth / base.width;
    const viewport = page.getViewport({ scale: cssScale });
    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${String(Math.floor(viewport.width))}px`;
    canvas.style.height = `${String(Math.floor(viewport.height))}px`;
    // pdf.js 6 owns the context. Passing canvasContext and canvas together
    // is rejected; a second render() on a busy canvas throws.
    const task = page.render({
      canvas,
      viewport,
      transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
    });
    canvasTask.set(canvas, task);
    void task.promise.finally(() => {
      if (canvasTask.get(canvas) === task) {
        canvasTask.delete(canvas);
      }
      unlock();
    });
    return task;
  } catch (error: unknown) {
    unlock();
    throw error;
  }
}

export async function startPdfPagePaint(
  document: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  textRoot: HTMLDivElement,
  signal?: AbortSignal,
): Promise<PdfPagePaint> {
  const { TextLayer } = await import("pdfjs-dist");
  throwIfAborted(signal);
  const wrap = canvas.parentElement;
  const cssWidth = wrap?.clientWidth ?? 800;
  const page = await requirePage(document, pageNumber);
  throwIfAborted(signal);
  const [renderTask, textContent] = await Promise.all([
    startPdfPageRender(document, pageNumber, canvas, cssWidth, signal),
    page.getTextContent(),
  ]);
  throwIfAborted(signal);
  const cssScale = cssWidth / page.getViewport({ scale: 1 }).width;
  const viewport = page.getViewport({ scale: cssScale });
  textRoot.replaceChildren();
  textRoot.style.width = canvas.style.width;
  textRoot.style.height = canvas.style.height;
  const layerContainer = window.document.createElement("div");
  layerContainer.style.width = canvas.style.width;
  layerContainer.style.height = canvas.style.height;
  textRoot.append(layerContainer);
  const textLayer = new TextLayer({
    textContentSource: textContent,
    container: layerContainer,
    viewport,
  });
  return { renderTask, textLayer, layerContainer };
}

export async function awaitPdfRender(task: RenderTask): Promise<void> {
  try {
    await task.promise;
  } catch (error: unknown) {
    if (isRenderCancelled(error)) {
      return;
    }
    throw error;
  }
}

export async function awaitTextLayer(layer: TextLayer): Promise<void> {
  try {
    await layer.render();
  } catch (error: unknown) {
    if (isRenderCancelled(error) || isDeadPdfTextLayer(error)) {
      return;
    }
    throw error;
  }
}

export async function awaitPdfPagePaint(paint: PdfPagePaint): Promise<void> {
  await Promise.all([awaitPdfRender(paint.renderTask), awaitTextLayer(paint.textLayer)]);
}

export function cancelPdfPagePaint(paint: PdfPagePaint): void {
  paint.renderTask.cancel();
  // Detach only. pdfjs 6 TextLayer.cancel() nulls #styleCache while pump()
  // still Object.assigns into it, which throws an unhandled TypeError.
  paint.layerContainer.remove();
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not capture the page as a PNG"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

export async function captureLoadedPdfPagePng(
  pdf: PDFDocumentProxy,
  pageNumber: number,
): Promise<Blob> {
  const canvas = window.document.createElement("canvas");
  const task = await startPdfPageRender(pdf, pageNumber, canvas);
  await awaitPdfRender(task);
  return canvasToPng(canvas);
}
