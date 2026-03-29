"use client";

/**
 * IndexedDB-backed transcript backup for voice interviews.
 * Provides data loss prevention when server checkpoints fail.
 * Pattern mirrors lib/chunk-queue.ts.
 */

const DB_NAME = "transcript-backup";
const STORE_NAME = "transcripts";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "interviewId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface TranscriptBackup {
  interviewId: string;
  transcript: Array<{ role: string; content: string; timestamp?: string; finalized?: boolean }>;
  moduleScores: Array<{ module: string; score: number; reason: string }>;
  questionCount: number;
  savedAt: number;
}

/**
 * Upsert transcript backup by interviewId.
 * Silently no-ops if IndexedDB is unavailable.
 */
export async function backupTranscript(
  interviewId: string,
  transcript: TranscriptBackup["transcript"],
  moduleScores: TranscriptBackup["moduleScores"],
  questionCount: number
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({
      interviewId,
      transcript,
      moduleScores,
      questionCount,
      savedAt: Date.now(),
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // IndexedDB unavailable — silent fallback
  }
}

/**
 * Retrieve backed-up transcript for an interview.
 */
export async function getBackedUpTranscript(
  interviewId: string
): Promise<TranscriptBackup | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const result = await new Promise<TranscriptBackup | null>((resolve, reject) => {
      const request = tx.objectStore(STORE_NAME).get(interviewId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

/**
 * Clear transcript backup after successful server save.
 */
export async function clearTranscriptBackup(
  interviewId: string
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(interviewId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Silent fallback
  }
}
