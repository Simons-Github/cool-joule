import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/react";
import { Rich } from "@/lib/i18n/rich";
import {
  disconnectStrava,
  getStravaStatus,
  startStravaConnect,
  syncStravaActivities,
} from "@/lib/strava-connect";
import { getStravaErrorMessage } from "@/lib/strava";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const STRAVA_STATUS_QUERY = ["strava-status"] as const;

function StravaMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169"
      />
    </svg>
  );
}

export function StravaConnectCard() {
  const { t, tp, lang } = useI18n();
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: STRAVA_STATUS_QUERY,
    queryFn: () => getStravaStatus(),
  });

  const connect = useMutation({
    mutationFn: () => startStravaConnect(),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (error: unknown) => toast.error(getStravaErrorMessage(error, lang)),
  });

  const sync = useMutation({
    mutationFn: () => syncStravaActivities({ data: { force: true } }),
    onSuccess: (result) => {
      queryClient.setQueryData(STRAVA_STATUS_QUERY, {
        configured: result.configured,
        connected: result.connected,
        athleteName: status.data?.athleteName ?? null,
        lastSyncedAt: result.lastSyncedAt,
      });
      void queryClient.invalidateQueries({ queryKey: ["exercise_logs"] });
      toast.success(
        result.imported > 0 ? tp("strava.imported", result.imported) : t("strava.noNew"),
      );
    },
    onError: (error: unknown) => toast.error(getStravaErrorMessage(error, lang)),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectStrava(),
    onSuccess: (next) => {
      queryClient.setQueryData(STRAVA_STATUS_QUERY, next);
      toast.success(t("strava.disconnected"));
    },
    onError: (error: unknown) => toast.error(getStravaErrorMessage(error, lang)),
  });

  const busy = connect.isPending || sync.isPending || disconnect.isPending;

  return (
    <div className="mt-4 space-y-4 rounded-3xl bg-white p-5 shadow-lg shadow-rose-50">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Strava</h2>
        <p className="mt-1 text-sm text-slate-400">{t("strava.intro")}</p>
      </div>

      {status.isLoading ? (
        <Skeleton className="h-5 w-48 rounded" />
      ) : status.isError ? (
        <p className="text-sm text-rose-600">{getStravaErrorMessage(status.error, lang)}</p>
      ) : !status.data?.configured ? (
        <p className="text-sm text-slate-400">
          <Rich text={t("strava.notConfigured")} />
        </p>
      ) : status.data.connected ? (
        <p className="text-sm text-slate-600">
          {status.data.athleteName ? (
            <Rich text={t("strava.connectedAs", { name: status.data.athleteName })} />
          ) : (
            t("strava.connected")
          )}
        </p>
      ) : (
        <p className="text-sm text-slate-400">{t("strava.notConnected")}</p>
      )}

      {status.data?.configured ? (
        <div className="flex flex-wrap items-center gap-2">
          {status.data.connected ? (
            <>
              <Button
                type="button"
                className="rounded-2xl"
                disabled={busy}
                onClick={() => sync.mutate()}
              >
                {sync.isPending ? t("strava.syncing") : t("strava.syncNow")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl"
                disabled={busy}
                onClick={() => disconnect.mutate()}
              >
                {disconnect.isPending ? t("strava.disconnecting") : t("strava.disconnect")}
              </Button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => connect.mutate()}
              aria-label={t("strava.connectAria")}
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#FC4C02] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#E34402] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <StravaMark className="size-6" />
              {connect.isPending ? t("strava.redirecting") : "Connect with Strava"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
