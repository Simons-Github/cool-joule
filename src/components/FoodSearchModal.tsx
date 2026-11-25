import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Barcode, Camera, Loader2, Search, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, useT } from "@/lib/i18n/react";
import { addDays, mealLabel, todayISO, type MealType } from "@/lib/nutrition";
import { getOpenFoodFactsErrorMessage, type FoodItem } from "@/lib/open-food-facts";
import { searchOpenFoodFacts, lookupOpenFoodFactsBarcode } from "@/lib/search-open-food-facts";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { FoodPhotoCapture, FoodPhotoResults } from "@/components/FoodPhotoPanel";
import { useFoodPhotoLog } from "@/hooks/useFoodPhotoLog";
import { toPhotoDrafts, type PhotoDraft } from "@/lib/food-photo-analysis";
import { RECENT_FOOD_DAYS, groupRecentFoods, type RecentFood } from "@/lib/food-log";
import type { Database } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

type CustomFoodRow = Database["public"]["Tables"]["custom_foods"]["Row"];

function useDebounced(value: string, delay = 450) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function FoodSearchModal({
  open,
  onOpenChange,
  mealType,
  date,
  userId,
  demo = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mealType: MealType;
  date: string;
  userId: string;
  /** Demo users see the photo tab, but the AI analysis is switched off. */
  demo?: boolean;
}) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const debounced = useDebounced(query);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState("100");
  const [photoDrafts, setPhotoDrafts] = useState<PhotoDraft[] | null>(null);
  const [quick, setQuick] = useState({ name: "", kcal: "", p: "", c: "", f: "" });
  const [cf, setCf] = useState({ name: "", brand: "", kcal: "", p: "", c: "", f: "" });
  const [editingCustom, setEditingCustom] = useState<CustomFoodRow | null>(null);
  const queryClient = useQueryClient();
  const { videoRef, scanning, supported, startScan, stopScan } = useBarcodeScanner();
  const addPhotoLogs = useFoodPhotoLog({
    userId,
    date,
    mealType,
    onSuccess: () => {
      setPhotoDrafts(null);
      onOpenChange(false);
    },
  });

  const mealName = mealLabel(t, mealType);
  const quickDefaultName = t("food.quickDefaultName");

  const selectFood = (item: FoodItem, servingGrams = "100") => {
    setSelected(item);
    setGrams(servingGrams);
  };

  const selectRecent = (food: RecentFood) => {
    selectFood(
      {
        name: food.name,
        brand: food.brand,
        kcal100: food.kcal100,
        protein100: food.protein100,
        carbs100: food.carbs100,
        fat100: food.fat100,
      },
      String(food.servingSizeG),
    );
  };

  const results = useQuery({
    queryKey: ["off", debounced],
    queryFn: () => searchOpenFoodFacts({ data: { query: debounced } }),
    enabled: open && debounced.trim().length > 2,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const searchErrorMessage = results.isError
    ? getOpenFoodFactsErrorMessage(results.error, lang)
    : null;
  const showEmptyResults =
    !results.isFetching &&
    !results.isError &&
    debounced.trim().length > 2 &&
    results.data?.length === 0;

  const barcodeLookup = useMutation({
    mutationFn: (raw: string) => lookupOpenFoodFactsBarcode({ data: { barcode: raw } }),
    onSuccess: (item) => {
      selectFood(item);
      setBarcodeInput(item.barcode ?? "");
      toast.success(t("fs.toast.productFound"));
    },
    onError: (e: Error) => toast.error(getOpenFoodFactsErrorMessage(e, lang)),
  });

  const handleBarcodeLookup = () => {
    if (!barcodeInput.trim()) {
      toast.error(t("fs.toast.enterBarcode"));
      return;
    }
    barcodeLookup.mutate(barcodeInput);
  };

  const handleScan = async () => {
    try {
      await startScan((code) => {
        setBarcodeInput(code);
        barcodeLookup.mutate(code);
      });
    } catch (error) {
      stopScan();
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        toast.error(t("fs.toast.cameraDenied"));
        return;
      }
      toast.error(t("fs.toast.scanFailed"));
    }
  };

  useEffect(() => {
    if (!open) {
      stopScan();
      setPhotoDrafts(null);
      setSelected(null);
    }
  }, [open, stopScan]);

  const customFoods = useQuery({
    queryKey: ["custom_foods", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_foods")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const factor = (Number(grams) || 0) / 100;
  const preview = useMemo(() => {
    if (!selected) return null;
    return {
      calories: Math.round(selected.kcal100 * factor),
      protein: Math.round(selected.protein100 * factor * 10) / 10,
      carbs: Math.round(selected.carbs100 * factor * 10) / 10,
      fat: Math.round(selected.fat100 * factor * 10) / 10,
    };
  }, [selected, factor]);

  const addLog = useMutation({
    mutationFn: async () => {
      if (!selected || !preview) return;
      const { error } = await supabase.from("food_logs").insert({
        user_id: userId,
        date,
        meal_type: mealType,
        food_name: selected.name,
        brand: selected.brand,
        serving_size_g: Number(grams),
        ...preview,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("toast.addedToDiary"));
      queryClient.invalidateQueries({ queryKey: ["food_logs"] });
      setSelected(null);
      setQuery("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // custom food creator
  const recentsQuery = useQuery({
    queryKey: ["food_logs", userId, "recents"],
    queryFn: async () => {
      const from = addDays(todayISO(), -(RECENT_FOOD_DAYS - 1));
      const { data, error } = await supabase
        .from("food_logs")
        .select("food_name, brand, date, created_at, serving_size_g, calories, protein, carbs, fat")
        .eq("user_id", userId)
        .gte("date", from)
        .lte("date", todayISO())
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open,
  });
  const recents = useMemo(
    () => groupRecentFoods(recentsQuery.data ?? [], { today: todayISO() }),
    [recentsQuery.data],
  );

  const addQuick = useMutation({
    mutationFn: async () => {
      const calories = Number(quick.kcal);
      if (!Number.isFinite(calories) || calories < 0) {
        throw new Error(t("fs.toast.invalidKcal"));
      }
      const { error } = await supabase.from("food_logs").insert({
        user_id: userId,
        date,
        meal_type: mealType,
        food_name: quick.name.trim() || quickDefaultName,
        brand: null,
        serving_size_g: 0,
        calories,
        protein: Number(quick.p) || 0,
        carbs: Number(quick.c) || 0,
        fat: Number(quick.f) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("toast.addedToDiary"));
      queryClient.invalidateQueries({ queryKey: ["food_logs"] });
      setQuick({ name: "", kcal: "", p: "", c: "", f: "" });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createCustom = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("custom_foods")
        .insert({
          user_id: userId,
          name: cf.name,
          brand: cf.brand || null,
          calories_per_100g: Number(cf.kcal) || 0,
          protein_per_100g: Number(cf.p) || 0,
          carbs_per_100g: Number(cf.c) || 0,
          fat_per_100g: Number(cf.f) || 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(t("fs.toast.customSaved"));
      queryClient.invalidateQueries({ queryKey: ["custom_foods"] });
      setCf({ name: "", brand: "", kcal: "", p: "", c: "", f: "" });
      selectFood({
        name: data.name,
        brand: data.brand,
        kcal100: Number(data.calories_per_100g),
        protein100: Number(data.protein_per_100g),
        carbs100: Number(data.carbs_per_100g),
        fat100: Number(data.fat_per_100g),
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateCustom = useMutation({
    mutationFn: async () => {
      if (!editingCustom) return;
      const { error } = await supabase
        .from("custom_foods")
        .update({
          name: cf.name,
          brand: cf.brand || null,
          calories_per_100g: Number(cf.kcal) || 0,
          protein_per_100g: Number(cf.p) || 0,
          carbs_per_100g: Number(cf.c) || 0,
          fat_per_100g: Number(cf.f) || 0,
        })
        .eq("id", editingCustom.id)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("fs.toast.customUpdated"));
      queryClient.invalidateQueries({ queryKey: ["custom_foods"] });
      setEditingCustom(null);
      setCf({ name: "", brand: "", kcal: "", p: "", c: "", f: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCustom = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("custom_foods")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("fs.toast.customDeleted"));
      queryClient.invalidateQueries({ queryKey: ["custom_foods"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEditCustom = (item: CustomFoodRow) => {
    setEditingCustom(item);
    setCf({
      name: item.name,
      brand: item.brand ?? "",
      kcal: String(item.calories_per_100g),
      p: String(item.protein_per_100g),
      c: String(item.carbs_per_100g),
      f: String(item.fat_per_100g),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("fs.title", { meal: mealName })}</DialogTitle>
          <DialogDescription>{t("fs.description")}</DialogDescription>
        </DialogHeader>

        {selected ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-rose-50/60 p-4">
              <p className="font-semibold text-slate-800">{selected.name}</p>
              {selected.brand && <p className="text-sm text-slate-500">{selected.brand}</p>}
              {selected.barcode && (
                <p className="text-xs text-slate-400">
                  {t("fs.barcodeLine", { code: selected.barcode })}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                {t("fs.per100", {
                  kcal: Math.round(selected.kcal100),
                  p: selected.protein100,
                  c: selected.carbs100,
                  f: selected.fat100,
                })}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="grams">{t("food.amountG")}</Label>
              <Input
                id="grams"
                type="number"
                min="1"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {[30, 50, 100, 150, 200, 250].map((g) => (
                  <Button key={g} size="sm" variant="outline" onClick={() => setGrams(String(g))}>
                    {g} g
                  </Button>
                ))}
              </div>
            </div>

            {preview && (
              <div
                aria-live="polite"
                className="grid grid-cols-4 gap-2 rounded-2xl bg-slate-50 p-3 text-center text-sm"
              >
                <div>
                  <p className="text-xs text-muted-foreground">kcal</p>
                  <p className="font-semibold">{preview.calories}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("macro.protein")}</p>
                  <p className="font-semibold">{preview.protein} g</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("macro.carbsShort")}</p>
                  <p className="font-semibold">{preview.carbs} g</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("macro.fat")}</p>
                  <p className="font-semibold">{preview.fat} g</p>
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setSelected(null)}>
                {t("fs.backToSearch")}
              </Button>
              <Button onClick={() => addLog.mutate()} disabled={addLog.isPending}>
                {t("fs.addToDiary")}
              </Button>
            </div>
          </div>
        ) : photoDrafts && photoDrafts.length > 0 ? (
          <FoodPhotoResults
            drafts={photoDrafts}
            onChange={(next) => setPhotoDrafts(next.length > 0 ? next : null)}
            onReset={() => setPhotoDrafts(null)}
            onAdd={() => addPhotoLogs.mutate(photoDrafts)}
            adding={addPhotoLogs.isPending}
          />
        ) : (
          <Tabs defaultValue="search" onValueChange={() => stopScan()}>
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="search" className="px-0.5 text-[11px] sm:text-sm">
                {t("fs.tab.search")}
              </TabsTrigger>
              <TabsTrigger value="photo" className="px-0.5 text-[11px] sm:text-sm">
                {t("fs.tab.photo")}
              </TabsTrigger>
              <TabsTrigger value="barcode" className="px-0.5 text-[11px] sm:text-sm">
                {t("fs.tab.barcode")}
              </TabsTrigger>
              <TabsTrigger value="own" className="px-0.5 text-[11px] sm:text-sm">
                {t("fs.tab.own")}
              </TabsTrigger>
              <TabsTrigger value="new" className="px-0.5 text-[11px] sm:text-sm">
                {t("fs.tab.new")}
              </TabsTrigger>
              <TabsTrigger value="quick" className="px-0.5 text-[11px] sm:text-sm">
                {t("fs.tab.quick")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="search" className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  className="pl-9"
                  placeholder={t("fs.searchPlaceholder")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <ScrollArea className="h-72">
                {debounced.trim().length <= 2 && (
                  <div className="space-y-1.5 pr-3">
                    {recents.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        {t("fs.recentsHint")}
                      </p>
                    ) : (
                      <>
                        <p className="px-1 pb-1 text-xs font-medium text-slate-400">
                          {t("fs.recent")}
                        </p>
                        {recents.map((food) => (
                          <button
                            key={`${food.name}|${food.brand ?? ""}|${food.kcal100}`}
                            onClick={() => selectRecent(food)}
                            className="w-full rounded-xl p-3 text-left transition-colors hover:bg-rose-50"
                          >
                            <p className="text-sm font-medium">{food.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {food.brand ? `${food.brand} · ` : ""}
                              {t("fs.recentLine", {
                                g: food.servingSizeG,
                                kcal: Math.round(food.kcal100),
                              })}
                            </p>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
                {results.isPending && debounced.trim().length > 2 && (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> {t("fs.searching")}
                  </div>
                )}
                {results.isFetching && !results.isPending && (
                  <p className="pb-2 text-center text-xs text-muted-foreground">
                    {t("fs.updating")}
                  </p>
                )}
                {searchErrorMessage && (
                  <p className="py-8 text-center text-sm text-destructive">{searchErrorMessage}</p>
                )}
                {showEmptyResults && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("fs.noResults", { query: debounced.trim() })}
                  </p>
                )}
                <div className="space-y-1.5 pr-3">
                  {debounced.trim().length > 2 &&
                    results.data?.map((item, i) => (
                      <button
                        key={`${item.barcode ?? item.name}-${i}`}
                        onClick={() => selectFood(item)}
                        className="w-full rounded-xl p-3 text-left transition-colors hover:bg-rose-50"
                      >
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.brand ? `${item.brand} · ` : ""}
                          {t("fs.resultLine", {
                            kcal: Math.round(item.kcal100),
                            p: item.protein100,
                            c: item.carbs100,
                            f: item.fat100,
                          })}
                        </p>
                      </button>
                    ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="photo">
              {demo ? (
                <p className="rounded-2xl bg-orange-50 p-4 text-sm text-orange-800">
                  {t("fs.photoDemo")}
                </p>
              ) : (
                <FoodPhotoCapture onAnalyzed={(items) => setPhotoDrafts(toPhotoDrafts(items))} />
              )}
            </TabsContent>

            <TabsContent value="barcode" className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("fs.barcodeHint")}</p>
              <div className="relative">
                <Barcode className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  inputMode="numeric"
                  placeholder={t("fs.barcodePlaceholder")}
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleBarcodeLookup()}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  className="flex-1"
                  onClick={handleBarcodeLookup}
                  disabled={barcodeLookup.isPending || !barcodeInput.trim()}
                >
                  {barcodeLookup.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> {t("fs.barcodeSearching")}
                    </>
                  ) : (
                    <>
                      <Search className="size-4" /> {t("fs.loadProduct")}
                    </>
                  )}
                </Button>
                {supported ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={scanning ? stopScan : handleScan}
                  >
                    <Camera className="size-4" />
                    {scanning ? t("fs.stop") : t("fs.scan")}
                  </Button>
                ) : null}
              </div>

              <div
                className={scanning ? "overflow-hidden rounded-2xl bg-black shadow-lg" : "hidden"}
              >
                <video
                  ref={videoRef}
                  className="aspect-video w-full object-cover"
                  muted
                  playsInline
                  autoPlay
                  disablePictureInPicture
                />
                {scanning ? (
                  <p className="bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
                    {t("fs.holdBarcode")}
                  </p>
                ) : null}
              </div>

              {barcodeLookup.isError && (
                <p className="text-sm text-destructive">
                  {getOpenFoodFactsErrorMessage(barcodeLookup.error, lang)}
                </p>
              )}
            </TabsContent>

            <TabsContent value="own">
              {editingCustom ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-slate-700">{t("common.edit")}</p>
                  <CustomFoodFields cf={cf} setCf={setCf} idPrefix="edit" />
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      className="flex-1"
                      onClick={() => {
                        setEditingCustom(null);
                        setCf({ name: "", brand: "", kcal: "", p: "", c: "", f: "" });
                      }}
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={!cf.name || updateCustom.isPending}
                      onClick={() => updateCustom.mutate()}
                    >
                      {t("common.save")}
                    </Button>
                  </div>
                </div>
              ) : (
                <ScrollArea className="h-80">
                  <div className="space-y-1.5 pr-3">
                    {customFoods.data?.length === 0 && (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        {t("fs.noCustom")}
                      </p>
                    )}
                    {customFoods.data?.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-1 rounded-xl hover:bg-rose-50"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            selectFood({
                              name: item.name,
                              brand: item.brand,
                              kcal100: Number(item.calories_per_100g),
                              protein100: Number(item.protein_per_100g),
                              carbs100: Number(item.carbs_per_100g),
                              fat100: Number(item.fat_per_100g),
                            })
                          }
                          className="min-w-0 flex-1 p-3 text-left"
                        >
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.brand ? `${item.brand} · ` : ""}
                            {t("fs.customLine", { kcal: Number(item.calories_per_100g) })}
                          </p>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("common.edit")}
                          className="size-8 text-slate-400"
                          onClick={() => startEditCustom(item)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("common.delete")}
                          className="size-8 text-slate-400 hover:text-rose-500"
                          onClick={() => {
                            if (window.confirm(t("fs.confirmDelete", { name: item.name }))) {
                              deleteCustom.mutate(item.id);
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>

            <TabsContent value="new" className="space-y-3">
              <CustomFoodFields cf={cf} setCf={setCf} idPrefix="new" />
              <Button
                className="w-full"
                disabled={!cf.name || createCustom.isPending || !!editingCustom}
                onClick={() => createCustom.mutate()}
              >
                <Plus className="size-4" /> {t("fs.saveAndSelect")}
              </Button>
            </TabsContent>

            <TabsContent value="quick" className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("fs.quickHint")}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="qn">{t("fs.nameOptional")}</Label>
                  <Input
                    id="qn"
                    placeholder={quickDefaultName}
                    value={quick.name}
                    onChange={(e) => setQuick({ ...quick, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qk">kcal</Label>
                  <Input
                    id="qk"
                    type="number"
                    min="0"
                    value={quick.kcal}
                    onChange={(e) => setQuick({ ...quick, kcal: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qp">
                    {t("macro.protein")} {t("food.unitG")}
                  </Label>
                  <Input
                    id="qp"
                    type="number"
                    min="0"
                    step="0.1"
                    value={quick.p}
                    onChange={(e) => setQuick({ ...quick, p: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qc">
                    {t("macro.carbs")} {t("food.unitG")}
                  </Label>
                  <Input
                    id="qc"
                    type="number"
                    min="0"
                    step="0.1"
                    value={quick.c}
                    onChange={(e) => setQuick({ ...quick, c: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qf">
                    {t("macro.fat")} {t("food.unitG")}
                  </Label>
                  <Input
                    id="qf"
                    type="number"
                    min="0"
                    step="0.1"
                    value={quick.f}
                    onChange={(e) => setQuick({ ...quick, f: e.target.value })}
                  />
                </div>
              </div>
              <Button
                className="w-full"
                disabled={quick.kcal.trim() === "" || addQuick.isPending}
                onClick={() => addQuick.mutate()}
              >
                {t("fs.addToDiary")}
              </Button>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

type CustomFoodForm = {
  name: string;
  brand: string;
  kcal: string;
  p: string;
  c: string;
  f: string;
};

function CustomFoodFields({
  cf,
  setCf,
  idPrefix,
}: {
  cf: CustomFoodForm;
  setCf: (next: CustomFoodForm) => void;
  idPrefix: string;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2 space-y-2">
        <Label htmlFor={`${idPrefix}-cfn`}>{t("fs.name")}</Label>
        <Input
          id={`${idPrefix}-cfn`}
          value={cf.name}
          onChange={(e) => setCf({ ...cf, name: e.target.value })}
        />
      </div>
      <div className="col-span-2 space-y-2">
        <Label htmlFor={`${idPrefix}-cfb`}>{t("fs.brandOptional")}</Label>
        <Input
          id={`${idPrefix}-cfb`}
          value={cf.brand}
          onChange={(e) => setCf({ ...cf, brand: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-cfk`}>{t("fs.kcalPer100")}</Label>
        <Input
          id={`${idPrefix}-cfk`}
          type="number"
          value={cf.kcal}
          onChange={(e) => setCf({ ...cf, kcal: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-cfp`}>
          {t("fs.per100Label", { label: t("macro.protein") })}
        </Label>
        <Input
          id={`${idPrefix}-cfp`}
          type="number"
          value={cf.p}
          onChange={(e) => setCf({ ...cf, p: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-cfc`}>
          {t("fs.per100Label", { label: t("macro.carbs") })}
        </Label>
        <Input
          id={`${idPrefix}-cfc`}
          type="number"
          value={cf.c}
          onChange={(e) => setCf({ ...cf, c: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-cff`}>{t("fs.per100Label", { label: t("macro.fat") })}</Label>
        <Input
          id={`${idPrefix}-cff`}
          type="number"
          value={cf.f}
          onChange={(e) => setCf({ ...cf, f: e.target.value })}
        />
      </div>
    </div>
  );
}
