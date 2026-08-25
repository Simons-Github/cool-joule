import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function isOpaqueSupabaseKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createAdminFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isOpaqueSupabaseKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export function createSupabaseAdmin(): SupabaseClient<Database> {
  const url =
    process.env["SUPABASE_URL"] ||
    (typeof import.meta !== "undefined" ? import.meta.env["VITE_SUPABASE_URL"] : undefined);
  const secretKey = process.env["SUPABASE_SECRET_KEY"] || process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!url || !secretKey) {
    throw new Error(
      "Server-Konfiguration unvollständig. Bitte SUPABASE_SECRET_KEY (ohne VITE_-Prefix) setzen.",
    );
  }

  return createClient<Database>(url, secretKey, {
    global: { fetch: createAdminFetch(secretKey) },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
