import { useHost } from "../host/HostContext";

export function BusyModal() {
  const { snap } = useHost();
  if (snap.busy === null) {
    return null;
  }
  return (
    <div className="busy-modal" role="dialog" aria-modal="true" aria-labelledby="busy-title">
      <div className="busy-modal-card">
        <div className="busy-spinner" aria-hidden="true" />
        <p className="eyebrow">Working</p>
        <h2 id="busy-title">{snap.busy.title}</h2>
        <p>{snap.busy.detail}</p>
      </div>
    </div>
  );
}
