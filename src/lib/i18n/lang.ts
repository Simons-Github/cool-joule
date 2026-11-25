import { createServerFn } from "@tanstack/react-start";
import { readLangFromCookie, type Lang } from "./index";

/** Reads the `lang` cookie from the incoming request (server only). */
export const getRequestLang = createServerFn({ method: "GET" }).handler(async (): Promise<Lang> => {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  return readLangFromCookie(getRequestHeader("cookie"));
});

/**
 * Resolves the UI language for the root route's `beforeLoad`.
 * - Server (SSR): from the request cookie, so the HTML is rendered in the right language
 *   and `<html lang>` is correct. The result is serialized into the page for hydration.
 * - Client navigations: from `document.cookie`.
 * Default is German; the browser language is never consulted.
 */
export async function resolveLang(): Promise<Lang> {
  if (typeof document === "undefined") return getRequestLang();
  return readLangFromCookie(document.cookie);
}
