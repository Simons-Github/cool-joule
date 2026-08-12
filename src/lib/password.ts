/** Must match Supabase Auth password policy. */
export const PASSWORD_MIN_LENGTH = 10;

export const PASSWORD_REQUIREMENTS_HINT =
  "Mindestens 10 Zeichen, mit Groß-/Kleinschreibung, Zahl und Sonderzeichen";

const HAS_LOWERCASE = /[a-z]/;
const HAS_UPPERCASE = /[A-Z]/;
const HAS_DIGIT = /\d/;
const HAS_SYMBOL = /[^A-Za-z0-9]/;

/** Returns a German error message, or null if the password meets all rules. */
export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`;
  }
  if (!HAS_LOWERCASE.test(password)) {
    return "Das Passwort braucht mindestens einen Kleinbuchstaben.";
  }
  if (!HAS_UPPERCASE.test(password)) {
    return "Das Passwort braucht mindestens einen Großbuchstaben.";
  }
  if (!HAS_DIGIT.test(password)) {
    return "Das Passwort braucht mindestens eine Zahl.";
  }
  if (!HAS_SYMBOL.test(password)) {
    return "Das Passwort braucht mindestens ein Sonderzeichen.";
  }
  return null;
}

/** Maps Supabase Auth errors to clearer German copy where useful. */
export function mapAuthErrorMessage(error: { message: string; code?: string }): string {
  if (error.code === "weak_password") {
    return `Das Passwort ist zu schwach. ${PASSWORD_REQUIREMENTS_HINT}.`;
  }
  return error.message;
}
