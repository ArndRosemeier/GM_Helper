import { useEffect } from "react";
import { postureFromAngles } from "../lib/posture";
import type { HostStore } from "../host/store/HostStore";

const FLAT_HOLD_MS = 800;

export function usePosture(store: HostStore): void {
  useEffect(() => {
    let flatTimer: number | null = null;
    const onOrient = (event: DeviceOrientationEvent): void => {
      if (event.beta === null || event.gamma === null) {
        return;
      }
      const posture = postureFromAngles(event.beta, event.gamma);
      if (posture === "tilted") {
        if (flatTimer !== null) {
          window.clearTimeout(flatTimer);
          flatTimer = null;
        }
        store.applyPosture("tilted");
        return;
      }
      if (flatTimer !== null) {
        return;
      }
      flatTimer = window.setTimeout(() => {
        flatTimer = null;
        store.applyPosture("flat");
      }, FLAT_HOLD_MS);
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      if (flatTimer !== null) {
        window.clearTimeout(flatTimer);
      }
    };
  }, [store]);
}
