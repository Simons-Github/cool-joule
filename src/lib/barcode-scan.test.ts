import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canUseNativeRetailDetector,
  createBarcodeDetector,
  isCameraSupported,
  nativeRetailFormats,
  openCameraStream,
} from "./barcode-scan";

vi.mock("./barcode-detector-ponyfill", () => {
  class MockPonyfillDetector {
    detect = vi.fn().mockResolvedValue([]);
  }
  return {
    createPonyfillBarcodeDetector: () => new MockPonyfillDetector(),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isCameraSupported", () => {
  it("is false without mediaDevices", () => {
    vi.stubGlobal("navigator", {});
    expect(isCameraSupported()).toBe(false);
  });

  it("is true when getUserMedia exists", () => {
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn() } });
    expect(isCameraSupported()).toBe(true);
  });
});

describe("native retail format checks", () => {
  it("requires at least one EAN/UPC format", () => {
    expect(canUseNativeRetailDetector(["qr_code"])).toBe(false);
    expect(canUseNativeRetailDetector(["ean_13", "qr_code"])).toBe(true);
  });

  it("keeps only retail formats the native detector supports", () => {
    expect(nativeRetailFormats(["qr_code", "ean_13", "upc_a"])).toEqual(["ean_13", "upc_a"]);
  });
});

describe("openCameraStream", () => {
  it("falls back to generic video when facingMode is overconstrained", async () => {
    const stream = { id: "cam" } as unknown as MediaStream;
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new Error("overconstrained"))
      .mockRejectedValueOnce(new Error("overconstrained"))
      .mockResolvedValueOnce(stream);

    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    await expect(openCameraStream()).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledTimes(3);
    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: false, video: true });
  });
});

describe("createBarcodeDetector", () => {
  it("uses the native detector when it supports EAN/UPC", async () => {
    class NativeDetector {
      static getSupportedFormats = async () => ["qr_code", "ean_13"];
      formats: string[];
      constructor(options?: { formats?: string[] }) {
        this.formats = options?.formats ?? [];
      }
      detect = vi.fn();
    }

    vi.stubGlobal("BarcodeDetector", NativeDetector);

    const detector = await createBarcodeDetector();
    expect(detector).toBeInstanceOf(NativeDetector);
    expect((detector as NativeDetector).formats).toEqual(["ean_13"]);
  });

  it("falls back to the ponyfill when native detection is QR-only", async () => {
    class NativeDetector {
      static getSupportedFormats = async () => ["qr_code"];
      detect = vi.fn();
    }

    vi.stubGlobal("BarcodeDetector", NativeDetector);

    const detector = await createBarcodeDetector();
    expect(detector).not.toBeInstanceOf(NativeDetector);
    expect(typeof detector.detect).toBe("function");
  });

  it("uses the ponyfill when BarcodeDetector is missing", async () => {
    const detector = await createBarcodeDetector();
    expect(typeof detector.detect).toBe("function");
  });
});
