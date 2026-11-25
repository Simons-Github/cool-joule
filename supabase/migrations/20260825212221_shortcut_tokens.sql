ALTER TABLE public.exercise_logs
  DROP CONSTRAINT IF EXISTS exercise_logs_source_check;

ALTER TABLE public.exercise_logs
  ADD CONSTRAINT exercise_logs_source_check
  CHECK (source IN ('manual', 'strava', 'shortcut'));

CREATE TABLE IF NOT EXISTS public.shortcut_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL CHECK (char_length(token_hash) = 64),
  token_ciphertext TEXT NOT NULL CHECK (token_ciphertext <> ''),
  token_suffix TEXT NOT NULL CHECK (char_length(token_suffix) = 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shortcut_tokens_token_hash_idx
  ON public.shortcut_tokens (token_hash);

COMMENT ON TABLE public.shortcut_tokens IS
  'Hashed+encrypted Apple-Shortcut webhook tokens. Readable only via service_role; not granted to anon/authenticated.';

ALTER TABLE public.shortcut_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.shortcut_tokens FROM PUBLIC;
REVOKE ALL ON TABLE public.shortcut_tokens FROM anon;
REVOKE ALL ON TABLE public.shortcut_tokens FROM authenticated;

GRANT ALL ON TABLE public.shortcut_tokens TO service_role;
