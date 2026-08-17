import { useEffect } from "react";
import { useHost } from "../host/HostContext";

/**
 * Applies persisted UI scale via CSS --ui-scale + zoom.
 * Root height is compensated in CSS (100dvh / scale) so zoom does not leave
 * empty space or a spurious page scrollbar.
 */
export function useUiScale(): void {
  const { snap } = useHost();
  const scale = snap.ready ? snap.settings.uiScale : 1;

  useEffect(() => {
    document.documentElement.style.setProperty("--ui-scale", String(scale));
  }, [scale]);
}
