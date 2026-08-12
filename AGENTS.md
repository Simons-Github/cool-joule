# Agent notes

- App name: **Cool Joule** (`src/lib/app-config.ts`)
- Auth: native Supabase (email/password + Google OAuth)
- Data: direct Supabase client calls with RLS; no custom REST API
- Tests: `npm test` (Vitest)

When changing the app name or slugs, update `src/lib/app-config.ts` only.
