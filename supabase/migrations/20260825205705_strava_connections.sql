ALTER TABLE public.exercise_logs
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_id TEXT;

ALTER TABLE public.exercise_logs
  DROP CONSTRAINT IF EXISTS exercise_logs_source_check;

ALTER TABLE public.exercise_logs
  ADD CONSTRAINT exercise_logs_source_check
  CHECK (source IN ('manual', 'strava'));

ALTER TABLE public.exercise_logs
  DROP CONSTRAINT IF EXISTS exercise_logs_strava_external_id_check;

ALTER TABLE public.exercise_logs
  ADD CONSTRAINT exercise_logs_strava_external_id_check
  CHECK (source <> 'strava' OR (external_id IS NOT NULL AND external_id <> ''));

CREATE UNIQUE INDEX IF NOT EXISTS exercise_logs_user_source_external_id_idx
  ON public.exercise_logs (user_id, source, external_id)
  WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.strava_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id BIGINT NOT NULL,
  athlete_name TEXT,
  access_token_ciphertext TEXT NOT NULL CHECK (access_token_ciphertext <> ''),
  refresh_token_ciphertext TEXT NOT NULL CHECK (refresh_token_ciphertext <> ''),
  token_expires_at TIMESTAMPTZ NOT NULL,
  last_synced_at TIMESTAMPTZ,
  ignored_external_ids TEXT[] NOT NULL DEFAULT '{}',
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS strava_connections_athlete_id_idx
  ON public.strava_connections (athlete_id);

COMMENT ON TABLE public.strava_connections IS
  'Encrypted Strava OAuth tokens. Readable only via service_role; not granted to anon/authenticated.';

ALTER TABLE public.strava_connections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.strava_connections FROM PUBLIC;
REVOKE ALL ON TABLE public.strava_connections FROM anon;
REVOKE ALL ON TABLE public.strava_connections FROM authenticated;

GRANT ALL ON TABLE public.strava_connections TO service_role;
