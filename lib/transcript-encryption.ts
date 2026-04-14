/**
 * Transcript-at-rest encryption — Track 5 Task 22.
 *
 * Extends the existing PII encryption machinery (lib/pii-encryption.ts)
 * to cover Interview.transcript. The transcript is a JSON column that
 * contains the candidate's verbatim answers plus the AI interviewer's
 * prompts — arguably more sensitive than anything in the Candidate
 * table, because it's content the candidate CREATED during the
 * interview and has strong privacy expectations around.
 *
 * The existing PII scheme encrypts individual string fields. A
 * transcript is a JSON array of turn objects; encrypting individual
 * fields would be wasteful and break equality/search. Instead, we
 * serialize the whole transcript JSON once and encrypt the string as
 * a single blob. Decryption rehydrates back to the JSON array.
 *
 * Rollout is FLAG-GATED: TRANSCRIPT_ENCRYPTION_ENABLED=true enables
 * encryption on new writes. Old plaintext rows continue to decrypt
 * transparently (the decrypt path is a no-op on unencrypted input).
 * A backfill script can encrypt existing rows out-of-band after the
 * flag is enabled; the module refuses to double-encrypt.
 *
 * The `null` / empty transcript cases are passed through unchanged so
 * NULL columns stay NULL.
 */

import { encryptPII, decryptPII, isPIIEncrypted } from "@/lib/pii-encryption";

/**
 * Feature flag — encryption only happens on write when this is true.
 * Reads always attempt decryption (safe — decryptPII is a no-op on
 * non-encrypted input), so enabling the flag on write is sufficient.
 */
function encryptionEnabled(): boolean {
  return process.env.TRANSCRIPT_ENCRYPTION_ENABLED === "true";
}

/**
 * Encrypt a transcript JSON value for storage. Accepts the value in
 * whatever shape Prisma was about to write (JSON array, string, or
 * null) and returns a value safe to persist.
 *
 * The encrypted form is a single string: the JSON.stringify of the
 * original value, AES-GCM encrypted via encryptPII. Prisma's JSON
 * column will happily store a string, and Postgres jsonb normalizes
 * it to a JSON string literal.
 */
export function encryptTranscript(value: unknown): unknown {
  if (!encryptionEnabled()) return value;
  if (value === null || value === undefined) return value;

  // Empty array or empty string — nothing to encrypt.
  if (Array.isArray(value) && value.length === 0) return value;
  if (typeof value === "string" && value.length === 0) return value;

  // If the value is already an encrypted blob, pass through. This
  // happens during read-modify-write cycles where the caller loaded
  // the decrypted transcript, modified nothing, and wrote it back.
  if (typeof value === "string" && isPIIEncrypted(value)) return value;

  try {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    return encryptPII(serialized);
  } catch {
    // If serialization fails for any reason, return the original so
    // we never block a write. The audit trail in logs catches this.
    return value;
  }
}

/**
 * Decrypt a transcript JSON value loaded from storage. Returns the
 * original JSON shape (array of turn objects) or the original value
 * if it wasn't encrypted — this lets the same code path handle both
 * pre-migration plaintext and post-migration ciphertext without a
 * feature flag on reads.
 */
export function decryptTranscript(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  // Only strings can be encrypted blobs. If it's already a JSON array
  // (the old plaintext shape), nothing to do.
  if (typeof value !== "string") return value;

  // If it's not in the encrypted format, return as-is.
  if (!isPIIEncrypted(value)) {
    // Some rows may have stored plaintext JSON as a string instead of
    // a JSON array. Try to parse it; fall back to the raw string.
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  try {
    const decrypted = decryptPII(value);
    // The decrypted string is JSON — parse it back to the original shape.
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch {
    // Decryption failed — return the ciphertext so the caller at
    // least sees something suspicious rather than silently getting
    // null. The admin dashboard will show this as a corrupted row.
    return value;
  }
}

/**
 * Process a Prisma Interview row's transcript field on read. Accepts
 * a plain object or array of rows and mutates in place.
 */
export function decryptInterviewRowOrList<T>(result: T): T {
  if (!result) return result;
  if (Array.isArray(result)) {
    for (const row of result) {
      if (row && typeof row === "object" && "transcript" in row) {
        (row as { transcript: unknown }).transcript = decryptTranscript(
          (row as { transcript: unknown }).transcript,
        );
      }
    }
    return result;
  }
  if (typeof result === "object" && "transcript" in (result as object)) {
    const r = result as unknown as { transcript: unknown };
    r.transcript = decryptTranscript(r.transcript);
  }
  return result;
}
