import { featureRegistry } from "../host/features/singleton";
import { useHost } from "../host/HostContext";

export function AmbientStrip() {
  const { snap } = useHost();
  return (
    <footer className="ambient">
      <div className="now-scene">
        <span className="eyebrow">Now</span>
        <strong>{snap.scene?.title ?? "No scene"}</strong>
      </div>
      {featureRegistry.ambients.map((entry) => {
        const Widget = entry.component;
        return <Widget key={entry.id} />;
      })}
    </footer>
  );
}
