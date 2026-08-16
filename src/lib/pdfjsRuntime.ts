import type { PDFDocumentProxy } from "pdfjs-dist";

const REQUIRED_WASM = ["openjpeg.wasm", "jbig2.wasm", "qcms_bg.wasm"] as const;

export type PdfjsDocumentOptions = {
  wasmUrl: string;
  cMapUrl: string;
  cMapPacked: true;
  standardFontDataUrl: string;
  iccUrl: string;
};

let ready: Promise<PdfjsDocumentOptions> | null = null;

function pdfjsAssetDir(folder: string): string {
  const base = import.meta.env.BASE_URL;
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}pdfjs/${folder}/`;
}

export function pdfjsDocumentOptions(): PdfjsDocumentOptions {
  return {
    wasmUrl: pdfjsAssetDir("wasm"),
    cMapUrl: pdfjsAssetDir("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: pdfjsAssetDir("standard_fonts"),
    iccUrl: pdfjsAssetDir("iccs"),
  };
}

export async function requirePdfjsReady(): Promise<PdfjsDocumentOptions> {
  if (!ready) {
    ready = preparePdfjs();
  }
  return ready;
}

export async function openPdfDocument(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const options = await requirePdfjsReady();
  const { getDocument } = await import("pdfjs-dist");
  return getDocument({
    data,
    wasmUrl: options.wasmUrl,
    cMapUrl: options.cMapUrl,
    cMapPacked: options.cMapPacked,
    standardFontDataUrl: options.standardFontDataUrl,
    iccUrl: options.iccUrl,
  }).promise;
}

async function preparePdfjs(): Promise<PdfjsDocumentOptions> {
  const { GlobalWorkerOptions } = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  if (typeof worker.default !== "string" || worker.default.length === 0) {
    throw new Error("PDF worker URL is empty. The viewer cannot start.");
  }
  GlobalWorkerOptions.workerSrc = worker.default;
  const options = pdfjsDocumentOptions();
  const missing: string[] = [];
  for (const name of REQUIRED_WASM) {
    const url = `${options.wasmUrl}${name}`;
    const problem = await wasmProblem(url);
    if (problem) {
      missing.push(problem);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `PDF engine WASM is not ready: ${missing.join("; ")}. JPEG2000 and JBIG2 pages will not decode.`,
    );
  }
  return options;
}

async function wasmProblem(url: string): Promise<string | null> {
  const response = await fetch(url);
  if (!response.ok) {
    return `${url} returned ${String(response.status)}`;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 4 || bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
    return `${url} is not a WebAssembly module`;
  }
  return null;
}
