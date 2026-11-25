/*
 * app.js — screens and interactions. Never touches storage directly; it goes through store.js.
 */
import store from './store.js';
import { defaultData, normalize, balance, undoneIds, sortedTiers, uid } from './model.js';
import { EMOJI_GROUPS, suggestEmoji } from './emoji.js';
import { IDEAS } from './ideas.js';
import { JAR_STYLES, JAR_FLOOR, JAR_SPAN } from './jars.js';
import { createFun, speechOn, setSpeech } from './fun.js';

const UNLOCK_MINUTES = 5;
const RELOAD_AFTER_AWAY_MS = 10 * 60000; // reopening the app after this long loads the newest version
// Where the 🔍 button searches. The item's name goes on the end of each address.
const SEARCH_SITES = [
  ['Amazon.ca', 'https://www.amazon.ca/s?k='],
  ['Walmart.ca', 'https://www.walmart.ca/search?q='],
];
const POTION_COLORS = ['#8b5cf6', '#6366f1', '#0ea5e9', '#14b8a6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#ec4899', '#a16207'];
const app = document.getElementById('app');
const modalRoot = document.getElementById('modal');
const toastEl = document.getElementById('toast');

let data;
let unlockedUntil = 0;
let lockTimer = null;
let pop = null; // { kidId, from }: animate that kid's jar from an earlier level on the next render
let selecting = null; // { kidId, ids: Set } while picking several history entries to undo at once
let play = null; // { kidId, extra }: pretend stickers in Play mode (never saved)
let showUndone = false; // history: also list entries that were undone
let historyFilter = 'all'; // which history entries are shown (and can be picked): 'all', 'earn' or 'redeem'
const isHistoryEntry = (e) => e.type === 'earn' || e.type === 'redeem';
const shownInHistory = (e) => isHistoryEntry(e) && (historyFilter === 'all' || e.type === historyFilter);

/* ---------- helpers ---------- */
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const kidById = (id) => data.kids.find((k) => k.id === id);
const tierById = (id) => data.settings.tiers.find((t) => t.id === id);
const kidHref = (kid, sub = '') => `#/kid/${encodeURIComponent(kid.id)}${sub ? '/' + sub : ''}`;
const nowIso = () => new Date().toISOString();

function firstGrapheme(s) {
  s = String(s).trim();
  if (!s) return '';
  if (window.Intl?.Segmenter) return [...new Intl.Segmenter().segment(s)][0].segment;
  return [...s][0];
}

function toInt(v, min, max) {
  if (String(v).trim() === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
}

async function commit(opts) {
  try {
    await store.save(data, opts);
  } catch (err) {
    console.error(err);
    toast(store.syncUnavailable ? `⚠️ ${err.message}` : "⚠️ Couldn't save. Try exporting a backup.");
  }
}

/* ---------- grown-up lock ---------- */
const isUnlocked = () => Date.now() < unlockedUntil;

function extendUnlock() {
  unlockedUntil = Date.now() + UNLOCK_MINUTES * 60000;
  clearTimeout(lockTimer);
  lockTimer = setTimeout(() => {
    unlockedUntil = 0;
    render();
  }, UNLOCK_MINUTES * 60000 + 50);
}

async function requireParent() {
  if (isUnlocked()) {
    extendUnlock();
    return true;
  }
  const ok = await pinPad();
  if (ok) {
    extendUnlock();
    render();
  }
  return ok;
}

async function hashPin(pin) {
  const text = 'sticker-board:' + pin;
  if (window.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return 'sha256:' + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381;
  for (const c of text) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return 'djb2:' + h.toString(16);
}

function pinPad(forceCreate = false) {
  return new Promise((resolve) => {
    const mode = forceCreate || !data.settings.pinHash ? 'create' : 'enter';
    let entry = '';
    let first = null;
    let busy = false;
    const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('');
    const s = openModal(`
      <div class="pin">
        <h2 class="pin-title"></h2>
        <p class="pin-sub"></p>
        <div class="dots"></div>
        <div class="keys">${keys}
          <button data-k="cancel" class="k-text">Cancel</button>
          <button data-k="0">0</button>
          <button data-k="del" aria-label="Delete">⌫</button>
        </div>
        ${mode === 'enter' ? '<button class="link" data-k="forgot">Forgot PIN?</button>' : ''}
      </div>`);
    const title = s.querySelector('.pin-title');
    const sub = s.querySelector('.pin-sub');
    const dots = s.querySelector('.dots');

    function paint(msg) {
      title.textContent = mode === 'enter' ? 'Grown-ups only 🔒' : first == null ? 'Make a grown-up PIN' : 'Type it again';
      sub.textContent =
        msg || (mode === 'enter' ? 'Enter the 4-digit PIN' : first == null ? "Pick 4 digits the kids won't guess" : 'Just to be sure');
      dots.innerHTML = [0, 1, 2, 3].map((i) => `<span class="${i < entry.length ? 'on' : ''}"></span>`).join('');
    }
    function shake(msg) {
      entry = '';
      paint(msg);
      dots.classList.remove('shake');
      void dots.offsetWidth;
      dots.classList.add('shake');
    }
    paint();

    s.addEventListener('click', (e) => press(e.target.closest('[data-k]')?.dataset.k));

    // Typing on a keyboard works too: digits, Backspace/Delete, Escape.
    function onKey(e) {
      if (!s.isConnected) return document.removeEventListener('keydown', onKey);
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      let k = null;
      if (/^[0-9]$/.test(e.key)) k = e.key;
      else if (e.key === 'Backspace' || e.key === 'Delete') k = 'del';
      else if (e.key === 'Escape') k = 'cancel';
      if (k == null) return;
      e.preventDefault();
      press(k);
    }
    document.addEventListener('keydown', onKey);

    async function press(k) {
      if (k == null || busy) return;
      if (k === 'cancel') {
        closeModal();
        return resolve(false);
      }
      if (k === 'forgot') {
        closeModal();
        const ok = await grownUpCheck();
        return resolve(ok ? await pinPad(true) : false);
      }
      if (k === 'del') {
        entry = entry.slice(0, -1);
        return paint();
      }
      if (entry.length >= 4) return;
      entry += k;
      paint();
      if (entry.length < 4) return;

      busy = true;
      const h = await hashPin(entry);
      busy = false;
      if (mode === 'enter') {
        if (h === data.settings.pinHash) {
          closeModal();
          resolve(true);
        } else shake('Not quite. Try again.');
      } else if (first == null) {
        first = h;
        entry = '';
        paint();
      } else if (first === h) {
        data.settings.pinHash = h;
        await commit();
        closeModal();
        resolve(true);
      } else {
        first = null;
        shake("Those didn't match. Start again.");
      }
    }
  });
}

function grownUpCheck() {
  return new Promise((resolve) => {
    const a = 6 + Math.floor(Math.random() * 4);
    const b = 6 + Math.floor(Math.random() * 4);
    const s = openModal(`
      <form class="gate">
        <h2>Grown-up check</h2>
        <p>To set a new PIN, what is ${a} × ${b}?</p>
        <input class="field wide" inputmode="numeric" autocomplete="off" required>
        <p class="err" hidden>Not quite.</p>
        <div class="row end">
          <button type="button" class="btn ghost" data-k="no">Cancel</button>
          <button class="btn">Continue</button>
        </div>
      </form>`);
    const input = s.querySelector('input');
    setTimeout(() => input.focus(), 50);
    s.querySelector('[data-k=no]').onclick = () => {
      closeModal();
      resolve(false);
    };
    s.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      if (Number(input.value) === a * b) {
        closeModal();
        resolve(true);
      } else {
        s.querySelector('.err').hidden = false;
        input.value = '';
      }
    };
  });
}

/* ---------- modals, toasts, fun ---------- */
function openModal(html, extraClass = '') {
  modalRoot.innerHTML = `<div class="backdrop"><div class="sheet ${extraClass}" role="dialog" aria-modal="true">${html}</div></div>`;
  modalRoot.hidden = false;
  return modalRoot.querySelector('.sheet');
}
function closeModal() {
  modalRoot.hidden = true;
  modalRoot.innerHTML = '';
}

function confirmDialog(title, body, okLabel = 'OK', danger = false) {
  return new Promise((resolve) => {
    const s = openModal(`
      <h2>${esc(title)}</h2>
      <p>${esc(body)}</p>
      <div class="row end">
        <button class="btn ghost" data-k="no">Cancel</button>
        <button class="btn ${danger ? 'danger' : 'go'}" data-k="yes">${esc(okLabel)}</button>
      </div>`);
    s.addEventListener('click', (e) => {
      const k = e.target.closest('[data-k]')?.dataset.k;
      if (!k) return;
      closeModal();
      resolve(k === 'yes');
    });
  });
}

function promptDialog(title, body, placeholder = '') {
  return new Promise((resolve) => {
    const s = openModal(`
      <form>
        <h2>${esc(title)}</h2>
        <p>${esc(body)}</p>
        <input class="field wide" placeholder="${esc(placeholder)}" maxlength="60" required>
        <div class="row end">
          <button type="button" class="btn ghost" data-k="no">Cancel</button>
          <button class="btn go">OK</button>
        </div>
      </form>`);
    const input = s.querySelector('input');
    setTimeout(() => input.focus(), 50);
    s.querySelector('[data-k=no]').onclick = () => {
      closeModal();
      resolve(null);
    };
    s.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      closeModal();
      resolve(v);
    };
  });
}

