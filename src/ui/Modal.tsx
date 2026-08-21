import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { getModalRoot } from "./modalRoot";

const ModalDepthContext = createContext(0);

const BASE_Z = 10_000;
const Z_STEP = 10;

type CloseHandler = () => void;

const closeStack: CloseHandler[] = [];

function pushClose(handler: CloseHandler): void {
  closeStack.push(handler);
}

function popClose(handler: CloseHandler): void {
  const index = closeStack.lastIndexOf(handler);
  if (index < 0) {
    throw new Error("Modal close handler was not on the stack");
  }
  closeStack.splice(index, 1);
}

function onDocumentKeyDown(event: KeyboardEvent): void {
  if (event.key !== "Escape") {
    return;
  }
  const top = closeStack[closeStack.length - 1];
  if (top === undefined) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  top();
}

let escapeBound = false;

function ensureEscapeBinding(): void {
  if (escapeBound) {
    return;
  }
  document.addEventListener("keydown", onDocumentKeyDown, true);
  escapeBound = true;
}

export function Modal({
  title,
  titleId,
  onClose,
  children,
  className,
  cardClassName,
  closeOnBackdrop = true,
  closeOnEscape = true,
}: {
  title?: string;
  titleId?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  cardClassName?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}) {
  const parentDepth = useContext(ModalDepthContext);
  const depth = parentDepth + 1;
  const autoTitleId = useId();
  const labelledBy = titleId ?? (title !== undefined ? autoTitleId : undefined);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!closeOnEscape) {
      return;
    }
    ensureEscapeBinding();
    const handler = (): void => {
      onCloseRef.current();
    };
    pushClose(handler);
    return () => {
      popClose(handler);
    };
  }, [closeOnEscape]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return createPortal(
    <div
      className={["app-modal", className].filter(Boolean).join(" ")}
      style={{ zIndex: BASE_Z + depth * Z_STEP }}
      role="dialog"
      aria-modal="true"
      aria-label={labelledBy === undefined ? title : undefined}
      aria-labelledby={labelledBy}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={["app-modal-card", cardClassName].filter(Boolean).join(" ")}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {title !== undefined && titleId === undefined ? (
          <h2 id={autoTitleId} className="visually-hidden">
            {title}
          </h2>
        ) : null}
        <ModalDepthContext.Provider value={depth}>{children}</ModalDepthContext.Provider>
      </div>
    </div>,
    getModalRoot(),
  );
}
