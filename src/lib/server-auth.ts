import { assertNotDemoUser } from "@/lib/demo-mode";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  /** Supabase anonymous sign-in = demo visitor. */
  isAnonymous: boolean;
};

export type RequireUserOptions = {
  /** Demo (anonymous) users are rejected with a DemoModeError unless this is true. */
  allowDemo?: boolean;
};

export async function requireAuthenticatedUser(
  unauthenticatedMessage: string,
  { allowDemo = true }: RequireUserOptions = {},
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

  const user: AuthenticatedUser = {
    id: userData.user.id,
    email: userData.user.email ?? null,
    isAnonymous: userData.user.is_anonymous === true,
  };
  if (!allowDemo) assertNotDemoUser(user);
  return user;
}

export async function requireAuthenticatedUserId(
  unauthenticatedMessage: string,
  options?: RequireUserOptions,
): Promise<string> {
  const user = await requireAuthenticatedUser(unauthenticatedMessage, options);
  return user.id;
}

export function logServerError(error: unknown): void {
  if (error instanceof Error && error.message) {
    console.error(error.message);
    return;
  }
  console.error("Unknown server error");
}
