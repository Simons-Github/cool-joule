import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ACTIVITY_LABELS,
  GOAL_LABELS,
  calculateTargets,
  todayISO,
  type ActivityLevel,
  type Gender,
  type Goal,
} from "@/lib/nutrition";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/app-config";

type Draft = {
  gender: Gender;
  age: string;
  height: string;
  weight: string;
  target: string;
  activity: ActivityLevel;
  goal: Goal;
};

const STEPS = ["Über dich", "Gewicht", "Aktivität", "Ziel", "Dein Plan"];

export function OnboardingModal({ open, userId }: { open: boolean; userId: string }) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>({
    gender: "female",
    age: "30",
    height: "170",
    weight: "70",
    target: "65",
    activity: "light",
    goal: "lose",
  });
  const queryClient = useQueryClient();

  const targets = calculateTargets({
    gender: d.gender,
    age: Number(d.age) || 30,
    heightCm: Number(d.height) || 170,
    weightKg: Number(d.weight) || 70,
    activity: d.activity,
    goal: d.goal,
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").upsert({
        id: userId,
        gender: d.gender,
        age: Number(d.age),
        height_cm: Number(d.height),
        current_weight: Number(d.weight),
        target_weight: Number(d.target),
        activity_level: d.activity,
        goal: d.goal,
        daily_calories: targets.calories,
        target_protein: targets.protein,
        target_carbs: targets.carbs,
        target_fat: targets.fat,
        onboarded: true,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      await supabase.from("weight_logs").upsert(
        {
          user_id: userId,
          date: todayISO(),
          weight_kg: Number(d.weight),
        },
        { onConflict: "user_id,date" },
      );
    },
    onSuccess: () => {
      toast.success("Profil gespeichert – los geht's!");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-lg [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Willkommen bei {APP_NAME}</DialogTitle>
          <DialogDescription>
            Schritt {step + 1} von {STEPS.length} — {STEPS[step]}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn("h-1.5 flex-1 rounded-full bg-slate-100", i <= step && "bg-rose-400")}
            />
          ))}
        </div>

        <div className="space-y-4 py-2">
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label>Geschlecht</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["female", "male"] as Gender[]).map((g) => (
                    <Button
                      key={g}
                      type="button"
                      variant={d.gender === g ? "default" : "outline"}
                      onClick={() => setD({ ...d, gender: g })}
                    >
                      {g === "female" ? "Weiblich" : "Männlich"}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="age">Alter (Jahre)</Label>
                  <Input
                    id="age"
                    type="number"
                    value={d.age}
                    onChange={(e) => setD({ ...d, age: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="height">Größe (cm)</Label>
                  <Input
                    id="height"
                    type="number"
                    value={d.height}
                    onChange={(e) => setD({ ...d, height: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="w">Aktuelles Gewicht (kg)</Label>
                <Input
                  id="w"
                  type="number"
                  step="0.1"
                  value={d.weight}
                  onChange={(e) => setD({ ...d, weight: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tw">Zielgewicht (kg)</Label>
                <Input
                  id="tw"
                  type="number"
                  step="0.1"
                  value={d.target}
                  onChange={(e) => setD({ ...d, target: e.target.value })}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <Label>Aktivitätslevel</Label>
              <div className="grid gap-2">
                {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
                  <Button
                    key={a}
                    type="button"
                    variant={d.activity === a ? "default" : "outline"}
                    className="justify-start"
                    onClick={() => setD({ ...d, activity: a })}
                  >
                    {ACTIVITY_LABELS[a]}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-2">
              <Label>Was ist dein Ziel?</Label>
              <div className="grid gap-2">
                {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
                  <Button
                    key={g}
                    type="button"
                    variant={d.goal === g ? "default" : "outline"}
                    className="justify-start"
                    onClick={() => setD({ ...d, goal: g })}
                  >
                    {GOAL_LABELS[g]}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="rounded-2xl bg-rose-50/60 p-4">
              <p className="text-sm text-slate-400">Dein Tagesziel</p>
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
              <p className="mt-4 text-xs text-slate-400">
                Berechnet nach der Mifflin-St-Jeor-Formel. Du kannst alles später im Profil
                anpassen.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            Zurück
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)}>Weiter</Button>
          ) : (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Speichern…" : "Plan starten"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
