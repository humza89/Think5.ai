import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { logger } from "@/lib/logger";

/**
 * Signed access to private storage objects (Phase 0 T5).
 *
 * Resume files live in the private `resumes` bucket. Stored `resumeUrl`
 * values keep their historical shape (a Supabase object URL or a local
 * `/uploads/...` path); readers call `signedResumeUrl` at read time, which
 * turns a bucket object URL into a short-lived signed URL and leaves any
 * other value untouched.
 */

export const RESUME_BUCKET = "resumes";
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600;

/** Extracts the object path from a Supabase storage URL for the given bucket. */
export function storageObjectPath(url: string | null | undefined, bucket: string = RESUME_BUCKET): string | null {
  if (!url) return null;
  const match = new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/([^?#]+)`).exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function signedResumeUrl(
  url: string | null | undefined,
  ttlSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  if (!url) return null;
  const path = storageObjectPath(url, RESUME_BUCKET);
  if (!path) return url;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return url;
  try {
    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin.storage.from(RESUME_BUCKET).createSignedUrl(path, ttlSeconds);
    if (error || !data?.signedUrl) {
      logger.warn("signedResumeUrl: could not sign object", { path, error: error?.message });
      return url;
    }
    return data.signedUrl;
  } catch (error) {
    logger.warn("signedResumeUrl: signing failed", { path, error: error instanceof Error ? error.message : String(error) });
    return url;
  }
}
