"use client";

/**
 * Downscale + re-encode an image entirely in the browser before upload, so the
 * `photos` bucket only ever stores modest JPEGs. Falls back to the original
 * file if the browser can't decode it.
 */
export async function compressImage(
  file: File,
  {
    maxEdge = 1280,
    quality = 0.82,
  }: { maxEdge?: number; quality?: number } = {},
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await loadBitmap(file);
  if (!bitmap) return file;

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap) bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) return file;

  return new File([blob], `${baseName(file)}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

/** Natural pixel size of an image file, for the picker's crop maths. */
export async function imageSize(
  file: File,
): Promise<{ width: number; height: number } | null> {
  const bitmap = await loadBitmap(file);
  if (!bitmap) return null;
  const size = { width: bitmap.width, height: bitmap.height };
  if ("close" in bitmap) bitmap.close();
  return size;
}

function baseName(file: File): string {
  return file.name.replace(/\.[^.]+$/, "") || "photo";
}

async function loadBitmap(
  file: File,
): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    if (typeof createImageBitmap === "function") {
      return await createImageBitmap(file);
    }
  } catch {
    // fall through to <img>
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export function fileExtension(file: File, fallback = "bin"): string {
  const fromType = file.type.split("/")[1];
  if (fromType) return fromType.replace("jpeg", "jpg");
  const fromName = file.name.split(".").pop();
  return fromName ? fromName.toLowerCase() : fallback;
}
