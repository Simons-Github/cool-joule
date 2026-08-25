import { useEffect, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { completeStravaConnect } from "@/lib/strava-connect";
import { getStravaErrorMessage } from "@/lib/strava";
import { APP_NAME } from "@/lib/app-config";

type CallbackSearch = {
  code?: string;
  state?: string;
  scope?: string;
  error?: string;
};

export const Route = createFileRoute("/strava/callback")({
  ssr: false,
  head: () => ({
    meta: [{ title: `Strava — ${APP_NAME}` }],
  }),
  validateSearch: (search: Record<string, unknown>): CallbackSearch => {
    const next: CallbackSearch = {};
    if (typeof search["code"] === "string") next.code = search["code"];
    if (typeof search["state"] === "string") next.state = search["state"];
    if (typeof search["scope"] === "string") next.scope = search["scope"];
    if (typeof search["error"] === "string") next.error = search["error"];
    return next;
  },
  component: StravaCallbackPage,
});

function StravaCallbackPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function finish() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Bitte zuerst anmelden, um Strava zu verbinden.");
        await navigate({ to: "/auth", replace: true });
        return;
      }

      if (search.error) {
        toast.error(
          search.error === "access_denied"
            ? "Strava-Zugriff wurde abgelehnt."
            : "Die Verbindung mit Strava ist fehlgeschlagen.",
        );
        await navigate({ to: "/profil", replace: true });
        return;
      }

      if (!search.code || !search.state) {
        toast.error("Die Strava-Anmeldung ist unvollständig. Bitte erneut verbinden.");
        await navigate({ to: "/profil", replace: true });
        return;
      }

      try {
        const payload: { code: string; state: string; scope?: string } = {
          code: search.code,
          state: search.state,
        };
        if (search.scope) payload.scope = search.scope;
        await completeStravaConnect({ data: payload });
        toast.success("Strava verbunden");
      } catch (error) {
        toast.error(getStravaErrorMessage(error));
      }
      await navigate({ to: "/profil", replace: true });
    }

    void finish();
  }, [navigate, search.code, search.error, search.scope, search.state]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-rose-50 px-4">
      <div className="max-w-sm rounded-3xl bg-white p-6 text-center shadow-lg shadow-rose-100">
        <p className="font-semibold text-slate-800">Verbindung mit Strava…</p>
        <p className="mt-2 text-sm text-slate-400">Einen Moment, wir holen deine Workouts.</p>
        <Link to="/profil" className="mt-4 inline-block text-sm font-medium text-rose-600">
          Zum Profil
        </Link>
      </div>
    </main>
  );
}
