import { createHmac } from "node:crypto";
import { decryptSecret, encryptSecret, parseEncryptionKey } from "@/lib/secret-box";
import { RateLimitError, STRAVA_WEBHOOK_IP_LIMIT } from "@/lib/rate-limit";
import { logServerError } from "@/lib/server-auth";
import {
  STRAVA_API_BASE,
  STRAVA_BACKFILL_DAYS,
  STRAVA_DEAUTHORIZE_URL,
  STRAVA_TOKEN_URL,
  StravaError,
  activitiesNeedingImport,
  buildAuthorizeUrl,
  buildOAuthState,
  emptyStravaStatus,
  hasActivityReadScope,
  isSyncStale,
  mapStravaActivityToLog,
  parseOAuthState,
  parseWebhookEvent,
  requestClientIp,
  shouldDeleteLocalActivityFromWebhook,
  shouldDropConnectionFromWebhook,
  shouldImportActivity,
  unixSecondsAfterDaysAgo,
  webhookAction,
  webhookSubscriptionIdFromBody,
  withIgnoredExternalId,
  isWebhookSubscriptionAuthorized,
  timingSafeEqual,
  type MappedExerciseLog,
  type StravaActivityLike,
  type StravaStatus,
  type StravaSyncResult,
  type StravaWebhookHttpStatus,
  type StravaWebhookProbe,
} from "@/lib/strava";

const AUTH_MESSAGE = "Bitte anmelden, um Strava zu verbinden.";
const TOKEN_SKEW_MS = 60_000;

type StravaConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type TokenBundle = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  athleteId: number | null;
  athleteName: string | null;
};

type ConnectionRow = {
  user_id: string;
  athlete_id: number;
  athlete_name: string | null;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  token_expires_at: string;
  last_synced_at: string | null;
  ignored_external_ids: string[];
};

function getEncryptionKey(): Buffer {
  const raw = process.env["USER_SECRETS_ENCRYPTION_KEY"];
  if (!raw?.trim()) {
    throw new StravaError(
      "NOT_CONFIGURED",
      "Schlüssel-Speicherung ist nicht konfiguriert. Bitte USER_SECRETS_ENCRYPTION_KEY setzen.",
    );
  }
  try {
    return parseEncryptionKey(raw);
  } catch {
    throw new StravaError(
      "NOT_CONFIGURED",
      "USER_SECRETS_ENCRYPTION_KEY ist ungültig. Es müssen 32 Byte als Base64 sein.",
    );
  }
}

function signStatePayload(payload: string, key: Buffer): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function defaultRedirectUri(): string {
  const explicit = process.env["STRAVA_REDIRECT_URI"]?.trim();
  if (explicit) return explicit;
  const vercel = process.env["VERCEL_PROJECT_PRODUCTION_URL"] || process.env["VERCEL_URL"];
  if (vercel) {
    const host = vercel.startsWith("http") ? vercel : `https://${vercel}`;
    return `${host.replace(/\/$/, "")}/strava/callback`;
  }
  return "http://localhost:5173/strava/callback";
}

export function getStravaConfig(): StravaConfig | null {
  const clientId = process.env["STRAVA_CLIENT_ID"]?.trim();
  const clientSecret = process.env["STRAVA_CLIENT_SECRET"]?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: defaultRedirectUri() };
}

function requireStravaConfig(): StravaConfig {
  const config = getStravaConfig();
  if (!config) {
    throw new StravaError(
      "NOT_CONFIGURED",
      "Strava ist nicht konfiguriert. Bitte STRAVA_CLIENT_ID und STRAVA_CLIENT_SECRET setzen.",
    );
  }
  return config;
}

async function getAdmin() {
  try {
    const { createSupabaseAdmin } = await import("@/integrations/supabase/admin.server");
    return createSupabaseAdmin();
  } catch (error) {
    throw new StravaError(
      "NOT_CONFIGURED",
      error instanceof Error
        ? error.message
        : "Server-Konfiguration unvollständig. Bitte SUPABASE_SECRET_KEY setzen.",
    );
  }
}

async function requireUserId(): Promise<string> {
  const { requireAuthenticatedUserId } = await import("@/lib/server-auth");
  try {
    return await requireAuthenticatedUserId(AUTH_MESSAGE);
  } catch (error) {
    if (error instanceof Error && error.message === AUTH_MESSAGE) {
      throw new StravaError("UNAUTHENTICATED", AUTH_MESSAGE);
    }
    throw error;
  }
}

