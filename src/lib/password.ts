import { translate, type Lang } from "@/lib/i18n";

/** Must match Supabase Auth password policy. */
export const PASSWORD_MIN_LENGTH = 10;

export function passwordRequirementsHint(lang: Lang = "de"): string {
  return translate(lang, "password.hint");
}

const HAS_LOWERCASE = /[a-z]/;
const HAS_UPPERCASE = /[A-Z]/;
const HAS_DIGIT = /\d/;
const HAS_SYMBOL = /[^A-Za-z0-9]/;

/** Returns an error message in the given language (German by default), or null if the password meets all rules. */
export function validatePassword(password: string, lang: Lang = "de"): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return translate(lang, "password.tooShort", { min: PASSWORD_MIN_LENGTH });
  }
  if (!HAS_LOWERCASE.test(password)) {
    return translate(lang, "password.needLower");
  }
  if (!HAS_UPPERCASE.test(password)) {
    return translate(lang, "password.needUpper");
  }
  if (!HAS_DIGIT.test(password)) {
    return translate(lang, "password.needDigit");
  }
  if (!HAS_SYMBOL.test(password)) {
    return translate(lang, "password.needSymbol");
  }
  return null;
}

/** Maps Supabase Auth errors to clearer copy where useful. */
export function mapAuthErrorMessage(
  error: { message: string; code?: string | undefined },
  lang: Lang = "de",
): string {
  if (error.code === "weak_password") {
    return translate(lang, "password.weak", { hint: passwordRequirementsHint(lang) });
  }
  return error.message;
}
