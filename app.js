/*
 * app.js — screens and interactions. Never touches storage directly; it goes through store.js.
 */
import store from './store.js';
import { defaultData, normalize, balance, undoneIds, sortedTiers, uid } from './model.js';

const UNLOCK_MINUTES = 5;
const app = document.getElementById('app');
const modalRoot = document.getElementById('modal');
const toastEl = document.getElementById('toast');

let data;
let unlockedUntil = 0;
let lockTimer = null;
let pop = null; // which sticker cells to animate on the next render

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

async function commit() {
  try {
    await store.save(data);
  } catch (err) {
    console.error(err);
    toast("⚠️ Couldn't save. Try exporting a backup.");
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

    s.addEventListener('click', async (e) => {
      const k = e.target.closest('[data-k]')?.dataset.k;
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
    });
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
function openModal(html) {
  modalRoot.innerHTML = `<div class="backdrop"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
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
async function award(kid, job) {
  if (!kid || !job) return;
  if (!(await requireParent())) return;
  const before = Math.max(balance(data, kid.id), 0);
  const ev = { id: uid(), type: 'earn', kidId: kid.id, amount: job.stickers, label: job.name, emoji: job.emoji, at: nowIso() };
  data.events.push(ev);
  await commit();
  pop = { kidId: kid.id, from: before, to: before + job.stickers };
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
  const ev = { id: uid(), type: 'redeem', kidId: kid.id, amount: tier.cost, label, emoji, tier: tier.id, at: nowIso() };
  data.events.push(ev);
  await commit();
  location.hash = kidHref(kid);
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
  const entries = incoming.events.filter((e) => e.type !== 'undo').length;
  const names = incoming.kids.map((k) => k.name).join(' & ') || 'no kids';
  const ok = await confirmDialog(
    'Replace everything?',
    `This replaces all kids, jobs, prizes and history here with the backup (${names}, ${plural(entries, 'history entry').replace('entrys', 'entries')}). This can't be undone.`,
    'Replace',
    true
  );
  if (!ok) return;
  data = incoming;
  await commit();
  render();
  toast('✅ Backup imported');
}

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
    award(k, k?.jobs.find((j) => j.id === job));
  },
  undo: ({ event }) => undo(event),
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
        ? { id: uid(), name: 'New job', emoji: '✅', stickers: 1 }
        : { id: uid(), name: 'New prize', emoji: '🎁', tier: 'small' };
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
    data.kids.push({ id: uid(), name: 'New kid', avatar: '🙂', sticker: '⭐', color: '#f97316', jobs: [], prizes: [] });
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
    await commit();
    render();
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
    case 'kid-color': kid.color = t.value; break;
    case 'item-name': item.name = t.value.trim() || item.name; t.value = item.name; break;
    case 'item-emoji': item.emoji = firstGrapheme(t.value) || item.emoji; t.value = item.emoji; break;
    case 'item-stickers': {
      const n = toInt(t.value, 1, 99);
      if (n != null) item.stickers = n;
      t.value = item.stickers;
      break;
    }
    case 'item-tier': item.tier = t.value; break;
    case 'sound': data.settings.sound = t.checked; break;
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