function tierPicker(title, current) {
  return new Promise((resolve) => {
    const s = openModal(`
      <h2>${esc(title)}</h2>
      <p>Which size of prize is it?</p>
      <div class="choice-list">${sortedTiers(data)
        .map((t) => `<button class="btn${t.id === current ? '' : ' ghost'}" data-k="${t.id}">${t.emoji} ${esc(t.name)} · ${t.cost} stickers</button>`)
        .join('')}</div>
      <div class="row end"><button class="btn ghost" data-k="no">Cancel</button></div>`);
    s.addEventListener('click', (e) => {
      const k = e.target.closest('[data-k]')?.dataset.k;
      if (!k) return;
      closeModal();
      resolve(k === 'no' ? null : k);
    });
  });
}

function searchDialog(q) {
  const s = openModal(`
    <h2>🔍 ${esc(q)}</h2>
    <p>Look it up at:</p>
    <div class="choice-list">${SEARCH_SITES.map(
      ([name, url]) => `<a class="btn" href="${esc(url + encodeURIComponent(q))}" target="_blank" rel="noopener">${esc(name)}</a>`
    ).join('')}</div>
    <div class="row end"><button class="btn ghost" data-k="no">Close</button></div>`);
  s.addEventListener('click', (e) => {
    if (e.target.closest('a, [data-k]')) setTimeout(closeModal, 0); // let the link open first
  });
}

function emojiPicker(title, suggestions, current) {
  return new Promise((resolve) => {
    const btns = (list) =>
      list.map((e) => `<button type="button" class="emoji-choice${e === current ? ' on' : ''}" data-emoji="${esc(e)}">${esc(e)}</button>`).join('');
    const sugg = suggestions.length ? `<h3>Suggested</h3><div class="emoji-grid">${btns(suggestions)}</div>` : '';
    const groups = EMOJI_GROUPS.map((g) => `<h3>${esc(g.name)}</h3><div class="emoji-grid">${btns(g.list)}</div>`).join('');
    const s = openModal(
      `<div class="picker-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn small" data-k="close" aria-label="Close">✕</button></div>
       <div class="picker-body">
         ${sugg}${groups}
         <h3>Or type any emoji</h3>
         <form class="row start"><input class="field emoji-in" aria-label="Type an emoji"><button class="btn small go">Use it</button></form>
       </div>`,
      'wide'
    );
    const done = (v) => {
      closeModal();
      resolve(v);
    };
    s.addEventListener('click', (e) => {
      const pick = e.target.closest('[data-emoji]');
      if (pick) return done(pick.dataset.emoji);
      if (e.target.closest('[data-k=close]')) done(null);
    });
    s.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const v = firstGrapheme(s.querySelector('form input').value);
      if (v) done(v);
    };
  });
}

let toastTimer;
function toast(msg, undoEventId) {
  toastEl.innerHTML = `<span>${esc(msg)}</span>${
    undoEventId ? `<button data-action="undo" data-event="${esc(undoEventId)}">Undo</button>` : ''
  }`;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, undoEventId ? 7000 : 3500);
}
function hideToast() {
  toastEl.classList.remove('show');
}

function celebrate(emoji, count = 18) {
  const layer = document.createElement('div');
  layer.className = 'confetti';
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.textContent = i % 4 === 0 ? '🎉' : emoji;
    s.style.left = Math.random() * 96 + 'vw';
    s.style.fontSize = 28 + Math.random() * 30 + 'px';
    s.style.animationDelay = Math.random() * 0.5 + 's';
    s.style.animationDuration = 1.3 + Math.random() * 0.9 + 's';
    s.style.setProperty('--spin', Math.random() * 720 - 360 + 'deg');
    layer.append(s);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 3000);
}

let audioCtx;
function getAudio() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}
// iPad only allows sound after a tap, so warm up audio on any touch.
document.addEventListener('pointerdown', getAudio, { passive: true });

function chime(notes = [523.25, 659.25, 783.99, 1046.5]) {
  if (!data.settings.sound) return;
  const ctx = getAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.02;
  notes.forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = t0 + i * 0.09;
    o.type = 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.4);
  });
}

/* ---------- actions ---------- */
/* Play mode: kids tap jobs just for fun. Nothing is saved, and the jar drains back afterwards. */
function playAward(kid, job) {
  if (!kid || !job) return;
  const real = Math.max(balance(data, kid.id), 0);
  pop = { kidId: kid.id, from: real + play.extra };
  play.extra += job.stickers;
  render();
  celebrate(kid.sticker);
  chime();
}

function stopPlay() {
  if (!play) return;
  const kid = kidById(play.kidId);
  if (kid && play.extra) pop = { kidId: kid.id, from: Math.max(balance(data, kid.id), 0) + play.extra };
  play = null;
  render();
  toast('🎈 All done playing! Back to the real stickers.');
}

async function award(kid, job) {
  if (!kid || !job) return;
  if (!(await requireParent())) return;
  const before = Math.max(balance(data, kid.id), 0);
  const ev = { id: uid(), type: 'earn', kidId: kid.id, amount: job.stickers, label: job.name, emoji: job.emoji, at: nowIso() };
  data.events.push(ev);
  await commit();
  pop = { kidId: kid.id, from: before };
  render();
  celebrate(kid.sticker);
  chime();
  toast(`${kid.sticker} +${job.stickers} for ${job.name}!`, ev.id);
}

async function redeem(kid, tier, label, emoji, { skipConfirm = false } = {}) {
  if (!kid || !tier) return;
  if (balance(data, kid.id) < tier.cost) return toast(`Not enough stickers yet`);
  if (!(await requireParent())) return;
  if (!skipConfirm) {
    const ok = await confirmDialog(
      `${emoji} ${label}`,
      `Trade ${tier.cost} stickers for this ${tier.name.toLowerCase()} prize?`,
      'Yes, get it!'
    );
    if (!ok) return;
  }
  const before = balance(data, kid.id);
  const ev = { id: uid(), type: 'redeem', kidId: kid.id, amount: tier.cost, label, emoji, tier: tier.id, at: nowIso() };
  data.events.push(ev);
  await commit();
  location.hash = kidHref(kid);
  pop = { kidId: kid.id, from: before };
  render();
  celebrate(emoji, 30);
  chime([783.99, 659.25, 783.99, 1046.5, 1318.5]);
  toast(`${kid.name} got ${label}! 🎉`, ev.id);
}

async function undo(eventId) {
  const ev = data.events.find((e) => e.id === eventId);
  if (!ev || undoneIds(data).has(eventId)) return;
  if (!(await requireParent())) return;
  const what = ev.type === 'earn' ? `+${ev.amount} for “${ev.label}”` : `the ${ev.label} prize (${ev.amount} stickers back)`;
  if (!(await confirmDialog('Undo this?', `Undo ${what}?`, 'Undo'))) return;
  data.events.push({ id: uid(), type: 'undo', ref: eventId, kidId: ev.kidId, at: nowIso() });
  await commit();
  hideToast();
  render();
  toast('↩️ Undone');
}

