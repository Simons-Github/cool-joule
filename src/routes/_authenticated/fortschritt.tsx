import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { AppShell } from "@/components/AppShell";
import { ErrorState } from "@/components/ErrorState";
import {
  addDays,
  calculateTargets,
  formatGermanDate,
  fromISO,
  toISO,
  todayISO,
  type ActivityLevel,
  type Gender,
  type Goal,
} from "@/lib/nutrition";
import { APP_NAME } from "@/lib/app-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/fortschritt")({
  head: () => ({
    meta: [
      { title: `Fortschritt — ${APP_NAME}` },
      { name: "description", content: "Verfolge deinen Gewichtsverlauf über 7, 30 oder 90 Tage." },
      { property: "og:title", content: `Fortschritt — ${APP_NAME}` },
      {
        property: "og:description",
        content: "Verfolge deinen Gewichtsverlauf über 7, 30 oder 90 Tage.",
      },
    ],
  }),
  component: ProgressPage,
});

const RANGES = [7, 30, 90] as const;

function ProgressPage() {
  const { user } = Route.useRouteContext();
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [weight, setWeight] = useState("");
  const [entryDate, setEntryDate] = useState(todayISO());
  const queryClient = useQueryClient();

  const profile = useProfile(user.id);

  const weights = useQuery({
    queryKey: ["weight_logs", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weight_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const log = useMutation({
    mutationFn: async () => {
      const value = Number(weight);
      if (!value) throw new Error("Bitte ein gültiges Gewicht eingeben.");
      // Upsert on (user_id, date): creates a new row for that day, or overwrites
      // the existing entry for that exact day — never touches other days.
      const { error } = await supabase
        .from("weight_logs")
        .upsert(
          { user_id: user.id, date: entryDate, weight_kg: value },
          { onConflict: "user_id,date" },
        );
      if (error) throw error;

      // Only reflect this entry as the profile's "current" weight if it's the
      // most recent day we have data for — otherwise a retroactively logged
      // past weight would incorrectly override today's current weight.
      const latestKnownDate = (weights.data ?? []).reduce(
        (max, w) => (w.date > max ? w.date : max),
        "",
      );
      if (entryDate >= latestKnownDate) {
        const p = profile.data;
        // Recompute BMR/TDEE-based targets with the new weight so daily
        // calorie/macro goals stay in sync, mirroring what the profile
        // page does when weight is edited there.
        const targets = calculateTargets({
          gender: (p?.gender as Gender) ?? "female",
          age: p?.age ?? 30,
          heightCm: p?.height_cm ?? 170,
          weightKg: value,
          activity: (p?.activity_level as ActivityLevel) ?? "light",
          goal: (p?.goal as Goal) ?? "lose",
        });
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            current_weight: value,
            daily_calories: targets.calories,
            target_protein: targets.protein,
            target_carbs: targets.carbs,
            target_fat: targets.fat,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
        if (profileError) throw profileError;
      }
    },
    onSuccess: () => {
      toast.success("Gewicht gespeichert");
      setWeight("");
      queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
      queryClient.invalidateQueries({ queryKey: ["weight_logs", user.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const chartData = useMemo(() => {
    const from = addDays(todayISO(), -range);
    return (weights.data ?? [])
      .filter((w) => w.date >= from)
      .map((w) => ({
        // Parse as a local calendar date, not UTC midnight, so the chart
        // doesn't shift a day off in timezones behind UTC.
        date: fromISO(w.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
        kg: Number(w.weight_kg),
      }));
  }, [weights.data, range]);

  const targetWeight = profile.data?.target_weight;
  const cards = useMemo(() => {
    const all = weights.data ?? [];
    const start = all.length ? Number(all[0]!.weight_kg) : null;
    const current = all.length ? Number(all[all.length - 1]!.weight_kg) : null;
    const diff = start !== null && current !== null ? current - start : null;

    return [
      { label: "Startgewicht", value: start !== null ? `${start} kg` : "—" },
      { label: "Aktuell", value: current !== null ? `${current} kg` : "—" },
      {
        label: "Veränderung",
        value: diff !== null ? `${diff > 0 ? "+" : ""}${diff.toFixed(1)} kg` : "—",
      },
      {
        label: "Zielgewicht",
        value: targetWeight ? `${Number(targetWeight)} kg` : "—",
      },
    ];
  }, [weights.data, targetWeight]);

  const isLoading = profile.isLoading || weights.isLoading;
  const hasError = profile.isError || weights.isError;

  return (
    <AppShell>
      <h1 className="text-2xl font-bold tracking-tight text-slate-800">Fortschritt</h1>

      {/* Weight input card */}
      <div className="mt-4 rounded-3xl bg-white p-5 shadow-xl shadow-rose-100/50">
        <Label htmlFor="wl" className="text-slate-700">
          Gewicht eintragen (kg)
        </Label>
        <div className="mt-2 flex flex-wrap gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="min-w-40 rounded-2xl border-rose-200 bg-white text-slate-700 shadow-sm hover:bg-rose-50"
              >
                <CalendarDays className="size-4 text-rose-400" />
                {formatGermanDate(entryDate)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={fromISO(entryDate)}
                onSelect={(d) => d && setEntryDate(toISO(d))}
                disabled={(d) => toISO(d) > todayISO()}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <Input
            id="wl"
            type="number"
            step="0.1"
            placeholder="z. B. 72,4"
            className="min-w-32 flex-1 rounded-2xl"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
          <Button
            onClick={() => log.mutate()}
            disabled={log.isPending}
            className="rounded-2xl px-5"
          >
            Speichern
          </Button>
        </div>
      </div>

      {hasError ? (
        <div className="mt-4">
          <ErrorState
            title="Fortschritt konnte nicht geladen werden"
            message="Dein Gewichtsverlauf konnte nicht abgerufen werden. Bitte prüfe deine Internetverbindung."
            onRetry={() => {
              profile.refetch();
              weights.refetch();
            }}
          />
        </div>
      ) : isLoading ? (
        <ProgressSkeleton />
      ) : (
        <>
          {/* Stats cards */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="rounded-3xl bg-white p-4 shadow-md shadow-rose-50">
                <p className="text-xs text-slate-400">{c.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-800">{c.value}</p>
              </div>
            ))}
          </div>

          {/* Chart card */}
          <div className="mt-4 rounded-3xl bg-white p-5 shadow-lg shadow-rose-50">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Gewichtsverlauf</h2>
              <div className="flex gap-1">
                {RANGES.map((r) => (
                  <Button
                    key={r}
                    size="sm"
                    variant={range === r ? "default" : "ghost"}
                    className={
                      range === r
                        ? "rounded-xl"
                        : "rounded-xl text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                    }
                    onClick={() => setRange(r)}
                  >
                    {r} Tage
                  </Button>
                ))}
              </div>
            </div>

            {chartData.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-400">
                Noch keine Einträge in diesem Zeitraum.
              </p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.94 0.01 50)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12, fill: "oklch(0.55 0.022 255)" }}
                      stroke="oklch(0.91 0.012 50)"
                    />
                    <YAxis
                      domain={["dataMin - 1", "dataMax + 1"]}
                      tick={{ fontSize: 12, fill: "oklch(0.55 0.022 255)" }}
                      stroke="oklch(0.91 0.012 50)"
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#ffffff",
                        border: "none",
                        borderRadius: 16,
                        boxShadow: "0 10px 40px rgba(244,63,94,0.12)",
                        color: "oklch(0.28 0.022 255)",
                      }}
                      formatter={(v) => [`${v} kg`, "Gewicht"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="kg"
                      stroke="var(--primary)"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "var(--primary)" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}

function ProgressSkeleton() {
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-3xl bg-white p-4 shadow-md shadow-rose-50">
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="mt-2 h-6 w-20 rounded" />
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-3xl bg-white p-5 shadow-lg shadow-rose-50">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-5 w-32 rounded-lg" />
          <Skeleton className="h-8 w-40 rounded-xl" />
        </div>
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    </>
  );
}
