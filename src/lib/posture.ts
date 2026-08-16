export type Posture = "flat" | "tilted";

const FLAT_DEG = 18;

export function postureFromAngles(beta: number, gamma: number): Posture {
  const faceUp = Math.abs(beta) <= FLAT_DEG && Math.abs(gamma) <= FLAT_DEG;
  return faceUp ? "flat" : "tilted";
}

export type OrientationPermission = "granted" | "denied" | "unsupported" | "prompt";

type OrientationPermissionDescriptor = {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export async function requestOrientationPermission(): Promise<OrientationPermission> {
  const ctor = DeviceOrientationEvent as unknown as OrientationPermissionDescriptor;
  if (typeof ctor.requestPermission === "function") {
    const result = await ctor.requestPermission();
    return result;
  }
  if (typeof window.DeviceOrientationEvent === "undefined") {
    return "unsupported";
  }
  return "granted";
}
