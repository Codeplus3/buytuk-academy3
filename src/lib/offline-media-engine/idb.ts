/* ─── OfflineMediaEngine — IndexedDB Layer ─── */

import type { BookContent, BookMetadata, TextChunk, TutorSession } from "./types";

const DB_NAME    = "OfflineMediaEngine";
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("books"))    db.createObjectStore("books",    { keyPath: "id" });
      if (!db.objectStoreNames.contains("chunks"))   db.createObjectStore("chunks",   { keyPath: "id" });
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
    };
    req.onsuccess = e => { _db = (e.target as IDBOpenDBRequest).result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    r.onsuccess = () => resolve(r.result as T);
    r.onerror   = () => reject(r.error);
  }));
}

/* ─── Books ─── */
export async function storeBook(book: BookContent): Promise<void> {
  const { chunks, ...meta } = book;
  await tx("books", "readwrite", s => s.put(meta));
  for (const chunk of chunks) {
    await tx("chunks", "readwrite", s => s.put(chunk));
  }
}

export async function getBookMeta(id: string): Promise<BookMetadata | null> {
  return tx<BookMetadata | undefined>("books", "readonly", s => s.get(id)).then(v => v ?? null);
}

export async function getAllBookMeta(): Promise<BookMetadata[]> {
  return tx<BookMetadata[]>("books", "readonly", s => s.getAll());
}

export async function getChunks(bookId: string): Promise<TextChunk[]> {
  const all: TextChunk[] = await tx("chunks", "readonly", s => s.getAll());
  return all.filter(c => c.bookId === bookId).sort((a, b) => a.chunkIndex - b.chunkIndex);
}

export async function getAllChunks(): Promise<TextChunk[]> {
  return tx("chunks", "readonly", s => s.getAll());
}

export async function deleteBook(id: string): Promise<void> {
  await tx("books", "readwrite", s => s.delete(id));
  const all: TextChunk[] = await tx("chunks", "readonly", s => s.getAll());
  for (const c of all.filter(c => c.bookId === id)) {
    await tx("chunks", "readwrite", s => s.delete(c.id));
  }
}

/* ─── Tutor Sessions ─── */
export async function saveTutorSession(session: TutorSession): Promise<void> {
  await tx("sessions", "readwrite", s => s.put(session));
}

export async function getTutorSessions(studentEmail: string): Promise<TutorSession[]> {
  const all: TutorSession[] = await tx("sessions", "readonly", s => s.getAll());
  return all.filter(s => s.studentEmail === studentEmail).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteTutorSession(id: string): Promise<void> {
  await tx("sessions", "readwrite", s => s.delete(id));
}

export const IDBAvailable = typeof indexedDB !== "undefined";
