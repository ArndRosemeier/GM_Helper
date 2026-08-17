/** Decode an image URL and re-encode as PNG. */
export async function imageUrlToPngBlob(url: string): Promise<Blob> {
  const image = await loadHtmlImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  if (canvas.width < 1 || canvas.height < 1) {
    throw new Error("Image has no pixels to export");
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not open a 2D canvas for PNG export");
  }
  ctx.drawImage(image, 0, 0);
  return await canvasToPngBlob(canvas);
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode the image for export"));
    image.src = url;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not encode the image as PNG"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}
