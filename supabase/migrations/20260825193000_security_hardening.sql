-- RLS init-plan: wrap auth.uid() in SELECT
DROP POLICY IF EXISTS "own profile" ON public.profiles;
CREATE POLICY "own profile" ON public.profiles
  FOR ALL TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "own food logs" ON public.food_logs;
CREATE POLICY "own food logs" ON public.food_logs
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "own weight logs" ON public.weight_logs;
CREATE POLICY "own weight logs" ON public.weight_logs
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "own custom foods" ON public.custom_foods;
CREATE POLICY "own custom foods" ON public.custom_foods
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS custom_foods_user_id_idx ON public.custom_foods (user_id);

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_meal_type_check
  CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snacks'));

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_macros_check
  CHECK (
    calories >= 0
    AND protein >= 0
    AND carbs >= 0
    AND fat >= 0
    AND serving_size_g > 0
  );

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female'));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_activity_check
  CHECK (
    activity_level IS NULL
    OR activity_level IN ('sedentary', 'light', 'moderate', 'very')
  );

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_goal_check
  CHECK (goal IS NULL OR goal IN ('lose', 'maintain', 'gain'));

ALTER TABLE public.weight_logs
  ADD CONSTRAINT weight_logs_weight_check
  CHECK (weight_kg > 0);

ALTER TABLE public.custom_foods
  ADD CONSTRAINT custom_foods_macros_check
  CHECK (
    calories_per_100g >= 0
    AND protein_per_100g >= 0
    AND carbs_per_100g >= 0
    AND fat_per_100g >= 0
  );

CREATE TABLE public.server_rate_limits (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  action text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count >= 0),
  PRIMARY KEY (user_id, action)
);

COMMENT ON TABLE public.server_rate_limits IS
  'Per-user rate limits for server functions. Service role only.';

ALTER TABLE public.server_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.server_rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.server_rate_limits FROM anon;
REVOKE ALL ON TABLE public.server_rate_limits FROM authenticated;
GRANT ALL ON TABLE public.server_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.claim_server_rate_limit(
  p_user_id uuid,
  p_action text,
  p_max_count integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  now_ts timestamptz := now();
  counted integer;
BEGIN
  INSERT INTO public.server_rate_limits AS limits (user_id, action, window_started_at, request_count)
  VALUES (p_user_id, p_action, now_ts, 1)
  ON CONFLICT (user_id, action) DO UPDATE
    SET
      window_started_at = CASE
        WHEN limits.window_started_at <= now_ts - make_interval(secs => p_window_seconds)
          THEN now_ts
        ELSE limits.window_started_at
      END,
      request_count = CASE
        WHEN limits.window_started_at <= now_ts - make_interval(secs => p_window_seconds)
          THEN 1
        ELSE limits.request_count + 1
      END
  RETURNING request_count INTO counted;

  RETURN counted <= p_max_count;
END;
$$;

COMMENT ON FUNCTION public.claim_server_rate_limit(uuid, text, integer, integer) IS
  'Atomically increments a per-user action counter. Returns true when still within the window limit.';

REVOKE ALL ON FUNCTION public.claim_server_rate_limit(uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_server_rate_limit(uuid, text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_server_rate_limit(uuid, text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_server_rate_limit(uuid, text, integer, integer) TO service_role;
