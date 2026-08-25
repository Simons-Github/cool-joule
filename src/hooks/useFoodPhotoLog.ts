import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { scaleMacros, type PhotoDraft } from "@/lib/food-photo-analysis";
import type { MealType } from "@/lib/nutrition";

export function useFoodPhotoLog({
  userId,
  date,
  mealType,
  onSuccess,
}: {
  userId: string;
  date: string;
  mealType: MealType;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (drafts: PhotoDraft[]) => {
      const rows = drafts
        .filter((draft) => draft.selected && draft.name.trim() && Number(draft.grams) > 0)
        .map((draft) => {
          const macros = scaleMacros(draft, Number(draft.grams));
          return {
            user_id: userId,
            date,
            meal_type: mealType,
            food_name: draft.name.trim(),
            brand: null,
            serving_size_g: Number(draft.grams),
            ...macros,
          };
        });
      if (rows.length === 0) {
        throw new Error("Bitte mindestens ein Lebensmittel auswählen.");
      }
      const { error } = await supabase.from("food_logs").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Zum Tagebuch hinzugefügt");
      queryClient.invalidateQueries({ queryKey: ["food_logs"] });
      onSuccess();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
