import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MEALS, type MealType } from "@/lib/nutrition";
import { isQuickAddServing, scaleLoggedMacros } from "@/lib/food-log";
import type { Database } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FoodLogRow = Database["public"]["Tables"]["food_logs"]["Row"];

export function EditFoodLogDialog({
  item,
  userId,
  onClose,
}: {
  item: FoodLogRow | null;
  userId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const quickAdd = item ? isQuickAddServing(Number(item.serving_size_g)) : false;
  const [grams, setGrams] = useState("");
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  useEffect(() => {
    if (!item) return;
    setGrams(String(item.serving_size_g));
    setMealType((item.meal_type as MealType) ?? "snacks");
    setCalories(String(item.calories));
    setProtein(String(item.protein));
    setCarbs(String(item.carbs));
    setFat(String(item.fat));
  }, [item]);

  const preview = useMemo(() => {
    if (!item || quickAdd) return null;
    return scaleLoggedMacros(item, Number(grams));
  }, [item, grams, quickAdd]);

  const save = useMutation({
    mutationFn: async () => {
      if (!item) return;
      const patch = quickAdd
        ? {
            meal_type: mealType,
            calories: Number(calories) || 0,
            protein: Number(protein) || 0,
            carbs: Number(carbs) || 0,
            fat: Number(fat) || 0,
          }
        : {
            meal_type: mealType,
            ...(preview ?? {}),
          };
      if (!quickAdd && (!preview || preview.serving_size_g <= 0)) {
        throw new Error("Bitte eine gültige Menge eingeben.");
      }
      const { error } = await supabase
        .from("food_logs")
        .update(patch)
        .eq("id", item.id)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eintrag aktualisiert");
      queryClient.invalidateQueries({ queryKey: ["food_logs"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Eintrag bearbeiten</DialogTitle>
          <DialogDescription>
            {item?.food_name}
            {item?.brand ? ` · ${item.brand}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="edit-meal">Mahlzeit</Label>
            <Select value={mealType} onValueChange={(v) => setMealType(v as MealType)}>
              <SelectTrigger id="edit-meal" className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEALS.map((meal) => (
                  <SelectItem key={meal.key} value={meal.key}>
                    {meal.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {quickAdd ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-kcal">kcal</Label>
                <Input
                  id="edit-kcal"
                  type="number"
                  min="0"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-p">Eiweiß (g)</Label>
                <Input
                  id="edit-p"
                  type="number"
                  min="0"
                  step="0.1"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-c">Kohlenhydrate (g)</Label>
                <Input
                  id="edit-c"
                  type="number"
                  min="0"
                  step="0.1"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-f">Fett (g)</Label>
                <Input
                  id="edit-f"
                  type="number"
                  min="0"
                  step="0.1"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="edit-grams">Menge (g)</Label>
                <Input
                  id="edit-grams"
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
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Abbrechen
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
