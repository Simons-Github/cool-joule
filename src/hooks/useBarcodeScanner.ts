import { useCallback, useEffect, useRef, useState } from "react";

const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

function isBarcodeDetectorSupported(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

export function useBarcodeScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(isBarcodeDetectorSupported());
  }, []);

  const stopScan = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  useEffect(() => () => stopScan(), [stopScan]);

  const startScan = useCallback(
    async (onDetected: (barcode: string) => void) => {
      if (!isBarcodeDetectorSupported()) return;
      stopScan();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      setScanning(true);

      const Detector = (
        window as unknown as Window & {
          BarcodeDetector: new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
        }
      ).BarcodeDetector;
      const detector = new Detector({ formats: [...BARCODE_FORMATS] });

      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;

        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes[0]?.rawValue;
          if (value) {
            stopScan();
            onDetected(value);
            return;
          }
        } catch {
          // ignore transient detection errors while camera warms up
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [stopScan],
  );

  return { videoRef, scanning, supported, startScan, stopScan };
}
