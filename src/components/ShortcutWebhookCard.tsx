import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/react";
import { Rich } from "@/lib/i18n/rich";
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
  const { t, lang } = useI18n();
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
      toast.success(t("shortcut.created"));
    },
    onError: (error: unknown) => toast.error(getShortcutErrorMessage(error, lang)),
  });

  const remove = useMutation({
    mutationFn: () => deleteShortcutToken(),
    onSuccess: (next) => {
      setRevealed(null);
      queryClient.setQueryData(SHORTCUT_STATUS_QUERY, next);
      toast.success(t("shortcut.removed"));
    },
    onError: (error: unknown) => toast.error(getShortcutErrorMessage(error, lang)),
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
    toast.success(t("shortcut.fileLoaded"));
  }

  return (
    <div className="mt-4 space-y-4 rounded-3xl bg-white p-5 shadow-lg shadow-rose-50">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">{t("shortcut.title")}</h2>
        <p className="mt-1 text-sm text-slate-400">{t("shortcut.intro")}</p>
      </div>

      {status.isLoading ? (
        <Skeleton className="h-5 w-48 rounded" />
      ) : status.isError ? (
        <p className="text-sm text-rose-600">{getShortcutErrorMessage(status.error, lang)}</p>
      ) : status.data?.configured && status.data.suffix ? (
        <p className="text-sm text-slate-600">
          {t("shortcut.active")}{" "}
          <span className="font-mono tabular-nums text-slate-800">••••{status.data.suffix}</span>
        </p>
      ) : (
        <p className="text-sm text-slate-400">{t("shortcut.noToken")}</p>
      )}

      {webhookUrl ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">{t("shortcut.urlLabel")}</p>
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
            ? t("shortcut.creating")
            : status.data?.configured
              ? t("shortcut.regenerate")
              : t("shortcut.create")}
        </Button>
        {webhookUrl ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-2xl"
            disabled={busy}
            onClick={() =>
              copyText(webhookUrl).then(
                () => toast.success(t("shortcut.copied")),
                () => toast.error(t("shortcut.copyFailed")),
              )
            }
          >
            <Copy className="size-4" />
            {t("shortcut.copyUrl")}
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
          {t("shortcut.install")}
        </Button>
        {origin ? (
          <a
            href={fileUrl}
            download={SHORTCUT_FILE_DOWNLOAD_NAME}
            className="inline-flex h-9 items-center text-sm text-rose-600 underline-offset-2 hover:underline"
          >
            {t("shortcut.downloadFile")}
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
            {remove.isPending ? t("shortcut.removing") : t("shortcut.remove")}
          </Button>
        ) : null}
      </div>

      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
        <li>
          <Rich text={t("shortcut.step1")} />
        </li>
        <li>
          <Rich text={t("shortcut.step2")} />
        </li>
        <li>
          <Rich text={t("shortcut.step3")} />
        </li>
        <li>
          <Rich text={t("shortcut.step4")} />
        </li>
      </ol>
      <p className="text-xs text-slate-400">{t("shortcut.regenNote")}</p>
    </div>
  );
}
