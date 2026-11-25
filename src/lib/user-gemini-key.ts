import { createServerFn } from "@tanstack/react-start";
import { normalizeGeminiApiKey, type GeminiKeyStatus } from "@/lib/gemini-api-key";

export const getGeminiKeyStatus = createServerFn({ method: "POST" }).handler(
  async (): Promise<GeminiKeyStatus> => {
    const { getUserGeminiKeyStatus } = await import("@/lib/user-gemini-key.server");
    return getUserGeminiKeyStatus();
  },
);

export const saveGeminiApiKey = createServerFn({ method: "POST" })
  .validator((data: { apiKey: string }) => ({ apiKey: normalizeGeminiApiKey(data.apiKey) }))
  .handler(async ({ data }): Promise<GeminiKeyStatus> => {
    const { saveUserGeminiApiKey } = await import("@/lib/user-gemini-key.server");
    return saveUserGeminiApiKey(data.apiKey);
  });

export const deleteGeminiApiKey = createServerFn({ method: "POST" }).handler(
  async (): Promise<GeminiKeyStatus> => {
    const { deleteUserGeminiApiKey } = await import("@/lib/user-gemini-key.server");
    return deleteUserGeminiApiKey();
  },
);
