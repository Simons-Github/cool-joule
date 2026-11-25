import { cn } from "@/lib/utils";

export type MacroColorVar = "protein" | "carbs" | "fat";

export function MacroBar({
  label,
  current,
  target,
  colorVar,
}: {
  label: string;
  current: number;
  target: number;
  colorVar: MacroColorVar;
}) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-400">
          {Math.round(current)} / {target} g
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: `var(--${colorVar})` }}
        />
      </div>
    </div>
  );
}

export function CalorieRing({ consumed, target }: { consumed: number; target: number }) {
  const remaining = Math.round(target - consumed);
  const pct = target > 0 ? Math.min(1, consumed / target) : 0;
  const size = 148;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track: fresh emerald-100 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke="oklch(0.92 0.06 163)"
        />
        {/* Progress: watermelon rose-500 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="var(--primary)"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            "text-3xl font-bold tabular-nums",
            remaining < 0 ? "text-destructive" : "text-slate-800",
          )}
        >
          {remaining}
        </span>
        <span className="text-xs text-slate-400">kcal übrig</span>
      </div>
    </div>
  );
}
