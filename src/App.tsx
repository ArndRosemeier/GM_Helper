import { Suspense, lazy } from "react";
import { HostProvider, useHost } from "./host/HostContext";
import { HomeShell } from "./ui/HomeShell";
import { PrepView } from "./ui/PrepView";
import { SettingsView } from "./ui/SettingsView";
import { BusyModal } from "./ui/BusyModal";
import { ErrorBanner } from "./ui/ErrorBanner";
import { MediaViewer } from "./ui/MediaViewer";
import { UrlViewer } from "./ui/UrlViewer";
import { useUiScale } from "./ui/useUiScale";
import { featureRegistry } from "./host/features/singleton";
import "./features/registerAll";

const SourceViewer = lazy(() =>
  import("./ui/SourceViewer").then((module) => ({ default: module.SourceViewer })),
);

function GlobalOverlays() {
  const { snap } = useHost();
  return (
    <>
      {snap.mediaViewEntityId ? <MediaViewer /> : null}
      {snap.sourceView ? (
        <Suspense fallback={null}>
          <SourceViewer />
        </Suspense>
      ) : null}
      {snap.urlView ? <UrlViewer /> : null}
    </>
  );
}

function Surfaces() {
  const { store, snap } = useHost();
  useUiScale();

  if (!snap.ready) {
    return (
      <div className="boot">
        <ErrorBanner />
        <BusyModal />
        {snap.error === null ? <p>Opening the cockpit…</p> : null}
      </div>
    );
  }

  if (snap.surface === "table") {
    const surface = featureRegistry.playerSurfaces[0];
    if (!surface) {
      store.setError("No PlayerSurface is registered");
      return (
        <div className="boot">
          <ErrorBanner />
          <BusyModal />
        </div>
      );
    }
    const Player = surface.component;
    return (
      <div className="gm-root">
        <ErrorBanner />
        <BusyModal />
        <Suspense fallback={<p className="muted boot">Loading battleground…</p>}>
          <Player />
        </Suspense>
        <GlobalOverlays />
      </div>
    );
  }

  const body =
    snap.mode === "prep" ? <PrepView /> : snap.mode === "settings" ? <SettingsView /> : <HomeShell />;

  return (
    <div className="gm-root">
      <ErrorBanner />
      <BusyModal />
      {body}
      <GlobalOverlays />
    </div>
  );
}

export default function App() {
  return (
    <HostProvider>
      <Surfaces />
    </HostProvider>
  );
}
