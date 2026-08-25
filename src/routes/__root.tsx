import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { APP_NAME } from "@/lib/app-config";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-rose-50 px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-slate-800">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-slate-800">Seite nicht gefunden</h2>
        <p className="mt-2 text-sm text-slate-500">
          Die angeforderte Seite existiert nicht oder wurde verschoben.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-2xl bg-rose-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-rose-300/40 transition-colors hover:bg-rose-600"
          >
            Zur Startseite
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-rose-50 px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-slate-800">
          Seite konnte nicht geladen werden
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Etwas ist schiefgelaufen. Bitte lade die Seite neu oder kehre zur Startseite zurück.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-2xl bg-rose-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-rose-300/40 transition-colors hover:bg-rose-600"
          >
            Erneut versuchen
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-rose-50"
          >
            Zur Startseite
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${APP_NAME} — Kalorien & Makros tracken` },
      {
        name: "description",
        content: "Ernährungstagebuch für Kalorien, Makros und Gewicht — auf Deutsch.",
      },
      { name: "author", content: APP_NAME },
      { property: "og:title", content: `${APP_NAME} — Kalorien & Makros tracken` },
      {
        property: "og:description",
        content: "Ernährungstagebuch für Kalorien, Makros und Gewicht — auf Deutsch.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#f43f5e" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="de" className="light">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  // Matches AppShell: top nav from md (768px), bottom nav below that
  const isDesktop = !useIsMobile();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position={isDesktop ? "bottom-center" : "top-right"} duration={2000} richColors />
    </QueryClientProvider>
  );
}
