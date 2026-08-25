import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { analyzeFoodPhoto, getFoodPhotoQuota } from "@/lib/analyze-food-photo";
import { compressFoodPhoto } from "@/lib/compress-food-photo";
import {
  getFoodPhotoErrorMessage,
  scaleMacros,
  type AnalyzedFoodItem,
  type PhotoDraft,
} from "@/lib/food-photo-analysis";
import {
  SERVER_KEY_PHOTO_LIMIT,
  foodPhotoQuotaQueryKey,
  formatQuotaReset,
  isFoodPhotoQuotaBlocked,
  type FoodPhotoQuota,
} from "@/lib/food-photo-quota";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

export function FoodPhotoResults({
  drafts,
  onChange,
  onReset,
  onAdd,
  adding,
}: {
  drafts: PhotoDraft[];
  onChange: (drafts: PhotoDraft[]) => void;
  onReset: () => void;
  onAdd: () => void;
  adding: boolean;
}) {
  const selectedCount = drafts.filter((d) => d.selected).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Nährwerte aus Open Food Facts, sonst KI-Schätzung — bitte prüfen.
      </p>
      <ScrollArea className="h-72">
        <div className="space-y-2 pr-3">
          {drafts.map((draft) => {
            const grams = Number(draft.grams) || 0;
            const macros = scaleMacros(draft, grams);
            return (
              <div key={draft.id} className="rounded-2xl bg-rose-50/60 p-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-2 size-4 accent-rose-500"
                    checked={draft.selected}
                    onChange={(e) =>
                      onChange(
                        drafts.map((item) =>
                          item.id === draft.id ? { ...item, selected: e.target.checked } : item,
                        ),
                      )
                    }
                    aria-label={`${draft.name} auswählen`}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      value={draft.name}
                      onChange={(e) =>
                        onChange(
                          drafts.map((item) =>
                            item.id === draft.id ? { ...item, name: e.target.value } : item,
                          ),
                        )
                      }
                      aria-label="Name"
                    />
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`grams-${draft.id}`} className="shrink-0 text-xs">
                        Menge (g)
                      </Label>
                      <Input
                        id={`grams-${draft.id}`}
                        type="number"
                        min="1"
                        value={draft.grams}
                        onChange={(e) =>
                          onChange(
                            drafts.map((item) =>
                              item.id === draft.id ? { ...item, grams: e.target.value } : item,
                            ),
                          )
                        }
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Entfernen"
                        onClick={() => onChange(drafts.filter((item) => item.id !== draft.id))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {macros.calories} kcal · {macros.protein} g E · {macros.carbs} g KH ·{" "}
                      {macros.fat} g F{draft.confidence === "low" ? " · unsichere Schätzung" : ""}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onReset}>
          Anderes Foto
        </Button>
        <Button type="button" onClick={onAdd} disabled={adding || selectedCount === 0}>
          {adding ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Speichern…
            </>
          ) : (
            `Ausgewählte hinzufügen (${selectedCount})`
          )}
        </Button>
      </div>
    </div>
  );
}

function ProfileKeyLink() {
  return (
    <Link to="/profil" className="font-medium text-rose-600 underline-offset-2 hover:underline">
      Profil
    </Link>
  );
}

function FoodPhotoQuotaHint({ quota }: { quota: FoodPhotoQuota | undefined }) {
  if (!quota?.limited) return null;

  if (quota.requiresOwnKey) {
    return (
      <p className="text-sm text-rose-600">
        Der App-Key ist nur für freigeschaltete Accounts verfügbar. Hinterlege einen eigenen Key im{" "}
        <ProfileKeyLink />.
      </p>
    );
  }

  if (quota.remaining <= 0) {
    return (
      <p className="text-sm text-rose-600">
        Kostenloses Kontingent aufgebraucht.
        {quota.resetsAt ? ` Nächste Analyse ab ${formatQuotaReset(quota.resetsAt)}.` : ""} Oder
        hinterlege einen Key im <ProfileKeyLink />.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Freigeschaltete Accounts: {quota.remaining} von {SERVER_KEY_PHOTO_LIMIT} Analysen in 24
      Stunden übrig. Unbegrenzt mit Key im <ProfileKeyLink />.
    </p>
  );
}

export function FoodPhotoCapture({
  onAnalyzed,
}: {
  onAnalyzed: (items: AnalyzedFoodItem[]) => void;
}) {
  const queryClient = useQueryClient();
  const cameraInputId = useId();
  const galleryInputId = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [payload, setPayload] = useState<{ mimeType: "image/jpeg"; base64: string } | null>(null);

  const quota = useQuery({
    queryKey: foodPhotoQuotaQueryKey,
    queryFn: () => getFoodPhotoQuota(),
    staleTime: 30_000,
  });
  const quotaBlocked = isFoodPhotoQuotaBlocked(quota.data);

  const revokePreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  useEffect(() => () => revokePreview(), []);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const compressed = await compressFoodPhoto(file);
      revokePreview();
      previewUrlRef.current = compressed.previewUrl;
      setPreviewUrl(compressed.previewUrl);
      setPayload({ mimeType: compressed.mimeType, base64: compressed.base64 });
    } catch (error) {
      toast.error(getFoodPhotoErrorMessage(error));
    }
  };

  const analyze = useMutation({
    mutationFn: async () => {
      if (!payload) throw new Error("Bitte zuerst ein Foto wählen.");
      return analyzeFoodPhoto({
        data: { imageBase64: payload.base64, mimeType: payload.mimeType },
      });
    },
    onSuccess: ({ items }) => {
      if (items.length === 0) {
        toast.error("Kein Essen erkennbar. Bitte ein klareres Foto versuchen.");
        return;
      }
      onAnalyzed(items);
    },
    onError: (error) => toast.error(getFoodPhotoErrorMessage(error)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: foodPhotoQuotaQueryKey });
    },
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Fotografiere dein Essen oder lade ein Bild hoch. Nährwerte kommen wo möglich aus Open Food
        Facts — bitte prüfen.
      </p>
      <FoodPhotoQuotaHint quota={quota.data} />
      <input
        id={cameraInputId}
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          void pickFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        id={galleryInputId}
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          void pickFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="flex-1" onClick={() => cameraRef.current?.click()}>
          <Camera className="size-4" /> Fotografieren
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => galleryRef.current?.click()}
        >
          <ImagePlus className="size-4" /> Hochladen
        </Button>
      </div>

      {previewUrl && (
        <div className="relative overflow-hidden rounded-2xl bg-slate-100">
          <img src={previewUrl} alt="Ausgewähltes Essen" className="max-h-56 w-full object-cover" />
          {analyze.isPending && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}
        </div>
      )}

      <Button
        type="button"
        className="w-full"
        disabled={!payload || analyze.isPending || quotaBlocked}
        onClick={() => analyze.mutate()}
      >
        {analyze.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Analysieren…
          </>
        ) : quotaBlocked ? (
          "Kontingent aufgebraucht"
        ) : (
          "Analysieren"
        )}
      </Button>
    </div>
  );
}
