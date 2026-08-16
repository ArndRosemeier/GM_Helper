import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { isDeadPdfTextLayer, isRenderCancelled } from "./errors";
import { hostStore, type HostSnapshot, type HostStore } from "./store/HostStore";

const StoreContext = createContext<HostStore | null>(null);

export function HostProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void hostStore.boot().catch((error: unknown) => {
      hostStore.report(error);
    });
    const onError = (event: ErrorEvent): void => {
      hostStore.report(event.error ?? event.message);
    };
    const onRejection = (event: PromiseRejectionEvent): void => {
      if (isRenderCancelled(event.reason) || isDeadPdfTextLayer(event.reason)) {
        event.preventDefault();
        return;
      }
      hostStore.report(event.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return <StoreContext.Provider value={hostStore}>{children}</StoreContext.Provider>;
}

export function useHost(): { store: HostStore; snap: HostSnapshot } {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("useHost requires HostProvider");
  }
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { store, snap };
}
