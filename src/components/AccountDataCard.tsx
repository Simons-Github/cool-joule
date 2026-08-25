import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteAccount } from "@/lib/delete-account";
import {
  accountExportFilename,
  collectAccountExport,
  downloadJson,
} from "@/lib/export-account-data";
import { RateLimitError } from "@/lib/rate-limit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountDataCard({ userId, email }: { userId: string; email: string | null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmEmail, setConfirmEmail] = useState("");
  const expected = (email ?? "").trim().toLowerCase();
  const confirmMatches = expected.length > 0 && confirmEmail.trim().toLowerCase() === expected;

  const exportData = useMutation({
    mutationFn: () => collectAccountExport(userId, email),
    onSuccess: (payload) => {
      downloadJson(accountExportFilename(), payload);
      toast.success("Export gespeichert");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteAccount(),
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      toast.success("Konto gelöscht");
      navigate({ to: "/", replace: true });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof RateLimitError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Das Konto konnte nicht gelöscht werden.";
      toast.error(message);
    },
  });

  return (
    <div className="mt-4 space-y-4 rounded-3xl bg-white p-5 shadow-lg shadow-rose-50">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Daten & Konto</h2>
        <p className="mt-1 text-sm text-slate-400">
          Lade eine JSON-Kopie deiner Einträge herunter oder lösche das Konto unwiderruflich.
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        className="rounded-2xl"
        disabled={exportData.isPending}
        onClick={() => exportData.mutate()}
      >
        {exportData.isPending ? "Exportiere…" : "Daten exportieren"}
      </Button>

      <div className="space-y-2 border-t border-rose-50 pt-4">
        <Label htmlFor="delete-account-email">Zum Löschen E-Mail zur Bestätigung eingeben</Label>
        <Input
          id="delete-account-email"
          type="email"
          autoComplete="off"
          className="rounded-xl"
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          placeholder={email ?? "E-Mail"}
        />
        <Button
          type="button"
          variant="destructive"
          className="rounded-2xl"
          disabled={remove.isPending || !confirmMatches}
          onClick={() => remove.mutate()}
        >
          {remove.isPending ? "Lösche…" : "Konto löschen"}
        </Button>
      </div>
    </div>
  );
}
