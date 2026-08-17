import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { isDeadPdfTextLayer, isRenderCancelled } from "../host/errors";
import { useHost } from "../host/HostContext";
import {
  awaitPdfPagePaint,
  cancelPdfCanvas,
  cancelPdfPagePaint,
  startPdfPagePaint,
  type LoadedPdf,
  type PdfPagePaint,
} from "../lib/pdfPage";
import { extractPdfImagePng, listPdfPageImages, type PdfPageImage } from "../lib/pdfImages";

export function PdfPageView({
  pdf,
  page,
  pickImages = false,
  selectedImageId = null,
  onSelectImage,
  onImagesChange,
}: {
  pdf: LoadedPdf;
  page: number;
  pickImages?: boolean;
  selectedImageId?: string | null;
  onSelectImage?: (image: PdfPageImage) => void;
  onImagesChange?: (images: ReadonlyArray<PdfPageImage>) => void;
}) {
  const { store } = useHost();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const onImagesChangeRef = useRef(onImagesChange);
  const [images, setImages] = useState<ReadonlyArray<PdfPageImage>>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  onImagesChangeRef.current = onImagesChange;

  const selected = images.find((image) => image.id === selectedImageId) ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    const textRoot = textRef.current;
    if (!canvas || !textRoot) {
      return;
    }
    const abort = new AbortController();
    let paint: PdfPagePaint | null = null;
    setImages([]);
    onImagesChangeRef.current?.([]);

    void startPdfPagePaint(pdf.document, page, canvas, textRoot, abort.signal)
      .then(async (started) => {
        paint = started;
        if (abort.signal.aborted) {
          cancelPdfPagePaint(started);
          return;
        }
        await awaitPdfPagePaint(started);
        if (abort.signal.aborted || !pickImages) {
          return;
        }
        const pdfPage = await pdf.document.getPage(page);
        if (abort.signal.aborted) {
          return;
        }
        const cssWidth = canvas.parentElement?.clientWidth ?? 800;
        const cssScale = cssWidth / pdfPage.getViewport({ scale: 1 }).width;
        const next = await listPdfPageImages(pdfPage, cssScale);
        if (abort.signal.aborted) {
          return;
        }
        setImages(next);
        onImagesChangeRef.current?.(next);
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted || isRenderCancelled(error) || isDeadPdfTextLayer(error)) {
          return;
        }
        store.report(error);
      });
    return () => {
      abort.abort();
      cancelPdfCanvas(canvas);
      if (paint) {
        cancelPdfPagePaint(paint);
      }
    };
  }, [pdf, page, store, pickImages]);

  useEffect(() => {
    if (!pickImages || selected === null) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    const objectName = selected.objectName;
    void pdf.document
      .getPage(page)
      .then((pdfPage) => extractPdfImagePng(pdfPage, objectName))
      .then((blob) => {
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        store.report(error);
        setPreviewUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl !== null) {
        URL.revokeObjectURL(objectUrl);
      }
      setPreviewUrl(null);
    };
  }, [pickImages, selected, pdf, page, store]);

  const onPickClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (!pickImages || !onSelectImage || images.length === 0) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const hits = images
      .filter((image) => pointInImage(x, y, image))
      .sort((a, b) => imageArea(b) - imageArea(a));
    if (hits.length === 0) {
      return;
    }
    const currentIndex = hits.findIndex((image) => image.id === selectedImageId);
    const next = hits[(currentIndex + 1) % hits.length];
    if (!next) {
      return;
    }
    onSelectImage(next);
  };

  return (
    <div
      className={
        pickImages
          ? selected
            ? "pdf-page-wrap is-picking has-image-selection"
            : "pdf-page-wrap is-picking"
          : "pdf-page-wrap"
      }
      onClick={pickImages ? onPickClick : undefined}
    >
      <canvas ref={canvasRef} className="pdf-page" />
      <div ref={textRef} className="pdf-text-layer" />
      {selected && previewUrl ? (
        <img
          className="pdf-image-preview"
          src={previewUrl}
          alt=""
          style={{
            left: selected.left,
            top: selected.top,
            width: selected.width,
            height: selected.height,
          }}
        />
      ) : null}
      {pickImages
        ? images.map((image) => (
            <div
              key={image.id}
              className={selectedImageId === image.id ? "pdf-image-frame is-selected" : "pdf-image-frame"}
              style={{
                left: image.left,
                top: image.top,
                width: image.width,
                height: image.height,
              }}
              aria-hidden="true"
            />
          ))
        : null}
    </div>
  );
}

function imageArea(image: PdfPageImage): number {
  return image.width * image.height;
}

function pointInImage(x: number, y: number, image: PdfPageImage): boolean {
  return (
    x >= image.left &&
    y >= image.top &&
    x <= image.left + image.width &&
    y <= image.top + image.height
  );
}
