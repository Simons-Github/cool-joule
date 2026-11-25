import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP_NAME } from "@/lib/app-config";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { translate } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/react";
import { getDemoStartErrorMessage } from "@/lib/demo-mode";
import { seedDemoAccount } from "@/lib/demo-seed";
import {
  PASSWORD_MIN_LENGTH,
  passwordRequirementsHint,
  mapAuthErrorMessage,
  validatePassword,
} from "@/lib/password";

export const Route = createFileRoute("/auth")({
  head: ({ match }) => {
    const lang = match.context.lang;
    const title = translate(lang, "auth.meta.title", { app: APP_NAME });
    const description = translate(lang, "auth.meta.description", { app: APP_NAME });
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: AuthPage,
});

function AuthPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const recoveringRef = useRef(false);
  // While the demo account is being seeded, the auth listener must not jump to /tagebuch yet.
  const seedingDemoRef = useRef(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveringRef.current = true;
        setRecovery(true);
        setForgotPassword(false);
        return;
      }
      if (recoveringRef.current || seedingDemoRef.current) return;
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        // Defer: navigating into /tagebuch runs getUser() and would deadlock supabase-js.
        setTimeout(() => {
          void navigate({ to: "/tagebuch", replace: true });
        }, 0);
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
      toast.error(mapAuthErrorMessage(error, lang));
      return;
    }
    navigate({ to: "/tagebuch", replace: true });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    const passwordError = validatePassword(password, lang);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    setLoading(false);
    if (error) {
      toast.error(mapAuthErrorMessage(error, lang));
      return;
    }
    if (!data.session) {
      toast.success(t("auth.confirmEmail"));
      return;
    }
    navigate({ to: "/tagebuch", replace: true });
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      toast.error(t("auth.enterEmail"));
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth`,
    });
    setLoading(false);
    if (error) {
      toast.error(mapAuthErrorMessage(error, lang));
      return;
    }
    toast.success(t("auth.resetSent"));
    setForgotPassword(false);
  }

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    const passwordError = validatePassword(newPassword, lang);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      toast.error(mapAuthErrorMessage(error, lang));
      return;
    }
    recoveringRef.current = false;
    setRecovery(false);
    setNewPassword("");
    toast.success(t("auth.passwordUpdated"));
    navigate({ to: "/tagebuch", replace: true });
  }

  async function startDemo() {
    setLoading(true);
    seedingDemoRef.current = true;
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.user) {
        toast.error(getDemoStartErrorMessage(error, lang));
        return;
      }
      try {
        await seedDemoAccount(supabase, data.user.id);
      } catch {
        // The empty account is still usable; the onboarding dialog takes over.
        toast.error(t("auth.demoSeedFailed"));
      }
      navigate({ to: "/tagebuch", replace: true });
    } finally {
      seedingDemoRef.current = false;
      setLoading(false);
    }
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
      toast.error(error.message || t("auth.googleFailed"));
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-rose-50 px-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm">
        {/* Mascot — links zur Startseite */}
        <Link
          to="/"
          className="mb-6 flex flex-col items-center gap-2 transition-opacity duration-200 hover:opacity-80"
        >
          <img
            src="/mascot.png"
            alt={t("brand.mascotAlt")}
            className="mx-auto mb-1 h-28 w-28 object-contain drop-shadow-lg"
          />
          <span className="text-xl font-bold tracking-tight text-slate-800">{APP_NAME}</span>
        </Link>

        <div className="rounded-3xl bg-white p-6 shadow-2xl shadow-rose-100/60">
          {recovery ? (
            <form onSubmit={updatePassword} className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-800">{t("auth.newPassword")}</h2>
              <p className="text-sm text-slate-500">{t("auth.newPasswordIntro")}</p>
              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-slate-600">
                  {t("auth.newPassword")}
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  aria-describedby="new-password-hint"
                  className="border-0 bg-slate-50 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-0 rounded-xl"
                />
                <p id="new-password-hint" className="text-xs text-slate-400">
                  {passwordRequirementsHint(lang)}
                </p>
              </div>
              <Button type="submit" className="w-full rounded-xl" disabled={loading}>
                {t("auth.savePassword")}
              </Button>
            </form>
          ) : forgotPassword ? (
            <form onSubmit={sendReset} className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-800">{t("auth.forgotTitle")}</h2>
              <p className="text-sm text-slate-500">{t("auth.forgotIntro")}</p>
              <div className="space-y-1.5">
                <Label htmlFor="reset-email" className="text-slate-600">
                  {t("auth.email")}
                </Label>
                <Input
                  id="reset-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-0 bg-slate-50 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-0 rounded-xl"
                />
              </div>
              <Button type="submit" className="w-full rounded-xl" disabled={loading}>
                {t("auth.sendLink")}
              </Button>
              <button
                type="button"
                className="w-full text-sm text-rose-600 hover:underline"
                onClick={() => setForgotPassword(false)}
              >
                {t("auth.backToSignIn")}
              </button>
            </form>
          ) : (
            <>
              <Tabs defaultValue="login">
                {/* Custom pill-style toggle */}
                <TabsList className="mb-4 grid w-full grid-cols-2 rounded-2xl bg-rose-50 p-1">
                  <TabsTrigger
                    value="login"
                    className="rounded-xl text-slate-500 data-[state=active]:bg-white data-[state=active]:text-rose-700 data-[state=active]:shadow-sm"
                  >
                    {t("auth.signIn")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="signup"
                    className="rounded-xl text-slate-500 data-[state=active]:bg-white data-[state=active]:text-rose-700 data-[state=active]:shadow-sm"
                  >
                    {t("auth.signUp")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <form onSubmit={signIn} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="e1" className="text-slate-600">
                        {t("auth.email")}
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
                        {t("auth.password")}
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
                      {t("auth.signIn")}
                    </Button>
                    <button
                      type="button"
                      className="w-full text-sm text-rose-600 hover:underline"
                      onClick={() => setForgotPassword(true)}
                    >
                      {t("auth.forgotLink")}
                    </button>
                  </form>
                </TabsContent>

                <TabsContent value="signup">
                  <form onSubmit={signUp} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="e2" className="text-slate-600">
                        {t("auth.email")}
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
                        {t("auth.password")}
                      </Label>
                      <Input
                        id="p2"
                        type="password"
                        required
                        minLength={PASSWORD_MIN_LENGTH}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        aria-describedby="p2-hint"
                        className="border-0 bg-slate-50 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-0 rounded-xl"
                      />
                      <p id="p2-hint" className="text-xs text-slate-400">
                        {passwordRequirementsHint(lang)}
                      </p>
                    </div>
                    <Button type="submit" className="w-full rounded-xl" disabled={loading}>
                      {t("auth.createAccount")}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>

              <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-100" /> {t("auth.or")}{" "}
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
                {t("auth.google")}
              </button>

              <div className="mt-5 rounded-2xl bg-orange-50 p-4 text-center">
                <p className="text-sm font-medium text-slate-700">{t("auth.demoTitle")}</p>
                <p className="mt-1 text-xs text-slate-500">{t("auth.demoText")}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={startDemo}
                  disabled={loading}
                  className="mt-3 w-full rounded-xl border-orange-200 bg-white text-orange-700 hover:bg-orange-100 hover:text-orange-800"
                >
                  {t("auth.demoButton")}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
