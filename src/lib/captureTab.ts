import { documentZoom } from "./documentZoom";

export async function canCaptureDisplayTab(): Promise<boolean> {
  return typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

/**
 * Capture a viewport rectangle from this tab as a PNG.
 * Uses the display-media picker with preferCurrentTab when the browser supports it.
 *
 * `region` is in client coordinates (same space as getBoundingClientRect / clientX).
 * With `html { zoom }`, client space is visual; the capture buffer is sized to the
 * layout viewport — convert via documentZoom before scaling into the video frame.
 */
export async function captureViewportRegionPng(region: {
  left: number;
  top: number;
  width: number;
  height: number;
}): Promise<Blob> {
  if (region.width < 1 || region.height < 1) {
    throw new Error("Capture region is empty");
  }
  if (!(await canCaptureDisplayTab())) {
    throw new Error("This browser cannot capture the page for Grab image");
  }

  const options: DisplayMediaStreamOptions & {
    preferCurrentTab?: boolean;
    selfBrowserSurface?: "include" | "exclude";
  } = {
    video: true,
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
  };

  const stream = await navigator.mediaDevices.getDisplayMedia(options);
  try {
    const track = stream.getVideoTracks()[0];
    if (!track) {
      throw new Error("No video track from the tab capture");
    }
    const video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    await waitForVideoFrame(video);

    const zoom = documentZoom();
    const layoutViewportW = Math.max(1, window.innerWidth / zoom);
    const layoutViewportH = Math.max(1, window.innerHeight / zoom);
    const layoutLeft = region.left / zoom;
    const layoutTop = region.top / zoom;
    const layoutWidth = region.width / zoom;
    const layoutHeight = region.height / zoom;
    const scaleX = video.videoWidth / layoutViewportW;
    const scaleY = video.videoHeight / layoutViewportH;
    const sx = Math.round(layoutLeft * scaleX);
    const sy = Math.round(layoutTop * scaleY);
    const sw = Math.max(1, Math.round(layoutWidth * scaleX));
    const sh = Math.max(1, Math.round(layoutHeight * scaleY));

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not open a 2D canvas for the capture");
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvasToPng(canvas);
  } finally {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
}

function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }
  return new Promise((resolve, reject) => {
    const onReady = (): void => {
      cleanup();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    };
    const onError = (): void => {
      cleanup();
      reject(new Error("Tab capture video failed to start"));
    };
    const cleanup = (): void => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("error", onError);
  });
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not encode the capture as PNG"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

export async function tryLoadImageUrl(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (image.naturalWidth < 1 || image.naturalHeight < 1) {
        resolve(null);
        return;
      }
      resolve(image);
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export function imageElementToPngBlob(image: HTMLImageElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("Could not open a 2D canvas for the image"));
  }
  try {
    ctx.drawImage(image, 0, 0);
  } catch {
    return Promise.reject(new Error("Could not read that image (blocked by the browser)"));
  }
  return canvasToPng(canvas);
}
