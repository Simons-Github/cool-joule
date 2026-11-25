import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/react";
import { deleteGeminiApiKey, getGeminiKeyStatus, saveGeminiApiKey } from "@/lib/user-gemini-key";
import { getGeminiKeyErrorMessage, validateGeminiApiKey } from "@/lib/gemini-api-key";
import { foodPhotoQuotaQueryKey, SERVER_KEY_PHOTO_LIMIT } from "@/lib/food-photo-quota";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const GEMINI_KEY_STATUS_QUERY = ["gemini-key-status"] as const;

export function GeminiApiKeyCard() {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");

  const status = useQuery({
    queryKey: GEMINI_KEY_STATUS_QUERY,
    queryFn: () => getGeminiKeyStatus(),
  });

  const save = useMutation({
    mutationFn: async (value: string) => saveGeminiApiKey({ data: { apiKey: value } }),
    onSuccess: (nextStatus) => {
      setApiKey("");
      queryClient.setQueryData(GEMINI_KEY_STATUS_QUERY, nextStatus);
      void queryClient.invalidateQueries({ queryKey: foodPhotoQuotaQueryKey });
      toast.success(t("gemini.saved"));
    },
    onError: (error: unknown) => toast.error(getGeminiKeyErrorMessage(error, lang)),
  });

  const remove = useMutation({
    mutationFn: () => deleteGeminiApiKey(),
    onSuccess: (nextStatus) => {
      setApiKey("");
      queryClient.setQueryData(GEMINI_KEY_STATUS_QUERY, nextStatus);
      void queryClient.invalidateQueries({ queryKey: foodPhotoQuotaQueryKey });
      toast.success(t("gemini.removed"));
    },
    onError: (error: unknown) => toast.error(getGeminiKeyErrorMessage(error, lang)),
  });

  const formatError = apiKey ? validateGeminiApiKey(apiKey, lang) : null;
  const busy = save.isPending || remove.isPending;

  return (
    <div className="mt-4 space-y-4 rounded-3xl bg-white p-5 shadow-lg shadow-rose-50">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">{t("gemini.title")}</h2>
        <p className="mt-1 text-sm text-slate-400">
          {t("gemini.intro1")}{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-rose-600 underline-offset-2 hover:underline"
          >
            Google AI Studio
          </a>
          {t("gemini.intro2", { limit: SERVER_KEY_PHOTO_LIMIT })}
        </p>
      </div>

      {status.isLoading ? (
        <Skeleton className="h-5 w-48 rounded" />
      ) : status.isError ? (
        <p className="text-sm text-rose-600">{getGeminiKeyErrorMessage(status.error, lang)}</p>
      ) : status.data?.configured && status.data.suffix ? (
        <p className="text-sm text-slate-600">
          {t("gemini.stored")}{" "}
          <span className="font-mono tabular-nums text-slate-800">••••{status.data.suffix}</span>
        </p>
      ) : (
        <p className="text-sm text-slate-400">{t("gemini.none")}</p>
      )}

      <div className="space-y-2">
        <Label htmlFor="gemini-api-key">{t("gemini.label")}</Label>
        <Input
          id="gemini-api-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="rounded-xl"
          value={apiKey}
          placeholder={t("gemini.placeholder")}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={busy}
        />
        {formatError ? <p className="text-xs text-rose-600">{formatError}</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="rounded-2xl"
          disabled={busy || !apiKey.trim() || Boolean(formatError)}
          onClick={() => save.mutate(apiKey)}
        >
          {save.isPending ? t("gemini.saving") : t("gemini.save")}
        </Button>
        {status.data?.configured ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-2xl"
            disabled={busy}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? t("gemini.removing") : t("gemini.remove")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
