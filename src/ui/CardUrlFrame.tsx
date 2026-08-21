import { useEffect, useRef, useState } from "react";
import { useHost } from "../host/HostContext";
import { iframeEmbedStatus, openExternalTab } from "../lib/iframeEmbed";

export function CardUrlFrame({ href }: { href: string }) {
  const { store } = useHost();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }
    let cancelled = false;
    setBlocked(false);
    const onLoad = (): void => {
      window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        if (iframeEmbedStatus(frame) === "blocked") {
          setBlocked(true);
        }
      }, 200);
    };
    frame.addEventListener("load", onLoad);
    frame.src = href;
    return () => {
      cancelled = true;
      frame.removeEventListener("load", onLoad);
      frame.removeAttribute("src");
    };
  }, [href]);

  return (
    <div className="card-url">
      <div className="card-actions card-url-actions">
        <button type="button" onClick={() => store.openUrlView(href)}>
          Open full page
        </button>
        {blocked ? (
          <>
            <p className="muted">This page will not embed here.</p>
            <button
              type="button"
              onClick={() => {
                if (!openExternalTab(href)) {
                  store.setError("Browser blocked the new tab.");
                }
              }}
            >
              Open in tab
            </button>
          </>
        ) : null}
      </div>
      <iframe
        className={blocked ? "card-url-frame hidden-frame" : "source-frame web-frame card-url-frame"}
        title={href}
        ref={frameRef}
      />
    </div>
  );
}
