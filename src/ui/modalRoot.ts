const MODAL_ROOT_ID = "gm-modal-root";

/** Dedicated body-end host so dialogs never compete with board stacking contexts. */
export function getModalRoot(): HTMLElement {
  const existing = document.getElementById(MODAL_ROOT_ID);
  if (existing instanceof HTMLElement) {
    return existing;
  }
  const root = document.createElement("div");
  root.id = MODAL_ROOT_ID;
  root.setAttribute("data-modal-root", "true");
  document.body.appendChild(root);
  return root;
}
