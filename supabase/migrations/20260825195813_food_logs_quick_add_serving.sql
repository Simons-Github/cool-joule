ALTER TABLE public.food_logs DROP CONSTRAINT IF EXISTS food_logs_macros_check;

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_macros_check
  CHECK (
    calories >= 0
    AND protein >= 0
    AND carbs >= 0
    AND fat >= 0
    AND serving_size_g >= 0
  );
