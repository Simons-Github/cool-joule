import {
  FOOD_PHOTO_JPEG_QUALITY,
  FoodPhotoError,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  estimateBase64Bytes,
  fitWithinMax,
} from "./food-photo-analysis";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new FoodPhotoError("INVALID_IMAGE", "Das Bild konnte nicht gelesen werden."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => {
      reject(new FoodPhotoError("INVALID_IMAGE", "Das Bild konnte nicht gelesen werden."));
    };
    reader.readAsDataURL(blob);
  });
}

export async function compressFoodPhoto(file: File): Promise<{
  mimeType: "image/jpeg";
  base64: string;
  previewUrl: string;
}> {
  if (file.size === 0) {
    throw new FoodPhotoError("INVALID_IMAGE", "Die Datei ist leer.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (cause) {
    throw new FoodPhotoError(
      "UNSUPPORTED_TYPE",
      "Dieses Bildformat wird nicht unterstützt. Bitte JPEG, PNG oder WebP verwenden.",
      { cause },
    );
  }

  const { width, height } = fitWithinMax(bitmap.width, bitmap.height, MAX_IMAGE_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new FoodPhotoError("INVALID_IMAGE", "Das Bild konnte nicht verarbeitet werden.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", FOOD_PHOTO_JPEG_QUALITY);
  });
  if (!blob) {
    throw new FoodPhotoError("INVALID_IMAGE", "Das Bild konnte nicht komprimiert werden.");
  }

  const base64 = await blobToBase64(blob);
  if (estimateBase64Bytes(base64) > MAX_IMAGE_BYTES) {
    throw new FoodPhotoError(
      "TOO_LARGE",
      "Das Bild ist zu groß. Bitte ein kleineres Foto verwenden.",
    );
  }

  return { mimeType: "image/jpeg", base64, previewUrl: URL.createObjectURL(blob) };
}
