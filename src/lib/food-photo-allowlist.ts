export type FoodPhotoAppKeyUser = {
  id: string;
  email: string | null;
};

export type FoodPhotoAllowlistEnv = {
  userIds?: string;
  emails?: string;
};

export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function isFoodPhotoAppKeyAllowed(
  user: FoodPhotoAppKeyUser,
  env: FoodPhotoAllowlistEnv = {
    userIds: process.env["FOOD_PHOTO_APP_KEY_USER_IDS"],
    emails: process.env["FOOD_PHOTO_APP_KEY_EMAILS"],
  },
): boolean {
  const ids = parseAllowlist(env.userIds);
  const emails = parseAllowlist(env.emails).map((email) => email.toLowerCase());
  if (ids.length === 0 && emails.length === 0) return false;
  if (ids.includes(user.id)) return true;
  const email = user.email?.trim().toLowerCase();
  return Boolean(email && emails.includes(email));
}

export function hasFoodPhotoGatewayAuth(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  if (env["AI_GATEWAY_API_KEY"]?.trim()) return true;
  const flag = env["FOOD_PHOTO_USE_AI_GATEWAY"]?.trim().toLowerCase();
  return flag === "true" || flag === "1" || flag === "yes";
}
