import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { AppShell } from "@/components/AppShell";
import { ErrorState } from "@/components/ErrorState";
import {
  ACTIVITY_LABELS,
  GOAL_LABELS,
  calculateTargets,
  todayISO,
  type ActivityLevel,
  type Gender,
  type Goal,
} from "@/lib/nutrition";
import { APP_NAME } from "@/lib/app-config";
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
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/profil")({
  head: () => ({
    meta: [
      { title: `Profil — ${APP_NAME}` },
      { name: "description", content: "Passe deine Ziele, Körperdaten und Makroverteilung an." },
      { property: "og:title", content: `Profil — ${APP_NAME}` },
      {
        property: "og:description",
        content: "Passe deine Ziele, Körperdaten und Makroverteilung an.",
      },
    ],
  }),
  component: ProfilePage,
});

type Form = {
  gender: Gender;
  age: string;
  height: string;
  weight: string;
  target: string;
  activity: ActivityLevel;
  goal: Goal;
};

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>({
    gender: "female",
    age: "30",
    height: "170",
    weight: "70",
    target: "65",
    activity: "light",
    goal: "lose",
  });

  const profile = useProfile(user.id);

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setForm({
      gender: (p.gender as Gender) ?? "female",
      age: String(p.age ?? 30),
      height: String(p.height_cm ?? 170),
      weight: String(p.current_weight ?? 70),
      target: String(p.target_weight ?? 65),
      activity: (p.activity_level as ActivityLevel) ?? "light",
      goal: (p.goal as Goal) ?? "lose",
    });
  }, [profile.data]);

  const targets = calculateTargets({
    gender: form.gender,
    age: Number(form.age) || 30,
    heightCm: Number(form.height) || 170,
    weightKg: Number(form.weight) || 70,
    activity: form.activity,
    goal: form.goal,
  });

  const save = useMutation({
    mutationFn: async () => {
      const weightKg = Number(form.weight);
      const { error } = await supabase
        .from("profiles")
        .update({
          gender: form.gender,
          age: Number(form.age),
          height_cm: Number(form.height),
          current_weight: weightKg,
          target_weight: Number(form.target),
          activity_level: form.activity,
          goal: form.goal,
          daily_calories: targets.calories,
          target_protein: targets.protein,
          target_carbs: targets.carbs,
          target_fat: targets.fat,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      if (error) throw error;

      // Mirror the weight into today's weight-history entry so the
      // Fortschritt chart/log stays in sync with what was edited here.
      // Upsert on (user_id, date) updates today's row if one already exists.
      const { error: weightError } = await supabase
        .from("weight_logs")
        .upsert(
          { user_id: user.id, date: todayISO(), weight_kg: weightKg },
          { onConflict: "user_id,date" },
        );
      if (weightError) throw weightError;
    },
    onSuccess: () => {
      toast.success("Profil aktualisiert");
      queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
      queryClient.invalidateQueries({ queryKey: ["weight_logs", user.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <h1 className="text-2xl font-bold tracking-tight text-slate-800">Profil & Ziele</h1>
      <p className="mt-1 text-sm text-slate-400">{user.email}</p>

      {profile.isError ? (
        <div className="mt-4">
          <ErrorState
            title="Profil konnte nicht geladen werden"
            message="Deine Profildaten konnten nicht abgerufen werden. Bitte prüfe deine Internetverbindung."
            onRetry={() => profile.refetch()}
          />
        </div>
      ) : profile.isLoading ? (
        <ProfileSkeleton />
      ) : (
        <>
          {/* Calorie target summary */}
          <div className="mt-4 rounded-3xl bg-white p-5 shadow-xl shadow-rose-100/50">
            <p className="text-sm text-slate-400">Aktuelles Tagesziel</p>
            <p className="text-4xl font-bold tabular-nums text-slate-800">
              {targets.calories} kcal
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
              <div>
                <p className="text-slate-400">Eiweiß</p>
                <p className="font-semibold text-slate-700">{targets.protein} g</p>
              </div>
              <div>
                <p className="text-slate-400">Kohlenhydrate</p>
                <p className="font-semibold text-slate-700">{targets.carbs} g</p>
              </div>
              <div>
                <p className="text-slate-400">Fett</p>
                <p className="font-semibold text-slate-700">{targets.fat} g</p>
              </div>
            </div>
          </div>

          {/* Form card */}
          <div className="mt-4 grid gap-4 rounded-3xl bg-white p-5 shadow-lg shadow-rose-50 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Geschlecht</Label>
              <Select
                value={form.gender}
                onValueChange={(v) => setForm({ ...form, gender: v as Gender })}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Weiblich</SelectItem>
                  <SelectItem value="male">Männlich</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="age">Alter</Label>
              <Input
                id="age"
                type="number"
                className="rounded-xl"
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="h">Größe (cm)</Label>
              <Input
                id="h"
                type="number"
                className="rounded-xl"
                value={form.height}
                onChange={(e) => setForm({ ...form, height: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="w">Aktuelles Gewicht (kg)</Label>
              <Input
                id="w"
                type="number"
                step="0.1"
                className="rounded-xl"
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tw">Zielgewicht (kg)</Label>
              <Input
                id="tw"
                type="number"
                step="0.1"
                className="rounded-xl"
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Aktivitätslevel</Label>
              <Select
                value={form.activity}
                onValueChange={(v) => setForm({ ...form, activity: v as ActivityLevel })}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
                    <SelectItem key={a} value={a}>
                      {ACTIVITY_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Ziel</Label>
              <Select
                value={form.goal}
                onValueChange={(v) => setForm({ ...form, goal: v as Goal })}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
                    <SelectItem key={g} value={g}>
                      {GOAL_LABELS[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="rounded-2xl sm:col-span-2"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              Änderungen speichern
            </Button>
          </div>
        </>
      )}
    </AppShell>
  );
}

function ProfileSkeleton() {
  return (
    <>
      <div className="mt-4 rounded-3xl bg-white p-5 shadow-xl shadow-rose-100/50">
        <Skeleton className="h-4 w-32 rounded" />
        <Skeleton className="mt-2 h-9 w-40 rounded" />
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
      <div className="mt-4 grid gap-4 rounded-3xl bg-white p-5 shadow-lg shadow-rose-50 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-9 w-full rounded-xl" />
          </div>
        ))}
        <Skeleton className="h-9 w-full rounded-2xl sm:col-span-2" />
      </div>
    </>
  );
}
