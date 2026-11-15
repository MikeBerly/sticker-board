/*
 * model.js — the shape of the data, starter data, and the math (totals).
 *
 * Document shape:
 * {
 *   schemaVersion: 1,
 *   settings: { tiers: [{id, name, emoji, cost}], pinHash, sound, lastBackupAt },
 *   kids: [{ id, name, avatar, sticker, color,
 *            jobs:   [{ id, name, emoji, stickers }],
 *            prizes: [{ id, name, emoji, tier }] }],
 *   events: [ { id, type: 'earn' | 'redeem', kidId, amount, label, emoji, tier?, at }
 *           | { id, type: 'undo', ref, kidId, at } ]
 * }
 *
 * Totals are never stored: a kid's total = earned − redeemed, skipping undone events.
 */

export const SCHEMA_VERSION = 1;

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

const DEFAULT_TIERS = [
  { id: 'small', name: 'Small', emoji: '🍬', cost: 5 },
  { id: 'medium', name: 'Medium', emoji: '🎁', cost: 10 },
  { id: 'large', name: 'Large', emoji: '🏆', cost: 20 },
];

export function defaultData() {
  const job = (name, emoji, stickers) => ({ id: uid(), name, emoji, stickers });
  const prize = (name, emoji, tier) => ({ id: uid(), name, emoji, tier });
  const starterPrizes = () => [
    prize('Treat', '🍭', 'small'),
    prize('Small toy', '🪀', 'medium'),
    prize('Big toy', '🧸', 'large'),
  ];
  const kids = [
      {
        id: uid(), name: 'Shae', startingStickers: 15, avatar: '🌈', sticker: '⭐', color: '#8b5cf6',
        jobs: [
          job('Brush teeth – morning ☀️', '🪥', 1),
          job('Brush teeth – night 🌙', '🪥', 1),
          job('Go to before care', '🏫', 3),
        ],
        prizes: starterPrizes(),
      },
      {
        id: uid(), name: 'Ellis', startingStickers: 22, avatar: '🚀', sticker: '🌟', color: '#0ea5e9',
        jobs: [
          job('Brush teeth – morning ☀️', '🪥', 2),
          job('Brush teeth – night 🌙', '🪥', 2),
          job('Go to before care', '🏫', 3),
        ],
        prizes: starterPrizes(),
      },
  ];
  const at = new Date().toISOString();
  // Stickers each kid already had on the old paper chart.
  const events = kids.map((k) => ({
    id: uid(), type: 'earn', kidId: k.id, amount: k.startingStickers, label: 'Stickers from before', emoji: '📋', at,
  }));
  kids.forEach((k) => delete k.startingStickers);
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { tiers: DEFAULT_TIERS.map((t) => ({ ...t })), pinHash: null, sound: true, lastBackupAt: null },
    kids,
    events,
  };
}

/** Cleans up a saved or imported document so the app can trust it. Throws if it isn't one. */
export function normalize(raw) {
  if (!raw || typeof raw !== 'object') throw new Error("That isn't a sticker board backup.");
  const d = raw.app === 'sticker-board' && raw.data ? raw.data : raw;
  if (!Array.isArray(d.kids)) throw new Error("That isn't a sticker board backup.");

  const str = (v, fallback = '') => (typeof v === 'string' && v.trim() ? v : fallback);
  const int = (v, min, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min ? n : fallback;
  };

  const tiersIn = Array.isArray(d.settings?.tiers) ? d.settings.tiers : [];
  const tiers = DEFAULT_TIERS.map((t) => {
    const saved = tiersIn.find((x) => x && x.id === t.id);
    return { ...t, cost: int(saved?.cost, 1, t.cost) };
  });
  const tierIds = new Set(tiers.map((t) => t.id));
  const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);

  const kids = list(d.kids).map((k) => ({
    id: str(k.id, uid()),
    name: str(k.name, 'Kid'),
    avatar: str(k.avatar, '🙂'),
    sticker: str(k.sticker, '⭐'),
    color: /^#[0-9a-f]{6}$/i.test(k.color) ? k.color : '#8b5cf6',
    jobs: list(k.jobs).map((j) => ({
      id: str(j.id, uid()), name: str(j.name, 'Job'), emoji: str(j.emoji, '✅'), stickers: int(j.stickers, 1, 1),
    })),
    prizes: list(k.prizes).map((p) => ({
      id: str(p.id, uid()), name: str(p.name, 'Prize'), emoji: str(p.emoji, '🎁'),
      tier: tierIds.has(p.tier) ? p.tier : 'small',
    })),
  }));

  const kidIds = new Set(kids.map((k) => k.id));
  const events = list(d.events)
    .filter((e) => (e.type === 'undo' ? typeof e.ref === 'string' : (e.type === 'earn' || e.type === 'redeem') && kidIds.has(e.kidId)))
    .map((e) =>
      e.type === 'undo'
        ? { id: str(e.id, uid()), type: 'undo', ref: e.ref, kidId: str(e.kidId), at: str(e.at, new Date().toISOString()) }
        : {
            id: str(e.id, uid()), type: e.type, kidId: e.kidId, amount: int(e.amount, 0, 0),
            label: str(e.label), emoji: str(e.emoji), ...(e.tier ? { tier: String(e.tier) } : {}),
            at: str(e.at, new Date().toISOString()),
          }
    );

  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      tiers,
      pinHash: typeof d.settings?.pinHash === 'string' ? d.settings.pinHash : null,
      sound: d.settings?.sound !== false,
      lastBackupAt: str(d.settings?.lastBackupAt) || null,
    },
    kids,
    events,
  };
}

export const undoneIds = (d) => new Set(d.events.filter((e) => e.type === 'undo').map((e) => e.ref));

export function balance(d, kidId) {
  const undone = undoneIds(d);
  let total = 0;
  for (const e of d.events) {
    if (e.kidId !== kidId || undone.has(e.id)) continue;
    if (e.type === 'earn') total += e.amount;
    else if (e.type === 'redeem') total -= e.amount;
  }
  return total;
}

export const sortedTiers = (d) => [...d.settings.tiers].sort((a, b) => a.cost - b.cost);
