// Phone photos are 3–8 MB. The server shrinks them to 2048px anyway, so the
// browser does it before sending: uploads get several times faster on mobile
// internet and a batch of 40 photos fits the server's request limit.

const MAX_DIMENSION = 2048;
const QUALITY = 0.85;
/** Smaller files that already fit go as they are. */
const SMALL_ENOUGH = 1.5 * 1024 * 1024;

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** A lighter copy of a photo, or the original when it can't be made smaller (unknown format, old browser). */
export async function compressImage(file: File, maxDimension = MAX_DIMENSION): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= SMALL_ENOUGH) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    // PNG may be transparent (logos): keep it PNG. Everything else becomes JPEG on white.
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    if (type === "image/jpeg") {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await toBlob(canvas, type, QUALITY);
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + (type === "image/png" ? ".png" : ".jpg");
    return new File([blob], name, { type, lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export function compressImages(files: File[]) {
  return Promise.all(files.map((file) => compressImage(file)));
}
