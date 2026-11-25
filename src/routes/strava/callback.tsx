import { useEffect, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/react";
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
  const { t, lang } = useI18n();
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
        toast.error(t("strava.cb.signInFirst"));
        await navigate({ to: "/auth", replace: true });
        return;
      }

      if (search.error) {
        toast.error(
          search.error === "access_denied" ? t("strava.cb.denied") : t("strava.cb.failed"),
        );
        await navigate({ to: "/profil", replace: true });
        return;
      }

      if (!search.code || !search.state) {
        toast.error(t("strava.cb.incomplete"));
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
        toast.success(t("strava.cb.success"));
      } catch (error) {
        toast.error(getStravaErrorMessage(error, lang));
      }
      await navigate({ to: "/profil", replace: true });
    }

    void finish();
  }, [navigate, search.code, search.error, search.scope, search.state, t, lang]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-rose-50 px-4">
      <div className="max-w-sm rounded-3xl bg-white p-6 text-center shadow-lg shadow-rose-100">
        <p className="font-semibold text-slate-800">{t("strava.cb.title")}</p>
        <p className="mt-2 text-sm text-slate-400">{t("strava.cb.wait")}</p>
        <Link to="/profil" className="mt-4 inline-block text-sm font-medium text-rose-600">
          {t("strava.cb.toProfile")}
        </Link>
      </div>
    </main>
  );
}
