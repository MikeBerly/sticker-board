/*
 * store.js — the ONLY file that knows where data is saved.
 *
 * The rest of the app talks to storage through these three methods:
 *
 *   load()       -> Promise<object|null>  the whole saved document, or null on first run
 *   save(doc)    -> Promise<void>         save the whole document
 *   onChange(cb) -> unsubscribe()         call cb(doc) when the data changes somewhere else
 *                                         (another tab today; another phone once synced)
 *
 * To add syncing later, write another adapter with the same three methods
 * (e.g. createFirebaseStore / createSupabaseStore) and change the last lines of this file.
 *
 * Tips for a sync adapter:
 *   - doc.events is append-only. Each event has a unique id, so merging two devices is
 *     "keep every event from both sides, de-duplicated by id". Totals are always
 *     recalculated from events, so nothing gets overwritten.
 *   - doc.kids and doc.settings change rarely; "last write wins" is fine for them.
 */

const KEY = 'stickerBoard.v1';

function createLocalStore() {
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

// ---- Swap this line to change where data lives ----
const store = createLocalStore();
export default store;
