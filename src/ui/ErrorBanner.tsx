import { createPortal } from "react-dom";
import { useHost } from "../host/HostContext";

export function ErrorBanner() {
  const { store, snap } = useHost();
  if (snap.error === null) {
    return null;
  }
  return createPortal(
    <button type="button" className="banner-error" onClick={() => store.setError(null)}>
      {snap.error}
    </button>,
    document.body,
  );
}
