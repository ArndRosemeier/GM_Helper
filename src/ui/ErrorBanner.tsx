import { createPortal } from "react-dom";
import { useHost } from "../host/HostContext";
import { getModalRoot } from "./modalRoot";

export function ErrorBanner() {
  const { store, snap } = useHost();
  if (snap.error === null) {
    return null;
  }
  return (
    <>
      {/* Invisible twin keeps layout pushed down while the real bar sits above portals. */}
      <div className="banner-error banner-error-slot" aria-hidden="true">
        <div className="banner-error-dismiss">
          <span className="banner-error-message">{snap.error}</span>
          <span className="banner-error-hint">Tap to dismiss</span>
        </div>
      </div>
      {createPortal(
        <div className="banner-error banner-error-overlay" role="alert">
          <button
            type="button"
            className="banner-error-dismiss"
            onClick={() => store.setError(null)}
            aria-label="Dismiss error"
          >
            <span className="banner-error-message">{snap.error}</span>
            <span className="banner-error-hint">Tap to dismiss</span>
          </button>
        </div>,
        getModalRoot(),
      )}
    </>
  );
}
