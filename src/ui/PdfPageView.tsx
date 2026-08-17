import { useEffect, useRef, useState } from "react";
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
import { listPdfPageImages, type PdfPageImage } from "../lib/pdfImages";

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
  onImagesChangeRef.current = onImagesChange;

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

  return (
    <div className="pdf-page-wrap">
      <canvas ref={canvasRef} className="pdf-page" />
      <div ref={textRef} className="pdf-text-layer" />
      {pickImages
        ? images.map((image) => (
            <button
              key={image.id}
              type="button"
              className={selectedImageId === image.id ? "pdf-image-frame is-selected" : "pdf-image-frame"}
              style={{
                left: image.left,
                top: image.top,
                width: image.width,
                height: image.height,
              }}
              aria-label="Select picture for card"
              aria-pressed={selectedImageId === image.id}
              onClick={() => onSelectImage?.(image)}
            />
          ))
        : null}
    </div>
  );
}
