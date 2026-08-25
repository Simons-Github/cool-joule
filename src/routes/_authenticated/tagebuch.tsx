import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { AppShell } from "@/components/AppShell";
import { OnboardingModal } from "@/components/OnboardingModal";
import { FoodSearchModal } from "@/components/FoodSearchModal";
import { EditFoodLogDialog } from "@/components/EditFoodLogDialog";
import { ExercisePanel } from "@/components/ExercisePanel";
import { ErrorState } from "@/components/ErrorState";
import { CalorieRing, MacroBar } from "@/components/MacroStats";
import {
  MEALS,
  addDays,
  formatGermanDate,
  fromISO,
  todayISO,
  toISO,
  type MealType,
} from "@/lib/nutrition";
import { isQuickAddServing, netRemaining, toCopiedInserts } from "@/lib/food-log";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/app-config";

const EMPTY_STATE_TEXT: Record<MealType, string> = {
  breakfast: "Zeit für einen guten Start in den Tag.",
  lunch: "Trage hier deine Mahlzeit ein.",
  dinner: "Trage hier deine Mahlzeit ein.",
  snacks: "Lust auf einen kleinen Snack?",
};

const EMPTY_STATE_IMAGE: Record<MealType, string> = {
  breakfast: "/mascot_breakfast.png",
  lunch: "/mascot_lunch.png",
  dinner: "/mascot_dinner.png",
  snacks: "/mascot.png",
};

type FoodLogRow = Database["public"]["Tables"]["food_logs"]["Row"];

export const Route = createFileRoute("/_authenticated/tagebuch")({
  head: () => ({
    meta: [
      { title: `Tagebuch — ${APP_NAME}` },
      {
        name: "description",
        content: "Dein tägliches Ernährungstagebuch mit Kalorien- und Makroübersicht.",
      },
      { property: "og:title", content: `Tagebuch — ${APP_NAME}` },
      {
        property: "og:description",
        content: "Dein tägliches Ernährungstagebuch mit Kalorien- und Makroübersicht.",
      },
    ],
  }),
  component: DiaryPage,
});

