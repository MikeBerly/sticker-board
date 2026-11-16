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
 * Which store is used:
 *   - firebase-config.js has no config  -> saves on this device only (createLocalStore)
 *   - firebase-config.js has a config   -> syncs through Firebase (createFirebaseStore),
 *                                          keeping a copy on this device as a backup
 */
import { firebaseConfig, FAMILY_ID } from './firebase-config.js';

const KEY = 'stickerBoard.v1'; // this device's own board (also the starting point when sync is first turned on)
const SYNC_COPY_KEY = 'stickerBoard.syncCopy'; // a copy of the synced board, for opening offline

export function createLocalStore(key = KEY) {
  const KEY = key;
  // Ask the browser not to clear our data when space runs low (best effort).
  navigator.storage?.persist?.().catch(() => {});

  return {
    name: 'this device',

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
