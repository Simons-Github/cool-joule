import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import {
  createShortcutToken,
  deleteShortcutToken,
  getShortcutTokenStatus,
} from "@/lib/shortcut-connect";
import { buildShortcutWebhookUrl, getShortcutErrorMessage } from "@/lib/shortcut";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const SHORTCUT_STATUS_QUERY = ["shortcut-token-status"] as const;

const JSON_BODY_EXAMPLE = `{
  "name": "Laufen",
  "calories": 380,
  "date": "2026-08-25"
}`;

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export function ShortcutWebhookCard() {
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState<string | null>(null);

  const status = useQuery({
    queryKey: SHORTCUT_STATUS_QUERY,
    queryFn: () => getShortcutTokenStatus(),
  });

  const token = revealed ?? status.data?.token ?? null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const webhookUrl = token ? buildShortcutWebhookUrl(origin, token) : null;

  const create = useMutation({
    mutationFn: () => createShortcutToken(),
    onSuccess: (next) => {
      setRevealed(next.token);
      queryClient.setQueryData(SHORTCUT_STATUS_QUERY, next);
      toast.success("Webhook-Token erzeugt");
    },
    onError: (error: unknown) => toast.error(getShortcutErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => deleteShortcutToken(),
    onSuccess: (next) => {
      setRevealed(null);
      queryClient.setQueryData(SHORTCUT_STATUS_QUERY, next);
      toast.success("Webhook-Token entfernt");
    },
    onError: (error: unknown) => toast.error(getShortcutErrorMessage(error)),
  });

  const busy = create.isPending || remove.isPending;

  return (
    <div className="mt-4 space-y-4 rounded-3xl bg-white p-5 shadow-lg shadow-rose-50">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Apple Watch / Kurzbefehl</h2>
        <p className="mt-1 text-sm text-slate-400">
          Ohne Strava-Abo: ein iOS-Kurzbefehl schickt Workouts an Cool Joule. Am zuverlässigsten als
          Automation „Wenn Training endet“.
        </p>
      </div>

      {status.isLoading ? (
        <Skeleton className="h-5 w-48 rounded" />
      ) : status.isError ? (
        <p className="text-sm text-rose-600">{getShortcutErrorMessage(status.error)}</p>
      ) : status.data?.configured && status.data.suffix ? (
        <p className="text-sm text-slate-600">
          Aktiv{" "}
          <span className="font-mono tabular-nums text-slate-800">••••{status.data.suffix}</span>
        </p>
      ) : (
        <p className="text-sm text-slate-400">Noch kein Webhook-Token</p>
      )}

      {webhookUrl ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">Webhook-URL (geheim halten)</p>
          <code className="block overflow-x-auto rounded-xl bg-slate-50 px-3 py-2 text-xs break-all text-slate-700">
            {webhookUrl}
          </code>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="rounded-2xl"
          disabled={busy}
          onClick={() => create.mutate()}
        >
          {create.isPending
            ? "Erzeugen…"
            : status.data?.configured
              ? "Token neu erzeugen"
              : "Token erzeugen"}
        </Button>
        {webhookUrl ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-2xl"
            disabled={busy}
            onClick={() =>
              copyText(webhookUrl).then(
                () => toast.success("URL kopiert"),
                () => toast.error("Kopieren nicht möglich"),
              )
            }
          >
            <Copy className="size-4" />
            URL kopieren
          </Button>
        ) : null}
        {status.data?.configured ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-2xl"
            disabled={busy}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? "Entfernen…" : "Token entfernen"}
          </Button>
        ) : null}
      </div>

      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
        <li>
          iPhone: App <span className="font-medium">Kurzbefehle</span> →{" "}
          <span className="font-medium">Automation</span> →{" "}
          <span className="font-medium">Wenn Training endet</span> (Apple Watch).
        </li>
        <li>
          Aktion <span className="font-medium">Inhalte von URL abrufen</span>: Methode{" "}
          <span className="font-medium">POST</span>, die kopierte URL einfügen.
        </li>
        <li>
          Anforderungskörper: <span className="font-medium">JSON</span>. Kalorien aus der Health-
          Probe „Aktiver Energieumsatz“, Name z. B. der Trainingsart.
        </li>
        <li>
          JSON-Beispiel (Datum optional, sonst heute):
          <button
            type="button"
            className="ml-2 text-rose-600 underline-offset-2 hover:underline"
            onClick={() =>
              copyText(JSON_BODY_EXAMPLE).then(
                () => toast.success("JSON kopiert"),
                () => toast.error("Kopieren nicht möglich"),
              )
            }
          >
            kopieren
          </button>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
            {JSON_BODY_EXAMPLE}
          </pre>
        </li>
      </ol>
    </div>
  );
}
