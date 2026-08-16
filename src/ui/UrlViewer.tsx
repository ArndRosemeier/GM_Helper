import { useEffect, useRef } from "react";
import { useHost } from "../host/HostContext";
import { iframeEmbedStatus } from "../lib/iframeEmbed";

export function UrlViewer() {
  const { store, snap } = useHost();
  const view = snap.urlView;
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!view) {
      return;
    }
    const frame = frameRef.current;
    if (!frame) {
      return;
    }
    let cancelled = false;
    let settled = false;
    const fail = (): void => {
      if (cancelled || settled) {
        return;
      }
      settled = true;
      store.failUrlViewToTab();
    };
    const onLoad = (): void => {
      window.setTimeout(() => {
        if (cancelled || settled) {
          return;
        }
        if (iframeEmbedStatus(frame) === "blocked") {
          fail();
          return;
        }
        settled = true;
      }, 200);
    };
    frame.addEventListener("load", onLoad);
    frame.addEventListener("error", fail);
    frame.src = view.href;
    const timer = window.setTimeout(fail, 8000);
    return () => {
      cancelled = true;
      frame.removeEventListener("load", onLoad);
      frame.removeEventListener("error", fail);
      window.clearTimeout(timer);
    };
  }, [view, store]);

  if (!view) {
    return null;
  }

  return (
    <section className="source-viewer">
      <header className="source-viewer-bar">
        <div>
          <p className="eyebrow">Page</p>
          <h2>{view.href}</h2>
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
      <iframe className="source-frame web-frame" title={view.href} ref={frameRef} />
    </section>
  );
}
