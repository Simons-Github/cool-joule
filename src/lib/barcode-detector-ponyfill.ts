import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import type { RetailBarcodeFormat } from "./barcode-scan";

let wasmPrepared = false;

export function createPonyfillBarcodeDetector(formats: RetailBarcodeFormat[]) {
  if (!wasmPrepared) {
    prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith(".wasm") ? wasmUrl : `${prefix}${path}`,
      },
    });
    wasmPrepared = true;
  }
  return new BarcodeDetector({ formats });
}
