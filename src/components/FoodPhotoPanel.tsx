import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n, useT } from "@/lib/i18n/react";
import { analyzeFoodPhoto, getFoodPhotoQuota } from "@/lib/analyze-food-photo";
import { compressFoodPhoto } from "@/lib/compress-food-photo";
import {
  getFoodPhotoErrorMessage,
  nutritionSourceLabel,
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

type PhotoPayload = { mimeType: "image/jpeg"; base64: string };
type AnalyzeVars = PhotoPayload & { requestId: number };

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
  const { t, lang } = useI18n();
  const selectedCount = drafts.filter((d) => d.selected).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("photo.resultsHint")}</p>
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
                    aria-label={t("photo.selectAria", { name: draft.name })}
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
                      aria-label={t("photo.nameAria")}
                    />
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`grams-${draft.id}`} className="shrink-0 text-xs">
                        {t("food.amountG")}
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
                        aria-label={t("photo.removeAria")}
                        onClick={() => onChange(drafts.filter((item) => item.id !== draft.id))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("photo.macroLine", {
                        kcal: macros.calories,
                        p: macros.protein,
                        c: macros.carbs,
                        f: macros.fat,
                        source: nutritionSourceLabel(draft.nutritionSource, lang),
                      })}
                      {draft.confidence === "low" ? ` · ${t("photo.lowConfidence")}` : ""}
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
          {t("photo.another")}
        </Button>
        <Button type="button" onClick={onAdd} disabled={adding || selectedCount === 0}>
          {adding ? (
            <>
              <Loader2 className="size-4 animate-spin" /> {t("photo.saving")}
            </>
          ) : (
            t("photo.addSelected", { count: selectedCount })
          )}
        </Button>
      </div>
    </div>
  );
}

function ProfileKeyLink() {
  const t = useT();
  return (
    <Link to="/profil" className="font-medium text-rose-600 underline-offset-2 hover:underline">
      {t("nav.profile")}
    </Link>
  );
}

/** Renders a translated sentence that contains a `{profile}` placeholder with the profile link. */
function WithProfileLink({ text }: { text: string }) {
  const [before = "", after = ""] = text.split("{profile}");
  return (
    <>
      {before}
      <ProfileKeyLink />
      {after}
    </>
  );
}

function FoodPhotoQuotaHint({ quota }: { quota: FoodPhotoQuota | undefined }) {
  const { t, lang } = useI18n();
  if (!quota?.limited) return null;

  if (quota.requiresOwnKey) {
    return (
      <p className="text-sm text-rose-600">
        <WithProfileLink text={t("photo.quota.ownKeyRequired", { profile: "{profile}" })} />
      </p>
    );
  }

  if (quota.remaining <= 0) {
    const reset = quota.resetsAt
      ? t("photo.quota.nextAnalysis", { time: formatQuotaReset(quota.resetsAt, lang) })
      : "";
    return (
      <p className="text-sm text-rose-600">
        <WithProfileLink text={t("photo.quota.exhausted", { reset, profile: "{profile}" })} />
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      <WithProfileLink
        text={t("photo.quota.remaining", {
          remaining: quota.remaining,
          limit: SERVER_KEY_PHOTO_LIMIT,
          profile: "{profile}",
        })}
      />
    </p>
  );
}

export function FoodPhotoCapture({
  onAnalyzed,
}: {
  onAnalyzed: (items: AnalyzedFoodItem[]) => void;
}) {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const cameraInputId = useId();
  const galleryInputId = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [payload, setPayload] = useState<PhotoPayload | null>(null);

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

  const isCurrentRequest = (requestId: number) => requestId === requestIdRef.current;

  const analyze = useMutation({
    mutationFn: async (vars: AnalyzeVars) => {
      return analyzeFoodPhoto({
        data: { imageBase64: vars.base64, mimeType: vars.mimeType },
      });
    },
    onSuccess: ({ items }, vars) => {
      if (!isCurrentRequest(vars.requestId)) return;
      if (items.length === 0) {
        toast.error(t("photo.noFood"));
        return;
      }
      onAnalyzed(items);
    },
    onError: (error, vars) => {
      if (!isCurrentRequest(vars.requestId)) return;
      toast.error(getFoodPhotoErrorMessage(error, lang));
    },
    onSettled: (_data, _error, vars) => {
      if (!isCurrentRequest(vars.requestId)) return;
      void queryClient.invalidateQueries({ queryKey: foodPhotoQuotaQueryKey });
    },
  });

  const startAnalyze = (image: PhotoPayload, requestId = ++requestIdRef.current) => {
    if (quotaBlocked) return;
    analyze.mutate({ ...image, requestId });
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    const requestId = ++requestIdRef.current;
    try {
      const compressed = await compressFoodPhoto(file, t);
      if (!isCurrentRequest(requestId)) return;
      revokePreview();
      previewUrlRef.current = compressed.previewUrl;
      setPreviewUrl(compressed.previewUrl);
      const nextPayload = { mimeType: compressed.mimeType, base64: compressed.base64 };
      setPayload(nextPayload);
      startAnalyze(nextPayload, requestId);
    } catch (error) {
      if (!isCurrentRequest(requestId)) return;
      toast.error(getFoodPhotoErrorMessage(error, lang));
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("photo.capture.intro")}</p>
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
          <Camera className="size-4" /> {t("photo.take")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => galleryRef.current?.click()}
        >
          <ImagePlus className="size-4" /> {t("photo.upload")}
        </Button>
      </div>

      {previewUrl && (
        <div className="relative overflow-hidden rounded-2xl bg-slate-100">
          <img
            src={previewUrl}
            alt={t("photo.previewAlt")}
            className="max-h-56 w-full object-cover"
          />
          {analyze.isPending && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-white"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="size-6 animate-spin" />
              <p className="text-sm">{t("photo.recognizing")}</p>
            </div>
          )}
        </div>
      )}

      {payload && (
        <Button
          type="button"
          className="w-full"
          disabled={analyze.isPending || quotaBlocked}
          onClick={() => startAnalyze(payload)}
        >
          {analyze.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> {t("photo.recognizing")}
            </>
          ) : quotaBlocked ? (
            t("photo.quotaUsedUp")
          ) : (
            t("photo.reanalyze")
          )}
        </Button>
      )}
    </div>
  );
}
