# ⭐ Sticker Board

A sticker reward board for Shae and Ellis. It runs as a web app, works offline, and saves its data on the device it's used on.

## Files

| File | What it does |
|---|---|
| `index.html` | The page itself |
| `styles.css` | Colors, sizes and layout |
| `app.js` | The screens: board, kid page, prizes, history, settings |
| `model.js` | The shape of the data, the starter data and the sticker math |
| `store.js` | **The only file that saves or loads data.** Swap this file to add sync. |
| `sw.js` | Offline support |
| `manifest.webmanifest`, `icon*` | Home Screen name and icon |

## Put it online (GitHub Pages, free, one time)

1. Create a free account at github.com.
2. Click **＋ → New repository** and name it `sticker-board`. Choose **Public**, which free Pages requires. The code will be public, but your family's data never leaves the iPad.
3. On the new repository's page, click **uploading an existing file** and drag in every file from this folder, **except** the `.claude` folder. Then click **Commit changes**.
4. Go to **Settings → Pages**. Under "Branch", choose `main` and `/ (root)`, then click **Save**.
5. After a minute or two, your app is live at `https://YOUR-USERNAME.github.io/sticker-board/`.

## Put it on the iPad

1. Open that address in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. **Open it from the Home Screen icon from now on.** On iPad, the Home Screen app keeps its data separate from Safari, and Safari can clear data from websites that haven't been used for a while. The Home Screen app doesn't have that problem.
4. The first time you award a sticker, the app asks you to make a 4-digit grown-up PIN.

The app starts with Shae at 15 stickers and Ellis at 22, their current jobs, and placeholder prizes. Change the prizes in ⚙️ Settings.

## Everyday use

- **Award a sticker:** tap a kid, then tap a job. Enter the PIN if asked. It stays unlocked for 5 minutes; tap **🔓 Lock** to lock it sooner.
- **Mistake?** Tap **Undo** in the message that appears, or undo any entry from that kid's 📜 History.
- **Walmart day:** tap a kid, then **🎁 Get a prize**. Pick a wish-list prize, or tap **Something else…** and type what they chose.
- **Forgot the PIN?** Tap "Forgot PIN?" and answer the grown-up math question.

## Backups

In ⚙️ **Settings → Backup**:

- **Export backup** opens the iPad share sheet. Choose **Save to Files**, or AirDrop or email it to yourself. Do this every week or two. Settings shows when you last did it.
- **Import backup** replaces everything on the device with a backup file. Use it to move to a new device, or into the synced version later.

## Updating the app later

After changing any app file, change `CACHE = 'sticker-board-v1'` in `sw.js` to `v2`, `v3` and so on, then upload the changed files. The iPad picks up the new version the second time you open the app.

## Adding sync later (for future you, or for Claude)

- All storage goes through `store.js`, which has three methods: `load()`, `save(doc)` and `onChange(cb)`. Write a cloud adapter (Firebase or Supabase, for example) with the same three methods, then change the last lines of `store.js`. No other file needs to change.
- Totals are **never stored**. They're calculated from `events`, a list that only ever grows: earn, redeem, and undo, which points at an earlier event. Each event has a unique id, so merging two phones means keeping every event from both and dropping duplicates. Stickers awarded on two phones at once can't overwrite each other.
- `kids` and `settings` change rarely, so for those, the most recent change wins.
- To move over: **Export** on the iPad, then **Import** into the synced version.
