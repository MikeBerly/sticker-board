/*
 * store.js — the ONLY file that decides where data is saved.
 *
 * The rest of the app talks to storage through:
 *
 *   load()            -> Promise<object|null>  the whole saved document, or null on first run
 *   save(doc, opts)   -> Promise<void>         save the whole document
 *                                              (opts.replace: also delete events no longer in doc)
 *   onChange(cb)      -> unsubscribe()         call cb(doc) when the data changes somewhere else
 *
 * Synced stores also have `auth` (sign in/out) — see firebase-store.js.
 *
 * Every store also has `live`, small shared records for playing together (never part of the board):
 *   live.watch(name, cb, onError) -> unsubscribe()   cb(record) now and whenever it changes
 *   live.update(name, fields)     -> Promise           deep-merges fields into the record
 *   live.reset(name, record)      -> Promise           replaces the record
 *
 * Which store is used:
 *   - firebase-config.js has no config  -> saves on this device only (createLocalStore)
 *   - firebase-config.js has a config   -> syncs through Firebase (createFirebaseStore),
 *                                          keeping a copy on this device as a backup
 */
import { firebaseConfig, FAMILY_ID } from './firebase-config.js';

const KEY = 'stickerBoard.v1'; // this device's own board (also the starting point when sync is first turned on)
const SYNC_COPY_KEY = 'stickerBoard.syncCopy'; // a copy of the synced board, for opening offline

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(a[k]) ? deepMerge(a[k], v) : v;
  return out;
}

// Live records for a store without sync: shared between tabs on this device only (handy for testing).
function localLive() {
  const PREFIX = 'stickerBoard.live.';
  const read = (name) => {
    try {
      return JSON.parse(localStorage.getItem(PREFIX + name) || '{}');
    } catch {
      return {};
    }
  };
  const listeners = new Map();
  const emit = (name) => listeners.get(name)?.forEach((cb) => cb(read(name)));
  window.addEventListener('storage', (e) => {
    if (e.key?.startsWith(PREFIX)) emit(e.key.slice(PREFIX.length));
  });
  const write = (name, rec) => {
    localStorage.setItem(PREFIX + name, JSON.stringify(rec));
    emit(name);
  };
  return {
    shared: false,
    watch(name, cb) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(cb);
      setTimeout(() => cb(read(name)), 0);
      return () => listeners.get(name)?.delete(cb);
    },
    async update(name, fields) {
      write(name, deepMerge(read(name), fields));
    },
    async reset(name, rec) {
      write(name, rec);
    },
  };
}

export function createLocalStore(key = KEY) {
  const KEY = key;
  // Ask the browser not to clear our data when space runs low (best effort).
  navigator.storage?.persist?.().catch(() => {});

  return {
    name: 'this device',
    live: localLive(),

    async load() {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    },

    async save(doc) {
      localStorage.setItem(KEY, JSON.stringify(doc));
    },

    onChange(cb) {
      const handler = (e) => {
        if (e.key === KEY && e.newValue) cb(JSON.parse(e.newValue));
      };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
  };
}

async function pickStore() {
  const local = createLocalStore();
  if (!firebaseConfig) return local;
  const syncCopy = createLocalStore(SYNC_COPY_KEY);
  try {
    const { createFirebaseStore } = await import('./firebase-store.js');
    return await createFirebaseStore(firebaseConfig, FAMILY_ID, { mirror: syncCopy, preSync: local });
  } catch (err) {
    // The sync library couldn't load (e.g. first launch with no internet).
    // Show the last synced copy, but don't let changes pile up that would never sync.
    console.error('Sync could not start', err);
    return {
      ...syncCopy,
      name: 'offline',
      syncUnavailable: true,
      async save() {
        throw new Error('Sync is unavailable right now. Connect to the internet and reopen the app.');
      },
    };
  }
}

const store = await pickStore();
export default store;
