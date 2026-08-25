import { APP_NAME, APP_SLUG } from "@/lib/app-config";

/** Elasticsearch text search — https://search.openfoodfacts.org */
export const OFF_SEARCH_URL = "https://search.openfoodfacts.org/search";
export const OFF_PRODUCT_API_URL = "https://world.openfoodfacts.org/api/v2/product";

/** Required by OFF: AppName/Version (contact or URL) */
export const OFF_USER_AGENT = `${APP_NAME}/1.0 (https://github.com/${APP_SLUG})`;

export const OFF_SEARCH_LANGS = "de,en";
export const OFF_SEARCH_FIELDS = [
  "code",
  "product_name",
  "product_name_de",
  "product_name_en",
  "product_name_other",
  "generic_name",
  "generic_name_de",
  "brands",
  "nutriments",
  "countries_tags",
  "unique_scans_n",
  "popularity_key",
  "completeness",
].join(",");

const DEFAULT_RESULT_SIZE = 25;
const SEARCH_CANDIDATE_SIZE = 40;

const GERMAN_COUNTRY_TAGS = new Set(["en:germany", "en:deutschland"]);

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
  code?: string;
  product_name?: string;
  product_name_de?: string;
  product_name_en?: string;
  product_name_other?: string[];
  generic_name?: string;
  generic_name_de?: string;
  brands?: string | string[];
  nutriments?: Record<string, number | string | undefined>;
  countries_tags?: string[];
  unique_scans_n?: number;
  popularity_key?: number;
  completeness?: number;
};

export type OffProductResponse = {
  status: number;
  code?: string;
  status_verbose?: string;
  product?: OffProduct;
};

export type OffSearchResponse = {
  hits?: OffProduct[];
  products?: OffProduct[];
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
  const kcalFallback = parseNutrientValue(nutriments?.["energy-kcal"]);
  if (kcalFallback > 0) return kcalFallback;
  const energyKj = parseNutrientValue(nutriments?.["energy_100g"]);
  return energyKj > 0 ? Math.round(energyKj / 4.184) : 0;
}

