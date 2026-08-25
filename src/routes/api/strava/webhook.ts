import { createFileRoute } from "@tanstack/react-router";

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
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const { handleStravaWebhookEvent } = await import("@/lib/strava.server");
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Bad Request", { status: 400 });
        }
        await handleStravaWebhookEvent(body);
        return new Response("OK");
      },
    },
  },
});
