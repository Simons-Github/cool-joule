-- Keep the 5-per-24h cap in sync with SERVER_KEY_PHOTO_LIMIT in src/lib/food-photo-quota.ts.

ALTER TABLE public.food_photo_server_usage
  ADD COLUMN IF NOT EXISTS use_count integer;

ALTER TABLE public.food_photo_server_usage
  ADD COLUMN IF NOT EXISTS window_started_at timestamptz;

UPDATE public.food_photo_server_usage
SET
  use_count = COALESCE(use_count, 1),
  window_started_at = COALESCE(window_started_at, last_used_at);

ALTER TABLE public.food_photo_server_usage
  ALTER COLUMN use_count SET DEFAULT 1,
  ALTER COLUMN use_count SET NOT NULL,
  ALTER COLUMN window_started_at SET DEFAULT now(),
  ALTER COLUMN window_started_at SET NOT NULL;

ALTER TABLE public.food_photo_server_usage
  DROP CONSTRAINT IF EXISTS food_photo_server_usage_use_count_check;

ALTER TABLE public.food_photo_server_usage
  ADD CONSTRAINT food_photo_server_usage_use_count_check CHECK (use_count >= 0);

COMMENT ON TABLE public.food_photo_server_usage IS
  'Shared server-key food-photo usage per user. Service role only; enforces 5 analyses / 24h.';

CREATE OR REPLACE FUNCTION public.claim_food_photo_server_usage(p_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.food_photo_server_usage AS usage (
    user_id,
    last_used_at,
    window_started_at,
    use_count
  )
  VALUES (p_user_id, now(), now(), 1)
  ON CONFLICT (user_id) DO UPDATE
    SET
      last_used_at = now(),
      window_started_at = CASE
        WHEN usage.window_started_at <= now() - interval '24 hours' THEN now()
        ELSE usage.window_started_at
      END,
      use_count = CASE
        WHEN usage.window_started_at <= now() - interval '24 hours' THEN 1
        ELSE usage.use_count + 1
      END
    WHERE usage.window_started_at <= now() - interval '24 hours'
       OR usage.use_count < 5
  RETURNING usage.last_used_at;
$$;

COMMENT ON FUNCTION public.claim_food_photo_server_usage(uuid) IS
  'Atomically claims one shared-key photo analysis. Returns last_used_at on success, null if 5 uses are already in the current 24h window.';
