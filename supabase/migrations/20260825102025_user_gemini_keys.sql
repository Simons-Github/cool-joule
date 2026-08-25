CREATE TABLE public.user_gemini_keys (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL CHECK (ciphertext <> ''),
  key_suffix TEXT NOT NULL CHECK (char_length(key_suffix) = 4),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_gemini_keys IS
  'Encrypted per-user Gemini API keys. Readable only via service_role; not granted to anon/authenticated.';

ALTER TABLE public.user_gemini_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_gemini_keys FROM PUBLIC;
REVOKE ALL ON TABLE public.user_gemini_keys FROM anon;
REVOKE ALL ON TABLE public.user_gemini_keys FROM authenticated;

GRANT ALL ON TABLE public.user_gemini_keys TO service_role;
