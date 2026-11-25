import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ignoreStravaActivity } from "@/lib/strava-connect";
import { getStravaErrorMessage } from "@/lib/strava";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ExercisePanel({ userId, date }: { userId: string; date: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");

  const exercises = useQuery({
    queryKey: ["exercise_logs", userId, date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercise_logs")
        .select("*")
        .eq("user_id", userId)
        .eq("date", date)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const kcal = Number(calories);
      if (!Number.isFinite(kcal) || kcal < 0) {
        throw new Error("Bitte gültige Kalorien eingeben.");
      }
      const { error } = await supabase.from("exercise_logs").insert({
        user_id: userId,
        date,
        name: name.trim() || "Training",
        calories: kcal,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aktivität gespeichert");
      setName("");
      setCalories("");
      queryClient.invalidateQueries({ queryKey: ["exercise_logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (item: { id: string; source: string; external_id: string | null }) => {
      if (item.source === "strava" && item.external_id) {
        await ignoreStravaActivity({ data: { externalId: item.external_id } });
        return;
      }
      const { error } = await supabase
        .from("exercise_logs")
        .delete()
        .eq("id", item.id)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aktivität gelöscht");
      queryClient.invalidateQueries({ queryKey: ["exercise_logs"] });
    },
    onError: (e: unknown) => toast.error(getStravaErrorMessage(e)),
  });

  const items = exercises.data ?? [];
  const total = items.reduce((sum, row) => sum + Number(row.calories), 0);

  return (
    <section className="rounded-3xl bg-white p-4 shadow-lg shadow-rose-50/80">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Aktivität</h2>
        <span className="text-sm text-slate-400 tabular-nums">+{Math.round(total)} kcal</span>
      </div>

      <div className="mt-3 divide-y divide-slate-50">
        {items.length === 0 && (
          <p className="py-2 text-sm text-slate-400">Noch keine Aktivität für diesen Tag.</p>
        )}
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 py-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <p className="min-w-0 truncate text-sm font-medium text-slate-700">{item.name}</p>
              {item.source === "strava" ? (
                <span className="shrink-0 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#FC4C02]">
                  Strava
                </span>
              ) : item.source === "shortcut" ? (
                <span className="shrink-0 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-600">
                  Watch
                </span>
              ) : null}
            </div>
            <span className="text-sm tabular-nums text-slate-600">
              {Math.round(Number(item.calories))} kcal
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Aktivität löschen"
              onClick={() =>
                remove.mutate({
                  id: item.id,
                  source: item.source,
                  external_id: item.external_id,
                })
              }
              className="size-8 rounded-xl text-slate-300 hover:bg-rose-50 hover:text-rose-400"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_6.5rem_auto] gap-2">
        <div className="space-y-1">
          <Label htmlFor="ex-name" className="sr-only">
            Aktivität
          </Label>
          <Input
            id="ex-name"
            placeholder="z. B. Laufen"
            className="rounded-xl"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ex-kcal" className="sr-only">
            Kalorien der Aktivität
          </Label>
          <Input
            id="ex-kcal"
            type="number"
            min="0"
            placeholder="kcal"
            className="rounded-xl"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
          />
        </div>
        <Button
          size="icon"
          className="rounded-xl"
          aria-label="Aktivität hinzufügen"
          disabled={calories.trim() === "" || add.isPending}
          onClick={() => add.mutate()}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </section>
  );
}
