import { supabase } from "@/integrations/supabase/client";
import { getGeminiKeyStatus } from "@/lib/user-gemini-key";
import { todayISO } from "@/lib/nutrition";
import type { GeminiKeyStatus } from "@/lib/gemini-api-key";

export type AccountExportPayload = {
  exportedAt: string;
  email: string | null;
  geminiKey: GeminiKeyStatus;
  profile: unknown;
  food_logs: unknown[];
  weight_logs: unknown[];
  custom_foods: unknown[];
  exercise_logs: unknown[];
};

export function accountExportFilename(now = todayISO()): string {
  return `cool-joule-export-${now}.json`;
}

export async function collectAccountExport(
  userId: string,
  email: string | null,
): Promise<AccountExportPayload> {
  const [profile, foodLogs, weightLogs, customFoods, exerciseLogs] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("food_logs").select("*").eq("user_id", userId).order("date", { ascending: true }),
    supabase
      .from("weight_logs")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: true }),
    supabase
      .from("custom_foods")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("exercise_logs")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: true }),
  ]);

  const firstError =
    profile.error || foodLogs.error || weightLogs.error || customFoods.error || exerciseLogs.error;
  if (firstError) throw firstError;

  let geminiKey: GeminiKeyStatus = { configured: false, suffix: null };
  try {
    geminiKey = await getGeminiKeyStatus();
  } catch {
    geminiKey = { configured: false, suffix: null };
  }

  return {
    exportedAt: new Date().toISOString(),
    email,
    geminiKey,
    profile: profile.data,
    food_logs: foodLogs.data ?? [],
    weight_logs: weightLogs.data ?? [],
    custom_foods: customFoods.data ?? [],
    exercise_logs: exerciseLogs.data ?? [],
  };
}

export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
