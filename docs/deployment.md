# Deployment

The app is hosted on Vercel at [joule.berger-labs.com](https://joule.berger-labs.com). See [development.md](development.md) for what each variable does.

## Production checklist

- [ ] `VITE_SUPABASE_*` values match the Supabase project
- [ ] `SUPABASE_SECRET_KEY` and `USER_SECRETS_ENCRYPTION_KEY` set in Vercel for Production and Preview (needed for Gemini, Strava and Shortcut tokens)
- [ ] `GEMINI_API_KEY` and/or `AI_GATEWAY_API_KEY` (or `FOOD_PHOTO_USE_AI_GATEWAY=true` if the OIDC gateway is intended)
- [ ] `FOOD_PHOTO_APP_KEY_USER_IDS` / `FOOD_PHOTO_APP_KEY_EMAILS` set to the allowlisted accounts
- [ ] `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI` (production callback)
- [ ] `STRAVA_WEBHOOK_VERIFY_TOKEN` and `STRAVA_WEBHOOK_SUBSCRIPTION_ID` (the latter is required, otherwise event POSTs get 403)
- [ ] Auth redirect URLs include `/auth` (recovery) and `/strava/callback`
- [ ] Leaked password protection enabled in the Supabase dashboard
- [ ] Migrations applied to the project (including `strava_connections` and `shortcut_tokens`)
