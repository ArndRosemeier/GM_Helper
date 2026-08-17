import { useEffect, useState } from "react";
import { useHost } from "../host/HostContext";
import type { SourceId } from "../host/ids";
import { loadPdf, type LoadedPdf } from "../lib/pdfPage";
import { PdfPageNav } from "./PdfPageNav";
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

  if (!source) {
    return <p className="muted">That PDF is gone.</p>;
  }
  if (source.bytes === null) {
    return null;
  }

  return (
    <div className="card-pdf">
      {pdf ? (
        <div className="source-viewer-bar">
          <PdfPageNav page={page} pageCount={pdf.pageCount} onChange={setPage} />
        </div>
      ) : null}
      {pdf ? <PdfPageView pdf={pdf} page={page} /> : <p className="muted">Opening the PDF…</p>}
    </div>
  );
}
