/*
 * together2.js — more games for two kids on two iPads (from the 🤝 Play together menu):
 *
 *   Tic-tac-toe       take turns; three in a row wins
 *   Copy my picture   one kid colors a little grid and sends it; the other copies it
 *   Hide and seek     one kid hides an animal behind a bush; the other finds it ("warmer", "colder")
 *   Hot potato        tap to throw the potato to the other iPad before it pops
 *   Build a tower     take turns dropping a swinging block; how high can you go?
 *   Simon says        the pads flash a pattern, split across both iPads; repeat it together
 *
 * Same approach as together.js: each game is one live record that both iPads watch, and only the
 * iPad whose turn it is changes it. With no sibling around, the first four play against a friendly
 * robot (run on this iPad); Build a tower and Simon says just work alone.
 */

const ROBOT = { id: 'robot', name: 'Robot', avatar: '🤖', color: '#94a3b8' };
const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];
const ANIMALS = ['🐰', '🦊', '🐶', '🐱', '🐼', '🐸', '🦄', '🐵', '🐯', '🐨'];
const BUSHES = ['🌳', '🌲', '🌿', '🌳'];
const PADS = [
  { color: '#ef4444', tone: 329.63, emoji: '🍓' },
  { color: '#3b82f6', tone: 392.0, emoji: '🐳' },
  { color: '#22c55e', tone: 440.0, emoji: '🐸' },
  { color: '#facc15', tone: 523.25, emoji: '⭐' },
];

// Best scores when playing alone, kept on the kid's own iPad.
const SOLO_KEY = 'stickerBoard.togetherBest';
function soloBest(kidId, game) {
  try {
    return JSON.parse(localStorage.getItem(SOLO_KEY) || '{}')[kidId]?.[game] || 0;
  } catch {
    return 0;
  }
}
function saveSoloBest(kidId, game, n) {
  try {
    const all = JSON.parse(localStorage.getItem(SOLO_KEY) || '{}');
    (all[kidId] ||= {})[game] = n;
    localStorage.setItem(SOLO_KEY, JSON.stringify(all));
  } catch {}
}

