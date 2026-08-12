import { APP_NAME, APP_SLUG } from "@/lib/app-config";

/** Open Food Facts search API — https://world.openfoodfacts.org */

export const OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
export const OFF_PRODUCT_API_URL = "https://world.openfoodfacts.org/api/v2/product";

/** Required by OFF: AppName/Version (contact or URL) */
export const OFF_USER_AGENT = `${APP_NAME}/1.0 (https://github.com/${APP_SLUG})`;

export type FoodItem = {
  name: string;
  brand: string | null;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  barcode?: string;
};

export type OffProduct = {
  product_name?: string;
  product_name_de?: string;
  generic_name?: string;
  brands?: string;
  nutriments?: Record<string, number | string | undefined>;
};

export type OffProductResponse = {
  status: number;
  code?: string;
  status_verbose?: string;
  product?: OffProduct;
};

export type OpenFoodFactsErrorCode =
  | "EMPTY_QUERY"
  | "INVALID_BARCODE"
  | "NOT_FOUND"
  | "INCOMPLETE_PRODUCT"
  | "NETWORK"
  | "HTTP"
  | "PARSE";

export class OpenFoodFactsError extends Error {
  readonly code: OpenFoodFactsErrorCode;
  readonly status?: number;

  constructor(
    code: OpenFoodFactsErrorCode,
    message: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message);
    this.name = "OpenFoodFactsError";
    this.code = code;
    if (options?.status !== undefined) this.status = options.status;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export type OffRequestOptions = {
  fetch?: typeof fetch;
  signal?: AbortSignal;
};

export function parseNutrientValue(value: unknown): number {
  const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : 0;
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function kcalFromNutriments(nutriments: OffProduct["nutriments"]): number {
  const kcalDirect = parseNutrientValue(nutriments?.["energy-kcal_100g"]);
  if (kcalDirect > 0) return kcalDirect;
  const energyKj = parseNutrientValue(nutriments?.["energy_100g"]);
  return energyKj > 0 ? Math.round(energyKj / 4.184) : 0;
}

export function offProductName(product: OffProduct): string | undefined {
  return product.product_name || product.product_name_de || product.generic_name;
}

export function mapOffProductToFoodItem(product: OffProduct, barcode?: string): FoodItem | null {
  const name = offProductName(product);
  if (!name || !product.nutriments) return null;

  const kcal100 = kcalFromNutriments(product.nutriments);
  if (kcal100 <= 0) return null;

  return {
    name,
    brand: product.brands ?? null,
    kcal100,
    protein100: parseNutrientValue(product.nutriments["proteins_100g"]),
    carbs100: parseNutrientValue(product.nutriments["carbohydrates_100g"]),
    fat100: parseNutrientValue(product.nutriments["fat_100g"]),
    ...(barcode ? { barcode } : {}),
  };
}

export function mapOffProducts(products: OffProduct[]): FoodItem[] {
  return products.flatMap((p) => {
    const item = mapOffProductToFoodItem(p);
    return item ? [item] : [];
  });
}

/** Strip non-digits; returns null if not a plausible EAN/UPC length (8–14). */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8 && digits.length <= 14) return digits;
  return null;
}

export function buildSearchUrl(query: string, pageSize = 25): string {
  const params = new URLSearchParams({
    search_terms: query.trim(),
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: String(pageSize),
    fields: "product_name,product_name_de,generic_name,brands,nutriments",
  });
  return `${OFF_SEARCH_URL}?${params.toString()}`;
}

export function buildProductUrl(barcode: string): string {
  const params = new URLSearchParams({
    fields: "product_name,product_name_de,generic_name,brands,nutriments",
  });
  return `${OFF_PRODUCT_API_URL}/${encodeURIComponent(barcode)}?${params.toString()}`;
}

async function offFetch<T>(url: string, options: OffRequestOptions = {}): Promise<T> {
  const fetchFn = options.fetch ?? fetch;

  let res: Response;
  try {
    const init: RequestInit = { headers: { "User-Agent": OFF_USER_AGENT } };
    if (options.signal) init.signal = options.signal;
    res = await fetchFn(url, init);
  } catch (cause) {
    throw new OpenFoodFactsError(
      "NETWORK",
      "Netzwerkfehler. Bitte Internetverbindung prüfen und erneut versuchen.",
      { cause },
    );
  }

  if (!res.ok) {
    throw new OpenFoodFactsError(
      "HTTP",
      `Open Food Facts ist momentan nicht erreichbar (HTTP ${res.status}).`,
      { status: res.status },
    );
  }

  try {
    return (await res.json()) as T;
  } catch (cause) {
    throw new OpenFoodFactsError(
      "PARSE",
      "Antwort von Open Food Facts konnte nicht gelesen werden.",
      { cause },
    );
  }
}

export type SearchProductsOptions = OffRequestOptions & {
  pageSize?: number;
};

export async function searchProducts(
  query: string,
  options: SearchProductsOptions = {},
): Promise<FoodItem[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new OpenFoodFactsError("EMPTY_QUERY", "Suchbegriff darf nicht leer sein.");
  }

  const json = await offFetch<{ products?: OffProduct[] }>(
    buildSearchUrl(trimmed, options.pageSize),
    options,
  );

  return mapOffProducts(json.products ?? []);
}

export type LookupProductOptions = OffRequestOptions;

export async function lookupProductByBarcode(
  rawBarcode: string,
  options: LookupProductOptions = {},
): Promise<FoodItem> {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode) {
    throw new OpenFoodFactsError(
      "INVALID_BARCODE",
      "Ungültiger Barcode. Bitte 8–14 Ziffern eingeben (EAN/UPC).",
    );
  }

  const json = await offFetch<OffProductResponse>(buildProductUrl(barcode), options);

  if (json.status !== 1 || !json.product) {
    throw new OpenFoodFactsError(
      "NOT_FOUND",
      `Kein Produkt mit Barcode ${barcode} in Open Food Facts gefunden.`,
    );
  }

  const item = mapOffProductToFoodItem(json.product, json.code ?? barcode);
  if (!item) {
    throw new OpenFoodFactsError(
      "INCOMPLETE_PRODUCT",
      "Produkt gefunden, aber es fehlen Nährwertangaben pro 100 g.",
    );
  }

  return item;
}

export function getOpenFoodFactsErrorMessage(error: unknown): string {
  if (error instanceof OpenFoodFactsError) return error.message;
  return "Suche fehlgeschlagen. Bitte erneut versuchen.";
}
