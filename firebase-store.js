/*
 * firebase-store.js — the synced storage adapter (Cloud Firestore + email/password sign-in).
 * Same interface as the local store in store.js, plus `auth` for signing in.
 *
 * Firestore layout:
 *   families/{FAMILY_ID}                 { schemaVersion, settings, kids, updatedAt }
 *   families/{FAMILY_ID}/events/{id}     one document per earn / redeem / undo event
 *
 * Why it can't lose stickers: events are only ever ADDED by normal saves. Two devices adding
 * events at the same time just end up with both. Events are only deleted on an explicit
 * replace (importing a backup or removing a kid). Kids and settings are last-write-wins.
 */

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const BATCH_LIMIT = 400;

// JSON with sorted keys, so the same data always compares equal.
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
const sameDoc = (a, b) =>
  stable({ ...a, events: [...a.events].sort((x, y) => (x.id < y.id ? -1 : 1)) }) ===
  stable({ ...b, events: [...b.events].sort((x, y) => (x.id < y.id ? -1 : 1)) });
const byTime = (a, b) => (a.at || '').localeCompare(b.at || '') || (a.id < b.id ? -1 : 1);

export async function createFirebaseStore(config, familyId, { mirror: localMirror, preSync }) {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);

  const app = initializeApp(config);
  const auth = A.getAuth(app);
  const db = F.initializeFirestore(app, {
    // Keeps a copy on the device so the board opens and works offline, then syncs later.
    localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
  });
  const familyRef = F.doc(db, 'families', familyId);
  const eventsCol = F.collection(familyRef, 'events');

  let meta = null; // { schemaVersion, settings, kids }
  const events = new Map(); // id -> event, as known in Firestore (including our own pending writes)
  let lastSeen = null; // the last document we loaded, saved or reported

  const current = () => (meta ? { ...meta, events: [...events.values()].sort(byTime) } : null);
  const metaOf = (d) => ({ schemaVersion: d.schemaVersion, settings: d.settings, kids: d.kids });

  async function commitOps(ops) {
    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const batch = F.writeBatch(db);
      ops.slice(i, i + BATCH_LIMIT).forEach((op) => op(batch));
      await batch.commit();
    }
  }

  const store = {
    name: 'synced',
    remoteEmpty: false,

    auth: {
      /** Resolves with the signed-in user, or null. */
      ready: () =>
        new Promise((resolve) => {
          const stop = A.onAuthStateChanged(auth, (user) => {
            stop();
            resolve(user);
          });
        }),
      get user() {
        return auth.currentUser;
      },
      signIn: (email, password) => A.signInWithEmailAndPassword(auth, email.trim(), password),
      signOut: () => A.signOut(auth),
      sendReset: (email) => A.sendPasswordResetEmail(auth, email.trim()),
    },

    /** The copy saved on this device before syncing was turned on (used for the first upload). */
    localCopy: () => preSync.load(),

    async load() {
      let famSnap, evSnap;
      try {
        [famSnap, evSnap] = await Promise.all([F.getDoc(familyRef), F.getDocs(eventsCol)]);
      } catch (err) {
        // Offline with nothing cached yet: fall back to this device's last copy.
        console.warn('Sync unavailable, using this device’s copy', err);
        const mirror = await localMirror.load();
        if (mirror) lastSeen = mirror;
        return mirror;
      }
      if (!famSnap.exists()) {
        store.remoteEmpty = true;
        return null;
      }
      meta = metaOf(famSnap.data());
      events.clear();
      evSnap.forEach((d) => events.set(d.id, d.data()));
      lastSeen = current();
      localMirror.save(lastSeen).catch(() => {});
      return lastSeen;
    },

    /**
     * Saves the document. Normally only ADDS events; pass { replace: true } to also delete
     * events that are no longer in the document (import, removing a kid).
     * Returns once queued on this device; Firestore uploads in the background (works offline).
     */
    async save(doc, { replace = false } = {}) {
      localMirror.save(doc).catch(() => {});
      const ops = [];
      const newMeta = metaOf(doc);
      if (!meta || stable(newMeta) !== stable(meta)) {
        meta = newMeta;
        ops.push((b) => b.set(familyRef, { ...newMeta, updatedAt: F.serverTimestamp() }));
      }
      const ids = new Set();
      for (const e of doc.events) {
        ids.add(e.id);
        if (!events.has(e.id)) {
          events.set(e.id, e);
          ops.push((b) => b.set(F.doc(eventsCol, e.id), e));
        }
      }
      if (replace) {
        for (const id of [...events.keys()]) {
          if (!ids.has(id)) {
            events.delete(id);
            ops.push((b) => b.delete(F.doc(eventsCol, id)));
          }
        }
      }
      store.remoteEmpty = false;
      lastSeen = doc;
      if (ops.length) commitOps(ops).catch((err) => console.error('Sync write failed', err));
    },

    /** Calls cb(doc) when another device changes the board. */
    onChange(cb) {
      const emit = () => {
        const doc = current();
        if (!doc || (lastSeen && sameDoc(doc, lastSeen))) return;
        lastSeen = doc;
        localMirror.save(doc).catch(() => {});
        cb(doc);
      };
      const opts = { includeMetadataChanges: true };
      const stopMeta = F.onSnapshot(familyRef, opts, (snap) => {
        if (snap.metadata.hasPendingWrites || !snap.exists()) return; // our own write, already applied
        meta = metaOf(snap.data());
        emit();
      });
      const stopEvents = F.onSnapshot(eventsCol, opts, (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        events.clear();
        snap.forEach((d) => events.set(d.id, d.data()));
        emit();
      });
      return () => {
        stopMeta();
        stopEvents();
      };
    },
  };
  return store;
}