async function undoSelected() {
  if (!selecting) return;
  const kid = kidById(selecting.kidId);
  const undone = undoneIds(data);
  const evs = data.events.filter((e) => selecting.ids.has(e.id) && !undone.has(e.id) && shownInHistory(e));
  if (!kid || !evs.length) return;
  if (!(await requireParent())) return;
  const lost = evs.filter((e) => e.type === 'earn').reduce((n, e) => n + e.amount, 0);
  const prizes = evs.filter((e) => e.type === 'redeem');
  const back = prizes.reduce((n, e) => n + e.amount, 0);
  const parts = [];
  if (lost) parts.push(`${kid.name} loses ${plural(lost, 'sticker')}`);
  if (prizes.length) parts.push(`gets ${plural(back, 'sticker')} back for ${plural(prizes.length, 'prize')}`);
  const n = plural(evs.length, 'entry').replace('entrys', 'entries');
  if (!(await confirmDialog(`Undo ${n}?`, `${parts.join(' and ')}. This can't be reversed.`, `Undo ${n}`, true))) return;
  const at = nowIso();
  for (const e of evs) data.events.push({ id: uid(), type: 'undo', ref: e.id, kidId: e.kidId, at });
  selecting = null;
  await commit();
  render();
  toast(`↩️ Undid ${n}`);
}

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

async function exportData() {
  const stamp = nowIso();
  const json = JSON.stringify({ app: 'sticker-board', exportedAt: stamp, data }, null, 2);
  const file = new File([json], `sticker-board-backup-${localDate()}.json`, { type: 'application/json' });
  try {
    // On iPad, the share sheet is the reliable way to "Save to Files".
    if (isIOS() && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Sticker board backup' });
    } else {
      download(file);
    }
  } catch (err) {
    if (err?.name === 'AbortError') return; // closed the share sheet
    download(file);
  }
  data.settings.lastBackupAt = stamp;
  await commit();
  render();
  toast('✅ Backup exported');
}

async function importFile(file) {
  if (!file) return;
  let incoming;
  try {
    incoming = normalize(JSON.parse(await file.text()));
  } catch (err) {
    return toast(err instanceof SyntaxError ? "That file isn't a sticker board backup." : err.message);
  }
  const entries = incoming.events.filter(isHistoryEntry).length;
  const names = incoming.kids.map((k) => k.name).join(' & ') || 'no kids';
  const ok = await confirmDialog(
    'Replace everything?',
    `This replaces all kids, jobs, prizes and history here with the backup (${names}, ${plural(entries, 'history entry').replace('entrys', 'entries')}). This can't be undone.`,
    'Replace',
    true
  );
  if (!ok) return;
  data = incoming;
  await commit({ replace: true });
  render();
  toast('✅ Backup imported');
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const onWishList = (kid, name) => [...kid.prizes, ...kid.wishes].some((x) => sameName(x.name, name));

/** A kid adds an idea. No PIN: it waits on their wish list page until a grown-up approves it. */
async function addWish(kid, name, emoji, tier) {
  name = String(name || '').trim().slice(0, 60);
  if (!kid || !name) return false;
  if (onWishList(kid, name)) {
    toast('That one is already on the list!');
    return false;
  }
  kid.wishes.push({
    id: uid(), name, emoji: emoji || suggestEmoji(name)[0] || '🎁',
    ...(tierById(tier) ? { tier } : {}),
    at: nowIso(),
  });
  await commit();
  render();
  chime([659.25, 880]);
  toast('💡 Great idea! A grown-up will check it.');
  return true;
}

app.addEventListener('submit', async (e) => {
  if (e.target.id !== 'wish-form') return;
  e.preventDefault();
  const input = e.target.querySelector('input');
  input.blur(); // so the page can refresh
  await addWish(kidById(e.target.dataset.kid), input.value);
});

const actions = {
  'open-settings': async () => {
    if (await requireParent()) location.hash = '#/settings';
  },
  lock: () => {
    unlockedUntil = 0;
    clearTimeout(lockTimer);
    render();
    toast('🔒 Locked');
  },
  award: ({ kid, job }) => {
    const k = kidById(kid);
    const j = k?.jobs.find((x) => x.id === job);
    if (play && play.kidId === kid) playAward(k, j);
    else award(k, j);
  },
  'toggle-undone': () => {
    showUndone = !showUndone;
    render();
  },
  'play-start': ({ kid }) => {
    const k = kidById(kid);
    if (!k) return;
    if (location.hash !== kidHref(k)) location.hash = kidHref(k); // started from the Play menu
    play = { kidId: k.id, extra: 0 };
    hideToast();
    render();
    toast('🎈 Play time! Tap a job to add pretend stickers.');
  },
  'play-stop': () => stopPlay(),
  undo: ({ event }) => undo(event),
  'select-mode': async ({ kid }) => {
    if (!kidById(kid) || !(await requireParent())) return;
    selecting = { kidId: kid, ids: new Set() };
    render();
  },
  'toggle-pick': ({ event }) => {
    if (!selecting) return;
    if (selecting.ids.has(event)) selecting.ids.delete(event);
    else selecting.ids.add(event);
    render();
  },
  'pick-day': ({ day }) => {
    if (!selecting) return;
    const undone = undoneIds(data);
    const live = data.events.filter(
      (e) => e.kidId === selecting.kidId && shownInHistory(e) && !undone.has(e.id) && localDate(new Date(e.at)) === day
    );
    const all = live.every((e) => selecting.ids.has(e.id));
    for (const e of live) all ? selecting.ids.delete(e.id) : selecting.ids.add(e.id);
    render();
  },
  'history-filter': ({ filter }) => {
    historyFilter = ['earn', 'redeem'].includes(filter) ? filter : 'all';
    // Never undo something that's hidden: drop picks the new filter hides.
    if (selecting) {
      for (const id of [...selecting.ids]) {
        const e = data.events.find((x) => x.id === id);
        if (!e || !shownInHistory(e)) selecting.ids.delete(id);
      }
    }
    render();
  },
  'pick-none': () => {
    if (!selecting) return;
    selecting.ids.clear();
    render();
  },
  'select-cancel': () => {
    selecting = null;
    render();
  },
  'undo-selected': () => undoSelected(),
  redeem: ({ kid, prize }) => {
    const k = kidById(kid);
    const p = k?.prizes.find((x) => x.id === prize);
    if (p) redeem(k, tierById(p.tier), p.name, p.emoji);
  },
  'redeem-other': async ({ kid, tier }) => {
    const k = kidById(kid);
    const t = tierById(tier);
    if (!k || !t || balance(data, k.id) < t.cost) return;
    if (!(await requireParent())) return;
    const name = await promptDialog(`${t.emoji} ${t.name} prize`, `What did ${k.name} pick? (${t.cost} stickers)`, 'e.g. Bouncy ball');
    if (name) redeem(k, t, name, t.emoji, { skipConfirm: true });
  },
  'add-item': async ({ kid, list }) => {
    const k = kidById(kid);
    if (!k) return;
    const item =
      list === 'jobs'
        ? { id: uid(), name: 'New job', emoji: '✅', stickers: 1, autoEmoji: true }
        : { id: uid(), name: 'New prize', emoji: '🎁', tier: 'treat', autoEmoji: true };
    k[list].push(item);
    await commit();
    render();
    const input = app.querySelector(`[data-item="${CSS.escape(item.id)}"][data-field="item-name"]`);
    input?.focus();
    input?.select();
  },
  'del-item': async ({ kid, list, item }) => {
    const k = kidById(kid);
    const it = k?.[list]?.find((x) => x.id === item);
    if (!it) return;
    const what = list === 'jobs' ? 'job' : 'prize';
    if (!(await confirmDialog(`Remove ${what}?`, `Remove “${it.name}” from ${k.name}'s ${what}s? Past history stays.`, 'Remove', true))) return;
    k[list] = k[list].filter((x) => x.id !== item);
    await commit();
    render();
  },
  'add-kid': async () => {
    data.kids.push({ id: uid(), name: 'New kid', avatar: '🙂', sticker: '⭐', color: '#f97316', jobs: [], prizes: [], wishes: [] });
    await commit();
    render();
  },
  'del-kid': async ({ kid }) => {
    const k = kidById(kid);
    if (!k) return;
    const ok = await confirmDialog(
      `Remove ${k.name}?`,
      `This removes ${k.name}, their jobs, prizes, stickers and history. It can't be undone, so export a backup first if you're unsure.`,
      `Remove ${k.name}`,
      true
    );
    if (!ok) return;
    data.kids = data.kids.filter((x) => x.id !== kid);
    data.events = data.events.filter((e) => e.kidId !== kid);
    await commit({ replace: true });
    render();
  },
  'pick-emoji': async ({ kid, list, item, target }) => {
    const k = kidById(kid);
    if (!k) return;
    const obj = target === 'item' ? k[list]?.find((x) => x.id === item) : k;
    if (!obj) return;
    const field = target === 'item' ? 'emoji' : target; // 'avatar' or 'sticker'
    const title =
      target === 'item' ? `Icon for “${obj.name}”` : target === 'avatar' ? `${k.name}'s picture` : `${k.name}'s sticker`;
    const chosen = await emojiPicker(title, target === 'item' ? suggestEmoji(obj.name) : [], obj[field]);
    if (!chosen) return;
    obj[field] = chosen;
    if (target === 'item') obj.autoEmoji = false; // a hand-picked icon is never replaced automatically
    if (isUnlocked()) extendUnlock();
    await commit();
    render();
  },
  'set-style': async ({ kid, style }) => {
    const k = kidById(kid);
    if (!k || !JAR_STYLES[style]) return;
    k.jarStyle = style;
    data.events.push({ id: uid(), type: 'pref', kidId: k.id, key: 'jarStyle', value: style, at: nowIso() });
    if (isUnlocked()) extendUnlock();
    await commit();
    render();
  },
  'set-color': async ({ kid, color }) => {
    const k = kidById(kid);
    if (!k) return;
    k.color = color;
    if (isUnlocked()) extendUnlock();
    await commit();
    render();
  },
  'add-idea': ({ kid, name, emoji, tier }) => addWish(kidById(kid), name, emoji, tier),
  'del-wish': async ({ kid, item }) => {
    const k = kidById(kid);
    const w = k?.wishes.find((x) => x.id === item);
    if (!w) return;
    k.wishes = k.wishes.filter((x) => x !== w);
    await commit();
    render();
    toast(`Removed “${w.name}”`);
  },
  'approve-wish': async ({ kid, item }) => {
    const k = kidById(kid);
    if (!k?.wishes.some((x) => x.id === item)) return;
    if (!(await requireParent())) return;
    const w = k.wishes.find((x) => x.id === item); // look again: the board may have synced while the PIN pad was open
    if (!w) return;
    const tier = await tierPicker(`${w.emoji} ${w.name}`, w.tier);
    if (!tier || !k.wishes.includes(w)) return;
    k.wishes = k.wishes.filter((x) => x !== w);
    k.prizes.push({ id: uid(), name: w.name, emoji: w.emoji, tier });
    await commit();
    render();
    celebrate(w.emoji, 12);
    toast(`${w.emoji} ${w.name} is on ${k.name}'s wish list!`);
  },
  search: async ({ q }) => {
    if (q && (await requireParent())) searchDialog(q);
  },
  'change-pin': async () => {
    if (await pinPad(true)) toast('🔒 New PIN saved');
  },
  export: () => exportData(),
  import: () => document.getElementById('import-file')?.click(),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  e.preventDefault();
  actions[el.dataset.action]({ ...el.dataset }, el);
});

