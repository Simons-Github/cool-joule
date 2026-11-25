import { translate, type Lang } from "@/lib/i18n";

/** Typed instead of an email when the account has none (demo / anonymous users). */
export const DELETE_CONFIRM_WORD = "LÖSCHEN";
export const DELETE_CONFIRM_WORD_EN = "DELETE";

/** Both words are always accepted, whichever language the UI is in. */
const ACCEPTED_WORDS = [DELETE_CONFIRM_WORD, DELETE_CONFIRM_WORD_EN];

export type DeleteConfirmation = {
  /** What the user has to type, compared case-insensitively. */
  expected: string;
  label: string;
  placeholder: string;
  inputType: "email" | "text";
};

export function getDeleteConfirmation(email: string | null, lang: Lang = "de"): DeleteConfirmation {
  const trimmed = email?.trim() ?? "";
  if (trimmed) {
    return {
      expected: trimmed,
      label: translate(lang, "deleteConfirm.email"),
      placeholder: trimmed,
      inputType: "email",
    };
  }
  const word = lang === "en" ? DELETE_CONFIRM_WORD_EN : DELETE_CONFIRM_WORD;
  return {
    expected: word,
    label: translate(lang, "deleteConfirm.word", { word }),
    placeholder: word,
    inputType: "text",
  };
}

export function isDeleteConfirmed(input: string, email: string | null): boolean {
  const typed = input.trim().toLowerCase();
  const trimmedEmail = email?.trim() ?? "";
  if (trimmedEmail) return typed === trimmedEmail.toLowerCase();
  return ACCEPTED_WORDS.some((word) => typed === word.toLowerCase());
}
