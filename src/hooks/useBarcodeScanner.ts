import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  captureVideoFrame,
  createBarcodeDetector,
  isCameraSupported,
  openCameraStream,
} from "@/lib/barcode-scan";

const SCAN_INTERVAL_MS = 180;

function stopTracks(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function useBarcodeScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const [scanning, setScanning] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(isCameraSupported());
  }, []);

  const stopScan = useCallback(() => {
    sessionRef.current += 1;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    stopTracks(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  useEffect(() => () => stopScan(), [stopScan]);

  const startScan = useCallback(
    async (onDetected: (barcode: string) => void) => {
      if (!isCameraSupported()) return;

      stopScan();
      const session = sessionRef.current;
      const streamPromise = openCameraStream();
      const detectorPromise = createBarcodeDetector();

      try {
        const [stream, detector] = await Promise.all([streamPromise, detectorPromise]);
        if (session !== sessionRef.current) {
          stopTracks(stream);
          return;
        }

        flushSync(() => {
          setScanning(true);
        });

        const video = videoRef.current;
        if (!video) {
          stopTracks(stream);
          throw new Error("Video-Element nicht bereit.");
        }

        streamRef.current = stream;
        video.setAttribute("playsinline", "true");
        video.playsInline = true;
        video.muted = true;
        video.autoplay = true;
        video.srcObject = stream;

        await new Promise<void>((resolve, reject) => {
          const onLoaded = () => {
            video.removeEventListener("loadedmetadata", onLoaded);
            video.removeEventListener("error", onError);
            resolve();
          };
          const onError = () => {
            video.removeEventListener("loadedmetadata", onLoaded);
            video.removeEventListener("error", onError);
            reject(new Error("Kamerabild konnte nicht geladen werden."));
          };
          if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
            onLoaded();
            return;
          }
          video.addEventListener("loadedmetadata", onLoaded);
          video.addEventListener("error", onError);
        });

        if (session !== sessionRef.current) {
          stopTracks(stream);
          return;
        }

        await video.play();

        if (!canvasRef.current) {
          canvasRef.current = document.createElement("canvas");
        }

        let detecting = false;
        let lastAttempt = 0;

        const tick = async () => {
          if (session !== sessionRef.current) return;
          const now = performance.now();
          const videoEl = videoRef.current;
          const canvas = canvasRef.current;

          if (!detecting && videoEl && canvas && now - lastAttempt >= SCAN_INTERVAL_MS) {
            lastAttempt = now;
            const frame = captureVideoFrame(videoEl, canvas);
            if (frame) {
              detecting = true;
              try {
                const codes = await detector.detect(frame);
                const value = codes[0]?.rawValue?.trim();
                if (value && session === sessionRef.current) {
                  stopScan();
                  onDetected(value);
                  return;
                }
              } catch {
                // ignore transient detection errors while camera warms up
              } finally {
                detecting = false;
              }
            }
          }

          if (session === sessionRef.current) {
            rafRef.current = requestAnimationFrame(() => {
              void tick();
            });
          }
        };

        rafRef.current = requestAnimationFrame(() => {
          void tick();
        });
      } catch (error) {
        try {
          stopTracks(await streamPromise);
        } catch {
          // getUserMedia already failed
        }
        if (session === sessionRef.current) {
          setScanning(false);
        }
        throw error;
      }
    },
    [stopScan],
  );

  return { videoRef, scanning, supported, startScan, stopScan };
}
