# Turning on sync with Firebase

The sync code is ready, but stays **off** until `firebase-config.js` has your project's settings. Until then, the app saves on each device exactly as before.

**Cost:** free. The Spark plan needs no credit card, and a family sticker board uses a tiny fraction of its daily limits.

## 1. Create the Firebase project (~10 minutes)

1. Go to **console.firebase.google.com** and sign in with a Google account. Either parent's account is fine; it owns the project.
2. Click **Create a project** and name it `sticker-board`. You can turn Google Analytics **off**; it isn't needed.
3. **Build → Firestore Database → Create database.**
   - Location: pick one near you, like `us-central` or `nam5`. It can't be changed later, but any choice works.
   - Start in **production mode**.
4. **Build → Authentication → Get started → Email/Password → Enable → Save.**
5. **Authentication → Users → Add user.** Add one account for each parent, with your email and a password you choose. These are the only accounts that can sign in, and there's no public sign-up.
6. **Firestore Database → Rules:** paste in the contents of [`firestore.rules`](firestore.rules) with your two emails filled in, then click **Publish**.
7. **Project settings** (⚙️ next to "Project overview") **→ Your apps → Web (`</>`)**. Register an app called `sticker-board` without Firebase Hosting. Copy the `firebaseConfig = { … }` values it shows.
8. **Authentication → Settings → Authorized domains → Add domain:** `mikeberly.github.io`.

## 2. Turn sync on in the app

1. Paste the config into `firebase-config.js`, in place of `null`:
   ```js
   export const firebaseConfig = {
     apiKey: '…',
     authDomain: 'sticker-board-xxxx.firebaseapp.com',
     projectId: 'sticker-board-xxxx',
     storageBucket: '…',
     messagingSenderId: '…',
     appId: '…',
   };
   ```
   These values aren't secret. The sign-in and the rules are what protect the data.
2. Test first, then upload the changed files to GitHub.

## 3. Move the current board over (do this on the device with the real stickers first)

1. **Export a backup first** (⚙️ Settings → Export backup), just in case.
2. Open the app and sign in. Since nothing is synced yet, it asks **"Use this board as the starting point for every device?"** Tap **Use this board**.
3. On each other device, open the app and sign in. They pick up the synced board.
   - The iPad's Home Screen app needs its own sign-in, separate from Safari.
   - Each device keeps its old, pre-sync board untouched in the background, so nothing is lost if you need to go back.

## How it behaves

- **Awarding on two devices at once:** both stickers count. Each award is its own record, so neither overwrites the other.
- **No internet:** changes are saved on the device and sync once it reconnects.
- **Settings changes** (jobs, prizes, colors, tier costs) are last-change-wins.
- **Same PIN everywhere:** the kid PIN syncs too.
- **Signing out** of a device (⚙️ Settings → Syncing) just hides the board there. Nothing is deleted.
- **Importing a backup** while synced replaces the board on **every** device.

## Turning sync off again

Set `firebaseConfig` back to `null` and upload `firebase-config.js`. Each device goes back to its own pre-sync board. Use Export/Import to carry the latest stickers over.