function DiaryPage() {
  const { user } = Route.useRouteContext();
  const [date, setDate] = useState(todayISO());
  const [modalMeal, setModalMeal] = useState<MealType | null>(null);
  const [editing, setEditing] = useState<FoodLogRow | null>(null);
  const queryClient = useQueryClient();

  const profile = useProfile(user.id);

  const logs = useQuery({
    queryKey: ["food_logs", user.id, date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("food_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", date)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const yesterday = addDays(date, -1);
  const yesterdayLogs = useQuery({
    queryKey: ["food_logs", user.id, yesterday],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("food_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", yesterday)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const exercises = useQuery({
    queryKey: ["exercise_logs", user.id, date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercise_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", date)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const restore = useMutation({
    mutationFn: async (row: FoodLogRow) => {
      const { error } = await supabase.from("food_logs").insert({
        id: row.id,
        user_id: row.user_id,
        date: row.date,
        meal_type: row.meal_type,
        food_name: row.food_name,
        brand: row.brand,
        serving_size_g: row.serving_size_g,
        calories: row.calories,
        protein: row.protein,
        carbs: row.carbs,
        fat: row.fat,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eintrag wiederhergestellt");
      queryClient.invalidateQueries({ queryKey: ["food_logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (row: FoodLogRow) => {
      const { error } = await supabase
        .from("food_logs")
        .delete()
        .eq("id", row.id)
        .eq("user_id", user.id);
      if (error) throw error;
      return row;
    },
    onSuccess: (row) => {
      toast.success("Eintrag gelöscht", {
        action: {
          label: "Rückgängig",
          onClick: () => restore.mutate(row),
        },
      });
      queryClient.invalidateQueries({ queryKey: ["food_logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyFromYesterday = useMutation({
    mutationFn: async (mealType?: MealType) => {
      const source = (yesterdayLogs.data ?? []).filter((row) =>
        mealType ? row.meal_type === mealType : true,
      );
      if (source.length === 0) {
        throw new Error("Es gibt nichts zu kopieren.");
      }
      const inserts = toCopiedInserts(source, date);
      const { error } = await supabase.from("food_logs").insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Einträge kopiert");
      queryClient.invalidateQueries({ queryKey: ["food_logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function requestCopy(mealType?: MealType) {
    const target = (logs.data ?? []).filter((row) =>
      mealType ? row.meal_type === mealType : true,
    );
    if (target.length > 0) {
      const ok = window.confirm(
        mealType
          ? "Diese Mahlzeit hat schon Einträge. Trotzdem vom Vortag kopieren?"
          : "Dieser Tag hat schon Einträge. Trotzdem vom Vortag kopieren?",
      );
      if (!ok) return;
    }
    copyFromYesterday.mutate(mealType);
  }

  const totals = useMemo(() => {
    const rows = logs.data ?? [];
    return rows.reduce(
      (acc, r) => ({
        calories: acc.calories + Number(r.calories),
        protein: acc.protein + Number(r.protein),
        carbs: acc.carbs + Number(r.carbs),
        fat: acc.fat + Number(r.fat),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
  }, [logs.data]);

  const exerciseCal = useMemo(
    () => (exercises.data ?? []).reduce((sum, row) => sum + Number(row.calories), 0),
    [exercises.data],
  );
  const remaining = netRemaining({
    target: profile.data?.daily_calories ?? 2000,
    food: totals.calories,
    exercise: exerciseCal,
  });

  const targetCal = profile.data?.daily_calories ?? 2000;
  const needsOnboarding = profile.isSuccess && !profile.data?.onboarded;
  const isLoading = profile.isLoading || logs.isLoading;
  const hasError = profile.isError || logs.isError;
  const yesterdayHasItems = (yesterdayLogs.data ?? []).length > 0;
  const copyDayLabel = date === todayISO() ? "Gestern kopieren" : "Vorherigen Tag kopieren";

  return (
    <AppShell>
      {needsOnboarding && <OnboardingModal open userId={user.id} />}

      {/* Date navigator */}
      <div className="mb-5 flex items-center justify-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDate(addDays(date, -1))}
          aria-label="Vorheriger Tag"
          className="rounded-xl text-slate-500 hover:bg-rose-50 hover:text-rose-500"
        >
          <ChevronLeft className="size-5" />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="min-w-40 rounded-2xl border-rose-200 bg-white text-slate-700 shadow-sm hover:bg-rose-50"
            >
              <CalendarDays className="size-4 text-rose-400" />
              {formatGermanDate(date)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              selected={fromISO(date)}
              onSelect={(d) => d && setDate(toISO(d))}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDate(addDays(date, 1))}
          aria-label="Nächster Tag"
          className="rounded-xl text-slate-500 hover:bg-rose-50 hover:text-rose-500"
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>
      <div className="mb-5 flex justify-center">
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl border-rose-200 text-slate-600"
          disabled={!yesterdayHasItems || copyFromYesterday.isPending}
          onClick={() => requestCopy()}
        >
          <Copy className="size-4" />
          {copyDayLabel}
        </Button>
      </div>

      <h1 className="sr-only">Tagebuch</h1>

      {hasError ? (
        <ErrorState
          title="Tagebuch konnte nicht geladen werden"
          message="Deine Einträge für diesen Tag konnten nicht abgerufen werden. Bitte prüfe deine Internetverbindung."
          onRetry={() => {
            profile.refetch();
            logs.refetch();
          }}
        />
      ) : isLoading ? (
        <DiarySkeleton />
      ) : (
        <>
          {/* Summary card — Calorie ring + macro bars */}
          <section className="rounded-3xl bg-white p-5 shadow-xl shadow-rose-100/50">
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <CalorieRing consumed={totals.calories} target={targetCal + exerciseCal} />
              <div className="w-full flex-1 space-y-4">
                <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-slate-400">Ziel</p>
                    <p className="font-semibold tabular-nums text-slate-700">{targetCal}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Sport</p>
                    <p className="font-semibold tabular-nums text-slate-700">
                      +{Math.round(exerciseCal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Gegessen</p>
                    <p className="font-semibold tabular-nums text-slate-700">
                      {Math.round(totals.calories)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Übrig</p>
                    <p className="font-semibold tabular-nums text-slate-700">{remaining}</p>
                  </div>
                </div>
                <MacroBar
                  label="Eiweiß"
                  current={totals.protein}
                  target={profile.data?.target_protein ?? 120}
                  colorVar="protein"
                />
                <MacroBar
                  label="Kohlenhydrate"
                  current={totals.carbs}
                  target={profile.data?.target_carbs ?? 220}
                  colorVar="carbs"
                />
                <MacroBar
                  label="Fett"
                  current={totals.fat}
                  target={profile.data?.target_fat ?? 65}
                  colorVar="fat"
                />
              </div>
            </div>
          </section>

          <div className="mt-5">
            <ExercisePanel userId={user.id} date={date} />
          </div>

          {/* Meal sections */}
          <div className="mt-5 space-y-4">
            {MEALS.map((meal) => {
              const items = (logs.data ?? []).filter((l) => l.meal_type === meal.key);
              const mealCal = items.reduce((s, i) => s + Number(i.calories), 0);
              return (
                <section
                  key={meal.key}
                  className="rounded-3xl bg-white p-4 shadow-lg shadow-rose-50/80"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-semibold text-slate-800">{meal.label}</h2>
                    <div className="flex items-center gap-2">
                      {(yesterdayLogs.data ?? []).some((row) => row.meal_type === meal.key) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-xl px-2 text-xs text-slate-400 hover:text-rose-600"
                          disabled={copyFromYesterday.isPending}
                          onClick={() => requestCopy(meal.key)}
                        >
                          <Copy className="size-3.5" />
                          Gestern
                        </Button>
                      )}
                      <span className="text-sm text-slate-400 tabular-nums">
                        {Math.round(mealCal)} kcal
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 divide-y divide-slate-50">
                    {items.length === 0 && (
                      <div className="flex flex-col items-center gap-1 py-4">
                        <img
                          src={EMPTY_STATE_IMAGE[meal.key]}
                          alt={meal.label}
                          className="mb-1 h-14 w-14 object-contain drop-shadow-sm"
                        />
                        <p className="text-sm text-slate-400">{EMPTY_STATE_TEXT[meal.key]}</p>
                      </div>
                    )}
                    {items.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => setEditing(item)}
                          className="min-w-0 flex-1 rounded-xl text-left hover:bg-rose-50/70"
                        >
                          <p className="truncate text-sm font-medium text-slate-700">
                            {item.food_name}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {item.brand ? `${item.brand} · ` : ""}
                            {isQuickAddServing(Number(item.serving_size_g))
                              ? ""
                              : `${Number(item.serving_size_g)} g · `}
                            {Number(item.protein)} g E · {Number(item.carbs)} g KH ·{" "}
                            {Number(item.fat)} g F
                          </p>
                        </button>
                        <span className="text-sm tabular-nums text-slate-600">
                          {Math.round(Number(item.calories))} kcal
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Item löschen"
                          onClick={() => remove.mutate(item)}
                          className="size-8 rounded-xl text-slate-300 hover:bg-rose-50 hover:text-rose-400"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Subtle "add food" text-button */}
                  <button
                    onClick={() => setModalMeal(meal.key)}
                    className="mt-2 flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-medium text-rose-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Plus className="size-4" />
                    Nahrungsmittel hinzufügen
                  </button>
                </section>
              );
            })}
          </div>
        </>
      )}

      {modalMeal && (
        <FoodSearchModal
          open
          onOpenChange={(o) => !o && setModalMeal(null)}
          mealType={modalMeal}
          date={date}
          userId={user.id}
        />
      )}

      <EditFoodLogDialog item={editing} userId={user.id} onClose={() => setEditing(null)} />
    </AppShell>
  );
}

function DiarySkeleton() {
  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-white p-5 shadow-xl shadow-rose-100/50">
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <Skeleton className="size-[148px] shrink-0 rounded-full" />
          <div className="w-full flex-1 space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
            <Skeleton className="h-6 w-full rounded-full" />
            <Skeleton className="h-6 w-full rounded-full" />
            <Skeleton className="h-6 w-full rounded-full" />
          </div>
        </div>
      </section>
      <Skeleton className="h-28 w-full rounded-3xl" />
      {MEALS.map((meal) => (
        <div key={meal.key} className="rounded-3xl bg-white p-4 shadow-lg shadow-rose-50/80">
          <Skeleton className="h-5 w-32 rounded-lg" />
          <Skeleton className="mt-3 h-14 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}
