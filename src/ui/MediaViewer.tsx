import { useHost } from "../host/HostContext";

export function MediaViewer() {
  const { store, snap } = useHost();
  const mediaId = snap.mediaViewId;
  if (!mediaId) {
    return null;
  }
  const url = snap.mediaUrls[mediaId];
  if (!url) {
    return (
      <section className="source-viewer">
        <p className="muted">That picture is missing.</p>
        <button type="button" onClick={() => store.closeMediaView()}>
          Close
        </button>
      </section>
    );
  }
  const owner = snap.entities.find((entity) =>
    entity.runCard.blocks.some((block) => block.kind === "media" && block.mediaId === mediaId),
  );
  const title = owner?.runCard.title ?? "Picture";

  return (
    <section className="source-viewer">
      <header className="source-viewer-bar">
        <div>
          <p className="eyebrow">Picture</p>
          <h2>{title}</h2>
        </div>
        <div className="card-actions">
          <button type="button" onClick={() => store.run(store.setBattlegroundMap(mediaId))}>
            Use as map
          </button>
          <button type="button" onClick={() => store.closeMediaView()}>
            Close
          </button>
        </div>
      </header>
      <img className="source-image" src={url} alt={title} />
    </section>
  );
}
