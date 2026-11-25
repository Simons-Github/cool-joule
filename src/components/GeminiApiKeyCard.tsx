import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteGeminiApiKey, getGeminiKeyStatus, saveGeminiApiKey } from "@/lib/user-gemini-key";
import { getGeminiKeyErrorMessage, validateGeminiApiKey } from "@/lib/gemini-api-key";
import { foodPhotoQuotaQueryKey, SERVER_KEY_PHOTO_LIMIT } from "@/lib/food-photo-quota";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const GEMINI_KEY_STATUS_QUERY = ["gemini-key-status"] as const;

export function GeminiApiKeyCard() {
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
      toast.success("API-Key gespeichert");
    },
    onError: (error: unknown) => toast.error(getGeminiKeyErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => deleteGeminiApiKey(),
    onSuccess: (nextStatus) => {
      setApiKey("");
      queryClient.setQueryData(GEMINI_KEY_STATUS_QUERY, nextStatus);
      void queryClient.invalidateQueries({ queryKey: foodPhotoQuotaQueryKey });
      toast.success("API-Key entfernt");
    },
    onError: (error: unknown) => toast.error(getGeminiKeyErrorMessage(error)),
  });

  const formatError = apiKey ? validateGeminiApiKey(apiKey) : null;
  const busy = save.isPending || remove.isPending;

  return (
    <div className="mt-4 space-y-4 rounded-3xl bg-white p-5 shadow-lg shadow-rose-50">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">KI-Fotoanalyse</h2>
        <p className="mt-1 text-sm text-slate-400">
          Optional: hinterlege deinen eigenen Gemini-API-Key aus{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-rose-600 underline-offset-2 hover:underline"
          >
            Google AI Studio
          </a>
          . Er wird verschlüsselt gespeichert und danach nicht mehr angezeigt. Freigeschaltete
          Accounts können den App-Key mit {SERVER_KEY_PHOTO_LIMIT} Analysen / 24 Stunden nutzen.
        </p>
      </div>

      {status.isLoading ? (
        <Skeleton className="h-5 w-48 rounded" />
      ) : status.isError ? (
        <p className="text-sm text-rose-600">{getGeminiKeyErrorMessage(status.error)}</p>
      ) : status.data?.configured && status.data.suffix ? (
        <p className="text-sm text-slate-600">
          Hinterlegt{" "}
          <span className="font-mono tabular-nums text-slate-800">••••{status.data.suffix}</span>
        </p>
      ) : (
        <p className="text-sm text-slate-400">Kein Key hinterlegt</p>
      )}

      <div className="space-y-2">
        <Label htmlFor="gemini-api-key">Gemini-API-Key</Label>
        <Input
          id="gemini-api-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="rounded-xl"
          value={apiKey}
          placeholder="Key einfügen"
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
          {save.isPending ? "Speichern…" : "Key speichern"}
        </Button>
        {status.data?.configured ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-2xl"
            disabled={busy}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? "Entfernen…" : "Key entfernen"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
