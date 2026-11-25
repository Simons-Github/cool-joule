import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n/react";
import {
  ACTIVITY_LEVELS,
  GOALS,
  activityLabel,
  calculateTargets,
  goalLabel,
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

const STEPS = [
  "onb.step.about",
  "onb.step.weight",
  "onb.step.activity",
  "onb.step.goal",
  "onb.step.plan",
] as const;

export function OnboardingModal({ open, userId }: { open: boolean; userId: string }) {
  const t = useT();
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
      toast.success(t("onb.saved"));
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-lg [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{t("onb.title", { app: APP_NAME })}</DialogTitle>
          <DialogDescription>
            {t("onb.stepOf", {
              step: step + 1,
              total: STEPS.length,
              name: t(STEPS[step] ?? STEPS[0]),
            })}
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
                <Label>{t("onb.gender")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["female", "male"] as Gender[]).map((g) => (
                    <Button
                      key={g}
                      type="button"
                      variant={d.gender === g ? "default" : "outline"}
                      onClick={() => setD({ ...d, gender: g })}
                    >
                      {g === "female" ? t("onb.female") : t("onb.male")}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="age">{t("onb.age")}</Label>
                  <Input
                    id="age"
                    type="number"
                    value={d.age}
                    onChange={(e) => setD({ ...d, age: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="height">{t("onb.height")}</Label>
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
                <Label htmlFor="w">{t("onb.weightNow")}</Label>
                <Input
                  id="w"
                  type="number"
                  step="0.1"
                  value={d.weight}
                  onChange={(e) => setD({ ...d, weight: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tw">{t("onb.weightTarget")}</Label>
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
              <Label>{t("onb.activityLevel")}</Label>
              <div className="grid gap-2">
                {ACTIVITY_LEVELS.map((a) => (
                  <Button
                    key={a}
                    type="button"
                    variant={d.activity === a ? "default" : "outline"}
                    className="justify-start"
                    onClick={() => setD({ ...d, activity: a })}
                  >
                    {activityLabel(t, a)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-2">
              <Label>{t("onb.goalQuestion")}</Label>
              <div className="grid gap-2">
                {GOALS.map((g) => (
                  <Button
                    key={g}
                    type="button"
                    variant={d.goal === g ? "default" : "outline"}
                    className="justify-start"
                    onClick={() => setD({ ...d, goal: g })}
                  >
                    {goalLabel(t, g)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="rounded-2xl bg-rose-50/60 p-4">
              <p className="text-sm text-slate-400">{t("onb.dailyTarget")}</p>
              <p className="text-4xl font-bold tabular-nums text-slate-800">
                {targets.calories} kcal
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
                <div>
                  <p className="text-slate-400">{t("macro.protein")}</p>
                  <p className="font-semibold text-slate-700">{targets.protein} g</p>
                </div>
                <div>
                  <p className="text-slate-400">{t("macro.carbs")}</p>
                  <p className="font-semibold text-slate-700">{targets.carbs} g</p>
                </div>
                <div>
                  <p className="text-slate-400">{t("macro.fat")}</p>
                  <p className="font-semibold text-slate-700">{targets.fat} g</p>
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-400">{t("onb.formulaNote")}</p>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            {t("common.back")}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)}>{t("onb.next")}</Button>
          ) : (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? t("onb.saving") : t("onb.start")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
