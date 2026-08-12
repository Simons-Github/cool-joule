import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP_NAME } from "@/lib/app-config";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: `Anmelden — ${APP_NAME}` },
      {
        name: "description",
        content: `Melde dich bei ${APP_NAME} an und tracke Kalorien und Makros.`,
      },
      { property: "og:title", content: `Anmelden — ${APP_NAME}` },
      {
        property: "og:description",
        content: `Melde dich bei ${APP_NAME} an und tracke Kalorien und Makros.`,
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/tagebuch", replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/tagebuch", replace: true });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      toast.success("Fast geschafft! Bestätige bitte deine E-Mail-Adresse.");
      return;
    }
    navigate({ to: "/tagebuch", replace: true });
  }

  async function google() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth`,
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message || "Google-Anmeldung fehlgeschlagen");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-rose-50 px-4">
      <div className="w-full max-w-sm">
        {/* Mascot — links zur Startseite */}
        <Link
          to="/"
          className="mb-6 flex flex-col items-center gap-2 transition-opacity duration-200 hover:opacity-80"
        >
          <img
            src="/mascot.png"
            alt="Cool Joule Maskottchen"
            className="mx-auto mb-1 h-28 w-28 object-contain drop-shadow-lg"
          />
          <span className="text-xl font-bold tracking-tight text-slate-800">{APP_NAME}</span>
        </Link>

        <div className="rounded-3xl bg-white p-6 shadow-2xl shadow-rose-100/60">
          <Tabs defaultValue="login">
            {/* Custom pill-style toggle */}
            <TabsList className="mb-4 grid w-full grid-cols-2 rounded-2xl bg-rose-50 p-1">
              <TabsTrigger
                value="login"
                className="rounded-xl text-slate-500 data-[state=active]:bg-white data-[state=active]:text-rose-700 data-[state=active]:shadow-sm"
              >
                Anmelden
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="rounded-xl text-slate-500 data-[state=active]:bg-white data-[state=active]:text-rose-700 data-[state=active]:shadow-sm"
              >
                Registrieren
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={signIn} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="e1" className="text-slate-600">
                    E-Mail
                  </Label>
                  <Input
                    id="e1"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="border-0 bg-slate-50 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-0 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p1" className="text-slate-600">
                    Passwort
                  </Label>
                  <Input
                    id="p1"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="border-0 bg-slate-50 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-0 rounded-xl"
                  />
                </div>
                <Button type="submit" className="w-full rounded-xl" disabled={loading}>
                  Anmelden
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={signUp} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="e2" className="text-slate-600">
                    E-Mail
                  </Label>
                  <Input
                    id="e2"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="border-0 bg-slate-50 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-0 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p2" className="text-slate-600">
                    Passwort
                  </Label>
                  <Input
                    id="p2"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-describedby="p2-hint"
                    className="border-0 bg-slate-50 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-0 rounded-xl"
                  />
                  <p id="p2-hint" className="text-xs text-slate-400">
                    Mindestens 8 Zeichen
                  </p>
                </div>
                <Button type="submit" className="w-full rounded-xl" disabled={loading}>
                  Konto erstellen
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-100" /> oder{" "}
            <span className="h-px flex-1 bg-slate-100" />
          </div>

          <button
            onClick={google}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-100 transition-colors hover:bg-rose-50 disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Mit Google fortfahren
          </button>
        </div>
      </div>
    </div>
  );
}
