/*
 * fun.js — Play: the toothbrush timer, number and letter games, and games to play together on two iPads.
 *
 * Nothing here changes stickers. The one exception is the toothbrush timer's "Get my sticker" button,
 * which asks a grown-up first and then awards the kid's brushing job as usual.
 *
 * Routes (all under #/kid/{id}/…):
 *   play              the Play menu
 *   brush             toothbrush timer
 *   game/{name}       a game (see GAMES)
 *   together          play together: who's here, send a sticker
 *   together/fill     fill one shared jar together
 *
 * Instructions are spoken out loud (the iPad's built-in voice), so kids don't need to read.
 * Spoken instructions can be turned off per iPad in Settings. Game levels are saved per kid on each iPad.
 */

const ROUND = 5; // questions per game
const FILL_TARGET = 40; // taps to fill the shared jar
const PRESENCE_MS = 25000; // a sibling counts as "here" if seen this recently

/* ---------- small helpers ---------- */
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;

// Things to count, with the word the voice uses for several of them.
const THINGS = [
  ['⭐', 'stars'], ['🍎', 'apples'], ['🐶', 'puppies'], ['🚗', 'cars'], ['🎈', 'balloons'], ['🐟', 'fish'],
  ['🌸', 'flowers'], ['🍪', 'cookies'], ['🦖', 'dinosaurs'], ['🚀', 'rockets'], ['🐞', 'ladybugs'], ['🍓', 'strawberries'],
];
const PRAISE = ['Yes!', 'Great job!', 'You got it!', 'Super!', 'Awesome!', 'Way to go!'];

// Words with pictures, for the letter games. Short ones (3 letters) come first in Picture words.
const WORDS = [
  ['ant', '🐜'], ['apple', '🍎'], ['ball', '⚽'], ['bee', '🐝'], ['bus', '🚌'], ['bear', '🐻'], ['bird', '🐦'], ['boat', '⛵'],
  ['bed', '🛏️'], ['box', '📦'], ['bat', '🦇'], ['cat', '🐱'], ['cake', '🎂'], ['car', '🚗'], ['cow', '🐄'], ['cup', '🥤'],
  ['dog', '🐶'], ['duck', '🦆'], ['egg', '🥚'], ['fish', '🐟'], ['fox', '🦊'], ['frog', '🐸'], ['goat', '🐐'], ['hat', '🎩'],
  ['house', '🏠'], ['juice', '🧃'], ['kite', '🪁'], ['lion', '🦁'], ['moon', '🌙'], ['milk', '🥛'], ['nut', '🥜'], ['nose', '👃'],
  ['octopus', '🐙'], ['owl', '🦉'], ['pig', '🐷'], ['pizza', '🍕'], ['queen', '👸'], ['rabbit', '🐰'], ['robot', '🤖'],
  ['sun', '☀️'], ['star', '⭐'], ['sock', '🧦'], ['tiger', '🐯'], ['train', '🚂'], ['tree', '🌳'], ['umbrella', '☂️'],
  ['van', '🚐'], ['web', '🕸️'], ['watch', '⌚'], ['yo-yo', '🪀'], ['zebra', '🦓'],
];
const SHORT_WORDS = WORDS.filter(([w]) => /^[a-z]{3}$/.test(w));
const FOUR_WORDS = WORDS.filter(([w]) => /^[a-z]{4}$/.test(w));

