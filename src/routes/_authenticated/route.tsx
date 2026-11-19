import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession() liest die Session lokal (und erneuert sie bei Bedarf). Anders als
    // getUser() braucht es kein Netzwerk – wichtig für die iPhone-Home-Screen-App, die
    // beim Aufwecken oft noch keine Verbindung hat. Ein Netzwerkfehler darf nicht
    // zum Logout führen.
    const { data, error } = await supabase.auth.getSession();
    if (data.session?.user) return { user: data.session.user };

    // Kein lokaler Session-Eintrag: nur dann wirklich ausgeloggt.
    // Bei einem Netzwerkfehler beim Token-Refresh bleibt die Session gespeichert,
    // daher nicht auf /auth umleiten, sondern den Fehler sichtbar machen.
    if (error && /fetch|network|timeout/i.test(error.message)) throw error;
    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
