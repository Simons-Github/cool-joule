import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Barcode, Camera, Loader2, Search, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { MealType } from "@/lib/nutrition";
import { MEALS } from "@/lib/nutrition";
import {
  getOpenFoodFactsErrorMessage,
  lookupProductByBarcode,
  searchProducts,
  type FoodItem,
} from "@/lib/open-food-facts";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { FoodPhotoCapture, FoodPhotoResults } from "@/components/FoodPhotoPanel";
import { useFoodPhotoLog } from "@/hooks/useFoodPhotoLog";
import { toPhotoDrafts, type PhotoDraft } from "@/lib/food-photo-analysis";
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
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mealType: MealType;
  date: string;
  userId: string;
}) {
  const [query, setQuery] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const debounced = useDebounced(query);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState("100");
  const [photoDrafts, setPhotoDrafts] = useState<PhotoDraft[] | null>(null);
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

  const mealLabel = MEALS.find((m) => m.key === mealType)?.label ?? "";

  const results = useQuery({
    queryKey: ["off", debounced],
    queryFn: () => searchProducts(debounced),
    enabled: debounced.trim().length > 2,
    staleTime: 5 * 60 * 1000,
  });

  const searchErrorMessage = results.isError ? getOpenFoodFactsErrorMessage(results.error) : null;
  const showEmptyResults =
    !results.isFetching &&
    !results.isError &&
    debounced.trim().length > 2 &&
    results.data?.length === 0;

  const barcodeLookup = useMutation({
    mutationFn: (raw: string) => lookupProductByBarcode(raw),
    onSuccess: (item) => {
      setSelected(item);
      setBarcodeInput(item.barcode ?? "");
      toast.success("Produkt gefunden");
    },
    onError: (e: Error) => toast.error(getOpenFoodFactsErrorMessage(e)),
  });

  const handleBarcodeLookup = () => {
    if (!barcodeInput.trim()) {
      toast.error("Bitte Barcode eingeben oder scannen.");
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
        toast.error(
          "Kamerazugriff wurde verweigert. Bitte in Safari unter Einstellungen erlauben.",
        );
        return;
      }
      toast.error("Scannen fehlgeschlagen. Bitte Berechtigung prüfen oder Barcode eintippen.");
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
      toast.success("Zum Tagebuch hinzugefügt");
      queryClient.invalidateQueries({ queryKey: ["food_logs"] });
      setSelected(null);
      setQuery("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // custom food creator
  const [cf, setCf] = useState({ name: "", brand: "", kcal: "", p: "", c: "", f: "" });
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
      toast.success("Eigenes Lebensmittel gespeichert");
      queryClient.invalidateQueries({ queryKey: ["custom_foods"] });
      setCf({ name: "", brand: "", kcal: "", p: "", c: "", f: "" });
      setSelected({
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nahrungsmittel hinzufügen — {mealLabel}</DialogTitle>
          <DialogDescription>
            Suche, scanne einen Barcode, fotografiere dein Essen oder lege ein eigenes Lebensmittel
            an.
          </DialogDescription>
        </DialogHeader>

        {selected ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-rose-50/60 p-4">
              <p className="font-semibold text-slate-800">{selected.name}</p>
              {selected.brand && <p className="text-sm text-slate-500">{selected.brand}</p>}
              {selected.barcode && (
                <p className="text-xs text-slate-400">Barcode: {selected.barcode}</p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                pro 100 g: {Math.round(selected.kcal100)} kcal · {selected.protein100} g E ·{" "}
                {selected.carbs100} g KH · {selected.fat100} g F
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="grams">Menge (g)</Label>
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
                  <p className="text-xs text-muted-foreground">Eiweiß</p>
                  <p className="font-semibold">{preview.protein} g</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">KH</p>
                  <p className="font-semibold">{preview.carbs} g</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fett</p>
                  <p className="font-semibold">{preview.fat} g</p>
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Zurück zur Suche
              </Button>
              <Button onClick={() => addLog.mutate()} disabled={addLog.isPending}>
                Zum Tagebuch hinzufügen
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
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="search" className="px-1 text-xs sm:text-sm">
                Suche
              </TabsTrigger>
              <TabsTrigger value="photo" className="px-1 text-xs sm:text-sm">
                Foto
              </TabsTrigger>
              <TabsTrigger value="barcode" className="px-1 text-xs sm:text-sm">
                Barcode
              </TabsTrigger>
              <TabsTrigger value="own" className="px-1 text-xs sm:text-sm">
                Eigene
              </TabsTrigger>
              <TabsTrigger value="new" className="px-1 text-xs sm:text-sm">
                Neu
              </TabsTrigger>
            </TabsList>

            <TabsContent value="search" className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  className="pl-9"
                  placeholder="z. B. Haferflocken, Skyr, Banane…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <ScrollArea className="h-72">
                {debounced.trim().length <= 2 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Mindestens 3 Zeichen eingeben, um zu suchen.
                  </p>
                )}
                {results.isFetching && debounced.trim().length > 2 && (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Suche läuft…
                  </div>
                )}
                {searchErrorMessage && (
                  <p className="py-8 text-center text-sm text-destructive">{searchErrorMessage}</p>
                )}
                {showEmptyResults && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Keine Treffer für „{debounced.trim()}“ — lege das Lebensmittel unter „Neu
                    anlegen“ an.
                  </p>
                )}
                <div className="space-y-1.5 pr-3">
                  {results.data?.map((item, i) => (
                    <button
                      key={`${item.name}-${i}`}
                      onClick={() => setSelected(item)}
                      className="w-full rounded-xl p-3 text-left transition-colors hover:bg-rose-50"
                    >
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.brand ? `${item.brand} · ` : ""}
                        {Math.round(item.kcal100)} kcal / 100 g · {item.protein100} g E ·{" "}
                        {item.carbs100} g KH · {item.fat100} g F
                      </p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="photo">
              <FoodPhotoCapture onAnalyzed={(items) => setPhotoDrafts(toPhotoDrafts(items))} />
            </TabsContent>

            <TabsContent value="barcode" className="space-y-3">
              <p className="text-sm text-muted-foreground">
                EAN/UPC-Barcode eingeben oder mit der Kamera scannen.
              </p>
              <div className="relative">
                <Barcode className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  inputMode="numeric"
                  placeholder="z. B. 4008400402224"
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
                      <Loader2 className="size-4 animate-spin" /> Suche…
                    </>
                  ) : (
                    <>
                      <Search className="size-4" /> Produkt laden
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
                    {scanning ? "Stoppen" : "Scannen"}
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
                    Barcode in den Rahmen halten…
                  </p>
                ) : null}
              </div>

              {barcodeLookup.isError && (
                <p className="text-sm text-destructive">
                  {getOpenFoodFactsErrorMessage(barcodeLookup.error)}
                </p>
              )}
            </TabsContent>

            <TabsContent value="own">
              <ScrollArea className="h-80">
                <div className="space-y-1.5 pr-3">
                  {customFoods.data?.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Noch keine eigenen Lebensmittel.
                    </p>
                  )}
                  {customFoods.data?.map((item) => (
                    <button
                      key={item.id}
                      onClick={() =>
                        setSelected({
                          name: item.name,
                          brand: item.brand,
                          kcal100: Number(item.calories_per_100g),
                          protein100: Number(item.protein_per_100g),
                          carbs100: Number(item.carbs_per_100g),
                          fat100: Number(item.fat_per_100g),
                        })
                      }
                      className="w-full rounded-xl p-3 text-left transition-colors hover:bg-rose-50"
                    >
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.brand ? `${item.brand} · ` : ""}
                        {Number(item.calories_per_100g)} kcal / 100 g
                      </p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="new" className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="cfn">Name</Label>
                  <Input
                    id="cfn"
                    value={cf.name}
                    onChange={(e) => setCf({ ...cf, name: e.target.value })}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="cfb">Marke (optional)</Label>
                  <Input
                    id="cfb"
                    value={cf.brand}
                    onChange={(e) => setCf({ ...cf, brand: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cfk">kcal / 100 g</Label>
                  <Input
                    id="cfk"
                    type="number"
                    value={cf.kcal}
                    onChange={(e) => setCf({ ...cf, kcal: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cfp">Eiweiß / 100 g</Label>
                  <Input
                    id="cfp"
                    type="number"
                    value={cf.p}
                    onChange={(e) => setCf({ ...cf, p: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cfc">Kohlenhydrate / 100 g</Label>
                  <Input
                    id="cfc"
                    type="number"
                    value={cf.c}
                    onChange={(e) => setCf({ ...cf, c: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cff">Fett / 100 g</Label>
                  <Input
                    id="cff"
                    type="number"
                    value={cf.f}
                    onChange={(e) => setCf({ ...cf, f: e.target.value })}
                  />
                </div>
              </div>
              <Button
                className="w-full"
                disabled={!cf.name || createCustom.isPending}
                onClick={() => createCustom.mutate()}
              >
                <Plus className="size-4" /> Speichern & auswählen
              </Button>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
