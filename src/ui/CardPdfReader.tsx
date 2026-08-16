import { useEffect, useState } from "react";
import { useHost } from "../host/HostContext";
import type { SourceId } from "../host/ids";
import { captureLoadedPdfPagePng, loadPdf, type LoadedPdf } from "../lib/pdfPage";
import { PdfBookmarkCheck } from "./PdfBookmarkCheck";
import { PdfPageView } from "./PdfPageView";

export function CardPdfReader({
  sourceId,
  bookmarkPage,
}: {
  sourceId: SourceId;
  bookmarkPage: number;
}) {
  const { store, snap } = useHost();
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [page, setPage] = useState(bookmarkPage);
  const source = snap.sources.find((item) => item.id === sourceId) ?? null;
  const bytes = source?.kind === "pdf" ? source.bytes : null;

  useEffect(() => {
    setPage(bookmarkPage);
  }, [bookmarkPage]);

  useEffect(() => {
    if (!bytes) {
      setPdf(null);
      return;
    }
    let cancelled = false;
    store.run(
      loadPdf(bytes).then((loaded) => {
        if (!cancelled) {
          setPdf(loaded);
        }
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [bytes, store]);

  const captureMap = (): void => {
    if (!pdf || !source) {
      store.setError("PDF page is not on screen yet");
      return;
    }
    store.run(
      captureLoadedPdfPagePng(pdf.document, page).then((blob) =>
        store.saveCapturedImage(blob, `${source.title} p.${String(page)}`, "map"),
      ),
    );
  };

  if (!source) {
    return <p className="muted">That PDF is gone.</p>;
  }
  if (source.bytes === null) {
    return <p className="muted">This PDF was ingested before files were kept. Feed the file again.</p>;
  }

  return (
    <div className="card-pdf">
      <div className="source-viewer-bar">
        <p className="muted">{source.title}</p>
        {pdf ? (
          <div className="inline-form">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Prev
            </button>
            <span>
              {String(page)} / {String(pdf.pageCount)}
            </span>
            <button
              type="button"
              disabled={page >= pdf.pageCount}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
        <div className="card-actions">
          <PdfBookmarkCheck key={String(page)} sourceId={sourceId} page={page} />
          <button type="button" onClick={captureMap}>
            Use as map
          </button>
        </div>
      </div>
      {pdf ? <PdfPageView pdf={pdf} page={page} /> : <p className="muted">Opening the PDF…</p>}
    </div>
  );
}
