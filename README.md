# Cool Joule

Deutschsprachiges Ernährungstagebuch zum Tracken von Kalorien, Makros und Gewicht — inspiriert von MyFitnessPal, gebaut als Full-Stack-Portfolio-Projekt.

<p align="left">
  <a href="https://github.com/Simons-Github/cool-joule/actions/workflows/ci.yml">
    <img src="https://github.com/Simons-Github/cool-joule/actions/workflows/ci.yml/badge.svg" alt="CI Status" />
  </a>
  <img src="https://img.shields.io/badge/React-19-blue?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/Supabase-Auth%20%26%20DB-emerald?logo=supabase" alt="Supabase" />
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License" />
  </a>
</p>

🚀 **Live Demo:** [cool-joule.vercel.app](https://cool-joule.vercel.app) — eigener Account, keine öffentlichen Testdaten.  
📦 **Repository:** [github.com/Simons-Github/cool-joule](https://github.com/Simons-Github/cool-joule/)

---

## Inhalt

- [Screenshots](#screenshots)
- [Über das Projekt](#über-das-projekt)
- [Tech Stack](#tech-stack)
- [Architektur](#architektur)
- [Features im Detail](#features-im-detail)
- [Lokale Entwicklung](#lokale-entwicklung)
- [Datenbank](#datenbank)
- [CI](#ci)
- [Projektstruktur](#projektstruktur)
- [Deployment](#deployment)
- [Grenzen & Datenschutz](#grenzen--datenschutz)
- [Lizenz & Autor](#lizenz--autor)

---

## Screenshots

| Landing | Login |
| :-----: | :---: |
| <img src="./public/screenshots/heropage.png" alt="Landing page" width="640" /> | <img src="./public/screenshots/login.png" alt="Login" width="640" /> |
| Hero & Auth | E-Mail / Passwort & Google |

| Tagebuch | Lebensmittel hinzufügen |
| :------: | :---------------------: |
| <img src="./public/screenshots/tagebuch1.png" alt="Tagebuch" width="640" /> | <img src="./public/screenshots/tagebuch2.png" alt="Lebensmittel hinzufügen" width="640" /> |
| Kalorien, Makros & Mahlzeiten | Suche, Barcode & eigene Foods |

| Fortschritt | Profil |
| :---------: | :----: |
| <img src="./public/screenshots/fortschritt.png" alt="Fortschritt" width="640" /> | <img src="./public/screenshots/profil.png" alt="Profil" width="640" /> |
| Gewichtsverlauf & Stats | Ziele & Körperdaten |

---

## Über das Projekt

**Cool Joule** hilft dabei, Mahlzeiten zu erfassen, Tagesziele für Kalorien und Makros im Blick zu behalten, Sport-kcal zu tracken und den Gewichtsverlauf über Zeit zu verfolgen.

Beim ersten Login berechnet ein Onboarding-Wizard (Mifflin-St Jeor) individuelle Kalorien- und Makroziele. Lebensmittel lassen sich per Textsuche oder Barcode aus der **Open Food Facts**-Datenbank importieren, fotografieren (KI-Schätzung) oder als eigene Einträge anlegen.

### Highlights

- Authentifizierung via **Supabase** (E-Mail/Passwort + Google OAuth, Passwort-Reset)
- Tages-Tagebuch mit Datumsnavigation, Einträge bearbeiten und vom Vortag kopieren
- Lebensmittel-Suche, zuletzt verwendet, Barcode-Lookup (Server Functions) plus Kamera-Scan
- KI-Fotoanalyse (Gemini) — eigener API-Key im Profil; App-Key nur für Allowlist-Accounts (5/24h)
- Aktivität/Sport-Kalorien und Netto-kcal im Tagebuch (manuell, **Strava** oder Apple-Watch-Kurzbefehl)
- Gewichtstracking und Kalorienverlauf mit Recharts (7 / 30 / 90 Tage)
- Als PWA auf den Homescreen installierbar (ohne Offline-Sync)
- Mobile-first Layout
- Row Level Security — Nutzer sehen nur eigene Daten
- Datenexport und Konto löschen
- Unit-Tests (Vitest) und GitHub Actions CI (`lint`, `test`, `build`)

---

## Tech Stack

| Bereich | Technologie |
| ------- | ----------- |
| Frontend | React 19, TypeScript, TanStack Router/Start/Query |
| Styling | Tailwind CSS 4, shadcn/ui, Lucide |
| Charts | Recharts |
| Backend | Supabase (PostgreSQL, Auth, RLS) + TanStack Start Server Functions |
| KI | Google Gemini (User-Key oder Owner-App-Key / AI Gateway) |
| Externe APIs | Open Food Facts, Strava |
| Tooling | Vite, Vitest, ESLint, Prettier |
| CI | GitHub Actions (Node 22) |
| Hosting | Vercel |

---

## Architektur

```
Browser (React)
    ├── Supabase JS Client     →  Auth + PostgreSQL (RLS)
    └── Server Functions       →  Fotoanalyse, Quota, User-Gemini-Keys,
                                  OFF-Suche/Barcode, Konto löschen,
                                  Strava-OAuth/Sync, Webhook-Tokens
iOS Kurzbefehl
    └── POST /api/shortcuts/exercise  →  exercise_logs (source: shortcut)
Strava
    ├── OAuth  /strava/callback
    └── POST /api/strava/webhook      →  exercise_logs (source: strava)
```

TDEE-Berechnung und Tagebuch-CRUD laufen im Client gegen Supabase (RLS). Kostenpflichtige oder geheime Operationen (Gemini, Secret-Key, Open-Food-Facts-User-Agent, Strava-Tokens, Webhook-Tokens) laufen in Server Functions. JWT wird per `Authorization: Bearer` angehängt und serverseitig mit `auth.getUser` geprüft.

Der Kurzbefehl-Webhook ist eine öffentliche POST-Route mit persönlichem Token (kein Session-Cookie). Der Strava-Webhook ist öffentlich HTTPS, aber nur mit `STRAVA_WEBHOOK_VERIFY_TOKEN` / optionaler Subscription-ID gültig.

---

## Features im Detail

| Feature | Status |
| ------- | ------ |
| Login / Registrierung (E-Mail, Google) | ✅ |
| Passwort zurücksetzen | ✅ |
| Multi-Step-Onboarding mit TDEE & Makros | ✅ |
| Tagebuch (Frühstück, Mittag, Abend, Snacks) | ✅ |
| Open Food Facts Textsuche | ✅ |
| Barcode-Lookup + Kamera-Scan | ✅ |
| KI-Fotoanalyse | ✅ |
| Eigene Lebensmittel anlegen, bearbeiten und löschen | ✅ |
| Zuletzt verwendet + Vortag/Mahlzeit kopieren | ✅ |
| Einträge bearbeiten + Löschen rückgängig | ✅ |
| Schnellerfassen (kcal ohne Datenbank) | ✅ |
| Gewichtsverlauf & Chart | ✅ |
| Kalorienverlauf, Ziel-Tage und Streak | ✅ |
| Aktivität / Sport-Kalorien im Tagebuch | ✅ |
| Strava-Import (OAuth, Sync, Webhook) | ✅ |
| Apple-Kurzbefehl-Webhook (Watch-Workouts) | ✅ |
| PWA (Homescreen, ohne Offline-Sync) | ✅ |
| Profil & Ziele bearbeiten | ✅ |
| Datenexport / Konto löschen | ✅ |

---

## Lokale Entwicklung

**Voraussetzungen:** Node.js 22, npm, Supabase-Projekt

```sh
git clone https://github.com/Simons-Github/cool-joule.git
cd cool-joule
cp .env.example .env
npm install
npm run dev
```

`.env` aus [`.env.example`](.env.example) befüllen. Mindestens:

```env
VITE_SUPABASE_URL=https://<project-id>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Für Fotoanalyse, verschlüsselte Secrets (Gemini-Keys, Strava-Tokens, Kurzbefehl-Token) und Konto-Löschen zusätzlich (ohne `VITE_`-Prefix):

```env
SUPABASE_SECRET_KEY=<secret-key>
USER_SECRETS_ENCRYPTION_KEY=<32-byte-base64>
GEMINI_API_KEY=<optional>
AI_GATEWAY_API_KEY=<optional>
FOOD_PHOTO_USE_AI_GATEWAY=   # nur "true", wenn OIDC-Gateway bewusst genutzt wird
FOOD_PHOTO_APP_KEY_USER_IDS=<deine-user-uuid>
FOOD_PHOTO_APP_KEY_EMAILS=<deine-login-email>
```

Key erzeugen: `openssl rand -base64 32`. Derselbe Key muss in Preview und Production identisch bleiben, sonst lassen sich gespeicherte Tokens nicht mehr lesen.

`process.env.VERCEL` allein gilt **nicht** als Gateway-Auth. Ohne Eintrag in der Allowlist brauchen Nutzer einen eigenen Gemini-Key im Profil. Leere Allowlists sind fail-closed (niemand bekommt den App-Key). Allowlist-Accounts ohne eigenen Key haben 5 Analysen / 24 Stunden.

### Supabase einrichten

1. Migrationen anwenden (`supabase/migrations/`) oder per Supabase CLI deployen
2. **Authentication → Providers → Google** aktivieren (optional)
3. **Authentication → Providers → Email:** [Leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) einschalten
4. **URL Configuration:** Redirect-URLs setzen (Login, OAuth, Passwort-Recovery, Strava):
   - `http://localhost:5173/auth`
   - `http://localhost:5173/strava/callback`
   - `https://<production-domain>/auth`
   - `https://<production-domain>/strava/callback`

### Strava

Workouts aus Strava ins Tagebuch übernehmen (Badge **Strava**). Apple Watch: in der Strava-App unter Einstellungen die Synchronisierung mit Apple Health einschalten — dann laufen Watch-Workouts über Strava, ohne Kurzbefehl.

**Voraussetzung:** `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `SUPABASE_SECRET_KEY`, `USER_SECRETS_ENCRYPTION_KEY`. Tokens liegen verschlüsselt in `strava_connections` (nur `service_role`).

Zwei Strava-Apps empfohlen (localhost vs. Production): Strava erlaubt nur **eine** Authorization Callback Domain pro App.

1. [Strava-API-Anwendung](https://www.strava.com/settings/api) anlegen
2. Authorization Callback Domain: `localhost` lokal bzw. die Production-Domain
3. Redirect: `http://localhost:5173/strava/callback` bzw. `https://<domain>/strava/callback`
4. In `.env` (siehe [`.env.example`](.env.example)):

```env
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REDIRECT_URI=http://localhost:5173/strava/callback
```

Ohne `STRAVA_REDIRECT_URI` fällt der Server auf `http://localhost:5173/strava/callback` bzw. die Vercel-Production-URL zurück.

5. In der App: **Profil → Connect with Strava** (Scope `read,activity:read_all`)

Beim Verbinden: Import der letzten 14 Tage. Danach Auto-Sync beim Öffnen des Tagebuchs (wenn der letzte Sync älter als 15 Minuten ist) oder manuell im Profil. Im Tagebuch gelöschte Strava-Einträge werden nicht erneut importiert.

**Optionaler Webhook** (nur Production, öffentliche HTTPS-URL — localhost reicht Strava nicht):

- Callback: `https://<domain>/api/strava/webhook`
- `STRAVA_WEBHOOK_VERIFY_TOKEN` — dieselbe Zeichenkette wie beim Anlegen der Push-Subscription
- Optional `STRAVA_WEBHOOK_SUBSCRIPTION_ID` — fremde POSTs ignorieren

Ohne Webhook reicht der Sync über Tagebuch und Profil.

### Apple Watch per Kurzbefehl

Apple Health lässt sich von einer Website nicht auslesen. Wer **kein** Strava-Konto nutzen will, importiert Watch-Workouts über einen **persönlichen Webhook** und die iOS-App Kurzbefehle.

**Voraussetzung:** `SUPABASE_SECRET_KEY` und `USER_SECRETS_ENCRYPTION_KEY` (Token wird gehasht und verschlüsselt in `shortcut_tokens` gespeichert, nur `service_role`).

1. In der App anmelden → **Profil** → **Token erzeugen** → **URL kopieren**  
   Die URL gilt für den Host, auf dem du sie erzeugt hast (`localhost` lokal, Production z. B. `https://cool-joule.vercel.app`).
2. iPhone: **Kurzbefehle** → **Automation** → **Wenn Training endet** (Apple Watch)
3. Aktion **Inhalte von URL abrufen**: Methode **POST**, kopierte URL einfügen
4. Anforderungskörper **JSON**. Kalorien z. B. aus der Health-Probe „Aktiver Energieumsatz“

Beispiel-Body:

```json
{
  "name": "Laufen",
  "calories": 380,
  "date": "2026-08-25"
}
```

| Feld | Pflicht | Hinweise |
| ---- | ------- | -------- |
| `name` / `titel` / `activity` | nein | sonst „Training“ |
| `calories` / `kcal` / `kalorien` | ja | Zahl oder String wie `"380 kcal"` |
| `date` / `datum` | nein | `YYYY-MM-DD`, sonst heutiges Datum |
| `id` / `uuid` | nein | gleiche ID = Update statt Duplikat (z. B. Workout-UUID) |

Token alternativ per Header: `Authorization: Bearer <token>` oder `X-Shortcut-Token`.

Lokal testen (Token aus dem Profil):

```sh
curl -X POST "http://localhost:5173/api/shortcuts/exercise?token=<TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Laufen","calories":380}'
```

Im Tagebuch erscheinen die Einträge mit Badge **Watch**. **Token neu erzeugen** macht die alte URL ungültig. Wer die URL kennt, kann Aktivitäten in dein Konto schreiben — die URL geheim halten.

### Scripts

| Befehl | Beschreibung |
| ------- | ----------- |
| `npm run dev` | Dev-Server starten |
| `npm test` | Vitest Unit-Tests |
| `npm run test:watch` | Vitest im Watch-Modus |
| `npm run lint` | ESLint inkl. Prettier-Check |
| `npm run format` | Prettier schreibt Dateien um |
| `npm run build` | Production-Build |
| `npm run preview` | Production-Build lokal ausliefern |

### Troubleshooting

| Symptom | Typische Ursache |
| ------- | ---------------- |
| Google-Login bricht ab | Redirect-URL `/auth` fehlt in Supabase |
| Strava-Connect landet nicht zurück | Callback-Domain passt nicht zur App (localhost vs. Production) oder `/strava/callback` fehlt |
| „Strava ist nicht konfiguriert“ | `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` fehlen auf diesem Host |
| Fotoanalyse / Tokens / Kurzbefehl schlagen fehl | `SUPABASE_SECRET_KEY` oder `USER_SECRETS_ENCRYPTION_KEY` fehlt bzw. weicht zwischen Preview und Production ab |
| Kurzbefehl 401 | Token neu erzeugt, alte URL noch im Kurzbefehl |

---

## Datenbank

| Tabelle | Zweck |
| ------- | ----- |
| `profiles` | Körperdaten, Ziele, Makros, Onboarding-Status |
| `food_logs` | Tägliche Mahlzeit-Einträge |
| `exercise_logs` | Sport/Aktivitäten mit kcal pro Tag (`source`: `manual` / `shortcut` / `strava`) |
| `shortcut_tokens` | Gehashte Apple-Kurzbefehl-Webhook-Tokens (nur service_role) |
| `strava_connections` | Verschlüsselte Strava-OAuth-Tokens (nur service_role) |
| `weight_logs` | Gewicht pro Tag |
| `custom_foods` | Nutzerdefinierte Lebensmittel |
| `user_gemini_keys` | Verschlüsselte User-Gemini-Keys (nur service_role) |
| `food_photo_server_usage` | 5/24h-Quota für den App-Key (Allowlist, nur service_role) |
| `server_rate_limits` | Rate-Limits für Server Functions (nur service_role) |

Nutzerdaten-Tabellen haben **Row Level Security** (`auth.uid()` = eigener Datensatz). Key-/Quota-/Rate-Limit-Tabellen sind dem Client entzogen.

---

## CI

Bei Push und Pull Request auf `main` läuft [GitHub Actions](.github/workflows/ci.yml) unter Node 22:

`lint` → `test` → `build`

---

## Projektstruktur

```
src/
├── routes/           # Seiten, /strava/callback, /api/shortcuts/exercise, /api/strava/webhook
├── components/       # UI & Feature-Komponenten
├── lib/              # nutrition, OFF, Fotoanalyse, Strava, Kurzbefehl, Auth-Helfer
├── integrations/     # Supabase Client, Admin-Client & Types
└── hooks/            # Profile, Barcode-Scanner, …
supabase/migrations/  # SQL-Schema + RLS
```

---

## Deployment

Die App wird über Vercel unter [cool-joule.vercel.app](https://cool-joule.vercel.app) gehostet.

### Production-Checkliste

- [ ] Dieselben `VITE_SUPABASE_*`-Werte wie im Supabase-Projekt
- [ ] `SUPABASE_SECRET_KEY` und `USER_SECRETS_ENCRYPTION_KEY` in Vercel (Production **und** Preview; letzteres für Gemini-, Strava- und Kurzbefehl-Tokens)
- [ ] `GEMINI_API_KEY` und/oder `AI_GATEWAY_API_KEY` (oder `FOOD_PHOTO_USE_AI_GATEWAY=true` bei bewusst aktiviertem OIDC-Gateway)
- [ ] `FOOD_PHOTO_APP_KEY_USER_IDS` / `FOOD_PHOTO_APP_KEY_EMAILS` auf die Allowlist-Accounts
- [ ] `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI` (Production-Callback)
- [ ] Optional: `STRAVA_WEBHOOK_VERIFY_TOKEN` und `STRAVA_WEBHOOK_SUBSCRIPTION_ID`
- [ ] Auth-Redirects inkl. `/auth` (Recovery) und `/strava/callback`
- [ ] Leaked-Password-Protection im Supabase-Dashboard
- [ ] Migrationen auf dem Cool-Joule-Projekt angewendet (inkl. `strava_connections` und `shortcut_tokens`)

---

## Grenzen & Datenschutz

- PWA ist installierbar, synchronisiert aber **nicht** offline.
- KI-Fotoanalyse braucht einen eigenen Gemini-Key im Profil oder einen Allowlist-Account.
- Apple Health ist von der Website nicht lesbar — Import nur über Strava oder den Kurzbefehl-Webhook.
- Strava-API setzt ein eigenes Developer-Konto voraus; der Kurzbefehl kommt ohne Strava aus.
- Mahlzeiten, Gewicht und Trainingsdaten liegen in deinem Supabase-Projekt. Im Profil gibt es **Datenexport** und **Konto löschen**.

Issues und PRs sind willkommen. Bitte keine Secrets, Tokens oder `.env`-Dateien committen.

---

## Lizenz & Autor

MIT © 2026 **[Simon Berger](https://github.com/Simons-Github)** — portfolio project.