// Settings edits save as soon as a field changes.
app.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'import-file') {
    const file = t.files[0];
    t.value = '';
    return importFile(file);
  }
  const f = t.dataset.field;
  if (!f) return;
  const kid = t.dataset.kid ? kidById(t.dataset.kid) : null;
  const item = kid && t.dataset.list ? kid[t.dataset.list]?.find((x) => x.id === t.dataset.item) : null;

  switch (f) {
    case 'tier-cost': {
      const tier = tierById(t.dataset.tier);
      const n = toInt(t.value, 1, 999);
      if (n != null) tier.cost = n;
      t.value = tier.cost;
      break;
    }
    case 'kid-name': kid.name = t.value.trim() || kid.name; t.value = kid.name; break;
    case 'kid-avatar': kid.avatar = firstGrapheme(t.value) || kid.avatar; t.value = kid.avatar; break;
    case 'kid-sticker': kid.sticker = firstGrapheme(t.value) || kid.sticker; t.value = kid.sticker; break;
    case 'kid-color':
      kid.color = t.value;
      if (isUnlocked()) extendUnlock();
      await commit();
      return render(); // refresh swatches and the preview jar
    case 'item-name': {
      item.name = t.value.trim() || item.name;
      t.value = item.name;
      // Until a parent hand-picks an icon, keep it matched to the name.
      const guess = item.autoEmoji ? suggestEmoji(item.name)[0] : null;
      if (guess) {
        item.emoji = guess;
        const btn = t.closest('.item')?.querySelector('.emoji-btn');
        if (btn) btn.textContent = guess;
      }
      break;
    }
    case 'item-emoji': item.emoji = firstGrapheme(t.value) || item.emoji; t.value = item.emoji; break;
    case 'item-stickers': {
      const n = toInt(t.value, 1, 99);
      if (n != null) item.stickers = n;
      t.value = item.stickers;
      break;
    }
    case 'item-tier': item.tier = t.value; break;
    case 'sound': data.settings.sound = t.checked; break;
    case 'brush-seconds': data.settings.brushSeconds = toInt(t.value, 30, 300) || 60; break;
    case 'speak': setSpeech(t.checked); return; // this iPad only, not synced
    default: return;
  }
  if (isUnlocked()) extendUnlock();
  await commit();
  const panel = t.closest('.kid-panel');
  if (panel && kid) {
    panel.querySelector('h2').textContent = `${kid.avatar} ${kid.name}`;
    panel.style.setProperty('--kid', kid.color);
  }
});

/* ---------- views ---------- */
function topbar(left, title, right = '') {
  const lock = isUnlocked() ? '<button class="pill" data-action="lock">🔓 Lock</button>' : '';
  return `<header class="topbar">
    <div class="tb-left">${left}</div>
    <h1>${title}</h1>
    <div class="tb-right">${lock}${right}</div>
  </header>`;
}
const back = (href, label) => `<a class="btn ghost back" href="${href}">‹ ${esc(label)}</a>`;

function statusText(bal) {
  const tiers = sortedTiers(data);
  if (!tiers.length) return '';
  const canGet = tiers.filter((t) => t.cost <= bal).pop();
  const next = tiers.find((t) => t.cost > bal);
  if (!next) return `Wow! Enough for a ${canGet.name.toLowerCase()} prize ${canGet.emoji}`;
  const need = `${plural(next.cost - bal, 'more sticker')} for a ${next.name.toLowerCase()} prize ${next.emoji}`;
  return canGet ? `Can get a ${canGet.name.toLowerCase()} prize ${canGet.emoji} · ${need}` : need;
}

/* ---------- the sticker jar (each kid picks a style in Settings; drawings live in jars.js) ---------- */
// The style is saved as a 'pref' event (events are add-only, so no device, even one running an
// older copy of the app, can erase it), and on the kid as a fallback. The latest one wins.
function jarStyleOf(kid) {
  let pick = kid.jarStyle;
  let at = '';
  for (const e of data.events) {
    if (e.type === 'pref' && e.kidId === kid.id && e.key === 'jarStyle' && e.at >= at) {
      pick = e.value;
      at = e.at;
    }
  }
  return JAR_STYLES[pick] ? pick : 'potion';
}

