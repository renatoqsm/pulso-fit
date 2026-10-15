'use client';
export type Pending = {
  key: string;
  userId: string;
  sessionId: string;
  path: string;
  body: Record<string, unknown>;
  order: number;
};
type Envelope = {
  key: string;
  userId: string;
  sessionId: string;
  iv: Uint8Array;
  cipher: ArrayBuffer;
  order: number;
};
function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('pulso-private-pending', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('keys');
      const q = db.createObjectStore('queue', { keyPath: 'key' });
      q.createIndex('userId', 'userId');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function request<T>(r: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function cryptoKey(db: IDBDatabase, userId: string) {
  const existing = (await request(db.transaction('keys').objectStore('keys').get(userId))) as
    CryptoKey | undefined;
  if (existing) return existing;
  const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  return new Promise<CryptoKey>((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite');
    const store = tx.objectStore('keys');
    let selected = candidate;
    const r = store.get(userId);
    r.onsuccess = () => {
      if (r.result) selected = r.result;
      else store.add(candidate, userId);
    };
    tx.oncomplete = () => resolve(selected);
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
function write(db: IDBDatabase, store: string, method: 'put' | 'delete', value: unknown) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store)[method](value as IDBValidKey);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
export async function savePending(value: Pending) {
  const db = await database();
  try {
    const key = await cryptoKey(db, value.userId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(value.key + value.userId) },
      key,
      new TextEncoder().encode(JSON.stringify(value)),
    );
    await write(db, 'queue', 'put', {
      key: value.key,
      userId: value.userId,
      sessionId: value.sessionId,
      order: value.order,
      iv,
      cipher,
    });
  } finally {
    db.close();
  }
}
export async function loadPending(userId: string, sessionId: string) {
  const db = await database();
  try {
    const key = (await request(db.transaction('keys').objectStore('keys').get(userId))) as
      CryptoKey | undefined;
    if (!key) return [];
    const records = (await request(
      db.transaction('queue').objectStore('queue').index('userId').getAll(userId),
    )) as Envelope[];
    const values: Pending[] = [];
    for (const record of records
      .filter((r) => r.sessionId === sessionId)
      .sort((a, b) => a.order - b.order)) {
      const plain = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: record.iv as Uint8Array<ArrayBuffer>,
          additionalData: new TextEncoder().encode(record.key + userId),
        },
        key,
        record.cipher,
      );
      const value = JSON.parse(new TextDecoder().decode(plain)) as Pending;
      if (value.userId !== userId || value.sessionId !== sessionId || value.key !== record.key)
        throw new Error('Pendência com identidade incompatível.');
      values.push(value);
    }
    return values;
  } finally {
    db.close();
  }
}
export async function deletePending(key: string) {
  const db = await database();
  try {
    await write(db, 'queue', 'delete', key);
  } finally {
    db.close();
  }
}
export async function clearOffline(userId: string) {
  try {
    const db = await database();
    try {
      const records = (await request(
        db.transaction('queue').objectStore('queue').index('userId').getAll(userId),
      )) as Envelope[];
      for (const r of records) await write(db, 'queue', 'delete', r.key);
      await write(db, 'keys', 'delete', userId);
      localStorage.removeItem('pulso-rest:' + userId);
    } finally {
      db.close();
    }
  } catch {
    /* Private browsing may disable IndexedDB. Authentication can still end. */
  }
}
