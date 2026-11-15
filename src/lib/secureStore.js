// Stores API keys encrypted with AES-GCM. The AES key is a non-extractable
// CryptoKey kept in IndexedDB: page JS can use it to decrypt, but the raw key
// material can never be read out, copied from storage, or synced elsewhere.
const DB = "spliteasy-secure";
const STORE = "kv";

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { d.close(); resolve(req?.result); };
    t.onerror = () => { d.close(); reject(t.error); };
  });
}

const get = (k) => tx("readonly", s => s.get(k));
const put = (k, v) => tx("readwrite", s => s.put(v, k));
const del = (k) => tx("readwrite", s => s.delete(k));

async function masterKey() {
  let key = await get("master");
  if (!key) {
    key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await put("master", key);
  }
  return key;
}

export async function saveSecret(name, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await masterKey(), new TextEncoder().encode(JSON.stringify(value)));
  await put(`secret:${name}`, { iv, data });
}

export async function loadSecret(name) {
  const rec = await get(`secret:${name}`);
  if (!rec) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: rec.iv }, await masterKey(), rec.data);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

export const deleteSecret = (name) => del(`secret:${name}`);

// Deletes every stored secret and the encryption key itself.
export function clearAllSecrets() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // completes once other tabs close their connections
  });
}
