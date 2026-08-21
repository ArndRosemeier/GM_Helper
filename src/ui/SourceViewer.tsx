import { useEffect, useState } from "react";
import { useHost } from "../host/HostContext";
import { extractPdfImagePng, type PdfPageImage } from "../lib/pdfImages";
import { clipboardWriteSupported, writeClipboardImage } from "../lib/clipboardImage";
import { loadPdf, type LoadedPdf } from "../lib/pdfPage";
import { runAddCardWithAi } from "./aiPdfCard";
import { AiTopicModal } from "./AiTopicModal";
import { FlashToast, useFlashToast } from "./FlashToast";
import { Modal } from "./Modal";
import { NameCardModal } from "./NameCardModal";
import { PdfPageNav } from "./PdfPageNav";
import { PdfPageView } from "./PdfPageView";

type PendingSave =
  | { kind: "page"; picture: PdfPageImage | null }
  | { kind: "image"; image: PdfPageImage };

export function SourceViewer() {
  const { store, snap } = useHost();
  const view = snap.sourceView;
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [htmlUrl, setHtmlUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<PdfPageImage | null>(null);
  const [viewPage, setViewPage] = useState(view?.page ?? 1);
  const [pending, setPending] = useState<PendingSave | null>(null);
  const [topicPending, setTopicPending] = useState(false);
  const { message: flashMessage, flash } = useFlashToast();

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

  const confirmSave = (name: string): void => {
    if (!source || pending === null) {
      store.setError("Nothing to save");
      return;
    }
    if (pending.kind === "image") {
      if (!pdf) {
        store.setError("PDF page is not on screen yet");
        return;
      }
      const page = viewPage;
      const image = pending.image;
      const document = pdf.document;
      setPending(null);
      store.run(
        (async () => {
          const picture = await extractPdfImagePng(await document.getPage(page), image.objectName);
          await store.savePdfImageAsCard(picture, name);
        })(),
      );
      return;
    }
    const pagePicture = pending.picture;
    setPending(null);
    if (source.kind === "pdf" && pagePicture !== null) {
      if (!pdf) {
        store.setError("PDF page is not on screen yet");
        return;
      }
      const page = viewPage;
      const document = pdf.document;
      store.run(
        (async () => {
          const picture = await extractPdfImagePng(
            await document.getPage(page),
            pagePicture.objectName,
          );
          await store.saveSourcePageAsCard(source.id, page, picture, name);
        })(),
      );
      return;
    }
    if (source.kind === "image" && source.bytes) {
      store.run(store.saveSourcePageAsCard(source.id, null, source.bytes, name));
      return;
    }
    store.run(
      store.saveSourcePageAsCard(source.id, source.kind === "pdf" ? viewPage : null, null, name),
    );
  };

  const onAddCardWithAi = (): void => {
    setTopicPending(true);
  };

  const copySelectedImage = (): void => {
    if (selectedImage === null) {
      store.setError("Select a picture on this page first");
      return;
    }
    if (!pdf) {
      store.setError("PDF page is not on screen yet");
      return;
    }
    const image = selectedImage;
    const document = pdf.document;
    const pageNumber = viewPage;
    store.run(
      (async () => {
        const picture = await extractPdfImagePng(await document.getPage(pageNumber), image.objectName);
        await writeClipboardImage(picture);
        flash("Image copied");
      })(),
    );
  };

  const title = source?.title ?? "Source";

  return (
    <Modal
      title={title}
      onClose={() => store.closeSourceView()}
      closeOnBackdrop={false}
      className="source-viewer-modal"
      cardClassName="source-viewer"
    >
      <header className="source-viewer-bar">
        {source?.kind === "pdf" && pdf ? (
          <PdfPageNav
            page={viewPage}
            pageCount={pdf.pageCount}
            onChange={setViewPage}
            onCommit={(next) => store.setSourceViewPage(next)}
          />
        ) : (
          <div>
            <p className="eyebrow">Source</p>
            <h2>{title}</h2>
          </div>
        )}
        <div className="card-actions source-save-row">
          <button type="button" onClick={() => setPending({ kind: "page", picture: selectedImage })}>
            Add card
          </button>
          {source?.kind === "pdf" ? (
            <button type="button" disabled={snap.busy !== null} onClick={onAddCardWithAi}>
              Add card with AI
            </button>
          ) : null}
          {source?.kind === "pdf" ? (
            <button
              type="button"
              disabled={selectedImage === null}
              title={
                selectedImage === null
                  ? "Select a picture on this page first"
                  : "Make a card from the selected picture only"
              }
              onClick={() => {
                if (selectedImage === null) {
                  store.setError("Select a picture on this page first");
                  return;
                }
                setPending({ kind: "image", image: selectedImage });
              }}
            >
              Add image card
            </button>
          ) : null}
          {source?.kind === "pdf" && clipboardWriteSupported() ? (
            <button
              type="button"
              disabled={selectedImage === null}
              title={
                selectedImage === null
                  ? "Select a picture on this page first"
                  : "Copy the selected picture to the clipboard"
              }
              onClick={copySelectedImage}
            >
              Copy image
            </button>
          ) : null}
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
      {pending !== null ? (
        <NameCardModal
          title={pending.kind === "image" ? "Name this image card" : "Name this card"}
          fieldLabel="Name"
          confirmLabel={pending.kind === "image" ? "Add image card" : "Add card"}
          onCancel={() => setPending(null)}
          onConfirm={confirmSave}
        />
      ) : null}
      {topicPending ? (
        <AiTopicModal
          initialTopic={view?.searchQuery?.trim() ?? ""}
          onCancel={() => setTopicPending(false)}
          onConfirm={(topic, tryGetImage) => {
            setTopicPending(false);
            if (!source || source.kind !== "pdf") {
              store.setError("AI card is only available for PDF sources");
              return;
            }
            store.run(runAddCardWithAi(store, source.id, viewPage, topic, tryGetImage));
          }}
        />
      ) : null}
      <FlashToast message={flashMessage} />
    </Modal>
  );
}
