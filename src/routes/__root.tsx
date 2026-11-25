import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { APP_NAME } from "@/lib/app-config";
import { translate, type Lang } from "@/lib/i18n";
import { resolveLang } from "@/lib/i18n/lang";
import { I18nProvider } from "@/lib/i18n/provider";
import { useT } from "@/lib/i18n/react";

function NotFoundComponent() {
  const t = useT();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-rose-50 px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-slate-800">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-slate-800">{t("root.notFound.title")}</h2>
        <p className="mt-2 text-sm text-slate-500">{t("root.notFound.text")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-2xl bg-rose-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-rose-300/40 transition-colors hover:bg-rose-600"
          >
            {t("root.toHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const t = useT();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-rose-50 px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-slate-800">
          {t("root.error.title")}
        </h1>
        <p className="mt-2 text-sm text-slate-500">{t("root.error.text")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-2xl bg-rose-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-rose-300/40 transition-colors hover:bg-rose-600"
          >
            {t("common.retry")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-rose-50"
          >
            {t("root.toHome")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Language comes from the `lang` cookie (read on the server for SSR), default German.
  beforeLoad: async (): Promise<{ lang: Lang }> => ({ lang: await resolveLang() }),
  head: ({ match }) => {
    const lang = match.context.lang;
    const title = translate(lang, "root.title", { app: APP_NAME });
    const description = translate(lang, "root.description");
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title },
        { name: "description", content: description },
        { name: "author", content: APP_NAME },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
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
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const lang = useRouterState({
    select: (state) => state.matches[0]?.context.lang,
  });
  const router = useRouter();
  const current: Lang = lang ?? "de";
  return (
    <html lang={current} className="light">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* Re-run beforeLoad/head() after a language change so titles and <html lang> follow. */}
        <I18nProvider lang={current} onChange={() => void router.invalidate()}>
          {children}
        </I18nProvider>
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
    // iOS kann localStorage unter Speicherdruck räumen (=> Login weg). Dauerhaften Speicher anfragen.
    void navigator.storage?.persist?.().catch(() => {});
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      // Defer: invalidate re-runs getUser() in authenticated routes and would deadlock supabase-js.
      setTimeout(() => {
        void router.invalidate();
        if (event !== "SIGNED_OUT") void queryClient.invalidateQueries();
      }, 0);
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
