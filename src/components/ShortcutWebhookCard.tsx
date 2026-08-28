import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import {
  createShortcutToken,
  deleteShortcutToken,
  getShortcutTokenStatus,
} from "@/lib/shortcut-connect";
import {
  SHORTCUT_FILE_DOWNLOAD_NAME,
  buildShortcutFileUrl,
  buildShortcutInstallUrl,
  buildShortcutWebhookUrl,
  getShortcutErrorMessage,
} from "@/lib/shortcut";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const SHORTCUT_STATUS_QUERY = ["shortcut-token-status"] as const;

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

function isIosDevice(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
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
  const fileUrl = origin ? buildShortcutFileUrl(origin) : "";
  const installUrl = origin ? buildShortcutInstallUrl(origin) : "";

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

  function installShortcut() {
    if (isIosDevice() && installUrl) {
      window.location.assign(installUrl);
      return;
    }
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = SHORTCUT_FILE_DOWNLOAD_NAME;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success("Kurzbefehl-Datei geladen — auf dem iPhone öffnen");
  }

  return (
    <div className="mt-4 space-y-4 rounded-3xl bg-white p-5 shadow-lg shadow-rose-50">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Apple Watch / Kurzbefehl</h2>
        <p className="mt-1 text-sm text-slate-400">
          Ohne Strava-Abo: fertigen iOS-Kurzbefehl installieren. Am zuverlässigsten als Automation
          „Wenn Training endet“.
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
        <Button
          type="button"
          variant="outline"
          className="rounded-2xl"
          disabled={busy || !origin}
          onClick={installShortcut}
        >
          <Download className="size-4" />
          Kurzbefehl installieren
        </Button>
        {origin ? (
          <a
            href={fileUrl}
            download={SHORTCUT_FILE_DOWNLOAD_NAME}
            className="inline-flex h-9 items-center text-sm text-rose-600 underline-offset-2 hover:underline"
          >
            Datei laden
          </a>
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
          <span className="font-medium">Token erzeugen</span> und die Webhook-URL kopieren.
        </li>
        <li>
          <span className="font-medium">Kurzbefehl installieren</span> — beim Import die kopierte
          URL einfügen. Auf dem iPhone öffnet sich die App Kurzbefehle; sonst die Datei aufs iPhone
          legen und antippen.
        </li>
        <li>
          Den Kurzbefehl <span className="font-medium">einmal manuell starten</span> (Health-Zugriff
          erlauben). Ohne heutiges Workout kann der Lauf fehlschlagen — das ist in Ordnung.
        </li>
        <li>
          iPhone: <span className="font-medium">Kurzbefehle</span> →{" "}
          <span className="font-medium">Automation</span> →{" "}
          <span className="font-medium">Wenn Training endet</span> → Cool Joule ausführen.{" "}
          <span className="font-medium">Vor dem Ausführen fragen</span> ausschalten.
        </li>
      </ol>
      <p className="text-xs text-slate-400">
        Token neu erzeugen macht die alte URL ungültig — dann die Text-Aktion im Kurzbefehl
        aktualisieren.
      </p>
    </div>
  );
}