function jarHTML(kid, bal, styleId = jarStyleOf(kid)) {
  const tiers = sortedTiers(data);
  const top = tiers.length ? tiers[tiers.length - 1].cost : 20;
  const level = (c) => JAR_FLOOR - (Math.min(Math.max(c, 0), top * 1.3) / top) * JAR_SPAN;
  const y = level(bal);
  const from = pop && pop.kidId === kid.id ? level(pop.from) - y : 0;
  const key = (kid.id.replace(/[^\w-]/g, '') || 'k') + Math.floor(Math.random() * 1e6);

  // Prize tags sit beside the jar; nudge them apart if two costs are close together.
  const marks = (lineColor) => {
    let lastTag = Infinity;
    return tiers
      .map((t) => {
        const ty = level(t.cost);
        const tagY = Math.min(ty, lastTag - 28);
        lastTag = tagY;
        const got = bal >= t.cost;
        return `<line class="tline${got ? ' got' : ''}" x1="27" x2="193" y1="${ty}" y2="${ty}"${lineColor && !got ? ` style="stroke:${lineColor}"` : ''}/>
          <g class="tag${got ? ' got' : ''}" transform="translate(204 ${tagY})">
            <rect x="0" y="-13" width="54" height="26" rx="13"/>
            <text class="te" x="15" y="1">${t.emoji}</text><text class="tn" x="38" y="1">${t.cost}</text>
          </g>`;
      })
      .join('');
  };

  const style = JAR_STYLES[styleId] || JAR_STYLES.potion;
  return `<svg class="jar" viewBox="0 0 262 272" role="img" aria-label="${esc(kid.name)}'s ${esc(style.name.toLowerCase())}: ${Math.max(bal, 0)} stickers">
    ${style.draw({ y, from, key, color: kid.color, bal, full: bal >= top, marks, tiers, top, prevBal: pop && pop.kidId === kid.id ? pop.from : bal })}
  </svg>`;
}

function boardView() {
  const cards = data.kids
    .map((kid) => {
      const bal = balance(data, kid.id);
      return `<a class="kid-card" href="${kidHref(kid)}" style="--kid:${kid.color}">
        <div class="kid-head">
          <span class="avatar">${esc(kid.avatar)}</span>
          <span class="kid-name">${esc(kid.name)}</span>
          <span class="total"><b>${Math.max(bal, 0)}</b></span>
        </div>
        ${jarHTML(kid, bal)}
        <p class="status">${esc(statusText(bal))}</p>
      </a>`;
    })
    .join('');
  return (
    topbar('', '⭐ Sticker Board', '<button class="icon-btn" data-action="open-settings" aria-label="Parent settings">⚙️</button>') +
    `<main class="board">${cards || '<p class="empty">Tap ⚙️ to add a kid.</p>'}</main>`
  );
}

function jobPoints(kid, n) {
  return n <= 5 ? esc(kid.sticker).repeat(n) : `+${n} ${esc(kid.sticker)}`;
}

function kidView(kid) {
  const playing = play && play.kidId === kid.id;
  const bal = Math.max(balance(data, kid.id), 0) + (playing ? play.extra : 0);
  const jobs = kid.jobs.length
    ? kid.jobs
        .map(
          (j) => `<button class="job" data-action="award" data-kid="${esc(kid.id)}" data-job="${esc(j.id)}">
            <span class="job-emoji">${esc(j.emoji)}</span>
            <span class="job-name">${esc(j.name)}</span>
            <span class="job-pts">${jobPoints(kid, j.stickers)}</span>
          </button>`
        )
        .join('')
    : '<p class="empty">No jobs yet. Add some in ⚙️ settings.</p>';
  return (
    topbar(back('#/', 'Board'), `${esc(kid.avatar)} ${esc(kid.name)}`) +
    `<main class="kid-page${playing ? ' playing' : ''}" style="--kid:${kid.color}">
      <section class="kid-progress">
        ${playing ? `<p class="play-banner">🎈 Pretend stickers! Just for fun, they won't be saved.</p>` : ''}
        <div class="big-total"><b>${Math.max(bal, 0)}</b><span>${esc(kid.sticker)} ${playing ? 'pretend' : 'stickers'}</span></div>
        ${jarHTML(kid, bal)}
        <p class="status">${esc(statusText(bal))}</p>
      </section>
      <section class="jobs">
        ${playing ? `<div class="row kid-actions"><button class="btn go" data-action="play-stop">✅ Done playing</button></div>` : `<div class="row kid-actions">
          <a class="btn" href="${kidHref(kid, 'redeem')}">🎁 Get a prize</a>
          <a class="btn ghost" href="${kidHref(kid, 'wishes')}">💡 Wish list${kid.wishes.length ? ` <span class="badge">${kid.wishes.length}</span>` : ''}</a>
          <a class="btn ghost" href="${kidHref(kid, 'history')}">📜 History</a>
        </div>`}
        <div class="jobs-head"><h2>Jobs</h2>${
          playing
            ? ''
            : `<span class="jobs-fun"><a class="btn ghost small" href="${kidHref(kid, 'brush')}">🪥 Brush</a><a class="btn ghost small" href="${kidHref(kid, 'play')}">🎈 Play</a></span>`
        }</div>
        ${jobs}
      </section>
    </main>`
  );
}

function redeemView(kid) {
  const bal = Math.max(balance(data, kid.id), 0);
  const kidAttr = `data-kid="${esc(kid.id)}"`;
  const sections = sortedTiers(data)
    .map((t) => {
      const can = bal >= t.cost;
      const dis = can ? '' : 'disabled';
      const prizes = kid.prizes
        .filter((p) => p.tier === t.id)
        .map(
          (p) => `<button class="prize" data-action="redeem" ${kidAttr} data-prize="${esc(p.id)}" ${dis}>
            <span class="prize-emoji">${esc(p.emoji)}</span><span>${esc(p.name)}</span>
          </button>`
        )
        .join('');
      return `<section class="tier-card ${can ? 'can' : 'cant'}">
        <header>
          <span class="tier-emoji">${t.emoji}</span>
          <h2>${esc(t.name)} prize</h2>
          <span class="cost">${t.cost} ${esc(kid.sticker)}</span>
        </header>
        <p class="tier-status">${can ? 'You have enough! 🎉' : `${plural(t.cost - bal, 'more sticker')} to go`}</p>
        <div class="prize-list">
          ${prizes}
          <button class="prize other" data-action="redeem-other" ${kidAttr} data-tier="${t.id}" ${dis}>
            <span class="prize-emoji">✏️</span><span>Something else…</span>
          </button>
        </div>
      </section>`;
    })
    .join('');
  return (
    topbar(back(kidHref(kid), kid.name), `🎁 Prizes`) +
    `<main class="redeem-page" style="--kid:${kid.color}">
      <p class="have">${esc(kid.name)} has <b>${bal}</b> ${esc(kid.sticker)}</p>
      ${sections}
    </main>`
  );
}

function wishesView(kid) {
  const k = `data-kid="${esc(kid.id)}"`;
  const tiers = sortedTiers(data);
  const searchBtn = (name) =>
    `<button class="icon-btn small" data-action="search" data-q="${esc(name)}" aria-label="Look up ${esc(name)} in stores">🔍</button>`;

  const waiting = kid.wishes
    .map(
      (w) => `<div class="wish">
        <button class="emoji-btn" data-action="pick-emoji" data-target="item" ${k} data-list="wishes" data-item="${esc(w.id)}" aria-label="Change icon for ${esc(w.name)}">${esc(w.emoji)}</button>
        <span class="wish-name">${esc(w.name)}</span>
        ${searchBtn(w.name)}
        <button class="btn go small" data-action="approve-wish" ${k} data-item="${esc(w.id)}">✓ Add</button>
        <button class="icon-btn small" data-action="del-wish" ${k} data-item="${esc(w.id)}" aria-label="Remove ${esc(w.name)}">✕</button>
      </div>`
    )
    .join('');

  const list = tiers
    .map((t) => {
      const ps = kid.prizes.filter((p) => p.tier === t.id);
      if (!ps.length) return '';
      return `<h3>${t.emoji} ${esc(t.name)} · ${t.cost} ${esc(kid.sticker)}</h3>
        ${ps.map((p) => `<div class="wish"><span class="wish-emoji">${esc(p.emoji)}</span><span class="wish-name">${esc(p.name)}</span>${searchBtn(p.name)}</div>`).join('')}`;
    })
    .join('');

  const gallery = tiers
    .map((t) => {
      const ideas = (IDEAS[t.id] || [])
        .map(([name, emoji]) => {
          const on = onWishList(kid, name);
          return `<button class="idea${on ? ' on' : ''}" data-action="add-idea" ${k} data-name="${esc(name)}" data-emoji="${esc(emoji)}" data-tier="${t.id}" ${on ? 'disabled' : ''}>
            <span class="prize-emoji">${esc(emoji)}</span><span>${esc(name)}</span>${on ? '<span class="idea-on">✓ On the list</span>' : ''}
          </button>`;
        })
        .join('');
      return ideas ? `<h3>${t.emoji} ${esc(t.name)} ideas</h3><div class="idea-grid">${ideas}</div>` : '';
    })
    .join('');

  return (
    topbar(back(kidHref(kid), kid.name), `💡 ${esc(kid.name)}'s wishes`) +
    `<main class="wishes-page" style="--kid:${kid.color}">
      <section class="panel">
        <h2>Add an idea</h2>
        <p class="hint">What would you like to work toward? Tap 🎤 on the keyboard to say it out loud.</p>
        <form id="wish-form" class="wish-form" ${k}>
          <input class="field" maxlength="60" placeholder="e.g. Dinosaur Lego" aria-label="Your idea" autocomplete="off" required>
          <button class="btn">Add</button>
        </form>
      </section>
      ${
        waiting
          ? `<section class="panel"><h2>Waiting for a grown-up</h2>
              <p class="hint">Grown-ups: tap ✓ Add to put it on the wish list and pick its size, or 🔍 to look it up.</p>
              <div class="items">${waiting}</div></section>`
          : ''
      }
      <section class="panel"><h2>${esc(kid.name)}'s wish list</h2>
        ${list ? `<div class="items">${list}</div>` : '<p class="hint">Nothing yet. Add an idea above!</p>'}
      </section>
      <section class="panel"><h2>Need ideas?</h2>
        <p class="hint">Tap one to add it. A grown-up will check it.</p>
        ${gallery}
      </section>
    </main>`
  );
}

function fmtDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function historyView(kid) {
  const undone = undoneIds(data);
  const evs = data.events
    .filter((e) => e.kidId === kid.id && isHistoryEntry(e))
    .sort((a, b) => b.at.localeCompare(a.at));
  let earned = 0, spent = 0, prizes = 0;
  for (const e of evs) {
    if (undone.has(e.id)) continue;
    if (e.type === 'earn') earned += e.amount;
    else { spent += e.amount; prizes++; }
  }
  const sel = selecting?.kidId === kid.id ? selecting.ids : null;
  const hiddenUndone = evs.filter((e) => shownInHistory(e) && undone.has(e.id)).length;
  const shown = evs.filter((e) => shownInHistory(e) && (showUndone || !undone.has(e.id)));
  // A heading for each day. While picking, each day gets a button that picks (or unpicks) all of its entries.
  const dayHead = (day) => {
    const live = shown.filter((e) => localDate(new Date(e.at)) === day && !undone.has(e.id));
    const label = new Date(day + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    const all = sel && live.length && live.every((e) => sel.has(e.id));
    const btn = sel && live.length
      ? `<button class="btn ghost small" data-action="pick-day" data-day="${day}">${all ? 'Unpick this day' : `Pick all ${live.length}`}</button>`
      : '';
    return `<li class="day-head"><span>${day === localDate() ? 'Today' : esc(label)}</span>${btn}</li>`;
  };
  let lastDay = null;
  const rows = shown
    .map((e) => {
      const day = localDate(new Date(e.at));
      const head = day !== lastDay ? dayHead(day) : '';
      lastDay = day;
      return head + evRow(e);
    })
    .join('');
  function evRow(e) {
      const u = undone.has(e.id);
      if (sel) {
        const picked = !u && sel.has(e.id);
        return `<li class="ev ${e.type}${u ? ' undone' : ''}${picked ? ' picked' : ''}"${u ? '' : ` data-action="toggle-pick" data-event="${esc(e.id)}"`}>
          <span class="pick" aria-hidden="true">${picked ? '✓' : ''}</span>
          <span class="ev-emoji">${esc(e.emoji || (e.type === 'earn' ? '⭐' : '🎁'))}</span>
          <div class="ev-main">
            <div class="ev-label">${e.type === 'redeem' ? 'Prize: ' : ''}${esc(e.label)}</div>
            <div class="ev-date">${fmtDate(e.at)}${u ? ' · undone' : ''}</div>
          </div>
          <span class="ev-amt">${e.type === 'earn' ? '+' : '−'}${e.amount}</span>
        </li>`;
      }
      return `<li class="ev ${e.type}${u ? ' undone' : ''}">
        <span class="ev-emoji">${esc(e.emoji || (e.type === 'earn' ? '⭐' : '🎁'))}</span>
        <div class="ev-main">
          <div class="ev-label">${e.type === 'redeem' ? 'Prize: ' : ''}${esc(e.label)}</div>
          <div class="ev-date">${fmtDate(e.at)}${u ? ' · undone' : ''}</div>
        </div>
        <span class="ev-amt">${e.type === 'earn' ? '+' : '−'}${e.amount}</span>
        ${u ? '' : `<button class="btn ghost small" data-action="undo" data-event="${esc(e.id)}">Undo</button>`}
      </li>`;
  }
  return (
    topbar(back(kidHref(kid), kid.name), `📜 ${esc(kid.name)}'s history`) +
    `<main class="history" style="--kid:${kid.color}">
      <div class="summary">
        <div class="stat"><b>${earned}</b>stickers earned</div>
        <div class="stat"><b>${prizes}</b>${prizes === 1 ? 'prize' : 'prizes'} redeemed</div>
        <div class="stat"><b>${Math.max(earned - spent, 0)}</b>stickers now</div>
      </div>
      ${
        !evs.length
          ? ''
          : sel
            ? `<div class="select-bar">
                <span class="sel-count">${plural(sel.size, 'entry').replace('entrys', 'entries')} picked</span>
                ${sel.size ? '<button class="btn ghost small" data-action="pick-none">Clear</button>' : ''}
                <button class="btn ghost small" data-action="select-cancel">Cancel</button>
                <button class="btn danger small" data-action="undo-selected" ${sel.size ? '' : 'disabled'}>↩️ Undo ${sel.size || ''}</button>
              </div>`
            : `<div class="row start"><button class="btn ghost small" data-action="select-mode" data-kid="${esc(kid.id)}">☑️ Undo several at once</button></div>`
      }
      ${
        evs.length
          ? `<div class="filters" role="group" aria-label="Show">${[
              ['all', 'Everything'],
              ['earn', '⭐ Stickers earned'],
              ['redeem', '🎁 Prizes'],
            ]
              .map(([f, label]) => `<button class="chip${historyFilter === f ? ' on' : ''}" data-action="history-filter" data-filter="${f}" aria-pressed="${historyFilter === f}">${label}</button>`)
              .join('')}</div>`
          : ''
      }
      ${
        rows
          ? `<ul class="ev-list">${rows}</ul>`
          : evs.length
            ? `<p class="empty">${historyFilter === 'redeem' ? 'No prizes yet.' : 'No stickers earned yet.'}</p>`
            : '<p class="empty">Nothing yet. Go earn some stickers! ⭐</p>'
      }
      ${hiddenUndone ? `<button class="btn ghost small show-undone" data-action="toggle-undone">${
        showUndone ? 'Hide undone' : `Show ${hiddenUndone} undone`
      }</button>` : ''}
    </main>`
  );
}

function lastBackupHTML() {
  const at = data.settings.lastBackupAt;
  if (!at) return '<p class="backup-status warn">No backup yet</p>';
  const days = Math.floor((Date.now() - Date.parse(at)) / 86400000);
  const when = new Date(at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `<p class="backup-status${days >= 30 ? ' warn' : ''}">Last backup: ${when} (${days > 0 ? plural(days, 'day') + ' ago' : 'today'})</p>`;
}

function kidSettings(kid) {
  const k = `data-kid="${esc(kid.id)}"`;
  const ref = (list, item) => `${k} data-list="${list}" data-item="${esc(item.id)}"`;
  const del = (list, item) =>
    `<button class="icon-btn small" data-action="del-item" ${ref(list, item)} aria-label="Remove ${esc(item.name)}">🗑️</button>`;
  const tierOptions = (cur) =>
    sortedTiers(data).map((t) => `<option value="${t.id}"${cur === t.id ? ' selected' : ''}>${t.emoji} ${esc(t.name)}</option>`).join('');

  const jobs = kid.jobs
    .map(
      (j) => `<div class="item">
        <button class="emoji-btn" data-action="pick-emoji" data-target="item" ${ref('jobs', j)} aria-label="Change icon for ${esc(j.name)}">${esc(j.emoji)}</button>
        <input class="field name-in" data-field="item-name" ${ref('jobs', j)} value="${esc(j.name)}" aria-label="Job name">
        <label class="num"><input class="field" type="number" inputmode="numeric" min="1" max="99" data-field="item-stickers" ${ref('jobs', j)} value="${j.stickers}" aria-label="Stickers">${esc(kid.sticker)}</label>
        ${del('jobs', j)}
      </div>`
    )
    .join('');
  const prizes = kid.prizes
    .map(
      (p) => `<div class="item">
        <button class="emoji-btn" data-action="pick-emoji" data-target="item" ${ref('prizes', p)} aria-label="Change icon for ${esc(p.name)}">${esc(p.emoji)}</button>
        <input class="field name-in" data-field="item-name" ${ref('prizes', p)} value="${esc(p.name)}" aria-label="Prize name">
        <select class="field" data-field="item-tier" ${ref('prizes', p)} aria-label="Prize size">${tierOptions(p.tier)}</select>
        <button class="icon-btn small" data-action="search" data-q="${esc(p.name)}" aria-label="Look up ${esc(p.name)} in stores">🔍</button>
        ${del('prizes', p)}
      </div>`
    )
    .join('');

  return `<section class="panel kid-panel" style="--kid:${kid.color}">
    <h2>${esc(kid.avatar)} ${esc(kid.name)}</h2>
    <div class="kid-fields">
      <label>Name<input class="field" data-field="kid-name" ${k} value="${esc(kid.name)}"></label>
      <label>Picture<button class="emoji-btn" data-action="pick-emoji" data-target="avatar" ${k} aria-label="Change ${esc(kid.name)}'s picture">${esc(kid.avatar)}</button></label>
      <label>Sticker<button class="emoji-btn" data-action="pick-emoji" data-target="sticker" ${k} aria-label="Change ${esc(kid.name)}'s sticker">${esc(kid.sticker)}</button></label>
    </div>
    <h3>Jar style</h3>
    <div class="style-picks">${Object.entries(JAR_STYLES)
      .map(
        ([id, s]) => `<button class="style-pick${id === jarStyleOf(kid) ? ' on' : ''}" data-action="set-style" ${k} data-style="${id}" aria-pressed="${id === jarStyleOf(kid)}">
          ${jarHTML(kid, Math.round((sortedTiers(data).at(-1)?.cost || 20) * 0.6), id)}<span>${esc(s.name)}</span>
        </button>`
      )
      .join('')}</div>
    <h3>Color</h3>
    <div class="potion-row">
      <div class="jar-preview">${jarHTML(kid, balance(data, kid.id))}</div>
      <div class="swatches">
        ${POTION_COLORS.map(
          (c) => `<button class="swatch${c.toLowerCase() === kid.color.toLowerCase() ? ' on' : ''}" style="background:${c}" data-action="set-color" ${k} data-color="${c}" aria-label="Jar color ${c}"></button>`
        ).join('')}
        <label class="swatch custom" title="Pick any color"><input type="color" data-field="kid-color" ${k} value="${kid.color}" aria-label="Pick any jar color">🎨</label>
      </div>
    </div>
    <p class="hint">Icons pick themselves from the name you type. Tap an icon to choose a different one.</p>
    <h3>Jobs</h3>
    <div class="items">${jobs || '<p class="hint">No jobs yet.</p>'}</div>
    <button class="btn ghost small" data-action="add-item" ${k} data-list="jobs">＋ Add job</button>
    <h3>Prize wish list</h3>
    ${
      kid.wishes.length
        ? `<a class="btn small review" href="${kidHref(kid, 'wishes')}">💡 ${plural(kid.wishes.length, 'new idea')} from ${esc(kid.name)} to review</a>`
        : ''
    }
    <div class="items">${prizes || '<p class="hint">No prizes yet.</p>'}</div>
    <button class="btn ghost small" data-action="add-item" ${k} data-list="prizes">＋ Add prize</button>
    <div class="danger-zone"><button class="btn danger small" data-action="del-kid" ${k}>Remove ${esc(kid.name)}</button></div>
  </section>`;
}

function settingsView() {
  const tiers = sortedTiers(data)
    .map(
      (t) => `<label class="tier-row">
        <span class="tier-emoji">${t.emoji}</span>
        <span class="tier-name">${esc(t.name)}</span>
        <input class="field" type="number" inputmode="numeric" min="1" max="999" value="${t.cost}" data-field="tier-cost" data-tier="${t.id}">
        <span>stickers</span>
      </label>`
    )
    .join('');
  return (
    topbar('<a class="btn ghost back" href="#/">✓ Done</a>', '⚙️ Parent settings') +
    `<main class="settings">
      <p class="hint center">Changes save as soon as you make them.</p>
      <section class="panel">
        <h2>Prize tiers</h2>
        <p class="hint">How many stickers each size of prize costs.</p>
        <div class="tier-rows">${tiers}</div>
      </section>
      ${data.kids.map(kidSettings).join('')}
      <section class="panel center"><button class="btn ghost" data-action="add-kid">＋ Add a kid</button></section>
      <section class="panel">
        <h2>Grown-up lock</h2>
        <p class="hint">The PIN is needed to award stickers, redeem prizes and open settings. After you enter it, it stays unlocked for ${UNLOCK_MINUTES} minutes.</p>
        <button class="btn ghost small" data-action="change-pin">Change PIN</button>
        <label class="check"><input type="checkbox" data-field="sound" ${data.settings.sound ? 'checked' : ''}> Play a sound when stickers are awarded</label>
      </section>
      <section class="panel">
        <h2>🪥 Brushing and play</h2>
        <label class="tier-row">How long to brush
          <select class="field" data-field="brush-seconds">${[60, 90, 120, 150, 180]
            .map((s) => `<option value="${s}"${(data.settings.brushSeconds || 60) === s ? ' selected' : ''}>${s % 60 ? `${Math.floor(s / 60)}½` : s / 60} minute${s === 60 ? '' : 's'}</option>`)
            .join('')}</select>
        </label>
        <label class="check"><input type="checkbox" data-field="speak" ${speechOn() ? 'checked' : ''}> Speak game instructions out loud on this iPad</label>
      </section>
      ${syncPanelHTML()}
      <section class="panel">
        <h2>Backup</h2>
        <p class="hint">${
          store.auth
            ? 'The board syncs through your Firebase account. Export a backup now and then as an extra safety net.'
            : 'Everything is saved on this device only. Export a backup now and then, and always before moving to a new device or the synced version.'
        }</p>
        ${lastBackupHTML()}
        <div class="row start">
          <button class="btn" data-action="export">⬇️ Export backup</button>
          <button class="btn ghost" data-action="import">⬆️ Import backup</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </section>
    </main>`
  );
}

function syncPanelHTML() {
  if (store.syncUnavailable) {
    return `<section class="panel"><h2>☁️ Syncing</h2>
      <p class="backup-status warn">Sync couldn't start, probably because there's no internet. This is the last synced copy, and changes are paused. Connect to the internet and reopen the app.</p></section>`;
  }
  if (!store.auth) return '';
  return `<section class="panel"><h2>☁️ Syncing</h2>
    <p class="hint">Changes show up on every signed-in device within a few seconds. Without internet, changes are kept and sent once it reconnects.</p>
    <p class="backup-status">Signed in as ${esc(store.auth.user?.email || '')}</p>
    <button class="btn ghost small" data-action="sign-out">Sign out of this device</button></section>`;
}

/* ---------- sign-in (only when syncing is turned on) ---------- */
function authMessage(err) {
  const code = err?.code || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code)) return "That email or password didn't work.";
  if (/too-many-requests/.test(code)) return 'Too many tries. Wait a minute, then try again.';
  if (/network-request-failed/.test(code)) return 'No internet connection. Connect and try again.';
  return 'Sign-in failed. Please try again.';
}

