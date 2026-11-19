import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Letzter Ausweg bei fehlendem Netz: die in localStorage gespeicherte Session lesen.
function readStoredUser() {
  try {
    const host = new URL(import.meta.env["VITE_SUPABASE_URL"]).hostname.split(".")[0];
    const raw = localStorage.getItem(`sb-${host}-auth-token`);
    const user = raw ? JSON.parse(raw)?.user : null;
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession() liest die Session lokal und erneuert das Token bei Bedarf. Anders als
    // getUser() ist es nicht von einem erfolgreichen Netzwerkaufruf abhängig. Beim Start
    // der iPhone-Home-Screen-App ist das Netz oft noch nicht bereit (Safari meldet dann
    // "Load failed"): in dem Fall mehrfach wiederholen, statt auszuloggen.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, error } = await supabase.auth.getSession();
      if (data.session?.user) return { user: data.session.user };
      if (!error || !isAuthRetryableFetchError(error)) break;
      await wait(750);
    }

    const stored = readStoredUser();
    if (stored) return { user: stored };
    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
