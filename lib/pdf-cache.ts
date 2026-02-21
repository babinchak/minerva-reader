/**
 * IndexedDB cache for PDF blobs. Caches PDFs by bookId so returning to a book
 * loads instantly from disk instead of re-downloading.
 */

const DB_NAME = "minerva-pdf-cache";
const STORE_NAME = "pdfs";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "bookId" });
      }
    };
  });
}

export async function getCachedPdf(bookId: string): Promise<ArrayBuffer | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(bookId);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const row = req.result as { bookId: string; data: ArrayBuffer } | undefined;
        resolve(row?.data ?? null);
      };
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

export async function setCachedPdf(bookId: string, data: ArrayBuffer): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ bookId, data });
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
      tx.oncomplete = () => db.close();
    });
  } catch {
    // Cache write failure is non-fatal; PDF will still load from network
  }
}
