import { createFileRoute } from "@tanstack/react-router";
import type { StravaWebhookHttpStatus } from "@/lib/strava";

function webhookResponse(status: StravaWebhookHttpStatus): Response {
  const body =
    status === 200
      ? "OK"
      : status === 400
        ? "Bad Request"
        : status === 429
          ? "Too Many Requests"
          : status === 503
            ? "Service Unavailable"
            : "Forbidden";
  const headers = new Headers();
  if (status === 429) headers.set("Retry-After", "60");
  return new Response(body, { status, headers });
}

export const Route = createFileRoute("/api/strava/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { verifyWebhookToken } = await import("@/lib/strava.server");
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const challenge = url.searchParams.get("hub.challenge");
        const token = url.searchParams.get("hub.verify_token");
        if (mode === "subscribe" && challenge && verifyWebhookToken(token)) {
          return Response.json({ "hub.challenge": challenge });
        }
        return webhookResponse(403);
      },
      POST: async ({ request }) => {
        const { handleStravaWebhookEvent } = await import("@/lib/strava.server");
        return webhookResponse(await handleStravaWebhookEvent(request));
      },
    },
  },
});
