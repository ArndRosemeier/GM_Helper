import { AmbientStrip } from "./AmbientStrip";
import { CardStack } from "./CardStack";
import { PinnedFacts } from "./PinnedFacts";
import { SceneRail } from "./SceneRail";
import { SearchTray } from "./SearchTray";
import { SessionLog } from "./SessionLog";
import { SomeoneHere } from "./SomeoneHere";
import { featureRegistry } from "../host/features/singleton";
import { MediaViewer } from "./MediaViewer";
import { SourceViewer } from "./SourceViewer";
import { UrlViewer } from "./UrlViewer";
import { useHost } from "../host/HostContext";

export function RunShell() {
  const { snap } = useHost();
  return (
    <div className="run-shell">
      <SceneRail />
      <main className="now">
        <div className="now-stage">
          {snap.urlView ? (
            <UrlViewer />
          ) : snap.sourceView ? (
            <SourceViewer />
          ) : snap.mediaViewId ? (
            <MediaViewer />
          ) : (
            <CardStack />
          )}
        </div>
        <AmbientStrip />
      </main>
      <aside className="edge">
        <SearchTray />
        <PinnedFacts />
        <SomeoneHere />
        <SessionLog />
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
