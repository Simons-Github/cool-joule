/** Typed instead of an email when the account has none (demo / anonymous users). */
export const DELETE_CONFIRM_WORD = "LÖSCHEN";

export type DeleteConfirmation = {
  /** What the user has to type, compared case-insensitively. */
  expected: string;
  label: string;
  placeholder: string;
  inputType: "email" | "text";
};

export function getDeleteConfirmation(email: string | null): DeleteConfirmation {
  const trimmed = email?.trim() ?? "";
  if (trimmed) {
    return {
      expected: trimmed,
      label: "Zum Löschen E-Mail zur Bestätigung eingeben",
      placeholder: trimmed,
      inputType: "email",
    };
  }
  return {
    expected: DELETE_CONFIRM_WORD,
    label: `Zum Löschen „${DELETE_CONFIRM_WORD}“ zur Bestätigung eingeben`,
    placeholder: DELETE_CONFIRM_WORD,
    inputType: "text",
  };
}

export function isDeleteConfirmed(input: string, email: string | null): boolean {
  const { expected } = getDeleteConfirmation(email);
  return input.trim().toLowerCase() === expected.toLowerCase();
}
