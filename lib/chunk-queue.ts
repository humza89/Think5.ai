"use client";

/**
 * IndexedDB-backed queue for recording chunks that failed to upload.
 * Provides offline resilience for video recording.
 */

const DB_NAME = "recording-chunks";
const STORE_NAME = "chunks";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface QueuedChunk {
  id: string;
  interviewId: string;
  chunkIndex: number;
  blob: Blob;
  checksum: string;
  createdAt: number;
}

export async function enqueueChunk(
  interviewId: string,
  chunkIndex: number,
  blob: Blob,
  checksum: string
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.put({
    id: `${interviewId}-${chunkIndex}`,
    interviewId,
    chunkIndex,
    blob,
    checksum,
    createdAt: Date.now(),
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getQueuedChunks(interviewId: string): Promise<QueuedChunk[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const all = await new Promise<QueuedChunk[]>((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return all.filter((c) => c.interviewId === interviewId);
}

export async function removeChunk(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearQueue(interviewId: string): Promise<void> {
  const chunks = await getQueuedChunks(interviewId);
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const chunk of chunks) {
    store.delete(chunk.id);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getQueueSize(interviewId: string): Promise<number> {
  const chunks = await getQueuedChunks(interviewId);
  return chunks.length;
}
