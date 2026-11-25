import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { serializeLangCookie, type Lang } from "./index";
import { I18nContext, buildValue } from "./react";

/**
 * `lang` comes from the root route context (cookie read on the server for SSR),
 * so server and first client render always agree.
 */
export function I18nProvider({
  lang: initialLang,
  onChange,
  children,
}: {
  lang: Lang;
  /** Called after the cookie is written, e.g. to re-run head()/beforeLoad. */
  onChange?: (lang: Lang) => void;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    setLangState(initialLang);
  }, [initialLang]);

  const setLang = useCallback(
    (next: Lang) => {
      try {
        document.cookie = serializeLangCookie(next);
      } catch {
        // cookies blocked: still switch for this page view
      }
      document.documentElement.lang = next;
      setLangState(next);
      onChange?.(next);
    },
    [onChange],
  );

  const value = useMemo(() => buildValue(lang, setLang), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
