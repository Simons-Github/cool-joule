import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { BookOpen, LineChart, User2, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { APP_NAME } from "@/lib/app-config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/tagebuch", label: "Tagebuch", icon: BookOpen },
  { to: "/fortschritt", label: "Fortschritt", icon: LineChart },
  { to: "/profil", label: "Profil", icon: User2 },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-rose-100/60 bg-white/90 backdrop-blur shadow-sm shadow-rose-100/40">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          <Link to="/tagebuch" className="flex items-center gap-2">
            <img
              src="/mascot.png"
              alt="Cool Joule Logo"
              className="h-9 w-9 object-contain drop-shadow-sm"
            />
            <span className="text-lg font-bold tracking-tight text-slate-800">{APP_NAME}</span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition-all hover:bg-rose-50 hover:text-rose-600",
                  pathname === item.to &&
                    "bg-rose-100 text-rose-700 font-semibold shadow-sm shadow-rose-200/60",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              aria-label="Abmelden"
              className="rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-500"
            >
              <LogOut className="size-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 md:pb-12">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-rose-100/60 bg-white/95 backdrop-blur shadow-[0_-4px_20px_rgba(244,63,94,0.06)] md:hidden">
        <div className="mx-auto flex max-w-md">
          {NAV.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors",
                  active ? "text-rose-500" : "text-slate-400",
                )}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
