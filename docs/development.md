# Development

The app UI is in German. This page covers everything beyond the quick start in the README.

## Prerequisites

- Node.js 22 and npm (CI uses `npm ci` on Node 22)
- A Supabase project

## Environment variables

Copy `.env.example` to `.env`. Variables without the `VITE_` prefix are server-only.

| Variable                         | Required                        | Purpose                                                                                                   |
| -------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`              | yes                             | Supabase project URL                                                                                      |
| `VITE_SUPABASE_PUBLISHABLE_KEY`  | yes                             | Supabase publishable key (browser)                                                                        |
| `SUPABASE_SECRET_KEY`            | for secrets, photo AI, delete   | Server-side Supabase access (Settings > API)                                                              |
| `USER_SECRETS_ENCRYPTION_KEY`    | for secrets                     | 32-byte key, Base64 (`openssl rand -base64 32`). Encrypts Gemini keys, Strava tokens and shortcut tokens  |
| `STRAVA_CLIENT_ID`               | for Strava                      | Strava API application                                                                                    |
| `STRAVA_CLIENT_SECRET`           | for Strava                      | Strava API application                                                                                    |
| `STRAVA_REDIRECT_URI`            | optional                        | OAuth redirect. Falls back to `http://localhost:5173/strava/callback` or the Vercel production URL       |
| `STRAVA_WEBHOOK_VERIFY_TOKEN`    | for Strava webhook              | Same string as used when creating the push subscription                                                   |
| `STRAVA_WEBHOOK_SUBSCRIPTION_ID` | for Strava webhook              | Required for event POSTs. Without it (or on mismatch) the app answers 403                                 |
| `GEMINI_API_KEY`                 | optional                        | App-level Gemini key for photo analysis                                                                   |
| `AI_GATEWAY_API_KEY`             | optional                        | Vercel AI Gateway key, as an alternative app-level key                                                    |
| `FOOD_PHOTO_USE_AI_GATEWAY`      | optional                        | Set to `true` only when the OIDC gateway is intended. `VERCEL` alone does not count as gateway auth      |
| `FOOD_PHOTO_APP_KEY_USER_IDS`    | optional                        | Comma-separated user UUIDs allowed to use the app-level key                                               |
| `FOOD_PHOTO_APP_KEY_EMAILS`      | optional                        | Comma-separated emails allowed to use the app-level key (case-insensitive)                                |

Keep `USER_SECRETS_ENCRYPTION_KEY` identical across Preview and Production. Otherwise stored tokens can no longer be decrypted.

A Gemini key saved in the profile takes precedence over the app-level key. Users on the allowlist who have no key of their own get 5 analyses per 24 hours. Empty allowlists mean nobody gets the app-level key.

## Scripts

| Command              | Description                  |
| -------------------- | ---------------------------- |
| `npm run dev`        | Start the dev server         |
| `npm test`           | Vitest unit tests            |
| `npm run test:watch` | Vitest in watch mode         |
| `npm run lint`       | ESLint (includes Prettier)   |
| `npm run format`     | Rewrite files with Prettier  |
| `npm run build`      | Production build             |
| `npm run build:dev`  | Build in development mode    |
| `npm run preview`    | Serve the production build   |

## Supabase setup