function showSignIn(message = '', email = '') {
  window.__appStarted = true;
  app.innerHTML = `<main class="signin">
    <div class="panel signin-card">
      <div class="signin-logo">🧪</div>
      <h1>Sticker Board</h1>
      <p class="hint">Grown-ups: sign in once on this device to sync the board between your devices.</p>
      <form id="signin-form">
        <label>Email<input class="field wide" type="email" name="email" autocomplete="username" value="${esc(email)}" required></label>
        <label>Password<input class="field wide" type="password" name="password" autocomplete="current-password" required></label>
        <p class="err"${message ? '' : ' hidden'}>${esc(message)}</p>
        <button class="btn go wide-btn">Sign in</button>
      </form>
      <button type="button" class="link" id="forgot-pw">Forgot password?</button>
    </div>
  </main>`;
  const form = document.getElementById('signin-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      await store.auth.signIn(form.email.value, form.password.value);
      await startBoard();
    } catch (err) {
      console.error(err);
      showSignIn(authMessage(err), form.email.value);
    }
  };
  document.getElementById('forgot-pw').onclick = async () => {
    const addr = form.email.value.trim();
    if (!addr) return showSignIn('Type your email above first, then tap “Forgot password?”.');
    try {
      await store.auth.sendReset(addr);
      showSignIn(`If ${addr} has an account, a reset email is on its way.`, addr);
    } catch (err) {
      showSignIn(authMessage(err), addr);
    }
  };
}

