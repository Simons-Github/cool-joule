export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export async function requireAuthenticatedUser(
  unauthenticatedMessage: string,
): Promise<AuthenticatedUser> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const { supabase } = await import("@/integrations/supabase/client");

  const authorization = getRequestHeader("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;

  if (!token) {
    throw new Error(unauthenticatedMessage);
  }

  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData.user) {
    throw new Error(unauthenticatedMessage);
  }

  return { id: userData.user.id, email: userData.user.email ?? null };
}

export async function requireAuthenticatedUserId(unauthenticatedMessage: string): Promise<string> {
  const user = await requireAuthenticatedUser(unauthenticatedMessage);
  return user.id;
}

export function logServerError(error: unknown): void {
  if (error instanceof Error && error.message) {
    console.error(error.message);
    return;
  }
  console.error("Unknown server error");
}
