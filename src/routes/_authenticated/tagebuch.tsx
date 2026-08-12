import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Trash2, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { AppShell } from "@/components/AppShell";
import { OnboardingModal } from "@/components/OnboardingModal";
import { FoodSearchModal } from "@/components/FoodSearchModal";
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

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("food_logs")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eintrag gelöscht");
      queryClient.invalidateQueries({ queryKey: ["food_logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  const targetCal = profile.data?.daily_calories ?? 2000;
  const needsOnboarding = profile.isSuccess && !profile.data?.onboarded;
  const isLoading = profile.isLoading || logs.isLoading;
  const hasError = profile.isError || logs.isError;

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
              <CalorieRing consumed={totals.calories} target={targetCal} />
              <div className="w-full flex-1 space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <p className="text-slate-400">Ziel</p>
                    <p className="font-semibold tabular-nums text-slate-700">{targetCal}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Gegessen</p>
                    <p className="font-semibold tabular-nums text-slate-700">
                      {Math.round(totals.calories)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Übrig</p>
                    <p className="font-semibold tabular-nums text-slate-700">
                      {Math.round(targetCal - totals.calories)}
                    </p>
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
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-slate-800">{meal.label}</h2>
                    <span className="text-sm text-slate-400 tabular-nums">
                      {Math.round(mealCal)} kcal
                    </span>
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
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-700">
                            {item.food_name}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {item.brand ? `${item.brand} · ` : ""}
                            {Number(item.serving_size_g)} g · {Number(item.protein)} g E ·{" "}
                            {Number(item.carbs)} g KH · {Number(item.fat)} g F
                          </p>
                        </div>
                        <span className="text-sm tabular-nums text-slate-600">
                          {Math.round(Number(item.calories))} kcal
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Item löschen"
                          onClick={() => remove.mutate(item.id)}
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
            <div className="grid grid-cols-3 gap-2">
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
      {MEALS.map((meal) => (
        <div key={meal.key} className="rounded-3xl bg-white p-4 shadow-lg shadow-rose-50/80">
          <Skeleton className="h-5 w-32 rounded-lg" />
          <Skeleton className="mt-3 h-14 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}
