import { createFileRoute } from "@tanstack/react-router";
import { ShortcutError } from "@/lib/shortcut";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Shortcut-Token",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

export const Route = createFileRoute("/api/shortcuts/exercise")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const { ingestShortcutRequest, shortcutHttpStatus } = await import("@/lib/shortcut.server");
        try {
          const result = await ingestShortcutRequest(request);
          return json({
            ok: true,
            duplicate: result.duplicate,
            name: result.name,
            calories: result.calories,
            date: result.date,
          });
        } catch (error) {
          if (error instanceof ShortcutError) {
            return json({ error: error.message }, shortcutHttpStatus(error));
          }
          const { logServerError } = await import("@/lib/server-auth");
          logServerError(error);
          return json({ error: "Die Aktivität konnte nicht gespeichert werden." }, 500);
        }
      },
    },
  },
});
