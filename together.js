/*
 * together.js — games for two kids on two iPads (from the 🤝 Play together menu):
 *
 *   Memory match    take turns flipping cards; a match scores and goes again
 *   Find the match  two picture cards share exactly one picture; first to tap it scores
 *   Pass the ball   iPads side by side: the ball rolls off one screen onto the other
 *
 * Each game keeps its shared state in one live record (store.live, see store.js), which both iPads
 * watch. Only the iPad whose turn it is (or that has the ball) changes the record, so the two never
 * fight over it. With no sibling around, each game also works alone.
 */

const PICS = [
  '🐶', '🐱', '🦊', '🐸', '🐵', '🦁', '🐯', '🐷', '🐰', '🐻', '🐼', '🦄', '🐙', '🦋', '🐞', '🐢',
  '🦖', '🚀', '🌈', '⭐', '🍦', '🍕', '🎈', '⚽', '🍓', '🚗', '🌻', '🐳', '🍩', '🎸',
];

// A random number generator both iPads can repeat from the same seed.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleWith(arr, r) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Single-player games keep their record in memory on this iPad, one per kid, so they never mix
// with a sibling's game. Same interface as store.live.
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => {
  const out = { ...a };
  for (const [key, v] of Object.entries(b)) out[key] = isObj(v) && isObj(a[key]) ? merge(a[key], v) : v;
  return out;
};
const soloRecords = {};
const soloSubs = {};
const soloEmit = (name) => soloSubs[name]?.forEach((cb) => cb(soloRecords[name] || {}));
const soloLive = {
  watch(name, cb) {
    (soloSubs[name] ||= new Set()).add(cb);
    setTimeout(() => cb(soloRecords[name] || {}), 0);
    return () => soloSubs[name].delete(cb);
  },
  async update(name, fields) {
    soloRecords[name] = merge(soloRecords[name] || {}, fields);
    soloEmit(name);
  },
  async reset(name, rec) {
    soloRecords[name] = rec;
    soloEmit(name);
  },
};

