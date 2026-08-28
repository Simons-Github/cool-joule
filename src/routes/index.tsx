import { useEffect } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { APP_NAME } from "@/lib/app-config";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // Session lives in localStorage — skip on the server to keep the landing page SSR'd.
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/tagebuch" });
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} — Kalorien & Makros einfach tracken` },
      {
        name: "description",
        content: `${APP_NAME} ist dein Ernährungstagebuch: Kalorien zählen, Makros im Blick behalten und Gewicht verfolgen — kostenlos und auf Deutsch.`,
      },
      { property: "og:title", content: `${APP_NAME} — Kalorien & Makros einfach tracken` },
      {
        property: "og:description",
        content: "Ernährungstagebuch mit Kalorienziel, Makro-Tracking und Gewichtsverlauf.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session || (event !== "SIGNED_IN" && event !== "INITIAL_SESSION")) return;
      // Defer: calling other supabase-js methods inside onAuthStateChange deadlocks the client.
      setTimeout(() => {
        void navigate({ to: "/tagebuch", replace: true });
      }, 0);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* Background blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-rose-200/40 blur-3xl" />
        <div className="absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-orange-200/40 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-rose-100/30 blur-3xl" />
      </div>

      {/* Header — volle Breite, Padding skaliert mit dem Viewport statt fixem max-w */}
      <header className="flex w-full items-center justify-between px-6 py-6 md:px-12 lg:px-20 xl:px-28">
        <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
          <img
            src="/mascot.png"
            alt="Cool Joule Logo"
            className="h-9 w-9 object-contain drop-shadow-sm"
          />
          <span className="text-base font-bold tracking-tight text-slate-800">{APP_NAME}</span>
        </Link>

        <Link
          to="/auth"
          className="rounded-full bg-white px-6 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-rose-50 hover:shadow-md"
        >
          Anmelden
        </Link>
      </header>

      {/* Hero */}
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center px-6 pb-14 pt-4">
        {/* Orbit zone — mascot + badges in one relative container */}
        <div className="relative mx-auto flex w-full max-w-sm items-center justify-center py-10">
          {/* Badge — Tagebuch (oben links) */}
          <div className="animate-float absolute left-2 top-2 z-0 flex cursor-default flex-col items-center justify-center gap-1.5 rounded-[1.5rem] border border-rose-100 bg-rose-50/90 p-4 shadow-xl shadow-slate-200/50 backdrop-blur-sm transition-transform duration-200 hover:scale-105 -rotate-[12deg] scale-90 md:left-0 md:top-4 md:scale-100">
            <img src="/icon-apple.png" alt="" className="h-10 w-10 object-contain drop-shadow-sm" />
            <span className="mt-0.5 text-[10px] font-semibold text-slate-600">Tagebuch</span>
          </div>

          {/* Badge — Ziele (oben rechts) */}
          <div className="animate-float-delayed absolute right-2 top-8 z-0 flex cursor-default flex-col items-center justify-center gap-1.5 rounded-[1.5rem] border border-emerald-100 bg-emerald-50/90 p-4 shadow-xl shadow-slate-200/50 backdrop-blur-sm transition-transform duration-200 hover:scale-105 rotate-[8deg] scale-75 md:right-0 md:top-10 md:scale-90">
            <img
              src="/icon-target.png"
              alt=""
              className="h-10 w-10 object-contain drop-shadow-sm"
            />
            <span className="mt-0.5 text-[10px] font-semibold text-slate-600">Ziele</span>
          </div>

          {/* Badge — Fortschritt (unten links) */}
          <div className="animate-float-slow absolute bottom-8 left-4 z-0 flex cursor-default flex-col items-center justify-center gap-1.5 rounded-[1.5rem] border border-orange-100 bg-orange-50/90 p-4 shadow-xl shadow-slate-200/50 backdrop-blur-sm transition-transform duration-200 hover:scale-105 -rotate-[6deg] scale-100 md:bottom-10 md:left-2">
            <img src="/icon-chart.png" alt="" className="h-10 w-10 object-contain drop-shadow-sm" />
            <span className="mt-0.5 text-[10px] font-semibold text-slate-600">Fortschritt</span>
          </div>

          {/* Mascot + soft contact shadow (grounds the strutting pose) */}
          <div className="relative z-10 flex flex-col items-center">
            <img
              src="/mascot.png"
              alt="Cool Joule Maskottchen"
              className="h-64 w-64 object-contain drop-shadow-md transition-transform duration-300 hover:scale-105 sm:h-72 sm:w-72"
            />
            {/* Flattened ellipse under the sneakers — denser core, soft falloff */}
            <div
              aria-hidden
              className="pointer-events-none -mt-5 h-6 w-36 sm:-mt-6 sm:h-7 sm:w-40"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(15, 23, 42, 0.16) 0%, rgba(15, 23, 42, 0.07) 42%, transparent 72%)",
              }}
            />
          </div>
        </div>

        {/* Headline */}
        <div className="mt-10 text-center">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-5xl">
            Kalorien tracken.
            <br />
            Ganz einfach.
          </h1>
          <p className="mx-auto mt-4 max-w-xs text-base text-slate-600 md:text-lg">
            Behalte deine Ernährung und Makros im Blick.
          </p>
        </div>

        {/* CTA */}
        <Link
          to="/auth"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-gradient-to-b from-rose-500 to-rose-600 px-8 py-3.5 text-base font-semibold tracking-wide text-white shadow-lg shadow-rose-500/30 ring-1 ring-inset ring-white/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-rose-500/40 active:translate-y-0 active:scale-[0.98]"
        >
          Kostenlos starten
        </Link>
      </main>
    </div>
  );
}
