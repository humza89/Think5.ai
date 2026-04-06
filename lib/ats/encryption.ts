/**
 * Application-level encryption for sensitive ATS credentials.
 * Uses AES-256-GCM with a server-side key.
 */

import * as crypto from "crypto";

const ENCRYPTION_KEY = process.env.ATS_ENCRYPTION_KEY;

function getKeyBuffer(): Buffer {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    throw new Error("ATS_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  return Buffer.from(ENCRYPTION_KEY, "hex");
}

export function encryptATSKey(plaintext: string): string {
  const key = getKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

export function decryptATSKey(encryptedStr: string): string {
  const key = getKeyBuffer();
  const parts = encryptedStr.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted format");
  const iv = Buffer.from(parts[0], "base64");
  const authTag = Buffer.from(parts[1], "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(parts[2], "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 3 && parts.every(p => {
    try { Buffer.from(p, "base64"); return true; } catch { return false; }
  });
}
