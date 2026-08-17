import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useHost } from "../host/HostContext";

export function MediaViewer() {
  const { store, snap } = useHost();
  const mediaId = snap.mediaViewId;
  if (!mediaId) {
    return null;
  }
  const url = snap.mediaUrls[mediaId];
  const owner = snap.entities.find((entity) =>
    entity.runCard.blocks.some((block) => block.kind === "media" && block.mediaId === mediaId),
  );
  const title = owner?.runCard.title ?? "Picture";

  return (
    <MediaLightbox
      title={title}
      url={url}
      onClose={() => store.closeMediaView()}
    />
  );
}

function MediaLightbox({
  title,
  url,
  onClose,
}: {
  title: string;
  url: string | undefined;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <button type="button" className="image-lightbox-close" onClick={onClose}>
        Close
      </button>
      {url ? (
        <img
          className="image-lightbox-img"
          src={url}
          alt={title}
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <p className="muted">That picture is missing.</p>
      )}
    </div>,
    document.body,
  );
}
