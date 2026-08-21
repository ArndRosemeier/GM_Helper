import { Modal } from "./Modal";
import { useHost } from "../host/HostContext";

export function BusyModal() {
  const { snap } = useHost();
  if (snap.busy === null) {
    return null;
  }
  return (
    <Modal
      titleId="busy-title"
      onClose={() => undefined}
      closeOnBackdrop={false}
      closeOnEscape={false}
      className="busy-modal"
      cardClassName="busy-modal-card"
    >
      <div className="busy-spinner" aria-hidden="true" />
      <p className="eyebrow">Working</p>
      <h2 id="busy-title">{snap.busy.title}</h2>
      <p>{snap.busy.detail}</p>
    </Modal>
  );
}
