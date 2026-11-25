import { translate, type Lang } from "./i18n";

/** Static fallback page for catastrophic SSR errors; German unless the language cookie says otherwise. */
export function renderErrorPage(lang: Lang = "de"): string {
  const title = translate(lang, "root.error.title");
  const text = translate(lang, "root.error.text");
  const retry = translate(lang, "common.retry");
  const home = translate(lang, "root.toHome");
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/favicon.png" type="image/png" />
    <link rel="apple-touch-icon" href="/favicon.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#f43f5e" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #059669; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${title}</h1>
      <p>${text}</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">${retry}</button>
        <a class="secondary" href="/">${home}</a>
      </div>
    </div>
  </body>
</html>`;
}
