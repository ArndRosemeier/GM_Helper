import { useEffect, useState } from "react";
import { useHost } from "../host/HostContext";
import { captureLoadedPdfPagePng, loadPdf, type LoadedPdf } from "../lib/pdfPage";
import { PdfBookmarkCheck } from "./PdfBookmarkCheck";
import { PdfPageView } from "./PdfPageView";

export function SourceViewer() {
  const { store, snap } = useHost();
  const view = snap.sourceView;
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [htmlUrl, setHtmlUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);

  const source = view ? (snap.sources.find((item) => item.id === view.sourceId) ?? null) : null;
  const page = view?.page ?? 1;
  const sourceId = source?.id ?? null;
  const sourceBytes = source?.bytes ?? null;
  const sourceKind = source?.kind ?? null;

  useEffect(() => {
    if (sourceId === null || sourceBytes === null || sourceKind === null) {
      setPdf(null);
      setHtmlUrl(null);
      setImageUrl(null);
      setTextBody(null);
      return;
    }
    const blob = sourceBytes;
    if (sourceKind === "pdf") {
      let cancelled = false;
      store.run(
        loadPdf(blob).then((loaded) => {
          if (!cancelled) {
            setPdf(loaded);
          }
        }),
      );
      return () => {
        cancelled = true;
      };
    }
    if (sourceKind === "markdown") {
      let cancelled = false;
      store.run(
        blob.text().then((text) => {
          if (!cancelled) {
            setTextBody(text);
          }
        }),
      );
      return () => {
        cancelled = true;
      };
    }
    const typed =
      sourceKind === "html" && blob.type !== "text/html"
        ? new Blob([blob], { type: "text/html" })
        : blob;
    const url = URL.createObjectURL(typed);
    if (sourceKind === "image") {
      setImageUrl(url);
      setHtmlUrl(null);
    } else {
      setHtmlUrl(url);
      setImageUrl(null);
    }
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [sourceId, sourceBytes, sourceKind, store]);

  if (!view) {
    return null;
  }

  const capture = (role: "other" | "map"): void => {
    if (source?.kind === "pdf") {
      if (!pdf) {
        store.setError("PDF page is not on screen yet");
        return;
      }
      store.run(
        captureLoadedPdfPagePng(pdf.document, page).then((blob) =>
          store.saveCapturedImage(blob, `${source.title} p.${String(page)}`, role),
        ),
      );
      return;
    }
    if (source?.kind === "image" && source.bytes) {
      store.run(store.saveCapturedImage(source.bytes, source.title, role));
      return;
    }
    store.setError("This source cannot be captured as an image");
  };

  return (
    <section className="source-viewer">
      <header className="source-viewer-bar">
        <div>
          <p className="eyebrow">Source</p>
          <h2>{source?.title ?? "Missing source"}</h2>
        </div>
        {source?.kind === "pdf" && pdf ? (
          <div className="inline-form">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => store.setSourceViewPage(page - 1)}
            >
              Prev
            </button>
            <span>
              {String(page)} / {String(pdf.pageCount)}
            </span>
            <button
              type="button"
              disabled={page >= pdf.pageCount}
              onClick={() => store.setSourceViewPage(page + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
        <div className="card-actions">
          {source?.kind === "pdf" ? (
            <PdfBookmarkCheck key={String(page)} sourceId={source.id} page={page} />
          ) : null}
          {source?.kind !== "pdf" ? (
            <button type="button" onClick={() => capture("other")}>
              Save picture
            </button>
          ) : null}
          <button type="button" onClick={() => capture("map")}>
            Use as map
          </button>
          <button type="button" onClick={() => store.closeSourceView()}>
            Close
          </button>
        </div>
      </header>
      {!source ? <p className="muted">That source is gone.</p> : null}
      {source && source.bytes === null ? (
        <p className="muted">This source was ingested before files were kept. Feed the file again.</p>
      ) : null}
      {source?.kind === "pdf" && pdf ? <PdfPageView pdf={pdf} page={page} /> : null}
      {textBody !== null ? <pre className="source-text">{textBody}</pre> : null}
      {htmlUrl && source && source.kind !== "image" && source.kind !== "pdf" && source.kind !== "markdown" ? (
        <iframe className="source-frame" title={source.title} src={htmlUrl} sandbox="allow-same-origin" />
      ) : null}
      {imageUrl ? <img className="source-image" src={imageUrl} alt={source?.title ?? ""} /> : null}
    </section>
  );
}
