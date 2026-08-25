export function getSupabaseConnectSrc(
  supabaseUrl = process.env["SUPABASE_URL"] ||
    (typeof import.meta !== "undefined" ? import.meta.env["VITE_SUPABASE_URL"] : undefined),
): string {
  if (typeof supabaseUrl !== "string" || !supabaseUrl.trim()) return "'self'";
  try {
    const origin = new URL(supabaseUrl).origin;
    const websocketOrigin = origin.startsWith("https://")
      ? `wss://${origin.slice("https://".length)}`
      : origin.startsWith("http://")
        ? `ws://${origin.slice("http://".length)}`
        : origin;
    return `'self' ${origin} ${websocketOrigin}`;
  } catch {
    return "'self'";
  }
}

export function securityHeaderMap(supabaseUrl?: string): Record<string, string> {
  const connectSrc = getSupabaseConnectSrc(supabaseUrl);
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data:",
      "font-src 'self'",
      `connect-src ${connectSrc}`,
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  };
}

export function applySecurityHeaders(headers: Headers, supabaseUrl?: string): void {
  for (const [key, value] of Object.entries(securityHeaderMap(supabaseUrl))) {
    headers.set(key, value);
  }
}

export function withSecurityHeaders(response: Response, supabaseUrl?: string): Response {
  const headers = new Headers(response.headers);
  applySecurityHeaders(headers, supabaseUrl);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
