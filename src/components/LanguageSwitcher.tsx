import { LANGS, type Lang } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/react";
import { cn } from "@/lib/utils";

/** Two-option language toggle. `card` is the profile-page card, `compact` the small header variant. */
export function LanguageSwitcher({ variant = "compact" }: { variant?: "card" | "compact" }) {
  const { lang, setLang, t } = useI18n();

  const group = (
    <div
      role="group"
      aria-label={t("lang.switchAria")}
      className={cn(
        "inline-flex rounded-full bg-slate-100 p-0.5",
        variant === "compact" && "bg-white/80 shadow-sm",
      )}
    >
      {LANGS.map((code: Lang) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={lang === code}
          onClick={() => setLang(code)}
          className={cn(
            "rounded-full px-3 py-1 text-sm font-medium transition-colors",
            variant === "compact" && "px-2.5 text-xs",
            lang === code
              ? "bg-rose-500 text-white shadow-sm"
              : "text-slate-500 hover:text-rose-600",
          )}
        >
          {variant === "compact" ? code.toUpperCase() : t(`lang.${code}`)}
        </button>
      ))}
    </div>
  );

  if (variant === "compact") return group;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white p-5 shadow-lg shadow-rose-50">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">{t("lang.cardTitle")}</h2>
        <p className="mt-1 text-sm text-slate-400">{t("lang.cardHint")}</p>
      </div>
      {group}
    </div>
  );
}
