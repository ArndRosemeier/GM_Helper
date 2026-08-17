import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useHost } from "../host/HostContext";
import type { MediaId } from "../host/ids";
import { mediaBlocksFrom } from "../host/runCard";
import { imageUrlToPngBlob } from "../lib/imagePng";
import { saveBlobAsFile } from "../lib/saveBlob";

export function MediaViewer() {
  const { store, snap } = useHost();
  const entityId = snap.mediaViewEntityId;
  if (!entityId) {
    return null;
  }
  const entity = snap.entities.find((item) => item.id === entityId) ?? null;
  if (!entity) {
    return null;
  }
  const mediaIds = mediaBlocksFrom(entity.runCard).map((block) => block.mediaId);
  const title = entity.runCard.title;
  const busy = snap.busy !== null;

  return (
    <MediaLightbox
      title={title}
      mediaIds={mediaIds}
      mediaUrls={snap.mediaUrls}
      busy={busy}
      onClose={() => store.closeMediaView()}
      onDelete={(mediaId) => store.run(store.removeEntityImage(entityId, mediaId))}
      onModify={(mediaId, prompt) => store.run(store.modifyEntityImage(entityId, mediaId, prompt))}
      onExportError={(message) => store.setError(message)}
    />
  );
}

function MediaLightbox({
  title,
  mediaIds,
  mediaUrls,
  busy,
  onClose,
  onDelete,
  onModify,
  onExportError,
}: {
  title: string;
  mediaIds: ReadonlyArray<MediaId>;
  mediaUrls: Readonly<Record<string, string>>;
  busy: boolean;
  onClose: () => void;
  onDelete: (mediaId: MediaId) => void;
  onModify: (mediaId: MediaId, prompt: string) => void;
  onExportError: (message: string) => void;
}) {
  const [modifyingId, setModifyingId] = useState<MediaId | null>(null);
  const [modifyPrompt, setModifyPrompt] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (modifyingId !== null) {
        setModifyingId(null);
        setModifyPrompt("");
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, modifyingId]);

  const exportPng = (mediaId: MediaId, index: number): void => {
    const url = mediaUrls[mediaId];
    if (!url) {
      onExportError("That picture is missing");
      return;
    }
    const suffix = mediaIds.length > 1 ? `-${String(index + 1)}` : "";
    void saveBlobAsFile(
      () => imageUrlToPngBlob(url),
      `${safeImageFileStem(title)}${suffix}.png`,
      {
        description: "PNG image",
        accept: { "image/png": [".png"] },
      },
    ).catch((error: unknown) => {
      onExportError(error instanceof Error ? error.message : String(error));
    });
  };

  const submitModify = (): void => {
    if (modifyingId === null) {
      return;
    }
    const instructions = modifyPrompt.trim();
    if (instructions.length === 0) {
      onExportError("Modification instructions are empty");
      return;
    }
    const mediaId = modifyingId;
    setModifyingId(null);
    setModifyPrompt("");
    onModify(mediaId, instructions);
  };

  return createPortal(
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => {
        if (modifyingId !== null) {
          return;
        }
        onClose();
      }}
    >
      <div className="image-lightbox-scroll" onClick={(event) => event.stopPropagation()}>
        {mediaIds.length === 0 ? (
          <p className="muted">No pictures on this card.</p>
        ) : (
          mediaIds.map((mediaId, index) => {
            const url = mediaUrls[mediaId];
            return (
              <figure key={mediaId} className="image-lightbox-item">
                {url ? (
                  <img className="image-lightbox-img" src={url} alt={`${title} ${String(index + 1)}`} />
                ) : (
                  <p className="muted">That picture is missing.</p>
                )}
                <div className="image-lightbox-actions">
                  <button
                    type="button"
                    disabled={!url || busy}
                    onClick={() => {
                      setModifyingId(mediaId);
                      setModifyPrompt("");
                    }}
                  >
                    Modify
                  </button>
                  <button type="button" disabled={!url || busy} onClick={() => exportPng(mediaId, index)}>
                    Export PNG
                  </button>
                  <button type="button" disabled={busy} onClick={() => onDelete(mediaId)}>
                    Delete
                  </button>
                  <button type="button" className="image-lightbox-close" onClick={onClose}>
                    Close
                  </button>
                </div>
              </figure>
            );
          })
        )}
      </div>
      {modifyingId !== null
        ? createPortal(
            <div
              className="busy-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modify-image-title"
              onClick={() => {
                setModifyingId(null);
                setModifyPrompt("");
              }}
            >
              <div className="busy-modal-card" onClick={(event) => event.stopPropagation()}>
                <p className="eyebrow">Picture</p>
                <h2 id="modify-image-title">Modify this picture</h2>
                <p className="muted">
                  Describe the change. The result is added as a new image on “{title}”; the original stays.
                </p>
                <label>
                  Instructions
                  <textarea
                    value={modifyPrompt}
                    onChange={(event) => setModifyPrompt(event.target.value)}
                    placeholder="make it night, add rain…"
                    rows={4}
                    autoFocus
                  />
                </label>
                <div className="card-actions">
                  <button type="button" disabled={busy || modifyPrompt.trim().length === 0} onClick={submitModify}>
                    Generate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModifyingId(null);
                      setModifyPrompt("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>,
    document.body,
  );
}

function safeImageFileStem(title: string): string {
  const stem = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return stem.length > 0 ? stem : "image";
}