export function moreGames(k, { frame, partnerOf }) {
  const { app, live, esc, uid, kidById, say, chime, celebrate, later, every, listen, onCleanup } = k;
  const who = (id) => (id === ROBOT.id ? ROBOT : kidById(id));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // Players for a new game: me and my sibling if they're here, otherwise me and the robot (or just me).
  function playersFor(kid, here, robot) {
    const p = partnerOf(kid, here());
    return p ? [kid.id, p.id] : robot ? [kid.id, ROBOT.id] : [kid.id];
  }
  const nextOf = (players, id) => players[(players.indexOf(id) + 1) % players.length];
  const chips = (ids, scores = null, active = null) =>
    ids
      .map(who)
      .filter(Boolean)
      .map((p) => `<span class="mem-score${p.id === active ? ' on' : ''}" style="--kid:${p.color}">${esc(p.avatar)}${scores ? ` <b>${scores[p.id] || 0}</b>` : ` ${esc(p.name)}`}</span>`)
      .join('');
  const turnText = (kid, id) => {
    const p = who(id);
    return p ? `${esc(p.avatar)} ${p.id === kid.id ? 'Your' : `${esc(p.name)}'s`} turn` : '';
  };
  const bigCheer = (emoji) => {
    celebrate(emoji, 30);
    chime([523.25, 659.25, 783.99, 1046.5, 1318.5]);
  };
  // Keep a shared record in sync, showing our own change right away.
  function sync(name, fail, onChange) {
    let rec = {};
    onCleanup(live.watch(name, (r) => ((rec = r || {}), onChange(rec)), fail));
    return {
      get: () => rec,
      set(change, merged) {
        rec = merged || { ...rec, ...change };
        onChange(rec);
        return live.update(name, change).catch(fail);
      },
      reset(r) {
        rec = r;
        onChange(rec);
        return live.reset(name, r).catch(fail);
      },
    };
  }

  const RESTART = `<div class="row restart-row"><button class="link" data-restart>🔁 New game</button></div>`;

  /* ---------- Tic-tac-toe ---------- */
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const lineOf = (marks) => LINES.find(([a, b, c]) => marks[a] && marks[a] === marks[b] && marks[a] === marks[c]) || null;

  function ttt(kid) {
    const { fail, here } = frame(
      kid,
      '⭕ Tic-tac-toe',
      `<div class="mem-head"></div><div class="ttt-grid"></div><div class="row"><button class="btn ghost" data-new>🔁 New game</button></div>`
    );
    let cheered = null;
    let botAt = null;
    const s = sync('ttt', fail, changed);

    function changed(rec) {
      const head = app.querySelector('.mem-head');
      const grid = app.querySelector('.ttt-grid');
      if (!head) return;
      if (!rec.id) {
        head.innerHTML = '<p class="mem-turn">Tap New game to start!</p>';
        grid.innerHTML = '';
        return;
      }
      const marks = rec.marks || {};
      const line = lineOf(marks);
      const full = Object.keys(marks).length >= 9;
      head.innerHTML =
        chips(rec.players, rec.wins, line || full ? null : rec.turn) +
        `<span class="mem-turn">${line ? `🎉 ${esc(who(marks[line[0]])?.name || '')} wins!` : full ? "🤝 It's a tie!" : turnText(kid, rec.turn)}</span>`;
      grid.innerHTML = Array.from({ length: 9 }, (_, i) => {
        const p = who(marks[i]);
        return `<button class="ttt-cell${line?.includes(i) ? ' win' : ''}" data-cell="${i}"${p ? ` style="--kid:${p.color}"` : ''}>${p ? esc(p.avatar) : ''}</button>`;
      }).join('');
      if ((line || full) && cheered !== rec.id) {
        cheered = rec.id;
        const w = line && who(marks[line[0]]);
        if (!w) say("It's a tie! Great game!");
        else if (w.id === ROBOT.id) say('The robot wins! Try again!');
        else {
          bigCheer(w.avatar);
          say(w.id === kid.id ? `You win, ${kid.name}!` : `${w.name} wins! Great game!`);
        }
      }
      // The robot moves from this iPad.
      if (!line && !full && rec.turn === ROBOT.id && botAt !== `${rec.id}/${Object.keys(marks).length}`) {
        botAt = `${rec.id}/${Object.keys(marks).length}`;
        later(robotMove, 800);
      }
    }
    function place(cell, by) {
      const rec = s.get();
      const marks = { ...(rec.marks || {}), [cell]: by };
      const line = lineOf(marks);
      const change = { marks: { [cell]: by }, turn: nextOf(rec.players, by) };
      if (line) change.wins = { [by]: (rec.wins?.[by] || 0) + 1 };
      chime([by === kid.id ? 660 : 520]);
      s.set(change, { ...rec, ...change, marks, wins: { ...rec.wins, ...(change.wins || {}) } });
    }
    function robotMove() {
      const rec = s.get();
      const marks = rec.marks || {};
      if (rec.turn !== ROBOT.id || lineOf(marks)) return;
      const open = [...Array(9).keys()].filter((i) => !marks[i]);
      if (!open.length) return;
      const wouldWin = (id) => open.find((i) => lineOf({ ...marks, [i]: id }));
      const me = wouldWin(ROBOT.id);
      const block = Math.random() < 0.6 ? wouldWin(kid.id) : undefined; // a beatable robot
      const cell = me ?? block ?? (!marks[4] && Math.random() < 0.5 ? 4 : pick(open));
      place(cell, ROBOT.id);
    }
    later(() => say('Tic-tac-toe! Get three in a row.'), 200);
    listen((e) => {
      if (e.target.closest('[data-new]')) {
        const rec = s.get();
        const players = playersFor(kid, here, true);
        // Take turns going first.
        const first = rec.first && players.includes(rec.first) ? nextOf(players, rec.first) : kid.id;
        const sameTeam = rec.players && players.every((p) => rec.players.includes(p));
        return s.reset({ id: uid(), players, first, turn: first, marks: {}, wins: sameTeam ? rec.wins || {} : {} });
      }
      const c = e.target.closest('[data-cell]');
      const rec = s.get();
      if (!c || !rec.id) return;
      const marks = rec.marks || {};
      if (lineOf(marks) || Object.keys(marks).length >= 9 || marks[c.dataset.cell]) return;
      if (rec.turn !== kid.id) return say(rec.turn === ROBOT.id ? "It's the robot's turn!" : `It's ${who(rec.turn)?.name}'s turn!`);
      place(Number(c.dataset.cell), kid.id);
    });
  }

  /* ---------- Copy my picture ---------- */
  // Two ways to play: 👀 look and copy (the picture stays up), or 🧠 remember it (10 seconds to look,
  // then it hides; one free 3-second peek; tap Done to see how many squares match).
  const REMEMBER_MS = 10000;
  const PEEK_MS = 3000;

  function copy(kid) {
    const { fail, here } = frame(kid, '🎨 Copy my picture', `<div class="mem-head"></div><div class="copy-area"></div>${RESTART}`);
    let color = 0;
    let draft = null; // the maker's picture while making it (only on the maker's iPad)
    let cheered = null;
    let robotRound = null;
    let sendTimer = null;
    let view = null; // what the remember round is showing: 'show', 'peek' or 'hide'
    const s = sync('copy', fail, changed);
    onCleanup(() => clearTimeout(sendTimer));

    const blank = (n) => Array(n * n).fill(-1);
    const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
    const matches = (rec) => rec.pattern.filter((c, i) => c === rec.copy[i]).length;
    function grid(cells, size, attr, small = false, marks = null) {
      return `<div class="copy-grid${small ? ' small' : ''}" style="--n:${size}">${cells
        .map(
          (c, i) =>
            `<button class="copy-cell${marks ? (marks[i] ? ' right' : ' wrong') : ''}" ${attr ? `${attr}="${i}"` : 'disabled'} style="background:${c >= 0 ? COLORS[c] : '#fff'}">${marks ? (marks[i] ? '✓' : '✗') : ''}</button>`
        )
        .join('')}</div>`;
    }
    const hidden = (size) => `<div class="copy-grid small hidden-pic" style="--n:${size}"><span>❓</span></div>`;
    const palette = () =>
      `<div class="copy-palette">${COLORS.map((c, i) => `<button class="copy-color${i === color ? ' on' : ''}" data-color="${i}" style="background:${c}" aria-label="Color ${i + 1}"></button>`).join('')}</div>`;
    // In a remember round: is the picture up right now?
    const viewOf = (rec) => {
      const now = Date.now();
      if (rec.mode !== 'remember' || rec.phase !== 'copy') return null;
      if (now < rec.showUntil) return 'show';
      if (now < (rec.peekUntil || 0)) return 'peek';
      return 'hide';
    };
    const secsLeft = (until) => Math.max(1, Math.ceil((until - Date.now()) / 1000));

    function newRound(maker, size) {
      const rec = s.get();
      const players = playersFor(kid, here, true);
      const n = size || rec.size || 3;
      draft = maker === kid.id ? blank(n) : null;
      const r = { id: uid(), players, maker, size: n, pattern: blank(n), copy: blank(n), phase: 'make', mode: rec.mode || 'look' };
      if (maker === ROBOT.id) {
        // The robot paints a few squares, a bit more each time.
        const cells = Math.min(n * n - 1, 2 + (rec.robotLevel || 1));
        const spots = [...Array(n * n).keys()].sort(() => Math.random() - 0.5).slice(0, cells);
        for (const i of spots) r.pattern[i] = Math.floor(Math.random() * COLORS.length);
        Object.assign(r, sendFields(r.mode, n), { robotLevel: (rec.robotLevel || 1) + 1 });
      }
      s.reset(r);
    }
    const sendFields = (mode, n) => ({ copy: blank(n), phase: 'copy', mode, showUntil: mode === 'remember' ? Date.now() + REMEMBER_MS : 0, peekUntil: 0, peeked: false });

    function changed(rec) {
      const head = app.querySelector('.mem-head');
      const area = app.querySelector('.copy-area');
      if (!head) return;
      view = viewOf(rec);
      if (!rec.id) {
        head.innerHTML = '';
        area.innerHTML = `<p class="mem-turn">Who makes the first picture?</p><div class="row"><button class="btn big-btn" data-start>🎨 Me!</button></div>`;
        return;
      }
      const maker = who(rec.maker);
      const copier = who(rec.players.find((p) => p !== rec.maker));
      const iMake = rec.maker === kid.id;
      head.innerHTML = chips(rec.players) + (rec.phase !== 'make' ? `<span class="mem-turn">${rec.mode === 'remember' ? '🧠 Remember it' : '👀 Look and copy'}</span>` : '');
      if (rec.phase === 'make') {
        if (iMake) {
          if (!draft || draft.length !== rec.size * rec.size) draft = blank(rec.size);
          const ready = draft.some((c) => c >= 0) ? '' : ' disabled';
          area.innerHTML = `<p class="mem-turn">Make a picture for ${esc(copier?.name || 'your partner')} to copy!</p>
            ${palette()}${grid(draft, rec.size, 'data-paint')}
            <div class="row">
              <button class="btn ghost" data-size="${rec.size === 3 ? 4 : 3}">${rec.size === 3 ? 'Bigger grid' : 'Smaller grid'}</button>
              <button class="btn go big-btn" data-send="look"${ready}>👀 Send: look and copy</button>
              <button class="btn go big-btn" data-send="remember"${ready}>🧠 Send: remember it</button>
            </div>`;
        } else area.innerHTML = `<p class="mem-turn wait">${esc(maker?.avatar || '')} ${esc(maker?.name || '')} is making a picture…</p>`;
        return;
      }
      if (rec.phase === 'copy') {
        if (!iMake) {
          if (view === 'show')
            area.innerHTML = `<p class="mem-turn">🧠 Remember it! <b class="copy-count">${secsLeft(rec.showUntil)}</b></p>${grid(rec.pattern, rec.size, null)}`;
          else if (view)
            area.innerHTML = `<p class="mem-turn">Now make it from memory!</p>
              <div class="copy-pair"><div><p class="hint">${view === 'peek' ? '👀 Peek!' : 'Picture'}</p>${view === 'peek' ? grid(rec.pattern, rec.size, null, true) : hidden(rec.size)}</div>
              <div><p class="hint">Your picture</p>${palette()}${grid(rec.copy, rec.size, 'data-copy')}</div></div>
              <div class="row">
                ${rec.peeked ? '' : `<button class="btn ghost big-btn" data-peek>👀 Peek (1)</button>`}
                <button class="btn go big-btn" data-done>✅ Done</button>
              </div>`;
          else
            area.innerHTML = `<p class="mem-turn">Copy ${esc(maker?.name || '')}'s picture!</p>
              <div class="copy-pair"><div><p class="hint">Picture</p>${grid(rec.pattern, rec.size, null, true)}</div>
              <div><p class="hint">Your copy</p>${palette()}${grid(rec.copy, rec.size, 'data-copy')}</div></div>`;
        } else
          area.innerHTML = `<p class="mem-turn wait">${esc(copier?.avatar || '')} ${esc(copier?.name || '')} is ${
            view === 'show' ? `remembering… <b class="copy-count">${secsLeft(rec.showUntil)}</b>` : view ? 'making it from memory…' : 'copying…'
          }</p>
            <div class="copy-pair"><div><p class="hint">Your picture</p>${grid(rec.pattern, rec.size, null, true)}</div>
            <div><p class="hint">${esc(copier?.name || '')}'s picture</p>${grid(rec.copy, rec.size, null, true)}</div></div>`;
        if (copier?.id === ROBOT.id && robotRound !== rec.id) {
          robotRound = rec.id;
          robotCopy(rec);
        }
        return;
      }
      // Done: look-and-copy rounds end on a perfect copy; remember rounds show how many squares match.
      const n = rec.size * rec.size;
      const got = matches(rec);
      const remember = rec.mode === 'remember';
      const marks = remember ? rec.pattern.map((c, i) => c === rec.copy[i]) : null;
      const verdict = !remember || got === n ? '🎉 Perfect!' : got >= n - 2 ? `So close! ${got} out of ${n}` : `Great try! ${got} out of ${n}`;
      area.innerHTML = `<p class="mem-turn">${verdict}</p>
        <div class="copy-pair"><div><p class="hint">${esc(maker?.name || '')}'s picture</p>${grid(rec.pattern, rec.size, null, true)}</div><div><p class="hint">${esc(copier?.name || '')}'s picture</p>${grid(rec.copy, rec.size, null, true, marks)}</div></div>
        <div class="row">${!iMake ? `<button class="btn big-btn" data-start>🎨 Now I'll make one!</button>` : `<button class="btn ghost big-btn" data-start>🎨 Make another</button>`}${
          copier?.id === ROBOT.id ? `<button class="btn ghost big-btn" data-robot>🤖 Robot's turn</button>` : ''
        }</div>`;
      if (cheered !== rec.id) {
        cheered = rec.id;
        const name = copier?.id === ROBOT.id ? 'The robot' : copier?.name || '';
        if (!remember || got === n) {
          bigCheer('🎨');
          say(remember ? `Perfect! ${name} remembered every square!` : copier?.id === ROBOT.id ? 'The robot copied it!' : `Perfect copy! Great job, ${name}!`);
        } else {
          celebrate('🎨', 14);
          say(got >= n - 2 ? `So close! ${got} out of ${n}!` : `Great try! ${got} out of ${n}!`);
        }
      }
    }

    // The robot copies one square at a time (from memory it sometimes gets one wrong).
    function robotCopy(rec) {
      const todo = rec.pattern.map((c, i) => [i, c]).filter(([, c]) => c >= 0);
      const step = () => {
        const r = s.get();
        if (r.id !== rec.id || r.phase !== 'copy') return;
        if (r.mode === 'remember' && Date.now() < r.showUntil) return later(step, 500);
        const next = todo.shift();
        if (!next) return s.set({ phase: 'done' });
        const [i, c] = next;
        const c2 = [...r.copy];
        c2[i] = r.mode === 'remember' && Math.random() < 0.15 ? (c + 1) % COLORS.length : c;
        chime([600]);
        if (r.mode !== 'remember' && same(c2, r.pattern)) return s.set({ copy: c2, phase: 'done' });
        s.set({ copy: c2 });
        later(step, 700);
      };
      later(step, 1000);
    }

    // Remember rounds: count down, hide the picture, and end a peek.
    let lastSaid = null;
    every(() => {
      const rec = s.get();
      const v = viewOf(rec);
      if (v !== view) {
        changed(rec);
        if (rec.maker !== kid.id && lastSaid !== `${rec.id}/${v}`) {
          lastSaid = `${rec.id}/${v}`;
          if (v === 'hide') say('Now make it from memory!');
        }
      } else if (v === 'show') {
        const c = app.querySelector('.copy-count');
        if (c) c.textContent = secsLeft(rec.showUntil);
      }
    }, 250);

    later(() => say('Copy my picture!'), 200);
    listen((e) => {
      if (e.target.closest('[data-restart]')) return s.reset({});
      const rec = s.get();
      if (e.target.closest('[data-start]')) return newRound(kid.id);
      if (e.target.closest('[data-robot]')) return newRound(ROBOT.id);
      const sz = e.target.closest('[data-size]');
      if (sz) {
        draft = blank(Number(sz.dataset.size));
        return s.set({ size: Number(sz.dataset.size), pattern: blank(Number(sz.dataset.size)), copy: blank(Number(sz.dataset.size)) });
      }
      const col = e.target.closest('[data-color]');
      if (col) {
        color = Number(col.dataset.color);
        app.querySelectorAll('.copy-color').forEach((b, i) => b.classList.toggle('on', i === color));
        return;
      }
      const paint = e.target.closest('[data-paint]');
      if (paint && draft) {
        const i = Number(paint.dataset.paint);
        draft[i] = draft[i] === color ? -1 : color;
        chime([500 + color * 60]);
        return changed(rec);
      }
      const send = e.target.closest('[data-send]');
      if (send && draft?.some((c) => c >= 0)) {
        const mode = send.dataset.send === 'remember' ? 'remember' : 'look';
        say(mode === 'remember' ? 'Sent! Remember it!' : 'Sent!');
        return s.set({ pattern: [...draft], ...sendFields(mode, rec.size) });
      }
      if (e.target.closest('[data-peek]') && !rec.peeked) {
        say('Peek!');
        return s.set({ peeked: true, peekUntil: Date.now() + PEEK_MS });
      }
      if (e.target.closest('[data-done]') && rec.phase === 'copy') {
        clearTimeout(sendTimer);
        sendTimer = null;
        return s.set({ copy: rec.copy, phase: 'done' });
      }
      const cp = e.target.closest('[data-copy]');
      if (cp && rec.phase === 'copy' && rec.maker !== kid.id && viewOf(rec) !== 'show') {
        const i = Number(cp.dataset.copy);
        const c2 = [...rec.copy];
        c2[i] = c2[i] === color ? -1 : color;
        chime([500 + color * 60]);
        if (rec.mode !== 'remember' && same(c2, rec.pattern)) {
          clearTimeout(sendTimer);
          sendTimer = null;
          return s.set({ copy: c2, phase: 'done' });
        }
        // Show it here now; send the picture so far at most every quarter second.
        s.get().copy = c2;
        changed(s.get());
        if (!sendTimer)
          sendTimer = setTimeout(() => {
            sendTimer = null;
            const r = s.get();
            if (r.phase === 'copy') live.update('copy', { copy: r.copy }).catch(fail);
          }, 250);
      }
    });
  }

  /* ---------- Hide and seek ---------- */
  function hide(kid) {
    const { fail, here } = frame(kid, '🌳 Hide and seek', `<div class="mem-head"></div><div class="hide-area"></div>${RESTART}`);
    const N = 16; // a 4 × 4 field of bushes
    const dist = (a, b) => Math.abs((a % 4) - (b % 4)) + Math.abs(Math.floor(a / 4) - Math.floor(b / 4));
    let cheered = null;
    let robotRound = null;
    let spoken = 0;
    const s = sync('hide', fail, changed);

    function newRound(hider) {
      const players = playersFor(kid, here, true);
      const r = { id: uid(), players, hider, animal: pick(ANIMALS), spot: -1, phase: 'hide', guesses: [] };
      if (hider === ROBOT.id) {
        r.spot = Math.floor(Math.random() * N);
        r.phase = 'seek';
      }
      s.reset(r);
    }
    function hint(guesses, spot) {
      const g = guesses.at(-1);
      const d = dist(g, spot);
      if (guesses.length < 2) return d <= 1 ? 'Ooh, very warm!' : 'Not here! Keep looking.';
      const before = dist(guesses.at(-2), spot);
      return d < before ? (d <= 1 ? 'Hot! Really close!' : 'Warmer!') : d > before ? 'Colder!' : 'Not here!';
    }
    function field(rec, { canHide, canSeek, showAnimal }) {
      return `<div class="hide-grid">${Array.from({ length: N }, (_, i) => {
        const looked = (rec.guesses || []).includes(i);
        const here2 = i === rec.spot && (showAnimal || rec.phase === 'found');
        const attr = canHide ? `data-hide="${i}"` : canSeek && !looked ? `data-seek="${i}"` : '';
        return `<button class="hide-bush${looked ? ' looked' : ''}${here2 ? ' found' : ''}" ${attr || 'disabled'}>${here2 ? rec.animal : looked ? '💨' : BUSHES[i % BUSHES.length]}</button>`;
      }).join('')}</div>`;
    }
    function changed(rec) {
      const head = app.querySelector('.mem-head');
      const area = app.querySelector('.hide-area');
      if (!head) return;
      if (!rec.id) {
        head.innerHTML = '';
        area.innerHTML = `<p class="mem-turn">Who hides first?</p><div class="row"><button class="btn big-btn" data-start>🙈 I'll hide!</button><button class="btn ghost big-btn" data-seekfirst>🔍 I'll look!</button></div>`;
        return;
      }
      const hider = who(rec.hider);
      const seeker = who(rec.players.find((p) => p !== rec.hider));
      const iHide = rec.hider === kid.id;
      head.innerHTML = chips(rec.players) + `<span class="mem-turn">${rec.animal} ${rec.guesses?.length ? `${rec.guesses.length} ${rec.guesses.length === 1 ? 'try' : 'tries'}` : ''}</span>`;
      if (rec.phase === 'hide') {
        area.innerHTML = iHide
          ? `<p class="mem-turn">Tap a bush to hide the ${rec.animal}! Don't let ${esc(seeker?.name || 'them')} see!</p>${field(rec, { canHide: true })}`
          : `<p class="mem-turn wait">🙈 ${esc(hider?.name || '')} is hiding the ${rec.animal}… no peeking!</p>${field(rec, {})}`;
      } else if (rec.phase === 'seek') {
        area.innerHTML = iHide
          ? `<p class="mem-turn wait">🔍 ${esc(seeker?.name || '')} is looking for your ${rec.animal}!</p>${field(rec, { showAnimal: true })}`
          : `<p class="mem-turn">Where's the ${rec.animal}? Tap a bush!</p>${field(rec, { canSeek: true })}`;
        // Say the hint for the latest guess (on the seeker's iPad).
        if (!iHide && rec.guesses?.length && spoken !== `${rec.id}/${rec.guesses.length}`) {
          spoken = `${rec.id}/${rec.guesses.length}`;
          say(hint(rec.guesses, rec.spot));
        }
        if (seeker?.id === ROBOT.id && robotRound !== `${rec.id}/${rec.guesses?.length || 0}`) {
          robotRound = `${rec.id}/${rec.guesses?.length || 0}`;
          later(robotGuess, 1100);
        }
      } else {
        const n = rec.guesses?.length || 0;
        area.innerHTML = `<p class="mem-turn">🎉 Found the ${rec.animal} in ${n} ${n === 1 ? 'try' : 'tries'}!</p>${field(rec, {})}
          <div class="row">${
            !iHide
              ? `<button class="btn big-btn" data-start>🙈 Now I'll hide!</button>`
              : seeker?.id === ROBOT.id
                ? `<button class="btn big-btn" data-seekfirst>🔍 Now I'll look!</button>`
                : `<button class="btn ghost big-btn" data-start>🙈 Hide again</button><button class="btn ghost big-btn" data-seekfirst>🔍 I'll look</button>`
          }</div>`;
        if (cheered !== rec.id) {
          cheered = rec.id;
          bigCheer(rec.animal);
          say(seeker?.id === kid.id ? `You found the ${ANIMAL_NAMES[rec.animal] || 'animal'}!` : `${seeker?.name || ''} found it!`);
        }
      }
    }
    function robotGuess() {
      const r = s.get();
      if (r.phase !== 'seek') return;
      const left = [...Array(N).keys()].filter((i) => !(r.guesses || []).includes(i));
      // Head toward the animal a little, so it doesn't take forever.
      const closest = Math.min(...left.map((i) => dist(i, r.spot)));
      const near = left.filter((i) => dist(i, r.spot) === closest);
      const g = Math.random() < 0.55 && near.length ? pick(near) : pick(left); // usually 3 to 6 tries
      guess(g, r);
    }
    function guess(i, rec) {
      const guesses = [...(rec.guesses || []), i];
      const found = i === rec.spot;
      chime(found ? [783.99, 1046.5] : [440]);
      s.set(found ? { guesses, phase: 'found' } : { guesses });
    }
    later(() => say("Hide and seek! Who's hiding?"), 200);
    listen((e) => {
      if (e.target.closest('[data-restart]')) return s.reset({});
      const rec = s.get();
      if (e.target.closest('[data-start]')) return newRound(kid.id);
      if (e.target.closest('[data-seekfirst]')) {
        const players = playersFor(kid, here, true);
        return newRound(players.find((p) => p !== kid.id) || ROBOT.id);
      }
      const h2 = e.target.closest('[data-hide]');
      if (h2 && rec.phase === 'hide' && rec.hider === kid.id) {
        chime([660, 880]);
        say('Hidden! Shh!');
        return s.set({ spot: Number(h2.dataset.hide), phase: 'seek' });
      }
      const sk = e.target.closest('[data-seek]');
      if (sk && rec.phase === 'seek' && rec.hider !== kid.id) guess(Number(sk.dataset.seek), rec);
    });
  }
  const ANIMAL_NAMES = { '🐰': 'bunny', '🦊': 'fox', '🐶': 'puppy', '🐱': 'kitty', '🐼': 'panda', '🐸': 'frog', '🦄': 'unicorn', '🐵': 'monkey', '🐯': 'tiger', '🐨': 'koala' };

  /* ---------- Hot potato ---------- */
  function potato(kid) {
    const { fail, here } = frame(kid, '🥔 Hot potato', `<div class="mem-head"></div><div class="potato-area"></div>`);
    let cheered = null;
    let lastTick = 0;
    let robotAt = null;
    let readyFor = null;
    const s = sync('potato', fail, changed);

    function start() {
      const players = playersFor(kid, here, true);
      s.reset({ id: uid(), players, holder: pick(players), explodeAt: Date.now() + 2000 + 8000 + Math.random() * 8000, startAt: Date.now() + 2000, throws: 0, popped: null });
    }
    function changed(rec) {
      const head = app.querySelector('.mem-head');
      const area = app.querySelector('.potato-area');
      if (!head) return;
      if (!rec.id) {
        head.innerHTML = '';
        area.innerHTML = `<p class="mem-turn">Pass the potato before it pops!</p><div class="row"><button class="btn big-btn" data-start>🥔 Start</button></div>`;
        return;
      }
      head.innerHTML = chips(rec.players, null, rec.popped ? null : rec.holder) + `<span class="mem-turn">🔁 ${rec.throws || 0}</span>`;
      if (rec.popped) {
        const p = who(rec.popped);
        area.innerHTML = `<div class="potato-pop">💥</div><p class="mem-turn">Pop! ${esc(p?.avatar || '')} ${p?.id === kid.id ? 'You' : esc(p?.name || '')} got the potato!</p>
          <div class="row"><button class="btn big-btn" data-start>🥔 Again!</button></div>`;
        if (cheered !== rec.id) {
          cheered = rec.id;
          celebrate(pick(['🥔', '🤪', '💥']), 34);
          chime([200, 150, 120]);
          say(p?.id === kid.id ? 'Pop! You got the potato! Ha ha!' : `Pop! ${p?.name || 'Someone'} got the potato!`);
        }
        return;
      }
      if (Date.now() < rec.startAt) {
        area.innerHTML = `<p class="mem-turn">Get ready…</p>`;
        return;
      }
      const mine = rec.holder === kid.id;
      area.innerHTML = mine
        ? `<button class="potato-btn" data-throw aria-label="Throw the potato">🥔</button><p class="mem-turn">Quick! Tap to throw it!</p>`
        : `<p class="mem-turn wait">🥔 ${esc(who(rec.holder)?.avatar || '')} ${esc(who(rec.holder)?.name || '')} has the potato!</p>`;
      if (rec.holder === ROBOT.id && robotAt !== `${rec.id}/${rec.throws}`) {
        robotAt = `${rec.id}/${rec.throws}`;
        later(() => {
          const r = s.get();
          if (r.holder === ROBOT.id && !r.popped) throwIt(r, ROBOT.id);
        }, 700 + Math.random() * 900);
      }
    }
    function throwIt(rec, from) {
      chime([880, 660]);
      s.set({ holder: nextOf(rec.players, from), throws: (rec.throws || 0) + 1 });
    }
    // Ticking that speeds up as the pop gets closer, and the pop itself.
    every(() => {
      const rec = s.get();
      if (!rec.id || rec.popped) return;
      const now = Date.now();
      if (now < rec.startAt) return;
      if (readyFor !== rec.id) {
        readyFor = rec.id; // "get ready" just ended
        changed(rec);
      }
      const left = rec.explodeAt - now;
      const gap = Math.max(140, Math.min(700, left / 8));
      if (now - lastTick > gap && rec.holder === kid.id) {
        lastTick = now;
        chime([1200]);
      }
      // The holder's iPad pops it (or the other iPad, if the holder has gone quiet).
      const mineToPop = rec.holder === kid.id || (rec.holder === ROBOT.id && rec.players[0] === kid.id);
      if (left <= 0 && (mineToPop || left < -1500)) s.set({ popped: rec.holder });
    }, 100);
    later(() => say('Hot potato! Throw it before it pops!'), 200);
    listen((e) => {
      const rec = s.get();
      if (e.target.closest('[data-start]')) return start();
      const t = e.target.closest('[data-throw]');
      if (t && rec.holder === kid.id && !rec.popped) {
        t.classList.add('thrown');
        throwIt(rec, kid.id);
      }
    });
  }

  /* ---------- Build a tower ---------- */
  function tower(kid) {
    const { fail, here } = frame(
      kid,
      '🧱 Build a tower',
      `<div class="mem-head"></div>${RESTART}
      <div class="tower-wrap"><svg class="tower-svg" viewBox="0 0 100 140" preserveAspectRatio="xMidYMax meet"></svg></div>
      <div class="row tower-buttons"></div>`
    );
    const BH = 8; // block height
    const s = sync('tower', fail, changed);
    let teamBest = 0;
    let cheered = null;
    let saidTurn = null;
    let recordGame = null;
    let raf = 0;
    const t0 = performance.now();
    onCleanup(live.watch('towerbest', (b) => ((teamBest = b?.height || 0), changed(s.get())), fail));
    onCleanup(() => cancelAnimationFrame(raf));

    const solo = (rec) => (rec.players || []).length < 2;
    const best = (rec) => (solo(rec) ? soloBest(kid.id, 'tower') : teamBest);
    const height = (rec) => Math.max(0, (rec.blocks || []).length - 1);
    // The swinging block's position: back and forth, a little faster as the tower grows.
    const swingX = (rec, w) => {
      const speed = 1.3 + Math.min(height(rec), 20) * 0.09;
      return ((Math.sin(((performance.now() - t0) / 1000) * speed) + 1) / 2) * (100 - w);
    };
    function start() {
      const players = playersFor(kid, here, false);
      s.reset({ id: uid(), players, turn: kid.id, blocks: [{ x: 20, w: 60, k: '' }], over: false });
    }
    function draw() {
      const rec = s.get();
      const svg = app.querySelector('.tower-svg');
      if (!svg) return;
      const blocks = rec.blocks || [];
      const shift = Math.max(0, blocks.length - 11) * BH; // scroll up as it grows
      const y = (i) => 132 - i * BH + shift;
      let out = `<rect x="0" y="${132 + BH + shift}" width="100" height="40" fill="#86efac"/>`;
      blocks.forEach((b, i) => {
        const c = who(b.k)?.color || '#a8a29e';
        out += `<rect x="${b.x}" y="${y(i)}" width="${b.w}" height="${BH - 0.6}" rx="1.5" fill="${c}" stroke="#fff" stroke-width="0.5"/>`;
      });
      if (rec.id && !rec.over && rec.turn === kid.id) {
        const top = blocks.at(-1);
        out += `<rect x="${swingX(rec, top.w).toFixed(2)}" y="${y(blocks.length) - 14}" width="${top.w}" height="${BH - 0.6}" rx="1.5" fill="${kid.color}" opacity="0.9"/>`;
      }
      if (rec.over && rec.fell) out += `<rect class="tower-fall" x="${rec.fell.x}" y="${y(blocks.length)}" width="${rec.fell.w}" height="${BH - 0.6}" rx="1.5" fill="${who(rec.fell.k)?.color || '#999'}"/>`;
      svg.innerHTML = out;
    }
    function loop() {
      draw();
      raf = requestAnimationFrame(loop);
    }
    function changed(rec) {
      const head = app.querySelector('.mem-head');
      const btns = app.querySelector('.tower-buttons');
      if (!head) return;
      const b = best(rec);
      head.innerHTML =
        (rec.id ? chips(rec.players, null, rec.over ? null : rec.turn) : '') +
        `<span class="mem-turn">🧱 ${height(rec)}${b ? ` · 🏆 ${b}` : ''}</span>`;
      if (!rec.id) btns.innerHTML = `<button class="btn big-btn" data-start>🧱 Start building</button>`;
      else if (rec.over) btns.innerHTML = `<p class="mem-turn">${recordGame === rec.id ? '🎉 New record! ' : ''}${height(rec)} blocks high!</p><button class="btn big-btn" data-start>🔁 Build again</button>`;
      else if (rec.turn === kid.id) btns.innerHTML = `<button class="btn go big-btn drop-btn" data-drop>⬇️ DROP!</button>`;
      else btns.innerHTML = `<p class="mem-turn wait">${turnText(kid, rec.turn)}</p>`;
      if (rec.id && !rec.over && rec.turn === kid.id && !solo(rec) && saidTurn !== `${rec.id}/${height(rec)}`) {
        saidTurn = `${rec.id}/${height(rec)}`;
        say('Your turn!');
      }
      if (rec.over && cheered !== rec.id) {
        cheered = rec.id;
        const h = height(rec);
        const prev = best(rec);
        if (h > prev) {
          if (solo(rec)) saveSoloBest(kid.id, 'tower', h);
          else live.update('towerbest', { height: h }).catch(fail);
          recordGame = rec.id;
          bigCheer('🧱');
          say(`Crash! ${h} blocks! A new record!`);
          changed(rec);
        } else say(`Crash! ${h} blocks high!`);
      }
    }
    later(() => say('Build a tower! Drop the block on top.'), 200);
    raf = requestAnimationFrame(loop);
    listen((e) => {
      if (e.target.closest('[data-start]') || e.target.closest('[data-restart]')) return start();
      if (!e.target.closest('[data-drop]')) return;
      const rec = s.get();
      if (!rec.id || rec.over || rec.turn !== kid.id) return;
      const top = rec.blocks.at(-1);
      let x = swingX(rec, top.w);
      if (Math.abs(x - top.x) < 2.5) x = top.x; // close enough: a perfect drop
      const left = Math.max(x, top.x);
      const right = Math.min(x + top.w, top.x + top.w);
      if (right - left < 1.5) {
        chime([300, 200]);
        return s.set({ over: true, fell: { x, w: top.w, k: kid.id } });
      }
      chime(x === top.x ? [880, 1174.66] : [620 + rec.blocks.length * 15]);
      if (x === top.x) say('Perfect!');
      const blocks = [...rec.blocks, { x: Number(left.toFixed(2)), w: Number((right - left).toFixed(2)), k: kid.id }];
      s.set({ blocks, turn: nextOf(rec.players, kid.id) });
    });
  }

  /* ---------- Simon says ---------- */
  function simon(kid) {
    const { fail, here } = frame(kid, '🚦 Simon says', `<div class="mem-head"></div><div class="simon-area"></div><div class="row simon-buttons"></div>`);
    const STEP = 850; // ms per flash in the pattern
    const s = sync('simon', fail, changed);
    let teamBest = 0;
    let lit = -1;
    let litUntil = 0;
    let shown = null;
    let seenInput = 0;
    let cheered = null;
    let saidGo = null;
    onCleanup(live.watch('simonbest', (b) => ((teamBest = b?.score || 0), changed(s.get())), fail));

    const solo = (rec) => (rec.players || []).length < 2;
    const best = (rec) => (solo(rec) ? soloBest(kid.id, 'simon') : teamBest);
    // In a pair, the first player has red and blue, the second green and yellow.
    const myPads = (rec) => (solo(rec) ? [0, 1, 2, 3] : rec.players[0] === kid.id ? [0, 1] : [2, 3]);
    const score = (rec) => Math.max(0, (rec.seq || []).length - 1);
    const inputOpen = (rec) => rec.id && !rec.fail && Date.now() >= rec.startAt + rec.seq.length * STEP;
    function start() {
      const players = playersFor(kid, here, false);
      s.reset({ id: uid(), players, seq: [Math.floor(Math.random() * 4)], startAt: Date.now() + 1500, input: [], fail: false });
    }
    function flash(p, ms = 450) {
      lit = p;
      litUntil = Date.now() + ms;
      chime([PADS[p].tone]);
      paintPads();
    }
    function paintPads() {
      const area = app.querySelector('.simon-area');
      const rec = s.get();
      if (!area || !rec.id) return;
      const mine = myPads(rec);
      const on = Date.now() < litUntil ? lit : -1;
      area.innerHTML = `<div class="simon-pads${solo(rec) ? ' all' : ''}">${PADS.map((p, i) =>
        `<button class="simon-pad${mine.includes(i) ? ' mine' : ' theirs'}${on === i ? ' lit' : ''}" ${mine.includes(i) ? `data-pad="${i}"` : 'disabled'} style="--pad:${p.color}">${p.emoji}</button>`
      ).join('')}</div>`;
    }
    function changed(rec) {
      const head = app.querySelector('.mem-head');
      const btns = app.querySelector('.simon-buttons');
      if (!head) return;
      const b = best(rec);
      head.innerHTML = (rec.id ? chips(rec.players) : '') + `<span class="mem-turn">⭐ ${score(rec)}${b ? ` · 🏆 ${b}` : ''}</span>`;
      if (!rec.id) {
        app.querySelector('.simon-area').innerHTML = `<p class="mem-turn">Watch the pattern, then copy it!</p>`;
        btns.innerHTML = `<button class="btn big-btn" data-start>🚦 Start</button>`;
        return;
      }
      // Light the pad the other iPad just tapped.
      const input = rec.input || [];
      if (input.length > seenInput && input.length) flash(input.at(-1), 300);
      seenInput = input.length;
      if (rec.fail) {
        btns.innerHTML = `<p class="mem-turn">Oops! You remembered ${score(rec)}!</p><button class="btn big-btn" data-start>🔁 Again</button>`;
        if (cheered !== rec.id) {
          cheered = rec.id;
          const sc = score(rec);
          if (sc > best(rec)) {
            if (solo(rec)) saveSoloBest(kid.id, 'simon', sc);
            else live.update('simonbest', { score: sc }).catch(fail);
            bigCheer('🚦');
            say(`Oops! But you remembered ${sc}! A new record!`);
          } else say(`Oops! You remembered ${sc}!`);
        }
      } else btns.innerHTML = '';
      paintPads();
    }
    // Play the pattern on both iPads at the same moments, then open for tapping.
    every(() => {
      const rec = s.get();
      if (!rec.id || rec.fail) return;
      const now = Date.now();
      const i = Math.floor((now - rec.startAt) / STEP);
      if (i >= 0 && i < rec.seq.length && shown !== `${rec.id}/${rec.seq.length}/${i}`) {
        shown = `${rec.id}/${rec.seq.length}/${i}`;
        if (i === 0) say('Watch!');
        flash(rec.seq[i]);
      }
      if (inputOpen(rec) && saidGo !== `${rec.id}/${rec.seq.length}`) {
        saidGo = `${rec.id}/${rec.seq.length}`;
        later(() => say(solo(rec) ? 'Your turn!' : 'Your turn! Work together!'), 500);
      }
      if (lit >= 0 && now >= litUntil) {
        lit = -1;
        paintPads();
      }
    }, 50);
    later(() => say('Simon says! Watch, then copy.'), 200);
    listen((e) => {
      if (e.target.closest('[data-start]')) return start();
      const pad = e.target.closest('[data-pad]');
      const rec = s.get();
      if (!pad || !inputOpen(rec)) return;
      const p = Number(pad.dataset.pad);
      const input = [...(rec.input || []), p];
      seenInput = input.length;
      flash(p, 300);
      if (rec.seq[input.length - 1] !== p) return s.set({ input, fail: true });
      if (input.length === rec.seq.length) {
        chime([783.99, 1046.5]);
        return s.set({ input: [], seq: [...rec.seq, Math.floor(Math.random() * 4)], startAt: Date.now() + 1300 });
      }
      s.set({ input });
    });
  }

  return { ttt, copy, hide, potato, tower, simon };
}