actions['sign-out'] = async () => {
  const ok = await confirmDialog(
    'Sign out?',
    'This device will stop showing the synced board until a grown-up signs in again. Nothing is deleted.',
    'Sign out',
    true
  );
  if (!ok) return;
  await store.auth.signOut();
  location.hash = '#/';
  location.reload();
};

/* ---------- Play: toothbrush timer, games, playing together (see fun.js) ---------- */
const fun = createFun({
  app,
  store,
  esc,
  uid,
  kidById,
  kidHref,
  topbar,
  back,
  celebrate,
  chime,
  requireParent,
  award,
  data: () => data,
  topCost: () => sortedTiers(data).at(-1)?.cost || 20,
  // Draw a kid's jar at `bal` stickers, rising from `from` if given.
  jarHTML(kid, bal, from) {
    pop = from == null ? null : { kidId: kid.id, from };
    const html = jarHTML(kid, bal);
    pop = null;
    return html;
  },
});

/* ---------- routing ---------- */
function parseRoute() {
  try {
    const [view = 'board', id, sub, arg] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    return { view, id, sub, arg };
  } catch {
    return { view: 'board' };
  }
}

function render() {
  if (!data) return; // still signing in
  const r = parseRoute();
  const kid = r.view === 'kid' ? kidById(r.id) : null;
  if (!(kid && r.sub === 'history' && selecting?.kidId === kid.id)) selecting = null;
  if (!(kid && r.sub === 'history')) {
    historyFilter = 'all';
    showUndone = false;
  }
  if (play && !(kid && kid.id === play.kidId && !r.sub)) play = null; // left the kid's page: pretend stickers go away
  if (kid && fun.isRoute(r.sub)) {
    fun.render(kid, r); // Play screens draw themselves (see fun.js)
    window.__appStarted = true;
    pop = null;
    return;
  }
  fun.leave();
  let html;
  if (kid) {
    const views = { redeem: redeemView, history: historyView, wishes: wishesView };
    html = (views[r.sub] || kidView)(kid);
  }
  else if (r.view === 'settings') {
    if (!isUnlocked()) {
      location.hash = '#/';
      return;
    }
    html = settingsView();
  } else html = boardView();
  app.innerHTML = html;
  window.__appStarted = true; // tells index.html the app is up, so it won't show its "didn't load" screen
  pop = null;
}

/* ---------- start ---------- */
// When another device changes the board, wait until the parent finishes typing or closes a dialog.
let renderWaiting = false;
function renderWhenIdle() {
  const a = document.activeElement;
  if ((a && app.contains(a) && a.matches('input, select, textarea')) || !modalRoot.hidden) {
    renderWaiting = true;
    return;
  }
  renderWaiting = false;
  render();
}
const retryRender = () => setTimeout(() => renderWaiting && renderWhenIdle(), 0);
app.addEventListener('focusout', retryRender);
new MutationObserver(() => modalRoot.hidden && retryRender()).observe(modalRoot, { attributes: true, attributeFilter: ['hidden'] });

async function startBoard() {
  let saved = null;
  try {
    saved = await store.load();
  } catch (err) {
    console.error('Could not read saved data', err);
  }
  if (!saved && store.loadFailed) {
    // Couldn't reach the synced board and this device has no copy yet. Never start a blank board here:
    // saving it would replace the real one once the internet is back.
    app.innerHTML = `<main class="start-fail"><div class="panel center">
      <p class="start-emoji">📶</p><h2>The sticker board needs the internet</h2>
      <p class="hint">This iPad hasn't loaded the board yet. Connect to Wi-Fi, then tap Try again.</p>
      <button class="btn" onclick="location.reload()">Try again</button></div></main>`;
    window.__appStarted = true;
    return;
  }
  const firstUpload = !saved && store.remoteEmpty;
  if (firstUpload) saved = await store.localCopy().catch(() => null); // this device's board from before syncing
  try {
    data = saved ? normalize(saved) : defaultData();
  } catch (err) {
    console.error('Saved data was unreadable', err);
    data = defaultData();
  }
  render();

  if (firstUpload) {
    const summary = data.kids.map((k) => `${k.name} ${Math.max(balance(data, k.id), 0)}`).join(', ');
    const ok = await confirmDialog(
      'Start syncing',
      `There's no synced board yet. Use the board on this device (${summary}) as the starting point for every device?`,
      'Use this board'
    );
    if (!ok) {
      data = defaultData();
      render();
      toast('Starting fresh. To use a backup instead: ⚙️ Settings → Import backup.');
    } else toast('☁️ Syncing is on');
    await commit({ replace: true });
  } else if (!saved || saved.schemaVersion !== data.schemaVersion) await commit();

  store.onChange((doc) => {
    try {
      data = normalize(doc);
      renderWhenIdle();
    } catch (err) {
      console.error(err);
    }
  });
  if (store.syncUnavailable) toast("⚠️ Sync couldn't start. Connect to the internet and reopen the app.");
  if (!funStarted) {
    funStarted = true;
    fun.start(); // stickers sent between the kids' iPads
  }
}
let funStarted = false;

async function init() {
  // A save the cloud refused (e.g. a permissions rule) would otherwise only show up later as a lost change.
  window.addEventListener('sync-error', (e) => {
    const code = e.detail?.code ? ` (${e.detail.code})` : '';
    toast(`⚠️ That change didn't reach the cloud${code}. It may not stay.`);
  });
  window.addEventListener('hashchange', () => {
    render();
    window.scrollTo(0, 0);
  });
  // iPad keeps the app suspended in the background for days, so it can keep running an old copy.
  // After a long time away, reload on return: that picks up any update (and the latest board).
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt > RELOAD_AFTER_AWAY_MS && modalRoot.hidden) {
      location.reload();
      return;
    }
    if (unlockedUntil && !isUnlocked()) {
      unlockedUntil = 0;
      render();
    }
  });
  if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error('Offline support unavailable', err));
  }

  if (store.auth && !(await store.auth.ready())) return showSignIn();
  await startBoard();
}

init();
