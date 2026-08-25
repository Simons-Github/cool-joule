import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = 5179;
const PASSWORD = "VerifyPhoto1!";

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const eq = line.indexOf("=");
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function isOpaqueSupabaseKey(value) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createEnvClient(url, apiKey) {
  return createClient(url, apiKey, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (isOpaqueSupabaseKey(apiKey) && headers.get("Authorization") === `Bearer ${apiKey}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", apiKey);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function waitForViteUrl(child, timeoutMs = 30_000) {
  return new Promise((resolveUrl, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("Vite did not print a Local URL")), timeoutMs);
    const onData = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      buf += text;
      const match = buf.match(/Local:\s+(http:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        child.stdout.off("data", onData);
        resolveUrl(match[1].replace(/\/$/, ""));
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  });
}

const fileEnv = loadEnv(resolve(ROOT, ".env"));
const url = fileEnv.SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const secret = fileEnv.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");

const ownerEmails = (fileEnv.FOOD_PHOTO_APP_KEY_EMAILS ?? "").trim();
const testEmail = `photo-verify-${Date.now()}@example.com`;
const allowlist = [ownerEmails, testEmail].filter(Boolean).join(",");

const admin = createEnvClient(url, secret);
let userId = null;
let vite = null;

try {
  const created = await admin.auth.admin.createUser({
    email: testEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("createUser failed");
  }
  userId = created.data.user.id;
  await admin.from("profiles").upsert({
    id: userId,
    onboarded: true,
    daily_calories: 2000,
    target_protein: 120,
    target_carbs: 220,
    target_fat: 65,
  });

  vite = spawn(
    "npm",
    ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    {
      cwd: ROOT,
      env: { ...process.env, ...fileEnv, FOOD_PHOTO_APP_KEY_EMAILS: allowlist },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const urlPromise = waitForViteUrl(vite);
  const base = await urlPromise;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(15_000);

  const publishable = fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY || fileEnv.SUPABASE_PUBLISHABLE_KEY;
  const browserClient = createEnvClient(url, publishable);
  const signedIn = await browserClient.auth.signInWithPassword({
    email: testEmail,
    password: PASSWORD,
  });
  if (signedIn.error || !signedIn.data.session) {
    throw signedIn.error ?? new Error("signInWithPassword failed");
  }
  const projectRef = new URL(url).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  await page.addInitScript(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
    },
    { key: storageKey, session: signedIn.data.session },
  );

  try {
    await page.goto(`${base}/tagebuch`, { waitUntil: "networkidle" });
    if (!page.url().includes("/tagebuch")) {
      await page.screenshot({ path: "/tmp/food-photo-verify-login.png", fullPage: true });
      console.error("login page text:", (await page.locator("body").innerText()).slice(0, 1500));
      throw new Error(`expected /tagebuch, got ${page.url()}`);
    }

  if (await page.getByText("Willkommen bei").isVisible().catch(() => false)) {
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Weiter" }).click();
    await page.getByRole("button", { name: "Plan starten" }).click();
    await page.getByText("Profil gespeichert", { exact: false }).waitFor({ timeout: 10_000 }).catch(() => {});
  }

  await page.getByRole("button", { name: "Nahrungsmittel hinzufügen" }).first().click();
  await page.getByRole("tab", { name: "Foto" }).click();
  const hint = page.getByText("Open Food Facts");
  if (!(await hint.first().isVisible())) {
    throw new Error("Foto-Tab zeigt den Open-Food-Facts-Hinweis nicht");
  }

  const image = resolve(ROOT, "public/mascot_lunch.png");
  await page.locator('input[type="file"][accept="image/*"]:not([capture])').setInputFiles(image);
  await page.getByRole("button", { name: "Analysieren" }).click();

  const started = Date.now();
  await page.waitForFunction(
    () => {
      const pending = document.body.innerText.includes("Analysieren…");
      const drafts = document.body.innerText.includes("Nährwerte aus Open Food Facts, sonst KI-Schätzung");
      const toastish =
        document.body.innerText.includes("zu lange gedauert") ||
        document.body.innerText.includes("fehlgeschlagen") ||
        document.body.innerText.includes("Kein Essen") ||
        document.body.innerText.includes("eigenen Key") ||
        document.body.innerText.includes("API-Key");
      return !pending && (drafts || toastish || document.body.innerText.includes("Anderes Foto"));
    },
    null,
    { timeout: 25_000 },
  );
  const elapsed = Date.now() - started;
  const body = await page.locator("body").innerText();
  await page.screenshot({ path: "/tmp/food-photo-verify.png", fullPage: true });

  const okDrafts = body.includes("Anderes Foto") || body.includes("Ausgewählte hinzufügen");
  const okError =
    body.includes("zu lange gedauert") ||
    body.includes("fehlgeschlagen") ||
    body.includes("Kein Essen");
  console.log(JSON.stringify({ elapsedMs: elapsed, okDrafts, okError, snippet: body.slice(0, 800) }));
  if (!okDrafts && !okError) {
    throw new Error("Analyse endete weder mit Drafts noch mit Fehlertext");
  }
  if (elapsed > 22_000 && !okDrafts) {
    console.warn("Analyse dauerte lange, aber nicht endlos.");
  }
  } finally {
    await browser.close();
  }
} finally {
  if (vite) {
    vite.kill("SIGTERM");
  }
  if (userId) {
    const del = await admin.auth.admin.deleteUser(userId);
    if (del.error) console.error("deleteUser failed:", del.error.message);
  }
}