function gridHTML(kid, bal) {
  const tiers = sortedTiers(data);
  const top = tiers.length ? tiers[tiers.length - 1].cost : 20;
  const shown = Math.max(bal, 0);
  const most = Math.max(top, shown);
  const cols = most > 30 ? 10 : 5;
  const n = Math.ceil(most / cols) * cols;
  const p = pop && pop.kidId === kid.id ? pop : null;
  let cells = '';
  for (let i = 0; i < n; i++) {
    const filled = i < shown;
    const tier = tiers.find((t) => t.cost === i + 1);
    const isNew = p && i >= p.from && i < p.to;
    cells += `<div class="cell${filled ? ' filled' : ''}${tier ? ' tier' : ''}${isNew ? ' pop' : ''}"${
      isNew ? ` style="animation-delay:${(i - p.from) * 140}ms"` : ''
    }>${filled ? `<span class="stk">${esc(kid.sticker)}</span>` : ''}${
      tier ? `<span class="tier-badge" title="${esc(tier.name)} prize">${tier.emoji}</span>` : ''
    }</div>`;
  }
  return `<div class="grid cols-${cols}">${cells}</div>`;
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
        ${gridHTML(kid, bal)}
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
  const bal = balance(data, kid.id);
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
    `<main class="kid-page" style="--kid:${kid.color}">
      <section class="kid-progress">
        <div class="big-total"><b>${Math.max(bal, 0)}</b><span>${esc(kid.sticker)} stickers</span></div>
        ${gridHTML(kid, bal)}
        <p class="status">${esc(statusText(bal))}</p>
      </section>
      <section class="jobs">
        <div class="row kid-actions">
          <a class="btn" href="${kidHref(kid, 'redeem')}">🎁 Get a prize</a>
          <a class="btn ghost" href="${kidHref(kid, 'history')}">📜 History</a>
        </div>
        <h2>Jobs</h2>
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

function fmtDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function historyView(kid) {
  const undone = undoneIds(data);
  const evs = data.events
    .filter((e) => e.kidId === kid.id && e.type !== 'undo')
    .sort((a, b) => b.at.localeCompare(a.at));
  let earned = 0, spent = 0, prizes = 0;
  for (const e of evs) {
    if (undone.has(e.id)) continue;
    if (e.type === 'earn') earned += e.amount;
    else { spent += e.amount; prizes++; }
  }
  const rows = evs
    .map((e) => {
      const u = undone.has(e.id);
      return `<li class="ev ${e.type}${u ? ' undone' : ''}">
        <span class="ev-emoji">${esc(e.emoji || (e.type === 'earn' ? '⭐' : '🎁'))}</span>
        <div class="ev-main">
          <div class="ev-label">${e.type === 'redeem' ? 'Prize: ' : ''}${esc(e.label)}</div>
          <div class="ev-date">${fmtDate(e.at)}${u ? ' · undone' : ''}</div>
        </div>
        <span class="ev-amt">${e.type === 'earn' ? '+' : '−'}${e.amount}</span>
        ${u ? '' : `<button class="btn ghost small" data-action="undo" data-event="${esc(e.id)}">Undo</button>`}
      </li>`;
    })
    .join('');
  return (
    topbar(back(kidHref(kid), kid.name), `📜 ${esc(kid.name)}'s history`) +
    `<main class="history" style="--kid:${kid.color}">
      <div class="summary">
        <div class="stat"><b>${earned}</b>stickers earned</div>
        <div class="stat"><b>${prizes}</b>${prizes === 1 ? 'prize' : 'prizes'} redeemed</div>
        <div class="stat"><b>${Math.max(earned - spent, 0)}</b>stickers now</div>
      </div>
      ${rows ? `<ul class="ev-list">${rows}</ul>` : '<p class="empty">Nothing yet. Go earn some stickers! ⭐</p>'}
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
        <input class="field emoji-in" data-field="item-emoji" ${ref('jobs', j)} value="${esc(j.emoji)}" aria-label="Job picture">
        <input class="field name-in" data-field="item-name" ${ref('jobs', j)} value="${esc(j.name)}" aria-label="Job name">
        <label class="num"><input class="field" type="number" inputmode="numeric" min="1" max="99" data-field="item-stickers" ${ref('jobs', j)} value="${j.stickers}" aria-label="Stickers">${esc(kid.sticker)}</label>
        ${del('jobs', j)}
      </div>`
    )
    .join('');
  const prizes = kid.prizes
    .map(
      (p) => `<div class="item">
        <input class="field emoji-in" data-field="item-emoji" ${ref('prizes', p)} value="${esc(p.emoji)}" aria-label="Prize picture">
        <input class="field name-in" data-field="item-name" ${ref('prizes', p)} value="${esc(p.name)}" aria-label="Prize name">
        <select class="field" data-field="item-tier" ${ref('prizes', p)} aria-label="Prize size">${tierOptions(p.tier)}</select>
        ${del('prizes', p)}
      </div>`
    )
    .join('');

  return `<section class="panel kid-panel" style="--kid:${kid.color}">
    <h2>${esc(kid.avatar)} ${esc(kid.name)}</h2>
    <div class="kid-fields">
      <label>Name<input class="field" data-field="kid-name" ${k} value="${esc(kid.name)}"></label>
      <label>Picture<input class="field emoji-in" data-field="kid-avatar" ${k} value="${esc(kid.avatar)}"></label>
      <label>Sticker<input class="field emoji-in" data-field="kid-sticker" ${k} value="${esc(kid.sticker)}"></label>
      <label>Color<input type="color" data-field="kid-color" ${k} value="${kid.color}"></label>
    </div>
    <h3>Jobs</h3>
    <div class="items">${jobs || '<p class="hint">No jobs yet.</p>'}</div>
    <button class="btn ghost small" data-action="add-item" ${k} data-list="jobs">＋ Add job</button>
    <h3>Prize wish list</h3>
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
        <h2>Backup</h2>
        <p class="hint">Everything is saved on this device only. Export a backup now and then, and always before moving to a new device or the synced version.</p>
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

/* ---------- routing ---------- */
function parseRoute() {
  try {
    const [view = 'board', id, sub] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    return { view, id, sub };
  } catch {
    return { view: 'board' };
  }
}

function render() {
  const r = parseRoute();
  const kid = r.view === 'kid' ? kidById(r.id) : null;
  let html;
  if (kid) html = r.sub === 'redeem' ? redeemView(kid) : r.sub === 'history' ? historyView(kid) : kidView(kid);
  else if (r.view === 'settings') {
    if (!isUnlocked()) {
      location.hash = '#/';
      return;
    }
    html = settingsView();
  } else html = boardView();
  app.innerHTML = html;
  pop = null;
}

/* ---------- start ---------- */
async function init() {
  let saved = null;
  try {
    saved = await store.load();
  } catch (err) {
    console.error('Could not read saved data', err);
  }
  try {
    data = saved ? normalize(saved) : defaultData();
  } catch (err) {
    console.error('Saved data was unreadable', err);
    data = defaultData();
  }
  if (!saved) await commit();

  window.addEventListener('hashchange', () => {
    render();
    window.scrollTo(0, 0);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && unlockedUntil && !isUnlocked()) {
      unlockedUntil = 0;
      render();
    }
  });
  store.onChange((doc) => {
    try {
      data = normalize(doc);
      render();
    } catch (err) {
      console.error(err);
    }
  });
  render();

  if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error('Offline support unavailable', err));
  }
}

init();
