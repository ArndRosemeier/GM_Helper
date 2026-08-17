import { AmbientStrip } from "./AmbientStrip";
import { CardStack } from "./CardStack";
import { SceneRail } from "./SceneRail";
import { SearchTray } from "./SearchTray";
import { featureRegistry } from "../host/features/singleton";
import { MediaViewer } from "./MediaViewer";
import { SourceViewer } from "./SourceViewer";
import { UrlViewer } from "./UrlViewer";
import { useHost } from "../host/HostContext";

export function HomeShell() {
  const { snap } = useHost();
  return (
    <div className="home-shell">
      <SceneRail />
      <main className="now">
        <div className="now-stage">
          {snap.urlView ? (
            <UrlViewer />
          ) : snap.sourceView ? (
            <SourceViewer />
          ) : (
            <CardStack />
          )}
          {snap.mediaViewId ? <MediaViewer /> : null}
        </div>
        <AmbientStrip />
      </main>
      <aside className="edge">
        <SearchTray />
        {featureRegistry.rails.map((entry) => {
          const Section = entry.component;
          return (
            <section key={entry.id}>
              <h3>{entry.title}</h3>
              <Section />
            </section>
          );
        })}
      </aside>
    </div>
  );
}