1. Apply the migrations in `supabase/migrations/` (for example with the Supabase CLI).
2. Optional: enable **Authentication > Providers > Google**.
3. **Authentication > Providers > Email:** turn on [leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
4. **URL Configuration:** add redirect URLs for login, OAuth, password recovery and Strava:
   - `http://localhost:5173/auth`
   - `http://localhost:5173/strava/callback`
   - `https://<production-domain>/auth`
   - `https://<production-domain>/strava/callback`
5. **Demo mode** (the "Demo ausprobieren" button): turn on **Authentication > Sign In / Providers > Allow anonymous sign-ins**. Supabase rate-limits anonymous sign-ins per IP (**Authentication > Rate Limits**, default 30 per hour). Without this setting the button shows "Der Demo-Modus ist gerade nicht verfügbar".
6. **Demo cleanup:** enable the `pg_cron` extension (**Database > Extensions**) and schedule the deletion of old anonymous users in the SQL editor. All user tables cascade from `auth.users`, so this removes their sample data too:

   ```sql
   select cron.schedule(
     'delete-stale-demo-users',
     '17 3 * * *',
     $$delete from auth.users where is_anonymous and created_at < now() - interval '7 days'$$
   );
   ```

## Database tables

| Table                     | Purpose                                                                          |
| ------------------------- | -------------------------------------------------------------------------------- |
| `profiles`                | Body data, goals, macros, onboarding status                                      |
| `food_logs`               | Daily meal entries                                                               |
| `exercise_logs`           | Activities with kcal per day (`source`: `manual`, `shortcut` or `strava`)        |
| `weight_logs`             | Weight per day                                                                   |
| `custom_foods`            | User-defined foods                                                               |
| `shortcut_tokens`         | Hashed iOS Shortcut webhook tokens (service role only)                           |
| `strava_connections`      | Encrypted Strava OAuth tokens (service role only)                                |
| `user_gemini_keys`        | Encrypted user Gemini keys (service role only)                                   |
| `food_photo_server_usage` | 5 per 24 h quota for the app-level key (service role only)                       |
| `server_rate_limits`      | Rate limits for server functions (service role only)                             |

User-data tables use Row Level Security (`auth.uid()` must match the row owner). The key, quota and rate-limit tables are not accessible from the client.

## Strava

Imports Strava workouts into the diary (badge **Strava**). For an Apple Watch, enable the Apple Health sync in the Strava app settings. Watch workouts then arrive through Strava and the iOS Shortcut is not needed.

Requires `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `SUPABASE_SECRET_KEY` and `USER_SECRETS_ENCRYPTION_KEY`. Tokens are stored encrypted in `strava_connections`.

Strava allows one Authorization Callback Domain per app, so use two Strava apps: one for localhost, one for production.

1. Create an application at [strava.com/settings/api](https://www.strava.com/settings/api).
2. Set the Authorization Callback Domain to `localhost` or to the production domain.
3. Redirect: `http://localhost:5173/strava/callback` or `https://<domain>/strava/callback`.
4. Fill in `.env`:

   ```env
   STRAVA_CLIENT_ID=
   STRAVA_CLIENT_SECRET=
   STRAVA_REDIRECT_URI=http://localhost:5173/strava/callback
   ```

5. In the app: **Profil > Connect with Strava** (scope `read,activity:read_all`).

On connect, the last 14 days are imported. After that the diary syncs when opened (if the last sync is older than 15 minutes), or manually from the profile. Strava entries deleted in the diary are not imported again.

**Optional webhook** (production only; Strava needs a public HTTPS URL):

- Callback URL: `https://<domain>/api/strava/webhook`
- `STRAVA_WEBHOOK_VERIFY_TOKEN`: the same string used when creating the push subscription.
- `STRAVA_WEBHOOK_SUBSCRIPTION_ID`: required. Event POSTs without it, or with a different ID, get 403. Disconnect and delete events are only applied after a check with Strava. Requests are rate-limited per IP and per user.

Without the webhook, syncing from the diary and profile is enough.

## Apple Watch via iOS Shortcut

A website cannot read Apple Health. Without Strava, watch workouts can be imported through a personal webhook and a prepared iOS Shortcut (`public/shortcuts/cool-joule-workout.shortcut`).

Requires `SUPABASE_SECRET_KEY` and `USER_SECRETS_ENCRYPTION_KEY`. The token is hashed and stored encrypted in `shortcut_tokens`.

1. Sign in, open **Profil**, click **Token erzeugen**, then **URL kopieren**. The URL is valid for the host you generated it on (`localhost`, or the production domain).
2. Install the Shortcut (the iPhone opens the Shortcuts app) and paste the webhook URL when asked.
3. Run the Shortcut once by hand so iOS asks for Health access.
4. In **Shortcuts > Automation**, add "When workout ends", run the Cool Joule Shortcut, and turn **Ask Before Running** off.

The Shortcut reads today's last workout (name, kcal, date, UUID) and POSTs it to the webhook. The same workout UUID updates the entry instead of creating a duplicate.

The token can also be sent as `Authorization: Bearer <token>` or `X-Shortcut-Token`.

Local test (token from the profile):

```sh
curl -X POST "http://localhost:5173/api/shortcuts/exercise?token=<TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Laufen","calories":380}'
```

Entries show up in the diary with the badge **Watch**. Regenerating the token invalidates the old URL, so update the text action in the Shortcut. Anyone who knows the URL can write activities into the account, so keep it private.

After changing `shortcuts/cool-joule-workout.plist`, re-sign the file on a Mac with `scripts/sign-apple-shortcut.sh`.

## Troubleshooting

| Symptom                                           | Likely cause                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Google login fails                                | The `/auth` redirect URL is missing in Supabase                                                         |
| Strava connect does not return to the app         | Callback domain does not match the Strava app (localhost vs. production), or `/strava/callback` missing |
| "Strava ist nicht konfiguriert"                   | `STRAVA_CLIENT_ID` or `STRAVA_CLIENT_SECRET` missing on this host                                       |
| Photo analysis, tokens or Shortcut fail           | `SUPABASE_SECRET_KEY` or `USER_SECRETS_ENCRYPTION_KEY` is missing, or differs between Preview and Production |
| Shortcut returns 401                              | Token was regenerated, the old URL is still in the Shortcut                                             |
| "Der Demo-Modus ist gerade nicht verfügbar"        | Anonymous sign-ins are off in Supabase (see Supabase setup, step 5)                                     |
| Shortcut cannot be imported                       | The file is signed; open it on the iPhone with the Shortcuts app                                        |