async function enforceStravaLimit(
  userId: string,
  action: "strava_connect" | "strava_sync" | "strava_webhook",
): Promise<void> {
  const { enforceRateLimit } = await import("@/lib/rate-limit.server");
  try {
    await enforceRateLimit(userId, action);
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw new StravaError("RATE_LIMITED", error.message);
    }
    throw error;
  }
}

function athleteDisplayName(
  athlete: { firstname?: string | null; lastname?: string | null } | null,
): string | null {
  if (!athlete) return null;
  const name = [athlete.firstname, athlete.lastname].filter(Boolean).join(" ").trim();
  return name || null;
}

async function stravaFormRequest(url: string, body: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(10_000),
  });
}

async function stravaApiGet(path: string, accessToken: string): Promise<Response> {
  return fetch(`${STRAVA_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
}

function parseTokenResponse(
  json: unknown,
  fallbackAthlete?: { id: number; name: string | null },
): TokenBundle {
  if (!json || typeof json !== "object") {
    throw new StravaError("OAUTH_FAILED", "Strava hat keine gültigen Tokens geliefert.");
  }
  const value = json as Record<string, unknown>;
  const accessToken = value["access_token"];
  const refreshToken = value["refresh_token"];
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    throw new StravaError("OAUTH_FAILED", "Strava hat keine gültigen Tokens geliefert.");
  }
  const expiresAtUnix = typeof value["expires_at"] === "number" ? value["expires_at"] : 0;
  const rawAthlete = value["athlete"];
  const athlete =
    rawAthlete && typeof rawAthlete === "object"
      ? (rawAthlete as { id?: number; firstname?: string; lastname?: string })
      : null;
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(expiresAtUnix * 1000),
    athleteId: athlete?.id ?? fallbackAthlete?.id ?? null,
    athleteName: athleteDisplayName(athlete) ?? fallbackAthlete?.name ?? null,
  };
}

async function loadConnection(userId: string): Promise<ConnectionRow | null> {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("strava_connections")
    .select(
      "user_id, athlete_id, athlete_name, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, last_synced_at, ignored_external_ids",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    logServerError(error);
    throw new StravaError("STORAGE_FAILED", "Die Strava-Verbindung konnte nicht geladen werden.");
  }
  return data;
}

async function loadConnectionByAthlete(athleteId: number): Promise<ConnectionRow | null> {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("strava_connections")
    .select(
      "user_id, athlete_id, athlete_name, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, last_synced_at, ignored_external_ids",
    )
    .eq("athlete_id", athleteId)
    .maybeSingle();
  if (error) {
    logServerError(error);
    throw new StravaError("STORAGE_FAILED", "Die Strava-Verbindung konnte nicht geladen werden.");
  }
  return data;
}

async function saveConnection(input: {
  userId: string;
  tokens: TokenBundle;
  athleteId: number;
  athleteName: string | null;
  lastSyncedAt?: string | null;
  ignoredExternalIds?: string[];
}): Promise<void> {
  const admin = await getAdmin();
  const key = getEncryptionKey();
  const { error } = await admin.from("strava_connections").upsert({
    user_id: input.userId,
    athlete_id: input.athleteId,
    athlete_name: input.athleteName,
    access_token_ciphertext: encryptSecret(input.tokens.accessToken, key),
    refresh_token_ciphertext: encryptSecret(input.tokens.refreshToken, key),
    token_expires_at: input.tokens.expiresAt.toISOString(),
    last_synced_at: input.lastSyncedAt ?? null,
    ignored_external_ids: input.ignoredExternalIds ?? [],
    updated_at: new Date().toISOString(),
  });
  if (error) {
    logServerError(error);
    if (error.code === "23505") {
      throw new StravaError(
        "ALREADY_CONNECTED",
        "Dieses Strava-Konto ist bereits mit einem anderen Cool-Joule-Account verbunden.",
      );
    }
    throw new StravaError(
      "STORAGE_FAILED",
      "Die Strava-Verbindung konnte nicht gespeichert werden.",
    );
  }
}

async function decryptedTokens(row: ConnectionRow): Promise<TokenBundle> {
  const key = getEncryptionKey();
  try {
    return {
      accessToken: decryptSecret(row.access_token_ciphertext, key),
      refreshToken: decryptSecret(row.refresh_token_ciphertext, key),
      expiresAt: new Date(row.token_expires_at),
      athleteId: row.athlete_id,
      athleteName: row.athlete_name,
    };
  } catch {
    throw new StravaError(
      "STORAGE_FAILED",
      "Die Strava-Verbindung konnte nicht gelesen werden. Bitte erneut verbinden.",
    );
  }
}

async function refreshTokens(
  row: ConnectionRow,
): Promise<{ row: ConnectionRow; accessToken: string }> {
  const tokens = await decryptedTokens(row);
  if (tokens.expiresAt.getTime() - TOKEN_SKEW_MS > Date.now()) {
    return { row, accessToken: tokens.accessToken };
  }

  const config = requireStravaConfig();
  let response: Response;
  try {
    response = await stravaFormRequest(STRAVA_TOKEN_URL, {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    });
  } catch (error) {
    logServerError(error);
    throw new StravaError(
      "SYNC_FAILED",
      "Strava ist gerade nicht erreichbar. Bitte später erneut versuchen.",
    );
  }

  if (!response.ok) {
    throw new StravaError(
      "NOT_CONNECTED",
      "Die Strava-Verbindung ist abgelaufen. Bitte erneut verbinden.",
    );
  }

  const refreshed = parseTokenResponse(await response.json(), {
    id: row.athlete_id,
    name: row.athlete_name,
  });
  await saveConnection({
    userId: row.user_id,
    tokens: refreshed,
    athleteId: row.athlete_id,
    athleteName: row.athlete_name,
    lastSyncedAt: row.last_synced_at,
    ignoredExternalIds: row.ignored_external_ids,
  });

  const next = await loadConnection(row.user_id);
  if (!next) {
    throw new StravaError(
      "STORAGE_FAILED",
      "Die Strava-Verbindung konnte nicht gespeichert werden.",
    );
  }
  return { row: next, accessToken: refreshed.accessToken };
}

async function loadWeightKg(userId: string): Promise<number | null> {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select("current_weight")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    logServerError(error);
    return null;
  }
  const weight = data?.current_weight;
  return typeof weight === "number" && weight > 0 ? weight : null;
}

async function existingStravaExternalIds(userId: string): Promise<Set<string>> {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("exercise_logs")
    .select("external_id")
    .eq("user_id", userId)
    .eq("source", "strava")
    .not("external_id", "is", null);
  if (error) {
    logServerError(error);
    throw new StravaError("STORAGE_FAILED", "Vorhandene Aktivitäten konnten nicht geladen werden.");
  }
  return new Set(
    (data ?? []).map((row) => row.external_id).filter((id): id is string => Boolean(id)),
  );
}

async function insertMappedLogs(userId: string, logs: MappedExerciseLog[]): Promise<number> {
  if (logs.length === 0) return 0;
  const admin = await getAdmin();
  const { error } = await admin.from("exercise_logs").insert(
    logs.map((log) => ({
      user_id: userId,
      date: log.date,
      name: log.name,
      calories: log.calories,
      source: log.source,
      external_id: log.external_id,
    })),
  );
  if (error) {
    if (error.code === "23505") return logs.length;
    logServerError(error);
    throw new StravaError("STORAGE_FAILED", "Aktivitäten konnten nicht gespeichert werden.");
  }
  return logs.length;
}

async function upsertMappedLog(userId: string, log: MappedExerciseLog): Promise<void> {
  const admin = await getAdmin();
  const { data, error: lookupError } = await admin
    .from("exercise_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("source", "strava")
    .eq("external_id", log.external_id)
    .maybeSingle();
  if (lookupError) {
    logServerError(lookupError);
    throw new StravaError("STORAGE_FAILED", "Aktivitäten konnten nicht gespeichert werden.");
  }
  if (data?.id) {
    const { error } = await admin
      .from("exercise_logs")
      .update({ name: log.name, calories: log.calories, date: log.date })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) {
      logServerError(error);
      throw new StravaError("STORAGE_FAILED", "Aktivitäten konnten nicht gespeichert werden.");
    }
    return;
  }
  await insertMappedLogs(userId, [log]);
}

async function fetchActivityDetail(
  accessToken: string,
  activityId: number,
): Promise<StravaActivityLike | null> {
  const response = await stravaApiGet(`/activities/${activityId}`, accessToken);
  if (response.status === 404) return null;
  if (response.status === 429) {
    throw new StravaError(
      "SYNC_FAILED",
      "Strava hat zu viele Anfragen. Bitte später erneut synchronisieren.",
    );
  }
  if (!response.ok) {
    throw new StravaError("SYNC_FAILED", "Strava-Workouts konnten nicht geladen werden.");
  }
  return (await response.json()) as StravaActivityLike;
}

async function importActivityIds(
  userId: string,
  accessToken: string,
  activityIds: number[],
  ignored: Iterable<string>,
  weightKg: number | null,
  mode: "insert" | "upsert" = "insert",
): Promise<number> {
  const logs: MappedExerciseLog[] = [];
  for (const activityId of activityIds) {
    const externalId = String(activityId);
    if (!shouldImportActivity(externalId, ignored)) continue;
    const detail = await fetchActivityDetail(accessToken, activityId);
    if (!detail) continue;
    const mapped = mapStravaActivityToLog(detail, weightKg);
    if (!mapped) continue;
    logs.push(mapped);
  }
  if (mode === "upsert") {
    for (const log of logs) await upsertMappedLog(userId, log);
    return logs.length;
  }
  return insertMappedLogs(userId, logs);
}

async function markSynced(userId: string): Promise<string> {
  const now = new Date().toISOString();
  const admin = await getAdmin();
  const { error } = await admin
    .from("strava_connections")
    .update({ last_synced_at: now, updated_at: now })
    .eq("user_id", userId);
  if (error) {
    logServerError(error);
    throw new StravaError("STORAGE_FAILED", "Der Sync-Status konnte nicht gespeichert werden.");
  }
  return now;
}

async function runBackfill(
  userId: string,
  row: ConnectionRow,
  accessToken: string,
): Promise<number> {
  const after = unixSecondsAfterDaysAgo(STRAVA_BACKFILL_DAYS);
  const response = await stravaApiGet(
    `/athlete/activities?after=${after}&per_page=100`,
    accessToken,
  );
  if (response.status === 429) {
    throw new StravaError(
      "SYNC_FAILED",
      "Strava hat zu viele Anfragen. Bitte später erneut synchronisieren.",
    );
  }
  if (!response.ok) {
    throw new StravaError("SYNC_FAILED", "Strava-Workouts konnten nicht geladen werden.");
  }
  const summaries = (await response.json()) as Array<{ id: number }>;
  if (!Array.isArray(summaries)) {
    throw new StravaError("SYNC_FAILED", "Strava-Workouts konnten nicht geladen werden.");
  }
  const existing = await existingStravaExternalIds(userId);
  const ids = activitiesNeedingImport(summaries, existing, row.ignored_external_ids ?? []);
  const weightKg = await loadWeightKg(userId);
  return importActivityIds(userId, accessToken, ids, row.ignored_external_ids ?? [], weightKg);
}

export async function getStravaStatus(): Promise<StravaStatus> {
  const configured = getStravaConfig() !== null;
  const userId = await requireUserId();
  const row = await loadConnection(userId);
  if (!row) return emptyStravaStatus(configured);
  return {
    configured,
    connected: true,
    athleteName: row.athlete_name,
    lastSyncedAt: row.last_synced_at,
  };
}

export async function startStravaConnect(): Promise<{ url: string }> {
  const userId = await requireUserId();
  await enforceStravaLimit(userId, "strava_connect");
  const config = requireStravaConfig();
  const key = getEncryptionKey();
  const state = buildOAuthState(userId, (payload) => signStatePayload(payload, key));
  return {
    url: buildAuthorizeUrl({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state,
    }),
  };
}

export async function completeStravaConnect(input: {
  code: string;
  state: string;
  scope?: string;
}): Promise<StravaStatus> {
  const userId = await requireUserId();
  await enforceStravaLimit(userId, "strava_connect");
  const config = requireStravaConfig();
  const key = getEncryptionKey();
  const stateUserId = parseOAuthState(input.state, (payload) => signStatePayload(payload, key));
  if (stateUserId !== userId) {
    throw new StravaError(
      "INVALID_STATE",
      "Die Strava-Anmeldung ist ungültig. Bitte erneut verbinden.",
    );
  }
  if (input.scope && !hasActivityReadScope(input.scope)) {
    throw new StravaError(
      "SCOPE_MISSING",
      "Bitte erlaube den Zugriff auf deine Aktivitäten, damit Workouts importiert werden können.",
    );
  }

  let response: Response;
  try {
    response = await stravaFormRequest(STRAVA_TOKEN_URL, {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code: input.code,
    });
  } catch (error) {
    logServerError(error);
    throw new StravaError(
      "OAUTH_FAILED",
      "Strava ist gerade nicht erreichbar. Bitte später erneut versuchen.",
    );
  }

  if (!response.ok) {
    throw new StravaError("OAUTH_FAILED", "Die Verbindung mit Strava ist fehlgeschlagen.");
  }

  const tokens = parseTokenResponse(await response.json());
  if (!tokens.athleteId) {
    throw new StravaError("OAUTH_FAILED", "Strava hat kein Athleten-Profil geliefert.");
  }

  await saveConnection({
    userId,
    tokens,
    athleteId: tokens.athleteId,
    athleteName: tokens.athleteName ?? null,
  });

  const row = await loadConnection(userId);
  if (!row) {
    throw new StravaError(
      "STORAGE_FAILED",
      "Die Strava-Verbindung konnte nicht gespeichert werden.",
    );
  }

  try {
    await runBackfill(userId, row, tokens.accessToken);
    const lastSyncedAt = await markSynced(userId);
    return {
      configured: true,
      connected: true,
      athleteName: row.athlete_name,
      lastSyncedAt,
    };
  } catch (error) {
    logServerError(error);
    return {
      configured: true,
      connected: true,
      athleteName: row.athlete_name,
      lastSyncedAt: row.last_synced_at,
    };
  }
}

export async function syncStravaActivities(force = false): Promise<StravaSyncResult> {
  const configured = getStravaConfig() !== null;
  const userId = await requireUserId();
  const row = await loadConnection(userId);
  if (!row) {
    return { configured, connected: false, skipped: true, imported: 0, lastSyncedAt: null };
  }
  if (!force && !isSyncStale(row.last_synced_at)) {
    return {
      configured,
      connected: true,
      skipped: true,
      imported: 0,
      lastSyncedAt: row.last_synced_at,
    };
  }

  await enforceStravaLimit(userId, "strava_sync");
  const refreshed = await refreshTokens(row);
  const imported = await runBackfill(userId, refreshed.row, refreshed.accessToken);
  const lastSyncedAt = await markSynced(userId);
  return { configured, connected: true, skipped: false, imported, lastSyncedAt };
}

export async function disconnectStrava(): Promise<StravaStatus> {
  const userId = await requireUserId();
  const row = await loadConnection(userId);
  if (row) {
    try {
      const tokens = await decryptedTokens(row);
      await stravaFormRequest(STRAVA_DEAUTHORIZE_URL, { access_token: tokens.accessToken });
    } catch (error) {
      logServerError(error);
    }
    const admin = await getAdmin();
    const { error } = await admin.from("strava_connections").delete().eq("user_id", userId);
    if (error) {
      logServerError(error);
      throw new StravaError(
        "STORAGE_FAILED",
        "Die Strava-Verbindung konnte nicht getrennt werden.",
      );
    }
  }
  return emptyStravaStatus(getStravaConfig() !== null);
}

export async function ignoreStravaActivity(externalId: string): Promise<void> {
  const userId = await requireUserId();
  const trimmed = externalId.trim();
  if (!trimmed) return;
  const row = await loadConnection(userId);
  const admin = await getAdmin();

  if (row) {
    const ignored = withIgnoredExternalId(row.ignored_external_ids, trimmed);
    const { error } = await admin
      .from("strava_connections")
      .update({ ignored_external_ids: ignored, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) {
      logServerError(error);
      throw new StravaError("STORAGE_FAILED", "Die Aktivität konnte nicht ausgeblendet werden.");
    }
  }

  const { error } = await admin
    .from("exercise_logs")
    .delete()
    .eq("user_id", userId)
    .eq("source", "strava")
    .eq("external_id", trimmed);
  if (error) {
    logServerError(error);
    throw new StravaError("STORAGE_FAILED", "Die Aktivität konnte nicht gelöscht werden.");
  }
}

async function upsertSingleActivity(row: ConnectionRow, activityId: number): Promise<void> {
  const externalId = String(activityId);
  if (!shouldImportActivity(externalId, row.ignored_external_ids ?? [])) return;
  const refreshed = await refreshTokens(row);
  const weightKg = await loadWeightKg(row.user_id);
  await importActivityIds(
    row.user_id,
    refreshed.accessToken,
    [activityId],
    row.ignored_external_ids ?? [],
    weightKg,
    "upsert",
  );
}

export async function handleStravaWebhookEvent(request: Request): Promise<StravaWebhookHttpStatus> {
  try {
    const { enforceMemoryRateLimit } = await import("@/lib/rate-limit.server");
    enforceMemoryRateLimit(
      `strava_webhook:${requestClientIp(request.headers)}`,
      STRAVA_WEBHOOK_IP_LIMIT.maxCount,
      STRAVA_WEBHOOK_IP_LIMIT.windowSeconds,
    );
  } catch (error) {
    if (error instanceof RateLimitError) return 429;
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return 400;
  }
  if (!body || typeof body !== "object") return 400;

  const expectedSubscription = process.env["STRAVA_WEBHOOK_SUBSCRIPTION_ID"]?.trim();
  if (!isWebhookSubscriptionAuthorized(webhookSubscriptionIdFromBody(body), expectedSubscription)) {
    return 403;
  }

  const event = parseWebhookEvent(body);
  if (!event) return 200;

  const action = webhookAction(event);
  if (action.type === "ignore") return 200;

  if (action.type === "disconnect") {
    return applyWebhookDisconnect(action.athleteId);
  }

  const row = await loadConnectionByAthlete(action.athleteId);
  if (!row) return 200;

  const limited = await limitWebhookUser(row.user_id);
  if (limited) return limited;

  if (action.type === "delete_activity") {
    return applyWebhookActivityDelete(row, action.activityId);
  }

  try {
    await upsertSingleActivity(row, action.activityId);
  } catch (error) {
    if (error instanceof StravaError && error.code === "SYNC_FAILED") return 503;
    logServerError(error);
  }
  return 200;
}

async function limitWebhookUser(userId: string): Promise<429 | null> {
  try {
    await enforceStravaLimit(userId, "strava_webhook");
    return null;
  } catch (error) {
    if (
      error instanceof RateLimitError ||
      (error instanceof StravaError && error.code === "RATE_LIMITED")
    ) {
      return 429;
    }
    throw error;
  }
}

async function applyWebhookDisconnect(athleteId: number): Promise<StravaWebhookHttpStatus> {
  const row = await loadConnectionByAthlete(athleteId);
  if (!row) return 200;

  const limited = await limitWebhookUser(row.user_id);
  if (limited) return limited;

  const decision = shouldDropConnectionFromWebhook(await probeAthleteAuthorization(row));
  if (decision === "keep") return 200;
  if (decision === "retry") return 503;

  const admin = await getAdmin();
  const { error } = await admin.from("strava_connections").delete().eq("athlete_id", athleteId);
  if (error) {
    logServerError(error);
    return 503;
  }
  return 200;
}

async function applyWebhookActivityDelete(
  row: ConnectionRow,
  activityId: number,
): Promise<StravaWebhookHttpStatus> {
  const decision = shouldDeleteLocalActivityFromWebhook(
    await probeActivityPresence(row, activityId),
  );
  if (decision === "ignore") return 200;
  if (decision === "retry") return 503;

  const admin = await getAdmin();
  const { error } = await admin
    .from("exercise_logs")
    .delete()
    .eq("user_id", row.user_id)
    .eq("source", "strava")
    .eq("external_id", String(activityId));
  if (error) {
    logServerError(error);
    return 503;
  }
  return 200;
}

async function probeAthleteAuthorization(
  row: ConnectionRow,
): Promise<Extract<StravaWebhookProbe, "authorized" | "revoked" | "unavailable">> {
  try {
    const refreshed = await refreshTokens(row);
    const response = await stravaApiGet("/athlete", refreshed.accessToken);
    if (response.ok) return "authorized";
    if (response.status === 401 || response.status === 403) return "revoked";
    return "unavailable";
  } catch (error) {
    if (error instanceof StravaError && error.code === "NOT_CONNECTED") return "revoked";
    logServerError(error);
    return "unavailable";
  }
}

async function probeActivityPresence(
  row: ConnectionRow,
  activityId: number,
): Promise<Extract<StravaWebhookProbe, "exists" | "missing" | "revoked" | "unavailable">> {
  try {
    const refreshed = await refreshTokens(row);
    const response = await stravaApiGet(`/activities/${activityId}`, refreshed.accessToken);
    if (response.status === 404) return "missing";
    if (response.status === 401 || response.status === 403) return "revoked";
    if (response.ok) return "exists";
    return "unavailable";
  } catch (error) {
    if (error instanceof StravaError && error.code === "NOT_CONNECTED") return "revoked";
    logServerError(error);
    return "unavailable";
  }
}

export function verifyWebhookToken(verifyToken: string | null): boolean {
  const expected = process.env["STRAVA_WEBHOOK_VERIFY_TOKEN"]?.trim();
  if (!expected || !verifyToken) return false;
  return timingSafeEqual(verifyToken, expected);
}
