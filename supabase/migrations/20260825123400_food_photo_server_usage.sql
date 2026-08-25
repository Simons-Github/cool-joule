CREATE TABLE public.food_photo_server_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.food_photo_server_usage IS
  'Last shared server-key food-photo analysis per user. Service role only; enforces 1 analysis / 24h.';

ALTER TABLE public.food_photo_server_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.food_photo_server_usage FROM PUBLIC;
REVOKE ALL ON TABLE public.food_photo_server_usage FROM anon;
REVOKE ALL ON TABLE public.food_photo_server_usage FROM authenticated;

GRANT ALL ON TABLE public.food_photo_server_usage TO service_role;

CREATE OR REPLACE FUNCTION public.claim_food_photo_server_usage(p_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.food_photo_server_usage AS usage (user_id, last_used_at)
  VALUES (p_user_id, now())
  ON CONFLICT (user_id) DO UPDATE
    SET last_used_at = now()
    WHERE usage.last_used_at <= now() - interval '24 hours'
  RETURNING usage.last_used_at;
$$;

COMMENT ON FUNCTION public.claim_food_photo_server_usage(uuid) IS
  'Atomically claims the shared-key photo quota. Returns last_used_at on success, null if still within 24h.';

REVOKE ALL ON FUNCTION public.claim_food_photo_server_usage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_food_photo_server_usage(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_food_photo_server_usage(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_food_photo_server_usage(uuid) TO service_role;
