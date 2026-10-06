(() => {
  'use strict';

  const DB_NAME = 'mile-camera-capture-v1';
  const STORE_NAME = 'capture-sessions';
  const DB_VERSION = 1;
  const MAX_SESSION_AGE_MS = 6 * 60 * 60 * 1000;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('Penyimpanan browser tidak tersedia. Gunakan Chrome Android versi terbaru.'));
        return;
      }
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Penyimpanan browser tidak dapat dibuka.'));
    });
  }

  async function runTransaction(mode, operation) {
    const database = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        let result;
        try {
          operation(store, value => { result = value; }, reject);
        } catch (error) {
          reject(error);
          return;
        }
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error || new Error('Penyimpanan browser gagal.'));
        transaction.onabort = () => reject(transaction.error || new Error('Penyimpanan browser dibatalkan.'));
      });
    } finally {
      database.close();
    }
  }

  function save(session) {
    // Capture timestamps can predate this handoff by days in an offline APK draft.
    const stored = { ...session, savedAt: Date.now() };
    return runTransaction('readwrite', (store, resolve, reject) => {
      const request = store.put(stored);
      request.onsuccess = () => resolve(stored);
      request.onerror = () => reject(request.error);
    });
  }

  function get(id) {
    return runTransaction('readonly', (store, resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  function remove(id) {
    return runTransaction('readwrite', (store, resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  function latestDraft() {
    return runTransaction('readonly', (store, resolve, reject) => {
      const index = store.index('createdAt');
      const request = index.openCursor(null, 'prev');
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(null);
          return;
        }
        const session = cursor.value;
        if (session?.draft === true && session?.route === 'camera' && Array.isArray(session?.draftCaptures) && session.draftCaptures.length) {
          resolve(session);
          return;
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  function cleanup() {
    const cutoff = Date.now() - MAX_SESSION_AGE_MS;
    return runTransaction('readwrite', (store, resolve, reject) => {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(true);
          return;
        }
        const session = cursor.value;
        const savedAt = Number(session?.savedAt) || Date.parse(session?.finishedAt) || Number(session?.updatedAt) || Number(session?.createdAt) || 0;
        if (!Number.isFinite(savedAt) || savedAt < cutoff) cursor.delete();
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  window.MileCameraStore = { save, get, remove, latestDraft, cleanup };
})();
