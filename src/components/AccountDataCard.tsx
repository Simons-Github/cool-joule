import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/react";
import { supabase } from "@/integrations/supabase/client";
import { deleteAccount } from "@/lib/delete-account";
import {
  accountExportFilename,
  collectAccountExport,
  downloadJson,
} from "@/lib/export-account-data";
import { RateLimitError } from "@/lib/rate-limit";
import { getDeleteConfirmation, isDeleteConfirmed } from "@/lib/delete-account-confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountDataCard({ userId, email }: { userId: string; email: string | null }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmEmail, setConfirmEmail] = useState("");
  const confirmation = getDeleteConfirmation(email, lang);
  const confirmMatches = isDeleteConfirmed(confirmEmail, email);

  const exportData = useMutation({
    mutationFn: () => collectAccountExport(userId, email),
    onSuccess: (payload) => {
      downloadJson(accountExportFilename(), payload);
      toast.success(t("account.exportSaved"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteAccount(),
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      toast.success(t("account.deleted"));
      navigate({ to: "/", replace: true });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof RateLimitError
          ? t("error.rateLimited")
          : error instanceof Error
            ? error.message
            : t("account.deleteFailed");
      toast.error(message);
    },
  });

  return (
    <div className="mt-4 space-y-4 rounded-3xl bg-white p-5 shadow-lg shadow-rose-50">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">{t("account.title")}</h2>
        <p className="mt-1 text-sm text-slate-400">{t("account.intro")}</p>
      </div>

      <Button
        type="button"
        variant="outline"
        className="rounded-2xl"
        disabled={exportData.isPending}
        onClick={() => exportData.mutate()}
      >
        {exportData.isPending ? t("account.exporting") : t("account.export")}
      </Button>

      <div className="space-y-2 border-t border-rose-50 pt-4">
        <Label htmlFor="delete-account-email">{confirmation.label}</Label>
        <Input
          id="delete-account-email"
          type={confirmation.inputType}
          autoComplete="off"
          className="rounded-xl"
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          placeholder={confirmation.placeholder}
        />
        <Button
          type="button"
          variant="destructive"
          className="rounded-2xl"
          disabled={remove.isPending || !confirmMatches}
          onClick={() => remove.mutate()}
        >
          {remove.isPending ? t("account.deleting") : t("account.delete")}
        </Button>
      </div>
    </div>
  );
}
