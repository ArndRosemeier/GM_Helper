import { useEffect, useRef } from "react";
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

export function PdfPageView({ pdf, page }: { pdf: LoadedPdf; page: number }) {
  const { store } = useHost();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const textRoot = textRef.current;
    if (!canvas || !textRoot) {
      return;
    }
    const abort = new AbortController();
    let paint: PdfPagePaint | null = null;
    void startPdfPagePaint(pdf.document, page, canvas, textRoot, abort.signal)
      .then((started) => {
        paint = started;
        if (abort.signal.aborted) {
          cancelPdfPagePaint(started);
          return;
        }
        return awaitPdfPagePaint(started);
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
  }, [pdf, page, store]);

  return (
    <div className="pdf-page-wrap">
      <canvas ref={canvasRef} className="pdf-page" />
      <div ref={textRef} className="pdf-text-layer" />
    </div>
  );
}