export function togetherGames(k) {
  const { app, live, esc, uid, kidById, say, chime, celebrate, later, every, listen, onCleanup, shuffle } = k;

  // The page frame, plus the "who's here" row kept up to date.
  function frame(kid, title, body, solo = false) {
    if (solo) {
      app.innerHTML = k.soloShell(kid, title, body);
      return { fail: () => {}, here: () => ({}) };
    }
    app.innerHTML = k.shell(kid, title, `<div class="together-status"></div><div class="pals"></div>${body}`);
    const fail = k.failFor(kid);
    let here = {};
    const paint = () => {
      const box = app.querySelector('.pals');
      if (box) box.innerHTML = k.friendsHTML(kid, here);
    };
    k.presence(kid, fail);
    onCleanup(live.watch('here', (h) => ((here = h || {}), paint()), fail));
    every(paint, 5000);
    return { fail, here: () => here };
  }
  // The sibling seen most recently on a Together screen, if any.
  function partnerOf(kid, here) {
    const now = Date.now();
    return (
      k
        .others(kid)
        .filter((o) => here[o.id] && now - here[o.id] < k.PRESENCE_MS)
        .sort((a, b) => here[b.id] - here[a.id])[0] || null
    );
  }
  const cheerScores = (players, scores) => {
    if (players.length < 2) return 'All matched! Great job!';
    const [a, b] = players;
    const sa = scores?.[a.id] || 0;
    const sb = scores?.[b.id] || 0;
    if (sa === sb) return "It's a tie! Great playing, both of you!";
    return `${(sa > sb ? a : b).name} wins! Great playing, both of you!`;
  };

  /* ---------- Memory match ---------- */
  function memory(kid, solo = false) {
    const L = solo ? soloLive : live; // alone: a private game on this iPad; together: shared with the sibling
    const NAME = solo ? `memory-${kid.id}` : 'memory';
    const { fail, here } = frame(
      kid,
      '🃏 Memory match',
      `<div class="mem-head"></div>
      <div class="mem-grid"></div>
      <div class="row"><button class="btn ghost" data-new="6">🔁 12 cards</button><button class="btn ghost" data-new="12">🔁 24 cards</button></div>`,
      solo
    );
    let rec = {};
    let saidTurn = null;
    let cheered = null;
    let missSeen = null;
    let missUntil = 0; // a missed pair stays face up until then (or until the next player taps)

    function newGame(pairs) {
      const partner = partnerOf(kid, here());
      const faces = shuffle(PICS).slice(0, pairs);
      L
        .reset(NAME, {
          id: uid(),
          cards: shuffle([...faces, ...faces]),
          players: partner && !solo ? [kid.id, partner.id] : [kid.id],
          turn: kid.id,
          flipped: [],
          matched: {},
          scores: {},
        })
        .catch(fail);
    }
    const players = () => (rec.players || []).map(kidById).filter(Boolean);
    const isDone = () => rec.cards && Object.keys(rec.matched || {}).length >= rec.cards.length;
    const missShowing = () => rec.miss && Date.now() < missUntil && !(rec.flipped || []).length ? rec.miss.cards : [];

    function draw() {
      const head = app.querySelector('.mem-head');
      const grid = app.querySelector('.mem-grid');
      if (!head) return;
      if (!rec.cards) {
        head.innerHTML = '<p class="mem-turn">Pick a game to start!</p>';
        grid.innerHTML = '';
        return;
      }
      const turnKid = kidById(rec.turn);
      head.innerHTML =
        players()
          .map((p) => `<span class="mem-score${p.id === rec.turn && !isDone() ? ' on' : ''}" style="--kid:${p.color}">${esc(p.avatar)} <b>${rec.scores?.[p.id] || 0}</b></span>`)
          .join('') +
        (solo
          ? `<span class="mem-turn">${isDone() ? '🎉 All matched!' : ''} 🔁 ${rec.tries || 0} ${rec.tries === 1 ? 'try' : 'tries'}</span>`
          : `<span class="mem-turn">${isDone() ? '🎉 All matched!' : turnKid ? `${esc(turnKid.avatar)} ${turnKid.id === kid.id ? 'Your' : `${esc(turnKid.name)}'s`} turn` : ''}</span>`);
      const missed = missShowing();
      grid.className = `mem-grid g${rec.cards.length}`;
      grid.innerHTML = rec.cards
        .map((face, i) => {
          const owner = kidById(rec.matched?.[i]);
          const up = owner || (rec.flipped || []).includes(i) || missed.includes(i);
          return `<button class="mem-card${up ? ' up' : ''}${owner ? ' matched' : ''}${missed.includes(i) ? ' missed' : ''}" data-card="${i}"${owner ? ` style="--kid:${owner.color}"` : ''}><span>${up ? face : '❓'}</span></button>`;
        })
        .join('');
    }

    function changed() {
      if (rec.miss?.id && rec.miss.id !== missSeen) {
        missSeen = rec.miss.id;
        missUntil = Date.now() + 1400;
        later(draw, 1450);
      }
      draw();
      if (!rec.cards) return;
      if (isDone()) {
        if (cheered !== rec.id) {
          cheered = rec.id;
          celebrate('🃏', 26);
          chime([523.25, 659.25, 783.99, 1046.5, 1318.5]);
          say(solo ? `You found them all in ${rec.tries || 0} tries! Great job, ${kid.name}!` : cheerScores(players(), rec.scores));
        }
      } else if (rec.turn === kid.id && (rec.players || []).length > 1 && saidTurn !== `${rec.id}/${rec.miss?.id || ''}`) {
        saidTurn = `${rec.id}/${rec.miss?.id || ''}`;
        if (rec.miss) say(`Your turn, ${kid.name}!`);
      }
    }
    onCleanup(L.watch(NAME, (r) => ((rec = r || {}), changed()), fail));
    later(() => say('Memory match! Find the pairs.'), 200);

    listen((e) => {
      const n = e.target.closest('[data-new]');
      if (n) return newGame(Number(n.dataset.new));
      const c = e.target.closest('[data-card]');
      if (!c || !rec.cards || isDone()) return;
      const i = Number(c.dataset.card);
      if (rec.turn !== kid.id) {
        const t = kidById(rec.turn);
        return say(t ? `It's ${t.name}'s turn!` : 'Wait for your turn!');
      }
      const flipped = rec.flipped || [];
      if (rec.matched?.[i] || flipped.includes(i) || flipped.length >= 2) return;
      const now = [...flipped, i];
      let change;
      if (now.length < 2) {
        change = { flipped: now };
      } else {
        // The second card settles the turn straight away, in one write, so the other iPad can go at once.
        const [a, b] = now;
        const tries = solo ? { tries: (rec.tries || 0) + 1 } : {};
        if (rec.cards[a] === rec.cards[b]) {
          chime([659.25, 880, 1046.5]);
          say(pickPraise());
          change = { ...tries, flipped: [], matched: { [a]: kid.id, [b]: kid.id }, scores: { [kid.id]: (rec.scores?.[kid.id] || 0) + 1 } };
        } else {
          const ps = rec.players || [kid.id];
          change = { ...tries, flipped: [], turn: ps[(ps.indexOf(kid.id) + 1) % ps.length], miss: { cards: [a, b], id: uid() } };
        }
      }
      // Show it on this iPad right away; the shared record catches up.
      rec = { ...rec, ...change, matched: { ...rec.matched, ...(change.matched || {}) }, scores: { ...rec.scores, ...(change.scores || {}) } };
      changed();
      L.update(NAME, change).catch(fail);
    });
  }
  const pickPraise = () => ['A match!', 'You found a pair!', 'Great memory!'][Math.floor(Math.random() * 3)];

  /* ---------- Find the match ---------- */
  const ring = (n, r) => Array.from({ length: n }, (_, i) => [50 + r * Math.cos((i / n) * 2 * Math.PI - Math.PI / 2), 50 + r * Math.sin((i / n) * 2 * Math.PI - Math.PI / 2)]);
  const SLOTS = {
    4: [[28, 30], [72, 30], [30, 72], [70, 70]],
    6: [[50, 17], [21, 38], [79, 38], [28, 76], [72, 76], [50, 52]],
    8: [[50, 50], ...ring(7, 34)],
  };
  const PIC_SCALE = { 4: 1, 6: 0.88, 8: 0.7 }; // more pictures per card means smaller pictures
  const LEVELS = [
    [4, '🙂 Easy'],
    [6, '😃 Medium'],
    [8, '🤩 Hard'],
  ];
  function spotCards(rec, round) {
    const r = seeded((rec.seed || 1) * 31 + round);
    const size = SLOTS[rec.size] ? rec.size : 4;
    const pool = shuffleWith(PICS, r);
    const common = pool[0];
    const layout = (pics) =>
      shuffleWith(pics, r).map((p, i) => ({
        p,
        x: SLOTS[size][i][0] + (r() * 8 - 4),
        y: SLOTS[size][i][1] + (r() * 8 - 4),
        s: (0.8 + r() * 0.45) * PIC_SCALE[size],
        rot: Math.round(r() * 70 - 35),
      }));
    return { common, a: layout([common, ...pool.slice(1, size)]), b: layout([common, ...pool.slice(size, size * 2 - 1)]) };
  }

  function spot(kid, solo = false) {
    const L = solo ? soloLive : live;
    const NAME = solo ? `spot-${kid.id}` : 'spot';
    const { fail } = frame(kid, '👀 Find the match', `<div class="spot-head"></div><div class="spot-area"></div>`, solo);
    let rec = {};
    let frozenUntil = 0;
    let lastRound = null;
    let cheered = null;

    const newGame = (size) =>
      L.reset(NAME, { id: uid(), seed: Math.floor(Math.random() * 1e9), size, round: 0, target: 10, claims: {} }).catch(fail);
    const scores = () => {
      const s = {};
      for (const id of Object.values(rec.claims || {})) s[id] = (s[id] || 0) + 1;
      return s;
    };
    const finished = () => rec.id && rec.round >= rec.target;

    function draw() {
      const head = app.querySelector('.spot-head');
      const area = app.querySelector('.spot-area');
      if (!head) return;
      const startButtons = `<div class="row">${LEVELS.map(([n, label], i) => `<button class="btn${i ? ' ghost' : ''} big-btn" data-size="${n}">${label}</button>`).join('')}</div>`;
      if (!rec.id) {
        head.innerHTML = '<p class="mem-turn">Pick a game!</p>';
        area.innerHTML = startButtons;
        return;
      }
      const s = scores();
      const ids = solo ? [kid.id] : [kid.id, ...k.others(kid).map((o) => o.id)];
      head.innerHTML =
        ids
          .map(kidById)
          .filter(Boolean)
          .map((p) => `<span class="mem-score" style="--kid:${p.color}">${esc(p.avatar)} <b>${s[p.id] || 0}</b></span>`)
          .join('') + `<span class="mem-turn">${finished() ? '🎉' : `${Math.min(rec.round + 1, rec.target)} / ${rec.target}`}</span>`;
      if (finished()) {
        area.innerHTML = `<div class="fun-finish"><div class="fun-star">🏆</div>${startButtons}</div>`;
        return;
      }
      const { a, b } = spotCards(rec, rec.round);
      const card = (pics) =>
        `<div class="spot-card">${pics
          .map(({ p, x, y, s: sc, rot }) => `<button class="spot-pic" data-pic="${p}" style="left:${x}%;top:${y}%;transform:translate(-50%,-50%) rotate(${rot}deg) scale(${sc.toFixed(2)})">${p}</button>`)
          .join('')}</div>`;
      area.innerHTML = `<div class="spot-cards${Date.now() < frozenUntil ? ' frozen' : ''}">${card(a)}${card(b)}</div>`;
    }

    onCleanup(
      L.watch(NAME,
        (r) => {
          const prev = rec;
          rec = r || {};
          // Say who found the last one.
          if (rec.id && prev.id === rec.id && lastRound !== null && rec.round > lastRound) {
            const who = kidById(rec.claims?.[lastRound]);
            if (who && who.id !== kid.id) say(`${who.name} found it!`);
          }
          lastRound = rec.round ?? null;
          draw();
          if (finished() && cheered !== rec.id) {
            cheered = rec.id;
            celebrate('🏆', 26);
            chime([523.25, 659.25, 783.99, 1046.5, 1318.5]);
            const s = scores();
            const ps = Object.keys(s).map(kidById).filter(Boolean);
            say(solo ? `You found all ${rec.target}! Great job, ${kid.name}!` : cheerScores(ps.length > 1 ? ps : [kid], s));
          }
        },
        fail
      )
    );
    later(() => say('Find the picture that is on both cards!'), 200);

    listen((e) => {
      const size = e.target.closest('[data-size]');
      if (size) return newGame(Number(size.dataset.size));
      const pic = e.target.closest('[data-pic]');
      if (!pic || !rec.id || finished() || Date.now() < frozenUntil) return;
      const { common } = spotCards(rec, rec.round);
      if (pic.dataset.pic === common) {
        if (rec.claims?.[rec.round]) return;
        chime([659.25, 880, 1046.5]);
        say('Got it!');
        L.update(NAME, { round: rec.round + 1, claims: { [rec.round]: kid.id } }).catch(fail);
      } else {
        // A wrong tap pauses this player for a moment, so guessing doesn't pay.
        frozenUntil = Date.now() + 1200;
        pic.classList.add('shake');
        app.querySelector('.spot-cards')?.classList.add('frozen');
        later(() => app.querySelector('.spot-cards')?.classList.remove('frozen'), 1200);
        say('Oops! Look again.');
      }
    });
  }

  /* ---------- Pass the ball ---------- */
  function pong(kid) {
    const { fail, here } = frame(
      kid,
      '🏓 Pass the ball',
      `<div class="pong-head"></div>
      <div class="pong-wrap">
        <canvas class="pong-canvas"></canvas>
        <div class="pong-over"></div>
      </div>`
    );
    const canvas = app.querySelector('.pong-canvas');
    const ctx2d = canvas.getContext('2d');
    let rec = {};
    let side = null; // 'left' or 'right': where this iPad sits on the table
    let ball = null; // { x, y, vx, vy } while the ball is on this screen (x, y from 0 to 1)
    let lastSeq = null;
    let paddle = 0.5;
    let rally = 0;
    let serveAt = 0;
    let raf = 0;
    const PADDLE_H = 0.32;
    const BASE = 0.42; // screen widths per second: slow and friendly

    const partnerId = () => (side ? rec.sides?.[side === 'left' ? 'right' : 'left'] : null);
    const partner = () => {
      const id = partnerId();
      const h = here();
      return id && id !== kid.id && h[id] && Date.now() - h[id] < k.PRESENCE_MS ? kidById(id) : null;
    };
    const toInner = () => (side === 'left' ? 1 : -1); // direction from this screen toward the other iPad

    function head() {
      const box = app.querySelector('.pong-head');
      if (!box) return;
      const ids = [kid.id, partner()?.id].filter(Boolean);
      box.innerHTML =
        ids
          .map(kidById)
          .map((p) => `<span class="mem-score" style="--kid:${p.color}">${esc(p.avatar)} <b>${rec.score?.[p.id] || 0}</b></span>`)
          .join('') + `<span class="mem-turn">🏓 ${rally}</span>`;
    }
    function overlay() {
      const box = app.querySelector('.pong-over');
      if (!box) return;
      if (!side) {
        box.innerHTML = `<div class="pong-pick"><p>Which side of the table are you on?</p>
          <div class="row"><button class="btn big-btn" data-side="left">⬅️ Left</button><button class="btn big-btn" data-side="right">Right ➡️</button></div></div>`;
        box.hidden = false;
      } else if (!ball && !serveAt && (!rec.ball || rec.ball.owner === kid.id || !partner())) {
        box.innerHTML = `<div class="pong-pick"><button class="btn go big-btn" data-serve>▶️ Serve</button>
          <p class="hint">${partner() ? `Playing with ${esc(partner().avatar)} ${esc(partner().name)}` : 'Practice: the ball bounces back. Your sibling can join on the other side.'}</p></div>`;
        box.hidden = false;
      } else box.hidden = true;
    }
    function resize() {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    }
    function serve() {
      serveAt = 0;
      ball = { x: 0.5, y: 0.5, vx: BASE * toInner(), vy: (Math.random() - 0.5) * 0.4 };
      rally = 0;
      const seq = (rec.ball?.seq || 0) + 1;
      lastSeq = seq;
      live.update('pong', { ball: { owner: kid.id, seq, y: 0.5, speed: BASE, vy: 0 } }).catch(fail);
      say('Go!');
      overlay();
      head();
    }

    function step(dt) {
      if (!ball) return;
      const w = canvas.width || 1;
      const h = canvas.height || 1;
      const rx = (h * 0.045) / w; // ball radius, as a share of width
      const ry = 0.045;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.y < ry) (ball.y = ry), (ball.vy = Math.abs(ball.vy));
      if (ball.y > 1 - ry) (ball.y = 1 - ry), (ball.vy = -Math.abs(ball.vy));
      const padX = 0.06;
      const atOuter = side === 'left' ? ball.x - rx <= padX && ball.vx < 0 : ball.x + rx >= 1 - padX && ball.vx > 0;
      const atInner = side === 'left' ? ball.x - rx > 1 && ball.vx > 0 : ball.x + rx < 0 && ball.vx < 0;
      if (atOuter) {
        if (Math.abs(ball.y - paddle) <= PADDLE_H / 2 + ry) {
          const speed = Math.min(Math.abs(ball.vx) * 1.06, 1.1);
          ball.vx = speed * toInner();
          ball.vy = Math.max(-0.9, Math.min(0.9, ball.vy + (ball.y - paddle) * 1.6));
          ball.x = side === 'left' ? padX + rx : 1 - padX - rx;
          rally++;
          head();
          chime([620 + Math.min(rally, 10) * 30]);
        } else if (side === 'left' ? ball.x < -rx : ball.x > 1 + rx) {
          // Missed: the other kid scores, and this side serves again.
          ball = null;
          rally = 0;
          const p = partner();
          if (p) {
            live.update('pong', { score: { [p.id]: (rec.score?.[p.id] || 0) + 1 } }).catch(fail);
            say(`Point for ${p.name}!`);
          } else say('Oops! Try again.');
          serveAt = Date.now() + 1200;
          head();
        }
      } else if (atInner) {
        const p = partner();
        if (p) {
          // Hand the ball to the other iPad.
          const seq = (rec.ball?.seq || lastSeq || 0) + 1;
          lastSeq = seq;
          live.update('pong', { ball: { owner: p.id, seq, y: ball.y, speed: Math.abs(ball.vx), vy: ball.vy, rally } }).catch(fail);
          ball = null;
        } else {
          ball.vx = -ball.vx; // practice: bounce off the middle
          ball.x = side === 'left' ? 1 - rx : rx;
        }
      }
    }
    function drawField() {
      const w = canvas.width;
      const h = canvas.height;
      if (!w || !h) return;
      const c = ctx2d;
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#dcfce7';
      c.fillRect(0, 0, w, h);
      // The middle of the table is this screen's inner edge.
      c.strokeStyle = '#86efac';
      c.lineWidth = Math.max(4, w * 0.006);
      c.setLineDash([h * 0.04, h * 0.03]);
      const ix = side === 'left' ? w - c.lineWidth : c.lineWidth;
      c.beginPath();
      c.moveTo(ix, 0);
      c.lineTo(ix, h);
      c.stroke();
      c.setLineDash([]);
      // Paddle on the outer edge.
      const pw = w * 0.03;
      const ph = h * PADDLE_H;
      const px = side === 'left' ? w * 0.03 : w - w * 0.03 - pw;
      c.fillStyle = kid.color;
      c.beginPath();
      c.roundRect ? c.roundRect(px, paddle * h - ph / 2, pw, ph, pw / 2) : c.rect(px, paddle * h - ph / 2, pw, ph);
      c.fill();
      if (ball) {
        const r = h * 0.045;
        c.fillStyle = '#ffffff';
        c.shadowColor = 'rgba(0,0,0,0.25)';
        c.shadowBlur = r * 0.6;
        c.beginPath();
        c.arc(ball.x * w, ball.y * h, r, 0, Math.PI * 2);
        c.fill();
        c.shadowBlur = 0;
        c.font = `${r * 1.5}px system-ui`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('⚽', ball.x * w, ball.y * h + r * 0.05);
      } else if (side && partner() && rec.ball?.owner && rec.ball.owner !== kid.id) {
        c.font = `${h * 0.08}px system-ui`;
        c.textAlign = 'center';
        c.fillStyle = '#16a34a';
        c.fillText(side === 'left' ? '⚽ ➡️' : '⬅️ ⚽', w / 2, h / 2);
      }
    }
    let last = performance.now();
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (serveAt && Date.now() >= serveAt) {
        serveAt = 0;
        overlay();
      }
      step(dt);
      drawField();
      raf = requestAnimationFrame(loop);
    }

    onCleanup(
      live.watch(
        'pong',
        (r) => {
          rec = r || {};
          if (side && rec.sides?.[side] !== kid.id) side = null; // someone else took this side
          const b = rec.ball;
          if (side && b && b.owner === kid.id && b.seq !== lastSeq && typeof b.y === 'number') {
            // The ball just rolled over from the other iPad.
            lastSeq = b.seq;
            rally = b.rally || rally;
            ball = { x: side === 'left' ? 1 : 0, y: b.y, vx: -(b.speed || BASE) * toInner(), vy: b.vy || 0 };
          }
          if (b && b.owner !== kid.id) ball = null;
          head();
          overlay();
        },
        fail
      )
    );
    const move = (e) => {
      const r = canvas.getBoundingClientRect();
      paddle = Math.max(PADDLE_H / 2, Math.min(1 - PADDLE_H / 2, (e.clientY - r.top) / r.height));
    };
    canvas.addEventListener('pointerdown', move);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('resize', resize);
    onCleanup(() => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    });
    resize();
    raf = requestAnimationFrame(loop);
    overlay();
    head();
    later(() => say('Pass the ball! Put your iPads side by side.'), 200);

    listen((e) => {
      const s = e.target.closest('[data-side]');
      if (s) {
        side = s.dataset.side;
        const other = side === 'left' ? 'right' : 'left';
        live.update('pong', { sides: { [side]: kid.id, ...(rec.sides?.[other] === kid.id ? { [other]: null } : {}) } }).catch(fail);
        resize();
        overlay();
        return;
      }
      if (e.target.closest('[data-serve]')) serve();
    });
  }

  /* ---------- Fill the jar: race the clock ---------- */
  // Pick a jar, count down 3-2-1, then tap as fast as you can. The clock stops when the jar is full.
  // Best times are kept for each jar size: one shared team record, and each kid's record when alone.
  const JARS = [
    [50, 'Small', 11],
    [100, 'Big', 7.5],
    [200, 'Giant', 5.4],
  ]; // size, name, ball radius (sized so a full jar reaches the top)
  const COUNTDOWN_MS = 3000;
  const lighter = (hex) => {
    const n = parseInt(String(hex).slice(1), 16);
    if (Number.isNaN(n)) return hex;
    const f = (v) => Math.round(v + (255 - v) * 0.45);
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  };
  const raceTime = (ms) => {
    const s = Math.max(0, ms) / 1000;
    return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  };
  const sayTime = (ms) => {
    const s = Math.round(ms / 1000);
    return s < 60 ? `${s} seconds` : `${Math.floor(s / 60)} minute${s >= 120 ? 's' : ''} ${s % 60} seconds`;
  };
  // Solo records live on the kid's own iPad.
  const SOLO_KEY = 'stickerBoard.jarRace';
  const soloBest = (kidId) => {
    try {
      return JSON.parse(localStorage.getItem(SOLO_KEY) || '{}')[kidId] || {};
    } catch {
      return {};
    }
  };
  const saveSoloBest = (kidId, size, ms) => {
    try {
      const all = JSON.parse(localStorage.getItem(SOLO_KEY) || '{}');
      (all[kidId] ||= {})[size] = ms;
      localStorage.setItem(SOLO_KEY, JSON.stringify(all));
    } catch {}
  };

  function jarSVG(size, colors) {
    const [, , r] = JARS.find(([n]) => n === size) || JARS[0];
    const dx = 2 * r + 1;
    const dy = r * 1.8;
    const cols = Math.floor(150 / dx);
    const x0 = 110 - ((cols - 1) * dx) / 2;
    const balls = colors
      .map((color, i) => {
        const row = Math.floor(i / cols);
        const cx = x0 + (i % cols) * dx + (row % 2 ? dx / 2 : 0) - (row % 2 && i % cols === cols - 1 ? dx : 0);
        const cy = 244 - r - row * dy;
        return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${color}" stroke="#fff" stroke-width="${r > 6 ? 2 : 1}"/>`;
      })
      .join('');
    const full = colors.length >= size;
    return `<svg viewBox="0 0 220 272" class="jar">
      <defs><clipPath id="race-dome"><path d="M30,250 L30,110 A80,80 0 0 1 190,110 L190,250 Z"/></clipPath></defs>
      <path class="glass-bg" d="M30,250 L30,110 A80,80 0 0 1 190,110 L190,250 Z"/>
      <g clip-path="url(#race-dome)">${balls}</g>
      ${full ? '<text x="110" y="62" text-anchor="middle" font-size="40">🎉</text>' : ''}
      <path class="glass" d="M30,250 L30,110 A80,80 0 0 1 190,110 L190,250 Z"/>
      <path d="M22,250 L198,250 L186,270 L34,270 Z" fill="#a9c7d6"/>
    </svg>`;
  }

  // Spread each color through the jar instead of in blocks.
  function interleave(list) {
    const groups = {};
    for (const c of list) (groups[c] ||= 0), groups[c]++;
    const entries = Object.entries(groups);
    const left = entries.map(([, n]) => n);
    const out = [];
    while (out.length < list.length) {
      let pick = -1;
      for (let i = 0; i < left.length; i++) if (left[i] > 0 && (pick < 0 || left[i] / entries[i][1] > left[pick] / entries[pick][1])) pick = i;
      out.push(entries[pick][0]);
      left[pick]--;
    }
    return out;
  }

  function fill(kid, solo = false) {
    const L = solo ? soloLive : live;
    const NAME = solo ? `jarrace-${kid.id}` : 'jarrace';
    const { fail } = frame(
      kid,
      solo ? '⏱️ Jar race' : '🫙 Fill the jar together',
      `<div class="share-row">
        <div class="share-jar"></div>
        <div class="share-side">
          <div class="race-time"></div>
          <div class="share-count"></div>
          <button class="tap-btn" data-tap style="--kid:${kid.color}"><span>${esc(kid.avatar)}</span>TAP!</button>
          <div class="race-sizes"></div>
        </div>
      </div>`,
      solo
    );
    let rec = {};
    let game = null;
    let mine = 0;
    let teamBest = {};
    let finished = null;
    let spoken = null;
    let sendTimer = null;
    let lastPicked = 100;
    let recordGame = null; // the game that set a new record

    const best = (size) => (solo ? soloBest(kid.id)[size] : teamBest[size]) || null;
    const total = () => Object.values(rec.taps || {}).reduce((s, n) => s + (Number(n) || 0), 0);
    const phase = () => {
      if (!rec.id) return 'pick';
      if (rec.time) return 'done';
      return Date.now() < rec.startAt ? 'countdown' : 'go';
    };

    function colors() {
      const size = rec.size || 0;
      if (rec.time) {
        // Full: fill every ball, keeping each kid's share.
        const t = total() || 1;
        const all = solo ? [] : Object.entries(rec.taps || {}).flatMap(([id, n]) => Array(Math.round(((Number(n) || 0) / t) * size)).fill(kidById(id)?.color || kid.color));
        while (all.length < size) all.push(solo ? (all.length % 2 ? kid.color : lighter(kid.color)) : kid.color);
        if (!solo) return interleave(all.slice(0, size));
        return all.slice(0, size);
      }
      if (solo) return Array.from({ length: Math.min(total(), size) }, (_, i) => (i % 2 ? kid.color : lighter(kid.color)));
      // Balls in each kid's color, mixed in roughly the order they arrived.
      const counts = Object.entries(rec.taps || {}).map(([id, n]) => [kidById(id)?.color || '#94a3b8', Number(n) || 0]);
      const left = counts.map(([, c]) => c);
      const seq = [];
      while (seq.length < size && left.some((c) => c > 0)) {
        let pick = -1;
        for (let i = 0; i < left.length; i++) if (left[i] > 0 && (pick < 0 || left[i] / counts[i][1] > left[pick] / counts[pick][1])) pick = i;
        seq.push(counts[pick][0]);
        left[pick]--;
      }
      return seq;
    }
    function sizesHTML() {
      return JARS.map(([n, label]) => {
        const b = best(n);
        return `<button class="btn${n === (rec.size || lastPicked) ? '' : ' ghost'} race-size" data-jar="${n}">${label} (${n})${b ? `<small>🏆 ${raceTime(b)}</small>` : ''}</button>`;
      }).join('');
    }
    function paintJar() {
      const box = app.querySelector('.share-jar');
      if (box) box.innerHTML = jarSVG(rec.size || lastPicked, colors());
      const count = app.querySelector('.share-count');
      if (count) count.innerHTML = rec.id ? `<b>${rec.time ? rec.size : Math.min(total(), rec.size)}</b> / ${rec.size}` : '';
    }
    function paint() {
      const p = phase();
      const time = app.querySelector('.race-time');
      if (!time) return;
      const b = best(rec.size || lastPicked);
      if (p === 'pick') time.innerHTML = `<span class="race-msg">Pick a jar!</span>`;
      else if (p === 'countdown') time.innerHTML = `<span class="race-count">${Math.ceil((rec.startAt - Date.now()) / 1000)}</span>`;
      else if (p === 'go') time.innerHTML = `${raceTime(Date.now() - rec.startAt)}${b ? `<small>🏆 ${raceTime(b)}</small>` : ''}`;
      else time.innerHTML = `${raceTime(rec.time)}<small>${recordGame === rec.id ? '🎉 New record!' : b ? `🏆 ${raceTime(b)}` : ''}</small>`;
      app.querySelector('[data-tap]').disabled = p !== 'go';
      const sizes = app.querySelector('.race-sizes');
      sizes.hidden = p === 'countdown' || p === 'go';
      if (!sizes.hidden) sizes.innerHTML = sizesHTML();
    }
    // Countdown voice and clock, ten times a second.
    every(() => {
      const p = phase();
      if (p === 'countdown' || p === 'go') {
        const left = Math.ceil((rec.startAt - Date.now()) / 1000);
        const word = p === 'go' ? 'Go!' : left <= 3 ? String(left) : null;
        if (word && spoken !== `${rec.id}/${word}`) {
          spoken = `${rec.id}/${word}`;
          say(word);
          chime(word === 'Go!' ? [783.99, 1046.5] : [523.25]);
        }
        paint();
      }
    }, 100);

    function finish() {
      if (finished === rec.id) return;
      finished = rec.id;
      const prev = best(rec.size);
      const record = !prev || rec.time <= prev;
      if (record) {
        if (solo) saveSoloBest(kid.id, rec.size, rec.time);
        else if (!teamBest[rec.size] || rec.time < teamBest[rec.size]) live.update('jarbest', { [rec.size]: rec.time }).catch(fail);
      }
      if (record) recordGame = rec.id;
      celebrate(record ? '🏆' : '🎉', record ? 40 : 26);
      chime([523.25, 659.25, 783.99, 1046.5, 1318.5]);
      say(`Full! ${sayTime(rec.time)}!${record && prev ? ' A new record!' : ''}`);
      paint();
    }
    const changed = () => {
      if (rec.id !== game) {
        game = rec.id;
        mine = Number(rec.taps?.[kid.id]) || 0;
      }
      // Our own taps may be ahead of what the shared record has caught up to.
      if (rec.id && !rec.time) rec = { ...rec, taps: { ...rec.taps, [kid.id]: Math.max(mine, Number(rec.taps?.[kid.id]) || 0) } };
      // The sibling's taps arrive a moment later, so the jar can fill from their side: stop the clock here too.
      if (rec.id && !rec.time && rec.startAt && total() >= rec.size) {
        rec = { ...rec, time: Date.now() - rec.startAt };
        L.update(NAME, { time: rec.time }).catch(fail);
      }
      paintJar();
      paint();
      if (rec.time) finish();
    };
    if (!solo) onCleanup(live.watch('jarbest', (b) => ((teamBest = b || {}), paint()), fail));
    onCleanup(L.watch(NAME, (r) => ((rec = r || {}), changed()), fail));
    onCleanup(() => clearTimeout(sendTimer));
    paintJar();
    paint();
    later(() => say(solo ? 'Jar race! Pick a jar.' : 'Fill the jar together! Pick a jar.'), 200);

    listen((e) => {
      const j = e.target.closest('[data-jar]');
      if (j) {
        lastPicked = Number(j.dataset.jar);
        L.reset(NAME, { id: uid(), size: lastPicked, startAt: Date.now() + COUNTDOWN_MS, taps: {} }).catch(fail);
        return;
      }
      if (!e.target.closest('[data-tap]') || phase() !== 'go') return;
      mine++;
      rec = { ...rec, taps: { ...rec.taps, [kid.id]: mine } };
      if (total() >= rec.size) {
        clearTimeout(sendTimer);
        sendTimer = null;
        rec = { ...rec, time: Date.now() - rec.startAt };
        L.update(NAME, { taps: { [kid.id]: mine }, time: rec.time }).catch(fail);
        changed();
        return;
      }
      paintJar();
      chime([500 + (total() % 12) * 40]);
      if (!sendTimer)
        sendTimer = setTimeout(() => {
          sendTimer = null;
          if (rec.id && !rec.time) L.update(NAME, { taps: { [kid.id]: mine } }).catch(fail);
        }, 200);
    });
  }

  return {
    memory,
    spot,
    pong,
    fill,
    soloMemory: (kid) => memory(kid, true),
    soloSpot: (kid) => spot(kid, true),
    soloFill: (kid) => fill(kid, true),
  };
}
