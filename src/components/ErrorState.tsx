import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/react";

/**
 * Shared error placeholder for failed queries (network issues, RLS errors, etc.).
 * Renders inside the same card-shaped slot the loaded content would occupy,
 * so retrying doesn't cause a layout jump.
 */
export function ErrorState({
  title,
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useT();
  return (
    <div
      role="alert"
      className={`flex flex-col items-center gap-3 rounded-3xl bg-white p-8 text-center shadow-xl shadow-rose-100/50 ${className ?? ""}`}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
        <AlertTriangle className="size-6" aria-hidden="true" />
      </div>
      <div>
        <p className="font-semibold text-slate-800">{title ?? t("errorState.title")}</p>
        <p className="mt-1 text-sm text-slate-500">{message ?? t("errorState.message")}</p>
      </div>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="mt-1 rounded-xl">
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}
