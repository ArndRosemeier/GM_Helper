import { HostProvider, useHost } from "./host/HostContext";
import { HomeShell } from "./ui/HomeShell";
import { PrepView } from "./ui/PrepView";
import { SettingsView } from "./ui/SettingsView";
import { BusyModal } from "./ui/BusyModal";
import { ErrorBanner } from "./ui/ErrorBanner";
import { featureRegistry } from "./host/features/singleton";
import "./features/registerAll";

function Surfaces() {
  const { store, snap } = useHost();

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
        <Player />
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
