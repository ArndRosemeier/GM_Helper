import { featureRegistry } from "../host/features/singleton";
import { useHost } from "../host/HostContext";

export function AmbientStrip() {
  const { snap } = useHost();
  return (
    <footer className="ambient">
      <div className="now-session">
        <span className="eyebrow">Now</span>
        <strong>{snap.session?.title ?? "No campaign"}</strong>
      </div>
      {featureRegistry.ambients.map((entry) => {
        const Widget = entry.component;
        return <Widget key={entry.id} />;
      })}
    </footer>
  );
}
