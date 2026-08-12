import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared `profiles` row fetch, used by every authenticated page that needs
 * the user's targets/onboarding state. Keeping the query in one place keeps
 * the query key, select shape, and error handling in sync across pages.
 */
export function useProfile(userId: string) {
  return useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
