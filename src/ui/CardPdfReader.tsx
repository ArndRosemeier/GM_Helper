import { useEffect, useState } from "react";
import { useHost } from "../host/HostContext";
import type { SourceId } from "../host/ids";
import { extractPdfImagePng, type PdfPageImage } from "../lib/pdfImages";
import { clipboardWriteSupported, writeClipboardImage } from "../lib/clipboardImage";
import { loadPdf, type LoadedPdf } from "../lib/pdfPage";
import { runAddCardWithAi } from "./aiPdfCard";
import { AiTopicModal } from "./AiTopicModal";
import { FlashToast, useFlashToast } from "./FlashToast";
import { NameCardModal } from "./NameCardModal";
import { PdfPageNav } from "./PdfPageNav";
import { PdfPageView } from "./PdfPageView";

type PendingSave =
  | { kind: "page"; picture: PdfPageImage | null }
  | { kind: "image"; image: PdfPageImage };

export function CardPdfReader({
  sourceId,
  bookmarkPage,
  topic,
}: {
  sourceId: SourceId;
  bookmarkPage: number;
  topic: string;
}) {
  const { store, snap } = useHost();
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [page, setPage] = useState(bookmarkPage);
  const [selectedImage, setSelectedImage] = useState<PdfPageImage | null>(null);
  const [pending, setPending] = useState<PendingSave | null>(null);
  const [aiTopicPending, setAiTopicPending] = useState(false);
  const { message: flashMessage, flash } = useFlashToast();
  const source = snap.sources.find((item) => item.id === sourceId) ?? null;
  const bytes = source?.kind === "pdf" ? source.bytes : null;
  const offBookmark = page !== bookmarkPage;

  useEffect(() => {
    setPage(bookmarkPage);
  }, [bookmarkPage]);

  useEffect(() => {
    setSelectedImage(null);
    setPending(null);
  }, [page]);

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

  const confirmSave = (name: string): void => {
    if (pending === null) {
      store.setError("Nothing to save");
      return;
    }
    if (!pdf) {
      store.setError("PDF page is not on screen yet");
      return;
    }
    const document = pdf.document;
    const pageNumber = page;
    if (pending.kind === "image") {
      const image = pending.image;
      setPending(null);
      store.run(
        (async () => {
          const picture = await extractPdfImagePng(
            await document.getPage(pageNumber),
            image.objectName,
          );
          await store.savePdfImageAsCard(picture, name);
        })(),
      );
      return;
    }
    const pagePicture = pending.picture;
    setPending(null);
    store.run(
      (async () => {
        const picture =
          pagePicture === null
            ? null
            : await extractPdfImagePng(await document.getPage(pageNumber), pagePicture.objectName);
        await store.saveSourcePageAsCard(source.id, pageNumber, picture, name);
      })(),
    );
  };

  const onAddCardWithAi = (): void => {
    setAiTopicPending(true);
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
    const pageNumber = page;
    store.run(
      (async () => {
        const picture = await extractPdfImagePng(await document.getPage(pageNumber), image.objectName);
        await writeClipboardImage(picture);
        flash("Image copied");
      })(),
    );
  };

  return (
    <div className="card-pdf">
      {pdf ? (
        <div className="source-viewer-bar">
          <PdfPageNav page={page} pageCount={pdf.pageCount} onChange={setPage} />
          <div className="card-actions source-save-row">
            {offBookmark ? (
              <>
                <button
                  type="button"
                  onClick={() => setPending({ kind: "page", picture: selectedImage })}
                >
                  Add card
                </button>
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
                {clipboardWriteSupported() ? (
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
              </>
            ) : null}
            <button
              type="button"
              disabled={snap.busy !== null}
              onClick={onAddCardWithAi}
            >
              Add card with AI
            </button>
          </div>
        </div>
      ) : null}
      {pdf ? (
        <PdfPageView
          pdf={pdf}
          page={page}
          pickImages={offBookmark}
          selectedImageId={offBookmark ? (selectedImage?.id ?? null) : null}
          onSelectImage={offBookmark ? setSelectedImage : undefined}
        />
      ) : (
        <p className="muted">Opening the PDF…</p>
      )}
      {pending !== null ? (
        <NameCardModal
          title={pending.kind === "image" ? "Name this image card" : "Name this card"}
          fieldLabel="Name"
          confirmLabel={pending.kind === "image" ? "Add image card" : "Add card"}
          onCancel={() => setPending(null)}
          onConfirm={confirmSave}
        />
      ) : null}
      {aiTopicPending ? (
        <AiTopicModal
          initialTopic={topic.trim()}
          onCancel={() => setAiTopicPending(false)}
          onConfirm={(confirmedTopic, tryGetImage) => {
            setAiTopicPending(false);
            store.run(runAddCardWithAi(store, source.id, page, confirmedTopic, tryGetImage));
          }}
        />
      ) : null}
      <FlashToast message={flashMessage} />
    </div>
  );
}
