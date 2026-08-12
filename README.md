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

🚀 **Live Demo:** [cool-joule.vercel.app](https://cool-joule.vercel.app)  
📦 **Repository:** [github.com/Simons-Github/cool-joule](https://github.com/Simons-Github/cool-joule/)

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

**Cool Joule** hilft dabei, Mahlzeiten zu erfassen, Tagesziele für Kalorien und Makros im Blick zu behalten und den Gewichtsverlauf über Zeit zu verfolgen.

Beim ersten Login berechnet ein Onboarding-Wizard (Mifflin-St Jeor) individuelle Kalorien- und Makroziele. Lebensmittel lassen sich per Textsuche oder Barcode aus der **Open Food Facts**-Datenbank importieren — oder als eigene Einträge anlegen.

### Highlights

- Authentifizierung via **Supabase** (E-Mail/Passwort + Google OAuth)
- Tages-Tagebuch mit Datumsnavigation und Makro-Übersicht
- Lebensmittel-Suche, **Barcode-Lookup** und Kamera-Scan (BarcodeDetector)
- Gewichtstracking mit Recharts-Diagramm (7 / 30 / 90 Tage)
- Dark/Light Mode, mobile-first Layout
- Row Level Security — Nutzer sehen nur eigene Daten
- Unit-Tests für die Open-Food-Facts-Integration
- GitHub Actions CI (`lint`, `test`, `build`)

---

## Tech Stack

| Bereich | Technologie |
| ------- | ----------- |
| Frontend | React 19, TypeScript, TanStack Router/Start/Query |
| Styling | Tailwind CSS 4, shadcn/ui, Lucide |
| Charts | Recharts |
| Backend | Supabase (PostgreSQL, Auth, RLS) |
| Externe API | Open Food Facts |
| Tooling | Vite, Vitest, ESLint, Prettier |
| CI | GitHub Actions |

---

## Architektur

```
Browser (React)
    ├── Supabase JS Client  →  Auth + PostgreSQL (RLS)
    └── open-food-facts.ts  →  Open Food Facts API
```

Es gibt **kein eigenes REST-Backend**: Business-Logik (z. B. TDEE-Berechnung) läuft im Frontend, Persistenz und Zugriffskontrolle in Supabase. Die Open-Food-Facts-Anbindung ist in ein testbares Modul ausgelagert (`src/lib/open-food-facts.ts`).

---

## Features im Detail

| Feature | Status |
| ------- | ------ |
| Login / Registrierung (E-Mail, Google) | ✅ |
| Multi-Step-Onboarding mit TDEE & Makros | ✅ |
| Tagebuch (Frühstück, Mittag, Abend, Snacks) | ✅ |
| Open Food Facts Textsuche | ✅ |
| Barcode-Lookup + Kamera-Scan | ✅ |
| Eigene Lebensmittel anlegen | ✅ |
| Gewichtsverlauf & Chart | ✅ |
| Profil & Ziele bearbeiten | ✅ |
| Exercise-Kalorien im Tagebuch | ⏳ Geplant |

---

## Lokale Entwicklung

**Voraussetzungen:** Node.js 20+, npm, Supabase-Projekt

```sh
git clone https://github.com/Simons-Github/cool-joule.git
cd cool-joule
cp .env.example .env
npm install
npm run dev
```

`.env` befüllen:

```env
VITE_SUPABASE_URL=https://<project-id>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

### Supabase einrichten

1. Migrationen anwenden (`supabase/migrations/`) oder per Supabase CLI deployen
2. **Authentication → Providers → Google** aktivieren (optional)
3. **URL Configuration:** Redirect-URLs setzen:
   - `http://localhost:5173/auth`
   - `https://<production-domain>/auth`

### Scripts

| Befehl | Beschreibung |
| ------ | ------------ |
| `npm run dev` | Dev-Server starten |
| `npm test` | Vitest Unit-Tests |
| `npm run lint` | ESLint + Prettier |
| `npm run build` | Production-Build |

---

## Datenbank

| Tabelle | Zweck |
| ------- | ----- |
| `profiles` | Körperdaten, Ziele, Makros, Onboarding-Status |
| `food_logs` | Tägliche Mahlzeit-Einträge |
| `weight_logs` | Gewicht pro Tag |
| `custom_foods` | Nutzerdefinierte Lebensmittel |

Alle Tabellen haben **Row Level Security** (`auth.uid()` = eigener Datensatz).

---

## CI

Bei Push und Pull Request auf `main` läuft [GitHub Actions](.github/workflows/ci.yml):

`lint` → `test` → `build`

---

## Projektstruktur

```
src/
├── routes/           # TanStack Router (Seiten)
├── components/       # UI & Feature-Komponenten
├── lib/              # nutrition.ts, open-food-facts.ts, app-config.ts
├── integrations/     # Supabase Client & Types
└── hooks/            # Theme, Barcode-Scanner, …
supabase/migrations/  # SQL-Schema + RLS
```

---

## Deployment

Die App wird automatisiert über Vercel deployt und unter [cool-joule.vercel.app](https://cool-joule.vercel.app) gehostet.

---

## Lizenz & Autor

MIT © 2026 **[Simon Berger](https://github.com/Simons-Github)** — portfolio project.
