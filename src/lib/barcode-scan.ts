export const RETAIL_BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;
export type RetailBarcodeFormat = (typeof RETAIL_BARCODE_FORMATS)[number];

export type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

type NativeBarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

export function isCameraSupported(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export function canUseNativeRetailDetector(supportedFormats: readonly string[]): boolean {
  return RETAIL_BARCODE_FORMATS.some((format) => supportedFormats.includes(format));
}

export function nativeRetailFormats(supportedFormats: readonly string[]): RetailBarcodeFormat[] {
  return RETAIL_BARCODE_FORMATS.filter((format) => supportedFormats.includes(format));
}

function getNativeBarcodeDetector(): NativeBarcodeDetectorCtor | null {
  if (typeof globalThis === "undefined" || !("BarcodeDetector" in globalThis)) {
    return null;
  }
  return (globalThis as typeof globalThis & { BarcodeDetector: NativeBarcodeDetectorCtor })
    .BarcodeDetector;
}

export async function createBarcodeDetector(): Promise<BarcodeDetectorLike> {
  const Native = getNativeBarcodeDetector();
  if (Native) {
    try {
      const supported = Native.getSupportedFormats
        ? await Native.getSupportedFormats()
        : [...RETAIL_BARCODE_FORMATS];
      if (canUseNativeRetailDetector(supported)) {
        return new Native({ formats: nativeRetailFormats(supported) });
      }
    } catch {
      // Safari may expose a stub without EAN/UPC support — use the ponyfill.
    }
  }

  const { createPonyfillBarcodeDetector } = await import("./barcode-detector-ponyfill");
  return createPonyfillBarcodeDetector([...RETAIL_BARCODE_FORMATS]);
}

export async function openCameraStream(): Promise<MediaStream> {
  if (!isCameraSupported()) {
    throw new Error("Kamera wird nicht unterstützt.");
  }

  const attempts: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: "environment" } } },
    { audio: false, video: { facingMode: "environment" } },
    { audio: false, video: true },
  ];

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Kamera konnte nicht geöffnet werden.");
}

export function captureVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): HTMLCanvasElement | null {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width === 0 || height === 0) return null;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  return canvas;
}
