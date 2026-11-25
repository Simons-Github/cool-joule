import { createT, type TFunction } from "@/lib/i18n";

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

export async function openCameraStream(t: TFunction = createT("de")): Promise<MediaStream> {
  if (!isCameraSupported()) {
    throw new Error(t("camera.unsupported"));
  }

  // Safari/iOS defaults to a low-resolution feed; barcodes are unreadable without a higher one.
  const attempts: MediaStreamConstraints[] = [
    {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    },
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

  throw lastError instanceof Error ? lastError : new Error(t("camera.openFailed"));
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

/** Best-effort: ask the camera for continuous autofocus (ignored where unsupported). */
export async function enableContinuousFocus(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track?.applyConstraints) return;
  try {
    await track.applyConstraints({
      advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
    });
  } catch {
    // focusMode is not supported on every browser/camera
  }
}
