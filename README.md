# ⭐ Sticker Board

A sticker reward board for Shae and Ellis. It runs as a web app, works offline, and saves its data on the device it's used on.

## Files

| File | What it does |
|---|---|
| `index.html` | The page itself |
| `styles.css` | Colors, sizes and layout |
| `app.js` | The screens: board, kid page, prizes, history, settings |
| `model.js` | The shape of the data, the starter data and the sticker math |
| `emoji.js` | Icon picker choices, and the words that suggest each icon |
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
- **🎈 Play:** on a kid's page, tap **🎈 Play** for the Play menu (no PIN needed). Everything is spoken out loud, so kids don't need to read; turn that off per iPad in ⚙️ Settings → Brushing and play.
  - **🪥 Brush teeth** (also on the kid's page): a toothbrush timer that fills the kid's jar and calls out each part of the mouth. Set the length (1–3 minutes) in Settings. At the end, **⭐ Get my sticker** awards their brushing job after the grown-up PIN.
  - **Numbers:** Count it, Fill the jar, Which has more?, Pop the bubbles, Add them up. **Letters:** First letter, Starts with…, Picture words. Each game gets harder (or easier) by itself for each kid; levels are saved on that kid's iPad. Nothing in a game changes stickers.
  - **🤝 Play together:** **🃏 Memory match** (12 or 24 cards; take turns; a match goes again), **👀 Find the match** (Easy, Medium or Hard: 4, 6 or 8 pictures per card; two cards share one picture; first to tap it scores; a wrong tap pauses you for a second), **🏓 Pass the ball** (iPads side by side: each picks Left or Right, and the ball rolls from one screen onto the other), **🫙 Fill the jar together**, or send each other a sticker that pops up on the other iPad. Each game also works alone for practice. Brushing at the same time shows a brushing race. This needs one Firebase rules change the first time (see FIREBASE-SETUP.md).
  - **🎈 Pretend stickers:** the original Play mode.
- **Undo a lot at once:** in a kid's 📜 History, tap **☑️ Undo several at once**, tap the entries to undo (or **Pick all** next to a day to tick every entry from that day), then tap **↩️ Undo**. The **⭐ Stickers earned** and **🎁 Prizes** filters above the list limit both what you see and what Pick all picks.
- **Walmart day:** tap a kid, then **🎁 Get a prize**. Pick a wish-list prize, or tap **Something else…** and type what they chose.
- **Wish list ideas:** on a kid's page, tap **💡 Wish list**. Kids can type an idea, say it with the 🎤 on the keyboard, or tap one from **Need ideas?** No PIN is needed. Ideas wait under "Waiting for a grown-up" until a parent taps **✓ Add** and picks the prize size. The gallery's ideas live in `ideas.js`.
- **Look it up:** the 🔍 button next to any idea or prize opens an Amazon.ca or Walmart.ca search for it. It asks for the PIN first, so kids don't end up in a store on their own.
- **Sticker jar:** each kid's jar fills up as they earn stickers. Prize tags beside it turn gold at 5 🍬 Treat, 10 🎈 Small, 20 🎁 Medium and 30 🏆 Large. You can change those costs in ⚙️ Settings. Each kid also picks a **jar style** there (potion jar, rocket, gumball machine, beanstalk, ice cream tower, fish tank or hot air balloon) and a color. The styles are drawn in `jars.js`.
- **Icons:** when you type a job or prize name, the icon picks itself ("Feed the dog" → 🐶). Tap any icon to choose another one from the picker. An icon you've picked by hand never changes on its own.
- **Forgot the PIN?** Tap "Forgot PIN?" and answer the grown-up math question.

## Backups

In ⚙️ **Settings → Backup**:

- **Export backup** opens the iPad share sheet. Choose **Save to Files**, or AirDrop or email it to yourself. Do this every week or two. Settings shows when you last did it.
- **Import backup** replaces everything on the device with a backup file. Use it to move to a new device, or into the synced version later.

## Updating the app later

Upload the changed files. With internet, the app always loads its newest files when it opens, so devices pick up a change on their next launch. The saved copy in `sw.js` is only used offline (or if the network takes more than 4 seconds). If you add a new file, add it to `FILES` in `sw.js` and bump `CACHE`.

If the app ever fails to start, it shows a **Reload** button instead of a blank screen. Reload clears the saved copy of the app's files (never the board's data) and loads them fresh.

## Adding sync later (for future you, or for Claude)

- All storage goes through `store.js`, which has three methods: `load()`, `save(doc)` and `onChange(cb)`. Write a cloud adapter (Firebase or Supabase, for example) with the same three methods, then change the last lines of `store.js`. No other file needs to change.
- Totals are **never stored**. They're calculated from `events`, a list that only ever grows: earn, redeem, and undo, which points at an earlier event. Each event has a unique id, so merging two phones means keeping every event from both and dropping duplicates. Stickers awarded on two phones at once can't overwrite each other.
- `kids` and `settings` change rarely, so for those, the most recent change wins.
- To move over: **Export** on the iPad, then **Import** into the synced version.
