import { useHost } from "../host/HostContext";

export function ErrorBanner() {
  const { store, snap } = useHost();
  if (snap.error === null) {
    return null;
  }
  return (
    <button type="button" className="banner-error" onClick={() => store.setError(null)}>
      {snap.error}
    </button>
  );
}
