import { useEffect, useRef, useState } from "react";
import { useHost } from "../host/HostContext";
import { iframeEmbedStatus } from "../lib/iframeEmbed";
import { Modal } from "./Modal";

type EmbedStatus = "loading" | "ready" | "blocked" | "slow";

export function UrlViewer() {
  const { store, snap } = useHost();
  const view = snap.urlView;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [embedStatus, setEmbedStatus] = useState<EmbedStatus>("loading");

  useEffect(() => {
    if (!view) {
      return;
    }
    setEmbedStatus("loading");
    const frame = frameRef.current;
    if (!frame) {
      return;
    }
    let cancelled = false;
    let settled = false;
    const markBlocked = (): void => {
      if (cancelled || settled) {
        return;
      }
      settled = true;
      setEmbedStatus("blocked");
    };
    const onLoad = (): void => {
      window.setTimeout(() => {
        if (cancelled || settled) {
          return;
        }
        if (iframeEmbedStatus(frame) === "blocked") {
          markBlocked();
          return;
        }
        settled = true;
        setEmbedStatus("ready");
      }, 200);
    };
    frame.addEventListener("load", onLoad);
    frame.addEventListener("error", markBlocked);
    frame.src = view.href;
    const timer = window.setTimeout(() => {
      if (cancelled || settled) {
        return;
      }
      setEmbedStatus("slow");
    }, 8000);
    return () => {
      cancelled = true;
      frame.removeEventListener("load", onLoad);
      frame.removeEventListener("error", markBlocked);
      window.clearTimeout(timer);
    };
  }, [view]);

  if (!view) {
    return null;
  }

  const showFrame = embedStatus !== "blocked";

  return (
    <Modal
      title={view.href}
      onClose={() => store.closeUrlView()}
      closeOnBackdrop={false}
      className="source-viewer-modal"
      cardClassName="source-viewer url-viewer"
    >
      <header className="source-viewer-bar">
        <div>
          <p className="eyebrow">Page</p>
          <h2 className="url-viewer-title">{view.href}</h2>
        </div>
        <div className="card-actions">
          <button type="button" onClick={() => store.failUrlViewToTab()}>
            Open in tab
          </button>
          <button type="button" onClick={() => store.closeUrlView()}>
            Close
          </button>
        </div>
      </header>
      {embedStatus === "blocked" ? (
        <div className="url-viewer-fallback">
          <p className="muted">This page will not open here.</p>
          <button type="button" onClick={() => store.failUrlViewToTab()}>
            Open in tab
          </button>
        </div>
      ) : null}
      {embedStatus === "slow" ? (
        <p className="url-viewer-slow muted">
          Still loading…
          <button type="button" onClick={() => store.failUrlViewToTab()}>
            Open in tab
          </button>
        </p>
      ) : null}
      <iframe
        className={showFrame ? "source-frame web-frame" : "source-frame web-frame hidden-frame"}
        title={view.href}
        ref={frameRef}
      />
    </Modal>
  );
}