/* ---------- speech (per iPad) ---------- */
const SPEAK_KEY = 'stickerBoard.speak';
export function speechOn() {
  try {
    return localStorage.getItem(SPEAK_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setSpeech(on) {
  try {
    localStorage.setItem(SPEAK_KEY, on ? 'on' : 'off');
  } catch {
    // private mode: speech stays on
  }
}
let voice = null;
function findVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  voice =
    voices.find((v) => /^en[-_]CA/i.test(v.lang)) ||
    voices.find((v) => /^en[-_]US/i.test(v.lang) && /samantha|ava|allison|karen/i.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    null;
}
if (window.speechSynthesis) {
  findVoice();
  window.speechSynthesis.addEventListener?.('voiceschanged', findVoice);
}
function say(text) {
  if (!text || !speechOn() || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || 'en-US';
    u.rate = 0.92;
    u.pitch = 1.08;
    window.speechSynthesis.speak(u);
  } catch {
    // no voice on this device
  }
}
const hush = () => {
  try {
    window.speechSynthesis?.cancel();
  } catch {}
};

/* ---------- game levels (per kid, saved on this iPad) ---------- */
const LEVEL_KEY = 'stickerBoard.levels';
function loadLevel(kidId, game) {
  try {
    return JSON.parse(localStorage.getItem(LEVEL_KEY) || '{}')[kidId]?.[game] || 1;
  } catch {
    return 1;
  }
}
function saveLevel(kidId, game, level) {
  try {
    const all = JSON.parse(localStorage.getItem(LEVEL_KEY) || '{}');
    (all[kidId] ||= {})[game] = level;
    localStorage.setItem(LEVEL_KEY, JSON.stringify(all));
  } catch {}
}
// Three right in a row (first try) moves up a level; two misses in a row moves down.
function tracker(kidId, game, max) {
  let level = Math.min(loadLevel(kidId, game), max);
  let streak = 0;
  let misses = 0;
  const set = (l) => {
    level = Math.max(1, Math.min(max, l));
    saveLevel(kidId, game, level);
  };
  return {
    get level() {
      return level;
    },
    result(firstTry) {
      if (firstTry) {
        misses = 0;
        if (++streak >= 3) {
          streak = 0;
          set(level + 1);
        }
      } else {
        streak = 0;
        if (++misses >= 2) {
          misses = 0;
          set(level - 1);
        }
      }
    },
    bump(d) {
      set(level + d);
    },
  };
}

/* ---------- the module ---------- */
export function createFun(ctx) {
  const { app, store, esc, kidById, kidHref, topbar, back, celebrate, chime, uid } = ctx;
  const live = store.live;
  let cur = null; // the mounted Play screen: { key, cleanup: [] }

  const later = (fn, ms) => {
    const t = setTimeout(fn, ms);
    cur?.cleanup.push(() => clearTimeout(t));
  };
  const every = (fn, ms) => {
    const t = setInterval(fn, ms);
    cur?.cleanup.push(() => clearInterval(t));
  };
  const listen = (fn) => {
    app.addEventListener('click', fn);
    cur?.cleanup.push(() => app.removeEventListener('click', fn));
  };
  function clean() {
    if (!cur) return;
    for (const fn of cur.cleanup.splice(0)) {
      try {
        fn();
      } catch {}
    }
  }
  function leave() {
    clean();
    cur = null;
    hush();
  }

  const shell = (kid, title, backHref, backLabel, body) =>
    topbar(back(backHref, backLabel), title) + `<main class="fun" data-fun style="--kid:${kid.color}">${body}</main>`;
  const others = (kid) => ctx.data().kids.filter((k) => k.id !== kid.id);
  const canTogether = (kid) => !!live && others(kid).length > 0;

  /** Called by app.js render() for Play routes. Re-renders from a sync are ignored while a screen is up. */
  function render(kid, r) {
    const key = `${kid.id}/${r.sub}/${r.arg || ''}`;
    if (cur && cur.key === key && app.querySelector('[data-fun]')) return;
    leave();
    cur = { key, cleanup: [] };
    if (r.sub === 'play') return menu(kid);
    if (r.sub === 'brush') return brush(kid);
    if (r.sub === 'together' && canTogether(kid)) return r.arg === 'fill' ? fillTogether(kid) : together(kid);
    if (r.sub === 'game' && GAMES[r.arg]) return GAMES[r.arg].run(kid);
    location.hash = kidHref(kid);
  }

  /* ---------- the Play menu ---------- */
  function menu(kid) {
    const tile = (href, emoji, name, extra = '') =>
      `<a class="fun-tile" href="${href}" ${extra}><span class="fun-emoji">${emoji}</span><span>${name}</span></a>`;
    const games = (ids) => ids.map((id) => tile(kidHref(kid, `game/${id}`), GAMES[id].emoji, GAMES[id].name)).join('');
    app.innerHTML = shell(
      kid,
      `🎈 Play`,
      kidHref(kid),
      kid.name,
      `<div class="fun-tiles big">
        ${tile(kidHref(kid, 'brush'), '🪥', 'Brush teeth')}
        <button class="fun-tile" data-action="play-start" data-kid="${esc(kid.id)}"><span class="fun-emoji">🎈</span><span>Pretend stickers</span></button>
        ${canTogether(kid) ? tile(kidHref(kid, 'together'), '🤝', 'Play together') : ''}
      </div>
      <h2 class="fun-h">🔢 Numbers</h2>
      <div class="fun-tiles">${games(['count', 'fill', 'more', 'pop', 'add'])}</div>
      <h2 class="fun-h">🔤 Letters</h2>
      <div class="fun-tiles">${games(['letter', 'sound', 'words'])}</div>`
    );
  }

  /* ---------- shared bits for games ---------- */
  const dots = (done) =>
    `<div class="fun-dots" aria-label="${done} of ${ROUND}">${Array.from({ length: ROUND }, (_, i) => `<span class="${i < done ? 'on' : ''}"></span>`).join('')}</div>`;
  const items = (emoji, n, countable = false) =>
    `<div class="q-items n${n > 12 ? 'l' : n > 6 ? 'm' : 's'}">${Array.from({ length: n }, () => `<span class="q-item${countable ? ' tap' : ''}">${emoji}</span>`).join('')}</div>`;
  function numberChoices(n, min = 1) {
    const set = new Set([n]);
    while (set.size < 3) {
      const v = n + pick([-2, -1, 1, 2]);
      if (v >= min) set.add(v);
    }
    return [...set].sort((a, b) => a - b);
  }
  function finish(kid, id) {
    clean();
    hush();
    app.innerHTML = shell(
      kid,
      `${GAMES[id].emoji} ${GAMES[id].name}`,
      kidHref(kid, 'play'),
      'Play',
      `<div class="fun-finish">
        <div class="fun-star">🌟</div>
        <h2>Great job, ${esc(kid.name)}!</h2>
        <div class="row">
          <button class="btn" data-again>🔁 Again</button>
          <a class="btn ghost" href="${kidHref(kid, 'play')}">🎈 More games</a>
        </div>
      </div>`
    );
    celebrate(kid.sticker, 24);
    chime([523.25, 659.25, 783.99, 1046.5, 1318.5]);
    say(`Great job, ${kid.name}!`);
    listen((e) => {
      if (!e.target.closest('[data-again]')) return;
      clean();
      GAMES[id].run(kid);
    });
  }
  const sayBtn = `<button class="fun-say" data-say aria-label="Say it again">🔊</button>`;

  /**
   * A multiple-choice game. make(level, kid) returns
   *   { scene, say, choices: [{ html, value, wrongSay? }], answer, praise?, countable?, choiceClass? }
   */
  function choiceGame(kid, id, max, make) {
    const tr = tracker(kid.id, id, max);
    let n = 0;
    let q;
    let firstTry;
    let locked;
    function next() {
      if (n >= ROUND) return finish(kid, id);
      q = make(tr.level, kid);
      firstTry = true;
      locked = false;
      app.innerHTML = shell(
        kid,
        `${GAMES[id].emoji} ${GAMES[id].name}`,
        kidHref(kid, 'play'),
        'Play',
        `${dots(n)}
        <div class="q-scene">${q.scene || ''}</div>
        <div class="q-choices ${q.choiceClass || ''}">${q.choices
          .map((c, i) => `<button class="q-choice" data-i="${i}">${c.html}</button>`)
          .join('')}</div>
        ${sayBtn}`
      );
      later(() => say(q.say), 250);
    }
    listen((e) => {
      if (e.target.closest('[data-say]')) return say(q.say);
      const item = e.target.closest('.q-item.tap');
      if (item) {
        item.classList.toggle('counted');
        return say(String(app.querySelectorAll('.q-item.counted').length || ''));
      }
      const b = e.target.closest('.q-choice');
      if (!b || locked || b.disabled) return;
      const c = q.choices[Number(b.dataset.i)];
      if (c.value === q.answer) {
        locked = true;
        tr.result(firstTry);
        b.classList.add('right');
        chime([659.25, 880, 1046.5]);
        say(q.praise || pick(PRAISE));
        n++;
        const d = app.querySelector('.fun-dots span:not(.on)');
        d?.classList.add('on');
        later(next, 1700);
      } else {
        firstTry = false;
        b.classList.add('wrong');
        b.disabled = true;
        say(c.wrongSay || 'Try again!');
      }
    });
    next();
  }

  /* ---------- the games ---------- */
  const GAMES = {
    count: {
      name: 'Count it',
      emoji: '🔢',
      run: (kid) =>
        choiceGame(kid, 'count', 4, (level) => {
          const [lo, hi] = [[1, 5], [1, 10], [5, 15], [10, 20]][level - 1];
          const n = rnd(lo, hi);
          const [e, name] = pick(THINGS);
          return {
            scene: items(e, n, true),
            say: `How many ${name}? Tap them to count.`,
            choices: numberChoices(n).map((v) => ({ html: `<b>${v}</b>`, value: v })),
            answer: n,
            praise: `Yes! ${n} ${name}!`,
          };
        }),
    },

    more: {
      name: 'Which has more?',
      emoji: '⚖️',
      run: (kid) =>
        choiceGame(kid, 'more', 4, (level) => {
          const [lo, hi, gap] = [[1, 5, 2], [1, 10, 3], [1, 10, 1], [5, 20, 1]][level - 1];
          const fewer = level >= 3 && Math.random() < 0.5;
          let a;
          let b;
          do {
            a = rnd(lo, hi);
            b = rnd(lo, hi);
          } while (Math.abs(a - b) < gap);
          const [e, name] = pick(THINGS);
          const answer = (fewer ? a < b : a > b) ? 0 : 1;
          return {
            choiceClass: 'two',
            say: fewer ? `Which side has fewer ${name}?` : `Which side has more ${name}?`,
            choices: [
              { html: items(e, a), value: 0 },
              { html: items(e, b), value: 1 },
            ],
            answer,
            praise: fewer ? `Yes! ${Math.min(a, b)} is fewer than ${Math.max(a, b)}!` : `Yes! ${Math.max(a, b)} is more than ${Math.min(a, b)}!`,
          };
        }),
    },

    add: {
      name: 'Add them up',
      emoji: '➕',
      run: (kid) =>
        choiceGame(kid, 'add', 4, (level) => {
          const max = [5, 10, 15, 20][level - 1];
          const a = rnd(1, max - 1);
          const b = rnd(1, Math.min(max - a, level === 1 ? 3 : 10));
          const [e, name] = pick(THINGS);
          return {
            scene: `<div class="q-sum">${items(e, a)}<span class="q-op">➕</span>${items(e, b)}</div>`,
            say: `${a} ${name}, and ${b} more. How many altogether?`,
            choices: numberChoices(a + b, 2).map((v) => ({ html: `<b>${v}</b>`, value: v })),
            answer: a + b,
            praise: `Yes! ${a} and ${b} makes ${a + b}!`,
          };
        }),
    },

    fill: { name: 'Fill the jar', emoji: '🫙', run: (kid) => fillGame(kid) },
    pop: { name: 'Pop the bubbles', emoji: '🫧', run: (kid) => popGame(kid) },

    letter: {
      name: 'First letter',
      emoji: '🔤',
      run: (kid) =>
        choiceGame(kid, 'letter', 2, (level) => {
          const [word, e] = pick(WORDS);
          const first = word[0];
          const letters = new Set([first]);
          while (letters.size < 3) letters.add(String.fromCharCode(97 + rnd(0, 25)));
          const show = (l) => (level === 1 ? l.toUpperCase() : l);
          return {
            scene: `<div class="q-pic">${e}</div>`,
            say: `${cap(word)}! What letter does ${word} start with?`,
            choices: shuffle([...letters]).map((l) => ({ html: `<b class="q-letter">${show(l)}</b>`, value: l })),
            answer: first,
            praise: `Yes! ${cap(word)} starts with ${first.toUpperCase()}!`,
          };
        }),
    },

    sound: {
      name: 'Starts with…',
      emoji: '👂',
      run: (kid) =>
        choiceGame(kid, 'sound', 2, (level) => {
          const picks = [];
          for (const w of shuffle(WORDS)) {
            if (!picks.some(([p]) => p[0] === w[0][0])) picks.push(w);
            if (picks.length === 3) break;
          }
          const [word] = picks[0];
          const L = word[0].toUpperCase();
          return {
            scene: `<div class="q-big-letter">${level === 1 ? L : `${L} ${word[0]}`}</div>`,
            say: `Which one starts with ${L}?`,
            choices: shuffle(picks).map(([w, e]) => ({
              html: `<span class="q-pic sm">${e}</span>`,
              value: w,
              wrongSay: `That's ${w}. ${cap(w)} starts with ${w[0].toUpperCase()}.`,
            })),
            answer: word,
            praise: `Yes! ${cap(word)} starts with ${L}!`,
          };
        }),
    },

    words: {
      name: 'Picture words',
      emoji: '📖',
      run: (kid) =>
        choiceGame(kid, 'words', 2, (level) => {
          const list = level === 1 ? SHORT_WORDS : FOUR_WORDS;
          const picks = shuffle(list).slice(0, 3);
          const [word] = picks[0];
          return {
            scene: `<div class="q-word">${word}</div>`,
            say: 'Which picture matches this word?',
            choices: shuffle(picks).map(([w, e]) => ({ html: `<span class="q-pic sm">${e}</span>`, value: w, wrongSay: `That's ${w}.` })),
            answer: word,
            praise: `Yes! It says ${word}!`,
          };
        }),
    },
  };

  /* Fill the jar: "Put 7 in the jar!" — tap + and −, then ✅. */
  function fillGame(kid) {
    const tr = tracker(kid.id, 'fill', 4);
    let n = 0;
    let target;
    let count;
    let firstTry;
    let locked;
    const jar = () => {
      app.querySelector('.fill-jar').innerHTML = items(kid.sticker, count);
      app.querySelector('.fill-count').textContent = count;
    };
    function next() {
      if (n >= ROUND) return finish(kid, 'fill');
      const [lo, hi] = [[1, 5], [2, 10], [5, 15], [8, 20]][tr.level - 1];
      target = rnd(lo, hi);
      count = 0;
      firstTry = true;
      locked = false;
      app.innerHTML = shell(
        kid,
        '🫙 Fill the jar',
        kidHref(kid, 'play'),
        'Play',
        `${dots(n)}
        <div class="fill-goal">Put <b>${target}</b> in the jar</div>
        <div class="fill-row">
          <div class="fill-jar"></div>
          <div class="fill-count">0</div>
        </div>
        <div class="fill-buttons">
          <button class="fill-btn" data-fill="-1" aria-label="Take one out">➖</button>
          <button class="fill-btn add" data-fill="1" aria-label="Put one in">➕</button>
          <button class="fill-btn done" data-fill="done" aria-label="Done">✅</button>
        </div>
        ${sayBtn}`
      );
      jar();
      later(() => say(`Put ${target} in the jar!`), 250);
    }
    listen((e) => {
      if (e.target.closest('[data-say]')) return say(`Put ${target} in the jar!`);
      const b = e.target.closest('[data-fill]');
      if (!b || locked) return;
      const f = b.dataset.fill;
      if (f === 'done') {
        if (count === target) {
          locked = true;
          tr.result(firstTry);
          chime([659.25, 880, 1046.5]);
          say(`Yes! ${target}!`);
          n++;
          app.querySelector('.fun-dots span:not(.on)')?.classList.add('on');
          later(next, 1500);
        } else {
          firstTry = false;
          say(count < target ? `More! We need ${target}.` : `Too many! Take some out.`);
          app.querySelector('.fill-jar').classList.remove('shake');
          void app.offsetWidth;
          app.querySelector('.fill-jar').classList.add('shake');
        }
        return;
      }
      count = Math.max(0, Math.min(25, count + Number(f)));
      jar();
      say(String(count));
    });
    next();
  }

  /* Pop the bubbles in order: 1, 2, 3… */
  function popGame(kid) {
    const tr = tracker(kid.id, 'pop', 4);
    const total = [5, 8, 12, 20][tr.level - 1];
    const cells = shuffle(Array.from({ length: 20 }, (_, i) => i)).slice(0, total);
    let nextNum = 1;
    let misses = 0;
    app.innerHTML = shell(
      kid,
      '🫧 Pop the bubbles',
      kidHref(kid, 'play'),
      'Play',
      `<div class="pop-next">Find <b>1</b></div>
      <div class="pop-field">${cells
        .map((cell, i) => {
          const x = (cell % 5) * 20 + rnd(2, 6);
          const y = Math.floor(cell / 5) * 25 + rnd(2, 6);
          return `<button class="bubble-btn" data-n="${i + 1}" style="left:${x}%;top:${y}%;animation-delay:${(i % 5) * 0.3}s">${i + 1}</button>`;
        })
        .join('')}</div>
      ${sayBtn}`
    );
    later(() => say('Pop the bubbles in order. Start with 1!'), 250);
    listen((e) => {
      if (e.target.closest('[data-say]')) return say(`Find ${nextNum}!`);
      const b = e.target.closest('.bubble-btn');
      if (!b || b.classList.contains('popped')) return;
      if (Number(b.dataset.n) === nextNum) {
        b.classList.add('popped');
        say(String(nextNum));
        chime([523.25 + nextNum * 20]);
        nextNum++;
        const label = app.querySelector('.pop-next b');
        if (label) label.textContent = nextNum;
        if (nextNum > total) {
          tr.bump(misses <= 1 ? 1 : misses >= 4 ? -1 : 0);
          later(() => finish(kid, 'pop'), 900);
        }
      } else {
        misses++;
        b.classList.remove('shake');
        void b.offsetWidth;
        b.classList.add('shake');
        say(`Find ${nextNum}!`);
      }
    });
  }

  /* ---------- toothbrush timer ---------- */
  const SECTIONS = [
    ['Top teeth, this side!', '⬆️'],
    ['Top teeth, other side!', '⬆️'],
    ['Bottom teeth, this side!', '⬇️'],
    ['Bottom teeth, other side!', '⬇️'],
  ];
  function mouthSVG(active) {
    const q = (i, x, y) =>
      `<rect x="${x}" y="${y}" width="66" height="30" rx="12" class="tooth-q${i === active ? ' on' : ''}${i < active ? ' done' : ''}"/>`;
    return `<svg class="mouth" viewBox="0 0 160 100" aria-hidden="true">
      <ellipse cx="80" cy="50" rx="78" ry="48" class="lips"/>
      ${q(0, 12, 18)}${q(1, 82, 18)}${q(2, 12, 52)}${q(3, 82, 52)}
    </svg>`;
  }
  // The kid's brushing job for this time of day (morning before 3 pm, otherwise night).
  function brushJob(kid) {
    const jobs = kid.jobs.filter((j) => /brush|teeth|tooth|🪥/i.test(j.name + j.emoji));
    if (jobs.length <= 1) return jobs[0] || null;
    const morning = new Date().getHours() < 15;
    const re = morning ? /morning|am\b|☀️|☀/i : /night|evening|bed|pm\b|🌙/i;
    return jobs.find((j) => re.test(j.name)) || jobs[0];
  }

  function brush(kid) {
    const secs = ctx.data().settings.brushSeconds || 60;
    const top = ctx.topCost();
    let state = 'ready'; // ready → brushing ⇄ paused → done
    let used = 0; // seconds brushed so far
    let since = 0; // when the current stretch started
    let shownBal = 0;
    let section = -1;
    let sentAt = 0;
    let siblings = {};

    const elapsed = () => used + (state === 'brushing' ? (Date.now() - since) / 1000 : 0);
    const jarBox = () => app.querySelector('.brush-jar');

    function draw() {
      const job = brushJob(kid);
      app.innerHTML = shell(
        kid,
        '🪥 Brush teeth',
        kidHref(kid, 'play'),
        'Play',
        `<div class="brush">
          <div class="brush-jar">${ctx.jarHTML(kid, shownBal)}</div>
          <div class="brush-side">
            <div class="brush-time">${fmtTime(secs)}</div>
            <div class="brush-mouth">${mouthSVG(-1)}</div>
            <p class="brush-cue">Ready?</p>
            <div class="brush-buttons"><button class="btn go big-btn" data-brush="start">▶️ Start</button></div>
            <div class="brush-friends"></div>
          </div>
        </div>
        <template id="brush-done">
          <div class="brush-buttons">
            ${job ? `<button class="btn go big-btn" data-brush="sticker">⭐ Get my sticker</button>` : ''}
            <a class="btn ghost" href="${kidHref(kid, 'play')}">🎈 Play</a>
          </div>
        </template>`
      );
    }
    function buttons(html) {
      app.querySelector('.brush-buttons').outerHTML = html;
    }
    function tick() {
      if (state !== 'brushing') return;
      const t = Math.min(elapsed(), secs);
      const p = t / secs;
      const s = Math.min(3, Math.floor(p * 4));
      app.querySelector('.brush-time').textContent = fmtTime(secs - t);
      if (s !== section) {
        section = s;
        app.querySelector('.brush-mouth').innerHTML = mouthSVG(s);
        app.querySelector('.brush-cue').textContent = `${SECTIONS[s][1]} ${SECTIONS[s][0]}`;
        if (s > 0) chime([783.99, 1046.5]);
        say(SECTIONS[s][0]);
      }
      // Refill the jar every couple of seconds (it animates the rise between).
      const bal = Math.round(p * top);
      if (bal !== shownBal && (bal - shownBal >= Math.max(1, top / 15) || t >= secs)) {
        jarBox().innerHTML = ctx.jarHTML(kid, bal, shownBal);
        shownBal = bal;
      }
      share(p, false);
      if (t >= secs) done();
    }
    function done() {
      state = 'done';
      jarBox().innerHTML = ctx.jarHTML(kid, top, shownBal);
      app.querySelector('.brush-time').textContent = '🎉';
      app.querySelector('.brush-mouth').innerHTML = mouthSVG(4);
      app.querySelector('.brush-cue').textContent = 'All done! Sparkly teeth!';
      buttons(app.querySelector('#brush-done').innerHTML);
      celebrate('🦷', 26);
      chime([523.25, 659.25, 783.99, 1046.5, 1318.5]);
      say(`All done! Great brushing, ${kid.name}!`);
      share(1, true);
    }
    // Brushing race: tell the other iPads how far along we are, and show theirs.
    function share(p, finished) {
      if (!live?.shared) return;
      if (!finished && Date.now() - sentAt < 2000) return;
      sentAt = Date.now();
      live.update('brush', { [kid.id]: { p: Math.round(p * 100) / 100, at: Date.now(), done: finished } }).catch(() => {});
    }
    function drawFriends() {
      const box = app.querySelector('.brush-friends');
      if (!box) return;
      const now = Date.now();
      box.innerHTML = others(kid)
        .filter((k) => siblings[k.id] && now - siblings[k.id].at < 8000)
        .map((k) => {
          const s = siblings[k.id];
          return `<div class="friend" style="--kid:${k.color}">
            <span class="friend-avatar">${esc(k.avatar)}</span>
            <span class="friend-bar"><span style="width:${Math.round(s.p * 100)}%"></span></span>
            <span>${s.done ? '✅' : '🪥'}</span>
          </div>`;
        })
        .join('');
    }

    draw();
    if (live?.shared) {
      const stop = live.watch('brush', (rec) => {
        siblings = rec || {};
        drawFriends();
      });
      cur.cleanup.push(stop);
      every(drawFriends, 3000);
    }
    every(tick, 250);
    listen(async (e) => {
      const b = e.target.closest('[data-brush]');
      if (!b) return;
      const what = b.dataset.brush;
      if (what === 'start') {
        state = 'brushing';
        since = Date.now();
        section = -1;
        buttons(`<div class="brush-buttons"><button class="btn ghost big-btn" data-brush="pause">⏸️ Pause</button></div>`);
        say("Let's brush!");
        later(tick, 900);
      } else if (what === 'pause') {
        used = elapsed();
        state = 'paused';
        buttons(`<div class="brush-buttons"><button class="btn go big-btn" data-brush="go">▶️ Keep going</button></div>`);
      } else if (what === 'go') {
        since = Date.now();
        state = 'brushing';
        buttons(`<div class="brush-buttons"><button class="btn ghost big-btn" data-brush="pause">⏸️ Pause</button></div>`);
      } else if (what === 'sticker') {
        const job = brushJob(kid);
        if (!job || !(await ctx.requireParent())) return;
        location.hash = kidHref(kid);
        ctx.award(kid, job);
      }
    });
  }

  /* ---------- playing together ---------- */
  const SEND = ['🦄', '🐶', '🦖', '🌈', '🚀', '🍦', '⭐', '💖', '🐱', '🎉', '🦋', '🤪'];

  function setupNeeded(err) {
    return /permission|insufficient/i.test(String(err?.code || err?.message || ''));
  }
  function showSetup(kid) {
    const box = app.querySelector('.together-status');
    if (box)
      box.innerHTML = `<p class="backup-status warn">Playing together isn't switched on yet. Grown-ups: it needs one change to the Firebase rules (see "Playing together" in FIREBASE-SETUP.md).</p>`;
  }
  // Tell the other iPads this kid is here, every 10 seconds while on a Together screen.
  function presence(kid, onError) {
    const ping = () => live.update('here', { [kid.id]: Date.now() }).catch(onError);
    ping();
    every(ping, 10000);
  }
  function friendsHTML(kid, here) {
    const now = Date.now();
    return others(kid)
      .map((k) => {
        const on = here[k.id] && now - here[k.id] < PRESENCE_MS;
        return `<span class="pal${on ? ' on' : ''}" style="--kid:${k.color}"><span class="friend-avatar">${esc(k.avatar)}</span>${esc(k.name)}<i></i></span>`;
      })
      .join('');
  }

  function together(kid) {
    let here = {};
    app.innerHTML = shell(
      kid,
      '🤝 Play together',
      kidHref(kid, 'play'),
      'Play',
      `<div class="together-status"></div>
      <div class="pals">${friendsHTML(kid, here)}</div>
      <div class="fun-tiles big">
        <a class="fun-tile" href="${kidHref(kid, 'together/fill')}"><span class="fun-emoji">🫙</span><span>Fill the jar together</span></a>
      </div>
      <h2 class="fun-h">💌 Send a sticker</h2>
      <div class="send-grid">${SEND.map((e) => `<button class="send-btn" data-send="${e}">${e}</button>`).join('')}</div>`
    );
    const fail = (err) => {
      if (setupNeeded(err)) showSetup(kid);
    };
    presence(kid, fail);
    const stop = live.watch(
      'here',
      (rec) => {
        here = rec || {};
        const box = app.querySelector('.pals');
        if (box) box.innerHTML = friendsHTML(kid, here);
      },
      fail
    );
    cur.cleanup.push(stop);
    every(() => {
      const box = app.querySelector('.pals');
      if (box) box.innerHTML = friendsHTML(kid, here);
    }, 5000);
    later(() => say('Play together!'), 200);
    listen((e) => {
      const b = e.target.closest('[data-send]');
      if (!b) return;
      const emoji = b.dataset.send;
      const mail = {};
      for (const k of others(kid)) mail[k.id] = { emoji, from: kid.id, id: uid(), at: Date.now() };
      live.update('mail', mail).catch(fail);
      b.classList.remove('sent');
      void b.offsetWidth;
      b.classList.add('sent');
      chime([880, 1174.66]);
      say(others(kid).length === 1 ? `Sent to ${others(kid)[0].name}!` : 'Sent!');
    });
  }

  function fillTogether(kid) {
    let rec = { round: 0, taps: {} };
    let mine = 0;
    let round = null;
    let cheered = -1;
    let sendTimer = null;
    const kids = () => ctx.data().kids;
    const total = () => Object.values(rec.taps || {}).reduce((s, n) => s + (Number(n) || 0), 0);

    app.innerHTML = shell(
      kid,
      '🫙 Fill the jar together',
      kidHref(kid, 'together'),
      'Together',
      `<div class="together-status"></div>
      <div class="pals"></div>
      <div class="share-row">
        <div class="share-jar"></div>
        <div class="share-side">
          <div class="share-count"></div>
          <button class="tap-btn" data-tap style="--kid:${kid.color}"><span>${esc(kid.avatar)}</span>TAP!</button>
          <button class="btn ghost" data-again hidden>🔁 Again</button>
        </div>
      </div>`
    );
    function jar() {
      // Balls in each kid's color, mixed in roughly the order they arrived.
      const counts = kids().map((k) => [k, Math.min(Number(rec.taps?.[k.id]) || 0, FILL_TARGET)]);
      const seq = [];
      const left = counts.map(([, c]) => c);
      while (seq.length < FILL_TARGET && left.some((c) => c > 0)) {
        let best = -1;
        for (let i = 0; i < left.length; i++) if (left[i] > 0 && (best < 0 || left[i] / (counts[i][1] || 1) > left[best] / (counts[best][1] || 1))) best = i;
        seq.push(counts[best][0].color);
        left[best]--;
      }
      const balls = seq
        .map((color, i) => {
          const row = Math.floor(i / 6);
          const col = i % 6;
          const cx = 52 + col * 23 + (row % 2 ? 11 : 0);
          const cy = 236 - row * 20;
          return `<circle cx="${cx}" cy="${cy}" r="11" fill="${color}" stroke="#fff" stroke-width="2"/>`;
        })
        .join('');
      const full = total() >= FILL_TARGET;
      app.querySelector('.share-jar').innerHTML = `<svg viewBox="0 0 220 272" class="jar">
        <path class="glass-bg" d="M30,250 L30,110 A80,80 0 0 1 190,110 L190,250 Z"/>
        ${balls}
        <path class="glass" d="M30,250 L30,110 A80,80 0 0 1 190,110 L190,250 Z"/>
        <path d="M22,250 L198,250 L186,270 L34,270 Z" fill="${kid.color}"/>
        ${full ? '<text x="110" y="70" text-anchor="middle" font-size="44">🎉</text>' : ''}
      </svg>`;
      app.querySelector('.share-count').innerHTML = `<b>${Math.min(total(), FILL_TARGET)}</b> / ${FILL_TARGET}`;
      app.querySelector('[data-tap]').disabled = full;
      app.querySelector('[data-again]').hidden = !full;
    }
    const fail = (err) => {
      if (setupNeeded(err)) showSetup(kid);
    };
    function send() {
      if (sendTimer) return;
      sendTimer = setTimeout(() => {
        sendTimer = null;
        live.update('filljar', { round, taps: { [kid.id]: mine } }).catch(fail);
      }, 250);
    }
    cur.cleanup.push(() => clearTimeout(sendTimer));
    presence(kid, fail);
    let here = {};
    cur.cleanup.push(
      live.watch('here', (h) => {
        here = h || {};
        const box = app.querySelector('.pals');
        if (box) box.innerHTML = friendsHTML(kid, here);
      }, fail)
    );
    cur.cleanup.push(
      live.watch(
        'filljar',
        (r) => {
          const fresh = r && typeof r.round === 'number' ? r : { round: 0, taps: {} };
          if (fresh.round !== round) {
            round = fresh.round;
            mine = Number(fresh.taps?.[kid.id]) || 0;
          }
          // Our own taps may be ahead of what the other iPad has seen.
          rec = { round, taps: { ...(fresh.taps || {}), [kid.id]: Math.max(mine, Number(fresh.taps?.[kid.id]) || 0) } };
          jar();
          if (total() >= FILL_TARGET && cheered !== round) {
            cheered = round;
            celebrate('🎉', 30);
            chime([523.25, 659.25, 783.99, 1046.5, 1318.5]);
            say('You filled it together! Hooray!');
          }
        },
        fail
      )
    );
    later(() => say('Tap to fill the jar together!'), 300);
    listen((e) => {
      if (e.target.closest('[data-tap]')) {
        if (round === null || total() >= FILL_TARGET) return;
        mine++;
        rec.taps = { ...rec.taps, [kid.id]: mine };
        jar();
        chime([600 + (total() % 8) * 60]);
        send();
        if (total() >= FILL_TARGET) live.update('filljar', { round, taps: { [kid.id]: mine } }).catch(fail);
      } else if (e.target.closest('[data-again]')) {
        live.reset('filljar', { round: (round || 0) + 1, taps: {} }).catch(fail);
      }
    });
  }

  /* ---------- stickers sent by a sibling: pop up on any of the kid's screens ---------- */
  const seen = new Set();
  let mailbox = {};
  let mailReady = false;
  function showMail() {
    const m = location.hash.match(/^#\/kid\/([^/]+)/);
    const kid = m ? kidById(decodeURIComponent(m[1])) : null;
    const msg = kid && mailbox[kid.id];
    if (!msg || seen.has(msg.id)) return;
    seen.add(msg.id);
    if (Date.now() - (msg.at || 0) > 60000) return; // too old to be a surprise
    const from = kidById(msg.from);
    const el = document.createElement('div');
    el.className = 'mail-pop';
    el.innerHTML = `<div class="mail-card" style="--kid:${from?.color || '#8b5cf6'}"><div class="mail-emoji">${esc(msg.emoji)}</div><p>From ${esc(from?.avatar || '')} ${esc(from?.name || 'someone')}</p></div>`;
    document.body.append(el);
    el.addEventListener('click', () => el.remove());
    setTimeout(() => el.remove(), 4000);
    chime([783.99, 987.77, 1174.66]);
    say(`${from?.name || 'Someone'} sent you a sticker!`);
  }
  function start() {
    if (!live) return;
    live.watch(
      'mail',
      (rec) => {
        mailbox = rec || {};
        if (!mailReady) {
          // Stickers sent before the app opened don't pop up.
          for (const m of Object.values(mailbox)) if (m?.id && Date.now() - (m.at || 0) > 60000) seen.add(m.id);
          mailReady = true;
        }
        showMail();
      },
      () => {}
    );
    window.addEventListener('hashchange', showMail);
  }

  return { render, leave, start, isRoute: (sub) => ['play', 'brush', 'game', 'together'].includes(sub) };
}
