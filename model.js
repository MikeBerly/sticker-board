/*
 * model.js — the shape of the data, starter data, and the math (totals).
 *
 * Document shape:
 * {
 *   schemaVersion: 1,
 *   settings: { tiers: [{id, name, emoji, cost}], pinHash, sound, lastBackupAt },
 *   kids: [{ id, name, avatar, sticker, color, jarStyle,
 *            jobs:   [{ id, name, emoji, stickers }],
 *            prizes: [{ id, name, emoji, tier }],
 *            wishes: [{ id, name, emoji, tier?, at }] }],   ideas a kid suggested, waiting for a grown-up
 *   events: [ { id, type: 'earn' | 'redeem', kidId, amount, label, emoji, tier?, at }
 *           | { id, type: 'undo', ref, kidId, at }
 *           | { id, type: 'pref', kidId, key, value, at } ]   a kid setting (e.g. jarStyle); the latest wins
 * }
 *
 * Totals are never stored: a kid's total = earned − redeemed, skipping undone events.
 */

export const SCHEMA_VERSION = 2;
// v1 had 3 tiers (small 5, medium 10, large 20). v2 adds a tier at the bottom:
// treat 5, small 10, medium 20, large 30. Old tier ids shift down so costs stay the same.
const V1_TIER_RENAME = { small: 'treat', medium: 'small', large: 'medium' };

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

const DEFAULT_TIERS = [
  { id: 'treat', name: 'Treat', emoji: '🍬', cost: 5 },
  { id: 'small', name: 'Small', emoji: '🎈', cost: 10 },
  { id: 'medium', name: 'Medium', emoji: '🎁', cost: 20 },
  { id: 'large', name: 'Large', emoji: '🏆', cost: 30 },
];

export function defaultData() {
  const job = (name, emoji, stickers) => ({ id: uid(), name, emoji, stickers });
  const prize = (name, emoji, tier) => ({ id: uid(), name, emoji, tier });
  const starterPrizes = () => [
    prize('Treat', '🍭', 'treat'),
    prize('Small toy', '🪀', 'small'),
    prize('Bigger toy', '🧸', 'medium'),
    prize('Big toy', '🚂', 'large'),
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
        wishes: [],
      },
      {
        id: uid(), name: 'Ellis', startingStickers: 22, avatar: '🚀', sticker: '🌟', color: '#0ea5e9',
        jobs: [
          job('Brush teeth – morning ☀️', '🪥', 2),
          job('Brush teeth – night 🌙', '🪥', 2),
          job('Go to before care', '🏫', 3),
        ],
        prizes: starterPrizes(),
        wishes: [],
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

  const version = Number(d.schemaVersion) || 1;
  const fixTier = (id) => (version < 2 && V1_TIER_RENAME[id]) || id;
  const tiersIn = (Array.isArray(d.settings?.tiers) ? d.settings.tiers : [])
    .filter((t) => t && typeof t === 'object')
    .map((t) => ({ ...t, id: fixTier(t.id) }));
  const tiers = DEFAULT_TIERS.map((t) => {
    const saved = tiersIn.find((x) => x && x.id === t.id);
    return { ...t, cost: int(saved?.cost, 1, t.cost) };
  });
  const tierIds = new Set(tiers.map((t) => t.id));
  const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);

  // Fields this version doesn't know about are kept (the `...k`, `...j` and so on below), so a device running an
  // older copy of the app never erases settings a newer copy added when it saves.
  const kids = list(d.kids).map((k) => ({
    ...k,
    id: str(k.id, uid()),
    name: str(k.name, 'Kid'),
    avatar: str(k.avatar, '🙂'),
    sticker: str(k.sticker, '⭐'),
    color: /^#[0-9a-f]{6}$/i.test(k.color) ? k.color : '#8b5cf6',
    jarStyle: /^[a-z]{1,20}$/.test(k.jarStyle) ? k.jarStyle : 'potion', // see jars.js
    jobs: list(k.jobs).map((j) => ({
      ...j,
      id: str(j.id, uid()), name: str(j.name, 'Job'), emoji: str(j.emoji, '✅'), stickers: int(j.stickers, 1, 1),
      ...(j.autoEmoji === true ? { autoEmoji: true } : {}),
    })),
    prizes: list(k.prizes).map((p) => ({
      ...p,
      id: str(p.id, uid()), name: str(p.name, 'Prize'), emoji: str(p.emoji, '🎁'),
      tier: tierIds.has(fixTier(p.tier)) ? fixTier(p.tier) : 'treat',
      ...(p.autoEmoji === true ? { autoEmoji: true } : {}),
    })),
    wishes: list(k.wishes).map((w) => {
      const { tier, ...rest } = w;
      return {
        ...rest,
        id: str(w.id, uid()), name: str(w.name, 'Idea'), emoji: str(w.emoji, '🎁'),
        ...(tierIds.has(tier) ? { tier } : {}),
        at: str(w.at, new Date().toISOString()),
      };
    }),
  }));

  const kidIds = new Set(kids.map((k) => k.id));
  const events = list(d.events)
    .filter((e) =>
      e.type === 'undo'
        ? typeof e.ref === 'string'
        : e.type === 'pref'
          ? kidIds.has(e.kidId) && typeof e.key === 'string' && typeof e.value === 'string'
          : (e.type === 'earn' || e.type === 'redeem') && kidIds.has(e.kidId)
    )
    .map((e) =>
      e.type === 'pref'
        ? { id: str(e.id, uid()), type: 'pref', kidId: e.kidId, key: e.key, value: e.value, at: str(e.at, new Date().toISOString()) }
        : e.type === 'undo'
        ? { id: str(e.id, uid()), type: 'undo', ref: e.ref, kidId: str(e.kidId), at: str(e.at, new Date().toISOString()) }
        : {
            id: str(e.id, uid()), type: e.type, kidId: e.kidId, amount: int(e.amount, 0, 0),
            label: str(e.label), emoji: str(e.emoji), ...(e.tier ? { tier: fixTier(String(e.tier)) } : {}),
            at: str(e.at, new Date().toISOString()),
          }
    );

  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      ...(d.settings && typeof d.settings === 'object' ? d.settings : {}),
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
