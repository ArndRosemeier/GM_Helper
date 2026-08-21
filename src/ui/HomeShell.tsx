import { AmbientStrip } from "./AmbientStrip";
import { CardStack } from "./CardStack";
import { SceneRail } from "./SceneRail";
import { SearchTray } from "./SearchTray";
import { featureRegistry } from "../host/features/singleton";

export function HomeShell() {
  return (
    <div className="home-shell">
      <SceneRail />
      <main className="now">
        <div className="now-stage">
          <CardStack />
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
