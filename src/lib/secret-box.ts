import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
export const SECRET_BOX_KEY_BYTES = 32;

export function parseEncryptionKey(raw: string): Buffer {
  const normalized = raw.trim().replace(/\s/g, "");
  const key = Buffer.from(normalized, "base64");
  if (key.length !== SECRET_BOX_KEY_BYTES) {
    throw new Error("Encryption key must be 32 bytes as Base64.");
  }
  return key;
}

/** AES-256-GCM. Stored as base64(iv || authTag || ciphertext). */
export function encryptSecret(plaintext: string, key: Buffer): string {
  if (key.length !== SECRET_BOX_KEY_BYTES) {
    throw new Error("Encryption key must be 32 bytes.");
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(ciphertext: string, key: Buffer): string {
  if (key.length !== SECRET_BOX_KEY_BYTES) {
    throw new Error("Encryption key must be 32 bytes.");
  }
  const buf = Buffer.from(ciphertext, "base64");
  if (buf.length <= IV_LENGTH + TAG_LENGTH) {
    throw new Error("Invalid ciphertext.");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