export function normalizeBrands(brands: OffProduct["brands"]): string | null {
  if (Array.isArray(brands)) {
    const parts = brands.map((b) => b.trim()).filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  if (typeof brands === "string") {
    const trimmed = brands.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

export function nameCandidates(product: OffProduct): string[] {
  const raw = [
    product.product_name_de,
    product.product_name,
    product.product_name_en,
    product.generic_name_de,
    product.generic_name,
    ...(product.product_name_other ?? []),
  ];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const name = value.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export function offProductName(product: OffProduct, query?: string): string | undefined {
  const candidates = nameCandidates(product);
  if (candidates.length === 0) return undefined;

  const needle = query?.trim().toLowerCase();
  if (needle) {
    const match = candidates.find((name) => name.toLowerCase().includes(needle));
    if (match) return match;
  }
  return candidates[0];
}

export function mapOffProductToFoodItem(
  product: OffProduct,
  barcode?: string,
  query?: string,
): FoodItem | null {
  const name = offProductName(product, query);
  if (!name || !product.nutriments) return null;

  const kcal100 = kcalFromNutriments(product.nutriments);
  if (kcal100 <= 0) return null;

  const code = barcode ?? product.code;

  return {
    name,
    brand: normalizeBrands(product.brands),
    kcal100,
    protein100: parseNutrientValue(product.nutriments["proteins_100g"]),
    carbs100: parseNutrientValue(product.nutriments["carbohydrates_100g"]),
    fat100: parseNutrientValue(product.nutriments["fat_100g"]),
    ...(code ? { barcode: code } : {}),
  };
}

export function mapOffProducts(products: OffProduct[], query?: string): FoodItem[] {
  return products.flatMap((p) => {
    const item = mapOffProductToFoodItem(p, p.code, query);
    return item ? [item] : [];
  });
}

export function isGermanProduct(countries?: string[]): boolean {
  return (countries ?? []).some((tag) => GERMAN_COUNTRY_TAGS.has(tag.toLowerCase()));
}

export function scoreSearchHit(input: {
  name: string;
  brand: string | null;
  query: string;
  relevanceIndex: number;
  uniqueScans: number;
  popularityKey: number;
  completeness: number;
  countries?: string[];
}): number {
  const query = input.query.trim().toLowerCase();
  const name = input.name.toLowerCase();
  const brand = (input.brand ?? "").toLowerCase();

  let score = 0;
  if (query) {
    if (name === query) score += 12;
    else if (name.startsWith(query)) score += 8;
    else if (name.includes(query)) score += 5;
    if (brand.includes(query)) score += 2;
  }
  if (isGermanProduct(input.countries)) score += 4;
  score += Math.min(4, Math.log10(1 + Math.max(0, input.uniqueScans)));
  if (input.popularityKey > 0) {
    score += Math.min(2, Math.log10(1 + input.popularityKey) / 6);
  }
  if (input.completeness >= 0.75) score += 1;
  score += 2 / (input.relevanceIndex + 1);
  return score;
}

export function mapAndRankSearchHits(hits: OffProduct[], query: string): FoodItem[] {
  const seenBarcodes = new Set<string>();
  const scored = hits.flatMap((hit, index) => {
    const item = mapOffProductToFoodItem(hit, hit.code, query);
    if (!item) return [];
    if (item.barcode) {
      if (seenBarcodes.has(item.barcode)) return [];
      seenBarcodes.add(item.barcode);
    }
    return [
      {
        item,
        score: scoreSearchHit({
          name: item.name,
          brand: item.brand,
          query,
          relevanceIndex: index,
          uniqueScans: hit.unique_scans_n ?? 0,
          popularityKey: hit.popularity_key ?? 0,
          completeness: hit.completeness ?? 0,
          countries: hit.countries_tags ?? [],
        }),
      },
    ];
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.item);
}

/** Strip non-digits; returns null if not a plausible EAN/UPC length (8–14). */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8 && digits.length <= 14) return digits;
  return null;
}

export function buildSearchUrl(query: string, pageSize = SEARCH_CANDIDATE_SIZE): string {
  const params = new URLSearchParams({
    q: query.trim(),
    langs: OFF_SEARCH_LANGS,
    page_size: String(pageSize),
    fields: OFF_SEARCH_FIELDS,
  });
  return `${OFF_SEARCH_URL}?${params.toString()}`;
}

export function buildProductUrl(barcode: string): string {
  const params = new URLSearchParams({
    fields: "product_name,product_name_de,generic_name,brands,nutriments",
  });
  return `${OFF_PRODUCT_API_URL}/${encodeURIComponent(barcode)}?${params.toString()}`;
}

function isAbortError(cause: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return cause instanceof Error && cause.name === "AbortError";
}

async function offFetch<T>(url: string, options: OffRequestOptions = {}): Promise<T> {
  const fetchFn = options.fetch ?? fetch;

  let res: Response;
  try {
    const init: RequestInit = { headers: { "User-Agent": OFF_USER_AGENT } };
    if (options.signal) init.signal = options.signal;
    res = await fetchFn(url, init);
  } catch (cause) {
    if (isAbortError(cause, options.signal)) throw cause;
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

  const resultSize = options.pageSize ?? DEFAULT_RESULT_SIZE;
  const candidateSize = Math.max(resultSize, SEARCH_CANDIDATE_SIZE);
  const json = await offFetch<OffSearchResponse>(buildSearchUrl(trimmed, candidateSize), options);
  const hits = json.hits ?? json.products ?? [];
  return mapAndRankSearchHits(hits, trimmed).slice(0, resultSize);
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
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Suche fehlgeschlagen. Bitte erneut versuchen.";
}
