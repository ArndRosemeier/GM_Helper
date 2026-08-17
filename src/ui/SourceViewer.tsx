import { useEffect, useState } from "react";
import { useHost } from "../host/HostContext";
import { extractPdfImagePng, type PdfPageImage } from "../lib/pdfImages";
import { loadPdf, type LoadedPdf } from "../lib/pdfPage";
import { PdfPageNav } from "./PdfPageNav";
import { PdfPageView } from "./PdfPageView";

export function SourceViewer() {
  const { store, snap } = useHost();
  const view = snap.sourceView;
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [htmlUrl, setHtmlUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<PdfPageImage | null>(null);
  const [viewPage, setViewPage] = useState(view?.page ?? 1);

  const source = view ? (snap.sources.find((item) => item.id === view.sourceId) ?? null) : null;
  const sourceId = source?.id ?? null;
  const sourceBytes = source?.bytes ?? null;
  const sourceKind = source?.kind ?? null;

  useEffect(() => {
    setViewPage(view?.page ?? 1);
  }, [view?.sourceId, view?.page]);

  useEffect(() => {
    setSelectedImage(null);
  }, [sourceId, viewPage]);

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

  const saveCard = (): void => {
    if (!source) {
      store.setError("That source is gone");
      return;
    }
    if (source.kind === "pdf" && selectedImage !== null) {
      if (!pdf) {
        store.setError("PDF page is not on screen yet");
        return;
      }
      const page = viewPage;
      const image = selectedImage;
      const document = pdf.document;
      store.run(
        (async () => {
          let picture: Blob | null = null;
          try {
            picture = await extractPdfImagePng(await document.getPage(page), image.objectName);
          } catch (error: unknown) {
            store.report(error);
          }
          await store.saveSourcePageAsCard(source.id, page, picture);
        })(),
      );
      return;
    }
    if (source.kind === "image" && source.bytes) {
      store.run(store.saveSourcePageAsCard(source.id, null, source.bytes));
      return;
    }
    store.run(
      store.saveSourcePageAsCard(source.id, source.kind === "pdf" ? viewPage : null, null),
    );
  };

  return (
    <section className="source-viewer">
      <header className="source-viewer-bar">
        {source?.kind === "pdf" && pdf ? (
          <PdfPageNav
            page={viewPage}
            pageCount={pdf.pageCount}
            onChange={setViewPage}
            onCommit={(next) => store.setSourceViewPage(next)}
          />
        ) : null}
        <div className="card-actions source-save-row">
          <button
            type="button"
            title="You can select a picture on this page to become the picture for this card."
            onClick={saveCard}
          >
            Add card
          </button>
          <button type="button" onClick={() => store.closeSourceView()}>
            Close
          </button>
        </div>
      </header>
      {!source ? <p className="muted">That source is gone.</p> : null}
      {source?.kind === "pdf" && pdf ? (
        <PdfPageView
          pdf={pdf}
          page={viewPage}
          pickImages
          selectedImageId={selectedImage?.id ?? null}
          onSelectImage={setSelectedImage}
        />
      ) : null}
      {textBody !== null ? <pre className="source-text">{textBody}</pre> : null}
      {htmlUrl && source && source.kind !== "image" && source.kind !== "pdf" && source.kind !== "markdown" ? (
        <iframe className="source-frame" title={source.title} src={htmlUrl} sandbox="allow-same-origin" />
      ) : null}
      {imageUrl ? <img className="source-image" src={imageUrl} alt={source?.title ?? ""} /> : null}
    </section>
  );
}
