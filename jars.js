/*
 * jars.js — the jar styles a kid can pick in Settings (potion jar, rocket, gumball machine, ...).
 *
 * Every style draws into the same 262×272 picture and gets:
 *   y      where the fill reaches for the kid's current stickers (258 = empty, 96 = top prize)
 *   from   how far below y the fill starts, for the rise animation on the next render
 *   key    a unique id for this picture (for clip paths)
 *   color  the kid's color
 *   bal    stickers now; full: true once they reach the top prize
 *   marks(lineColor?)  the dashed prize lines and tags beside the jar
 * The prize math lives in app.js (jarHTML), so a new style only has to draw.
 */

export const JAR_FLOOR = 258; // where an empty jar's fill sits
export const JAR_SPAN = 162; // how far the fill rises to reach the top prize

const rand = (i) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
// Blend a #rrggbb color toward white (amt 0–1).
const tint = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v + (255 - v) * amt);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
const rising = (from, inner) => `<g class="liquid" style="--from:${from.toFixed(1)}px">${inner}</g>`;
const SKY_CLOUDS = (spots) => spots.map(([x, y, rx]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${Math.round(rx * 0.38)}" fill="#fff"/>`).join('');

const POTION_PATH =
  'M68,30 L68,46 C68,60 22,60 22,94 L22,236 Q22,264 50,264 L170,264 Q198,264 198,236 L198,94 C198,60 152,60 152,46 L152,30';
const DOME = 'M40,248 L40,124 A70,70 0 0 1 180,124 L180,248 Z';

export const JAR_STYLES = {
  potion: {
    name: 'Potion jar',
    draw({ y, from, key, color, marks }) {
      let wave = `M-110,${y}`;
      for (let i = 0; i < 6; i++) wave += ' q27.5,-7 55,0 t55,0';
      wave += ` L550,${y + 30} L-110,${y + 30} Z`;
      const deep = JAR_FLOOR - y > 22;
      const bubbles = deep
        ? Array.from({ length: 7 }, (_, i) => {
            const bx = (40 + rand(i + 40) * 140).toFixed(1);
            const r = (3 + rand(i + 50) * 4).toFixed(1);
            return `<circle class="bubble" cx="${bx}" cy="252" r="${r}" style="--rise:${(y - 242).toFixed(1)}px;animation-delay:${(rand(i + 60) * 3).toFixed(2)}s"/>`;
          }).join('')
        : '';
      const sparkles = deep
        ? [0, 1, 2].map((i) => `<text class="sparkle" x="${50 + i * 55}" y="${Math.min(Math.max(y + 34, 110) + i * 26, 250)}" style="animation-delay:${i * 0.5}s">✨</text>`).join('')
        : '';
      return `<defs>
          <clipPath id="clip-${key}"><path d="${POTION_PATH} Z"/></clipPath>
          <linearGradient id="liq-${key}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${color}" stop-opacity=".75"/><stop offset="1" stop-color="${color}"/>
          </linearGradient>
        </defs>
        <path class="glass-bg" d="${POTION_PATH} Z"/>
        <g clip-path="url(#clip-${key})">
          ${rising(from, `<path class="wave" d="${wave}" fill="${color}" opacity=".55"/>
            <rect x="0" y="${y + 4}" width="220" height="300" fill="url(#liq-${key})"/>
            ${bubbles}${sparkles}`)}
        </g>
        ${marks()}
        <path class="glass" d="${POTION_PATH}"/>
        <path class="shine" d="M38,112 L38,226"/>
        <rect x="58" y="8" width="104" height="25" rx="8" fill="${color}"/>
        <rect x="64" y="11" width="92" height="7" rx="3.5" fill="#fff" opacity=".35"/>`;
    },
  },

  rocket: {
    name: 'Rocket to the moon',
    draw({ y, from, key, color, bal, marks }) {
      const tip = Math.max(y, 52) - 6;
      const stars = [[45, 70], [160, 82], [70, 130], [175, 150], [40, 200], [150, 215], [95, 40], [120, 175], [60, 100], [178, 228]]
        .map(([x, sy], i) => `<circle class="sparkle" cx="${x}" cy="${sy}" r="${1.6 + (i % 3) * 0.6}" fill="#fff" style="animation-delay:${(i % 4) * 0.4}s"/>`)
        .join('');
      return `<defs><clipPath id="clip-${key}"><rect x="22" y="14" width="176" height="250" rx="22"/></clipPath></defs>
        <rect x="22" y="14" width="176" height="250" rx="22" fill="#1e1b4b"/>
        ${stars}
        <circle cx="160" cy="44" r="20" fill="#e5e7eb"/><circle cx="153" cy="40" r="4" fill="#cbd5e1"/><circle cx="166" cy="51" r="3" fill="#cbd5e1"/>
        <rect x="22" y="246" width="176" height="18" rx="9" fill="#4ade80"/>
        ${marks('#6b6894')}
        <g clip-path="url(#clip-${key})">${rising(
          from,
          `<line x1="110" y1="${tip + 64}" x2="110" y2="250" stroke="${color}" stroke-width="6" stroke-dasharray="2 10" stroke-linecap="round" opacity=".75"/>
          <g transform="translate(0 ${tip})">
            <path class="flame" d="M100,52 Q110,${bal > 0 ? 80 : 60} 120,52 Z" fill="#f59e0b"/>
            <path d="M110,0 C126,14 128,34 124,52 L96,52 C92,34 94,14 110,0 Z" fill="#fff"/>
            <path d="M96,34 L84,54 L97,50 Z M124,34 L136,54 L123,50 Z" fill="${color}"/>
            <circle cx="110" cy="24" r="7" fill="${color}" stroke="#cbd5e1" stroke-width="3"/>
          </g>`
        )}</g>`;
    },
  },

  gumball: {
    name: 'Gumball machine',
    draw({ y, from, key, color, bal, marks }) {
      const palette = [color, '#f472b6', '#facc15', '#4ade80', '#fb923c', '#38bdf8'];
      // About 6 gumballs per 17px of fill, and at least one as soon as there's a sticker.
      const count = bal > 0 ? Math.max(1, Math.round(((248 - y) / 17) * 6)) : 0;
      let balls = '';
      for (let i = 0, row = 0; i < count && row < 12; row++) {
        const cy = 238 - row * 17;
        const spots = [];
        for (let cx = 52 + (row % 2 ? 10 : 0); cx <= 170; cx += 20) spots.push(cx);
        spots.sort((a, b) => Math.abs(a - 110) - Math.abs(b - 110)); // a part-filled row starts in the middle
        for (const cx of spots) {
          if (i >= count) break;
          balls += `<circle cx="${cx}" cy="${cy}" r="10" fill="${palette[(row * 7 + cx) % palette.length]}"/>`;
          i++;
        }
      }
      return `<defs><clipPath id="clip-${key}"><path d="${DOME}"/></clipPath></defs>
        <path class="glass-bg" d="${DOME}"/>
        <g clip-path="url(#clip-${key})">${rising(from, balls)}</g>
        ${marks()}
        <path class="glass" d="${DOME}"/>
        <path class="shine" d="M54,120 A56,56 0 0 1 90,72" fill="none"/>
        <rect x="96" y="44" width="28" height="12" rx="4" fill="${color}"/>
        <path d="M34,248 L186,248 L176,270 L44,270 Z" fill="${color}"/>
        <rect x="98" y="254" width="24" height="10" rx="3" fill="#fff" opacity=".7"/>`;
    },
  },

  beanstalk: {
    name: 'Magic beanstalk',
    draw({ y, from, key, color, bal, full, marks }) {
      const top = bal > 0 ? Math.min(y, 220) : 232; // a sprout peeks out of the pot from the first sticker
      const sway = (yy) => 110 + Math.sin((236 - yy) / 18) * 9;
      let stem = `M${sway(272)},272`;
      for (let yy = 266; yy >= top; yy -= 6) stem += ` L${sway(yy).toFixed(1)},${yy}`;
      let leaves = '';
      for (let k = 0, yy = 220; yy > top + 8; yy -= 26, k++) {
        const x = sway(yy), dir = k % 2 ? 1 : -1;
        leaves += `<path d="M${x.toFixed(1)},${yy} q${dir * 20},-14 ${dir * 30},2 q${dir * -14},10 ${dir * -30},-2 Z" fill="#22c55e"/>`;
      }
      const tx = sway(top);
      const flower = full
        ? [0, 72, 144, 216, 288].map((a) => `<circle cx="${(tx + 12 * Math.cos((a * Math.PI) / 180)).toFixed(1)}" cy="${(top - 6 + 12 * Math.sin((a * Math.PI) / 180)).toFixed(1)}" r="9" fill="${color}"/>`).join('') +
          `<circle cx="${tx.toFixed(1)}" cy="${top - 6}" r="7" fill="#facc15"/>`
        : `<circle cx="${tx.toFixed(1)}" cy="${top}" r="7" fill="${tint(color, 0.35)}"/>`;
      return `<defs><clipPath id="clip-${key}"><rect x="22" y="14" width="176" height="232"/></clipPath></defs>
        <rect x="22" y="14" width="176" height="250" rx="22" fill="#eef9ff"/>
        ${SKY_CLOUDS([[60, 60, 24], [150, 96, 28]])}
        ${marks()}
        <g clip-path="url(#clip-${key})">${rising(from, `<path d="${stem}" fill="none" stroke="#16a34a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>${leaves}${flower}`)}</g>
        <path d="M76,234 L144,234 L136,266 L84,266 Z" fill="${color}"/>
        <rect x="70" y="228" width="80" height="12" rx="5" fill="${tint(color, 0.25)}"/>`;
    },
  },

  icecream: {
    name: 'Ice cream tower',
    draw({ y, from, color, bal, full, marks }) {
      const flavours = [color, '#f9a8d4', '#fde68a', '#86efac', '#a16207', '#fdba74'];
      // One scoop per sixth of the way to the top prize; the first scoop shows from the first sticker.
      const n = bal > 0 ? Math.max(1, Math.round((JAR_FLOOR - y) / 27)) : 0;
      let scoops = '';
      for (let k = 0; k < n; k++) {
        const cy = 232 - k * 22, cx = 110 + (k % 2 ? 4 : -4);
        scoops += `<circle cx="${cx}" cy="${cy}" r="25" fill="${flavours[k % flavours.length]}"/>
          <path d="M${cx - 24},${cy + 6} q8,8 16,0 q8,8 16,0 q8,8 16,0" fill="none" stroke="#fff" stroke-width="3" opacity=".5"/>`;
      }
      const topY = 232 - (n - 1) * 22;
      const cherry = full && n
        ? `<circle cx="112" cy="${topY - 30}" r="8" fill="#dc2626"/><path d="M112,${topY - 38} q6,-12 14,-14" stroke="#16a34a" stroke-width="3" fill="none"/>`
        : '';
      return `${marks()}
        ${rising(from, scoops + cherry)}
        <path d="M86,244 L134,244 L110,272 Z" fill="#e0a458"/>
        <path d="M92,250 L128,250 M98,258 L122,258" stroke="#b7791f" stroke-width="2"/>`;
    },
  },

  fishtank: {
    name: 'Fish tank',
    draw({ y, from, key, color, marks }) {
      const fish = [['🐠', 70, 236], ['🐟', 145, 214], ['🐡', 95, 188], ['🐠', 160, 160], ['🐟', 62, 140], ['🦀', 130, 250], ['🐙', 80, 112]];
      const swim = fish
        .filter(([, , fy]) => fy > y + 10)
        .map(([e, x, fy], i) => `<text class="bob" x="${x}" y="${fy}" font-size="22" text-anchor="middle" style="animation-delay:${(i % 3) * 0.6}s">${e}</text>`)
        .join('');
      let wave = `M-110,${y}`;
      for (let i = 0; i < 6; i++) wave += ' q21,-6 42,0 t42,0';
      wave += ` L550,300 L-110,300 Z`;
      return `<defs><clipPath id="clip-${key}"><rect x="26" y="58" width="168" height="204" rx="14"/></clipPath></defs>
        <rect class="glass-bg" x="26" y="58" width="168" height="204" rx="14"/>
        <g clip-path="url(#clip-${key})">
          ${rising(from, `<path class="wave" d="${wave}" fill="${tint(color, 0.45)}"/>`)}
          <path d="M26,252 q20,-8 42,0 t42,0 t42,0 t42,0 L194,262 L26,262 Z" fill="#fcd9a0"/>
          <path d="M48,252 q-6,-24 4,-40 M54,252 q8,-20 0,-34" stroke="#22c55e" stroke-width="4" fill="none"/>
          ${swim}
        </g>
        ${marks()}
        <rect class="glass" x="26" y="58" width="168" height="204" rx="14"/>
        <rect x="20" y="48" width="180" height="14" rx="6" fill="${color}"/>`;
    },
  },

  balloon: {
    name: 'Hot air balloon',
    draw({ y, from, key, color, marks }) {
      const b = Math.max(y, 108); // where the basket sits
      return `<defs><clipPath id="clip-${key}"><rect x="22" y="14" width="176" height="250" rx="22"/></clipPath></defs>
        <rect x="22" y="14" width="176" height="250" rx="22" fill="#e0f2fe"/>
        ${SKY_CLOUDS([[62, 70, 26], [158, 150, 28], [58, 196, 22]])}
        <path d="M22,250 Q70,226 112,246 T198,240 L198,252 Q198,264 186,264 L34,264 Q22,264 22,252 Z" fill="#4ade80"/>
        ${marks()}
        <g clip-path="url(#clip-${key})">${rising(
          from,
          `<g class="bob">
            <path d="M110,${b - 104} C70,${b - 104} 64,${b - 64} 96,${b - 30} L124,${b - 30} C156,${b - 64} 150,${b - 104} 110,${b - 104} Z" fill="${color}"/>
            <path d="M110,${b - 98} C88,${b - 98} 80,${b - 70} 96,${b - 38} L124,${b - 38} C140,${b - 70} 132,${b - 98} 110,${b - 98} Z" fill="#fff"/>
            <path d="M98,${b - 30} L102,${b - 14} M122,${b - 30} L118,${b - 14}" stroke="#7c5a3a" stroke-width="2"/>
            <rect x="99" y="${b - 15}" width="22" height="14" rx="3" fill="#b7791f"/>
          </g>`
        )}</g>`;
    },
  },

  treasure: {
    name: 'Treasure chest',
    draw: (a) => scene(a, ({ n, prev, color, T }) => {
      const spots = [];
      for (let row = 0; spots.length < 36; row++) {
        const y = 192 - row * 11, half = Math.max(14, 76 - row * 6), off = row % 2 ? 9 : 0;
        for (let x = 120 - half + off; x <= 120 + half; x += 18) spots.push([x, y]);
      }
      const coins = spots.slice(0, n).map(([x, y], i) =>
        `<g class="${i >= prev ? 'j-drop' : ''}"><ellipse cx="${x.toFixed(1)}" cy="${y}" rx="10" ry="6" fill="#facc15" stroke="#b45309" stroke-width="1.5"/><ellipse cx="${x.toFixed(1)}" cy="${y - 1}" rx="5" ry="2.5" fill="#fde68a"/></g>`).join('');
      const topY = n ? spots[n - 1][1] : 192;
      const gems = T.filter(([c]) => n >= c).slice(0, 4).map(([c], i) =>
        `<text class="j-emo ${c > prev ? 'j-pop' : ''}" x="${[96, 144, 108, 132][i]}" y="${Math.min(topY - 12, 182) - i * 4}" font-size="22">${['💎', '💍', '👑', '🏆'][i]}</text>`).join('');
      return `<rect width="240" height="280" fill="#fffaf3"/>
        <path d="M30,150 L30,96 Q30,56 120,56 Q210,56 210,96 L210,150 Z" fill="${shade(color, 0.3)}" transform="rotate(-8 30 150)"/>
        <path d="M40,148 L40,104 Q40,72 120,72 Q200,72 200,104 L200,148 Z" fill="#3b2412" transform="rotate(-8 30 150)"/>
        <rect x="30" y="150" width="180" height="110" rx="10" fill="#4a2c14"/>
        <rect x="24" y="196" width="192" height="68" rx="10" fill="${color}"/>
        <rect x="24" y="196" width="192" height="12" fill="#facc15"/>
        <rect x="24" y="250" width="192" height="12" rx="4" fill="#facc15"/>
        <rect x="106" y="210" width="28" height="30" rx="6" fill="#facc15" stroke="#b45309" stroke-width="2"/>
        <circle cx="120" cy="222" r="4" fill="#78350f"/><rect x="118" y="224" width="4" height="9" fill="#78350f"/>
        ${coins}${gems}
        ${n >= 30 ? '<text class="j-emo j-twinkle" x="60" y="130" font-size="22">✨</text><text class="j-emo j-twinkle" x="184" y="120" font-size="22" style="animation-delay:.6s">✨</text>' : ''}`;
    }),
  },

  stars: {
    name: 'Light up the sky',
    draw: (a) => scene(a, ({ n, prev, color, key }) => {
      // four star pictures: a kite (5 stars), a house (5), a bunny (10), a bear (10)
      const GROUPS = [
        { pts: [[40, 60], [62, 40], [84, 60], [62, 88], [62, 112]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4]], label: '🪁' },
        { pts: [[150, 70], [180, 44], [210, 70], [210, 104], [150, 104]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]], label: '🏠' },
        { pts: [[40, 150], [52, 128], [64, 150], [70, 172], [96, 168], [116, 180], [110, 200], [80, 206], [58, 196], [48, 172]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 3]], label: '🐰' },
        { pts: [[140, 150], [166, 146], [190, 152], [212, 166], [206, 196], [176, 200], [168, 172], [150, 224], [132, 232], [112, 244]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3], [5, 7], [7, 8], [8, 9]], label: '🐻' },
      ];
      let k = 0, out = '';
      for (const g of GROUPS) {
        const start = k;
        const done = start + g.pts.length <= n;
        const fresh = done && start + g.pts.length > prev;
        if (done) out += g.lines.map(([p, q]) => `<line x1="${g.pts[p][0]}" y1="${g.pts[p][1]}" x2="${g.pts[q][0]}" y2="${g.pts[q][1]}" stroke="#fde68a" stroke-width="2" opacity=".75"/>`).join('');
        g.pts.forEach(([x, y], i) => {
          const on = start + i < n;
          out += on
            ? `<g class="${start + i >= prev ? 'j-pop' : ''}"><circle cx="${x}" cy="${y}" r="9" fill="#fde047" opacity=".25"/><text class="j-emo j-twinkle" x="${x}" y="${y}" font-size="15" style="animation-delay:${(rand(start + i) * 2).toFixed(1)}s">⭐</text></g>`
            : `<circle cx="${x}" cy="${y}" r="3.5" fill="#94a3b8" opacity=".55"/>`;
        });
        if (done) out += `<text class="j-emo${fresh ? ' j-pop' : ''}" x="${g.pts[0][0] - 10}" y="${g.pts[0][1] - 16}" font-size="18">${g.label}</text>`;
        k += g.pts.length;
      }
      const tiny = Array.from({ length: 26 }, (_, i) => `<circle cx="${(rand(i + 70) * 236).toFixed(0)}" cy="${(rand(i + 90) * 260).toFixed(0)}" r=".9" fill="#fff" opacity=".5"/>`).join('');
      return `<defs><linearGradient id="night-${key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="${shade(color, 0.55)}"/></linearGradient></defs>
        <rect width="240" height="280" fill="url(#night-${key})"/>
        ${tiny}
        <text class="j-emo" x="206" y="242" font-size="34">${n >= 30 ? '🌕' : '🌙'}</text>
        <path d="M0,266 Q40,252 80,262 T160,260 T240,258 L240,280 L0,280 Z" fill="#0b1220"/>
        ${out}`;
    }),
  },

  caterpillar: {
    name: 'Caterpillar',
    draw: (a) => scene(a, ({ n, prev, color, T, full }) => {
      if (full) {
        return `<rect width="240" height="280" fill="#f0fdf4"/>
          <text class="j-emo" x="40" y="250" font-size="34">🌼</text><text class="j-emo" x="200" y="246" font-size="30">🌷</text>
          <circle cx="120" cy="140" r="78" fill="#fde68a" opacity=".5"/>
          <g class="${prev < 30 ? 'j-pop' : ''}"><text class="j-emo j-hop" x="120" y="140" font-size="110">🦋</text></g>
          <text x="120" y="30" text-anchor="middle" font-size="18" font-weight="900" fill="#2b2238">A butterfly! 🎉</text>`;
      }
      const pos = (i) => {
        const t = Math.min(i, 29) / 29, r = t * 6 % 2;
        return [26 + (r < 1 ? r : 2 - r) * 188, 236 - Math.floor(t * 6) * 34];
      };
      let body = '';
      for (let i = 0; i < n; i++) {
        const [x, y] = pos(i);
        const tier = T.find(([c]) => c === i + 1);
        body += `<g class="${i >= prev ? 'j-pop' : ''}"><circle cx="${x.toFixed(1)}" cy="${y}" r="13" fill="${i % 2 ? color : tint(color, 0.4)}" stroke="${shade(color, 0.35)}" stroke-width="1.5"/>${tier ? `<text class="j-emo" x="${x.toFixed(1)}" y="${y}" font-size="13">${tier[1]}</text>` : ''}</g>`;
      }
      const [hx, hy] = pos(Math.max(n, 1) - 1 + (n ? 0.9 : 0));
      const X = (d) => (hx + d).toFixed(1);
      const head = `<g class="bob"><circle cx="${X(0)}" cy="${hy}" r="16" fill="#84cc16" stroke="#3f6212" stroke-width="2"/>
        <circle cx="${X(-5)}" cy="${hy - 3}" r="3" fill="#1f2937"/><circle cx="${X(5)}" cy="${hy - 3}" r="3" fill="#1f2937"/>
        <path d="M${X(-6)},${hy + 5} q6,5 12,0" stroke="#1f2937" stroke-width="2" fill="none" stroke-linecap="round"/>
        <line x1="${X(-6)}" y1="${hy - 14}" x2="${X(-10)}" y2="${hy - 26}" stroke="#3f6212" stroke-width="2"/><circle cx="${X(-10)}" cy="${hy - 27}" r="3" fill="${color}"/>
        <line x1="${X(6)}" y1="${hy - 14}" x2="${X(10)}" y2="${hy - 26}" stroke="#3f6212" stroke-width="2"/><circle cx="${X(10)}" cy="${hy - 27}" r="3" fill="${color}"/></g>`;
      return `<rect width="240" height="280" fill="#f0fdf4"/>
        <path d="M8,262 Q120,20 232,262 Z" fill="#bbf7d0"/>
        <path d="M120,262 L120,60" stroke="#86efac" stroke-width="3"/>
        ${body}${head}
        <text class="j-emo" x="214" y="30" font-size="26" opacity=".35">🦋</text>`;
    }),
  },

  pizza: {
    name: 'Pizza party',
    draw: (a) => scene(a, ({ n, prev, color, got, full }) => {
      const TOP = ['🍅', '🍄', '🫒', '🌽', '🧀', '🫑'];
      const tops = Array.from({ length: n }, (_, i) => {
        const ang = i * 2.39996, r = 14 + Math.sqrt(i / 36) * 64;
        const x = (120 + Math.cos(ang) * r).toFixed(1), y = (140 + Math.sin(ang) * r).toFixed(1);
        const cls = i >= prev ? 'j-pop' : '';
        return i % 3 === 0
          ? `<g class="${cls}"><circle cx="${x}" cy="${y}" r="9" fill="#dc2626"/><circle cx="${x - 2}" cy="${y - 2}" r="2" fill="#fca5a5"/></g>`
          : `<text class="j-emo ${cls}" x="${x}" y="${y}" font-size="16">${TOP[i % TOP.length]}</text>`;
      }).join('');
      const extras = [got >= 1 ? '<path d="M70,170 q20,-12 40,0 t40,0" stroke="#fef9c3" stroke-width="5" fill="none" opacity=".9"/>' : '',
        got >= 2 ? '<text class="j-emo" x="40" y="236" font-size="26">🥤</text>' : '',
        got >= 3 ? '<text class="j-emo" x="204" y="236" font-size="26">🎂</text>' : ''].join('');
      const ready = full
        ? '<text x="120" y="22" text-anchor="middle" font-size="17" font-weight="900" fill="#2b2238">Hot and ready! 🍕</text>' +
          [0, 1, 2].map((i) => `<path class="j-steam" d="M${96 + i * 24},70 q-6,-10 0,-20 t0,-20" stroke="#cbd5e1" stroke-width="3" fill="none" style="animation-delay:${i * 0.8}s"/>`).join('')
        : '';
      return `<rect width="240" height="280" fill="#fffaf3"/>
        <circle cx="120" cy="152" r="104" fill="${tint(color, 0.65)}"/>
        <circle cx="120" cy="152" r="96" fill="none" stroke="${color}" stroke-width="5" stroke-dasharray="14 10" opacity=".5"/>
        <circle cx="120" cy="140" r="90" fill="#f59e0b"/>
        <circle cx="120" cy="140" r="80" fill="#ef4444"/>
        <circle cx="120" cy="140" r="77" fill="#fde68a"/>
        ${tops}${extras}${ready}`;
    }),
  },

  castle: {
    name: 'Build a castle',
    draw: (a) => scene(a, ({ n, prev, color, T, full }) => {
      const W = 30, H = 20, PER = 5, left = 120 - (W * PER) / 2;
      const bricks = Array.from({ length: Math.min(n, 30) }, (_, i) => {
        const row = Math.floor(i / PER), col = i % PER;
        return `<rect class="${i >= prev ? 'j-drop' : ''}" x="${left + col * W + 1}" y="${256 - (row + 1) * H + 1}" width="${W - 2}" height="${H - 2}" rx="3" fill="${(row + col) % 2 ? color : tint(color, 0.3)}" stroke="${shade(color, 0.4)}" stroke-width="1"/>`;
      }).join('');
      const flags = T.filter(([c]) => n >= c).map(([c, e], i) => {
        const y = 256 - Math.min(6, Math.ceil(c / PER)) * H;
        const side = i % 2 ? 1 : -1;
        const x = side > 0 ? left + PER * W + 2 : left - 2;
        return `<g><line x1="${x}" x2="${x}" y1="${y + 6}" y2="${y - 22}" stroke="#78350f" stroke-width="3"/>
          <path class="j-flag" d="M${x},${y - 22} l${side * 26},7 l${side * -26},7 Z" fill="#facc15" stroke="#ca8a04"/>
          <text class="j-emo" x="${x + side * 14}" y="${y - 3}" font-size="14">${e}</text></g>`;
      }).join('');
      const done = full
        ? `<g class="${prev < 30 ? 'j-pop' : ''}">${[0, 2, 4].map((c) => `<rect x="${left + c * W + 3}" y="${256 - 6 * H - 18}" width="${W - 6}" height="18" fill="${color}"/>`).join('')}
            <text class="j-emo" x="120" y="${256 - 6 * H - 42}" font-size="34">👑</text></g>`
        : `<rect x="${left}" y="${256 - 6 * H}" width="${W * PER}" height="${6 * H}" fill="none" stroke="#94a3b8" stroke-dasharray="5 5" stroke-width="2" opacity=".6"/>`;
      return `<rect width="240" height="280" fill="#ecfeff"/>
        <text class="j-emo bob" x="40" y="36" font-size="28">☁️</text>
        <text class="j-emo bob" x="196" y="54" font-size="22" style="animation-delay:-1.2s">☁️</text>
        <path d="M0,256 L240,256 L240,280 L0,280 Z" fill="#86efac"/>
        ${bricks}${done}${flags}`;
    }),
  },

  dragon: {
    name: 'Hatch a dragon',
    draw: (a) => scene(a, ({ color, bal, prevBal, tiers, got, full }) => {
      const STAGES = [['🥚', 70, 'j-wobble', 'A magic egg…'], ['🐣', 74, 'j-hop', 'It hatched!'], ['🦎', 84, 'j-hop', 'Baby dragon'], ['🐲', 96, 'j-hop', 'Growing dragon'], ['🐉', 120, 'j-hop', 'BIG DRAGON!']];
      const stageOf = (g, f) => (f ? 4 : Math.min(g, 3));
      const st = stageOf(got, full);
      const prevGot = tiers.filter((t) => prevBal >= t.cost).length;
      const evolved = st > stageOf(prevGot, tiers.length && prevBal >= tiers[tiers.length - 1].cost);
      const [emo, size, anim, label] = STAGES[st];
      const lo = got ? tiers[got - 1].cost : 0, hi = tiers[got]?.cost;
      const pct = hi ? Math.max(0, Math.min(1, (bal - lo) / (hi - lo))) : 1;
      const cracks = st === 0 && bal > 0 ? `<path d="M104,${172 - Math.round(pct * 12)} l8,10 l-6,8 l10,10" stroke="#78350f" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="${Math.min(1, 0.3 + pct)}"/>` : '';
      const hearts = bal > prevBal ? [0, 1, 2].map((i) => `<text class="j-emo j-float" x="${100 + i * 20}" y="110" font-size="18" style="animation-delay:${i * 0.12}s">💖</text>`).join('') : '';
      return `<rect width="240" height="280" fill="#fdf4ff"/>
        <ellipse cx="120" cy="232" rx="90" ry="22" fill="${tint(color, 0.7)}"/>
        <path d="M44,232 q76,-30 152,0" fill="none" stroke="${tint(color, 0.5)}" stroke-width="6" stroke-linecap="round"/>
        ${evolved ? '<circle class="j-pop" cx="120" cy="170" r="80" fill="#fde68a" opacity=".6"/>' : ''}
        <g class="${evolved ? 'j-pop' : ''}"><text class="j-emo ${anim}" x="120" y="${222 - size / 2}" font-size="${size}">${emo}</text></g>
        ${cracks}${hearts}
        <text x="120" y="26" text-anchor="middle" font-size="18" font-weight="900" fill="#2b2238">${label}</text>
        <rect x="40" y="250" width="160" height="14" rx="7" fill="#fff" stroke="${tint(color, 0.6)}" stroke-width="2"/>
        <rect x="42" y="252" width="${(156 * pct).toFixed(1)}" height="10" rx="5" fill="${color}"/>
        <text class="j-emo" x="214" y="257" font-size="16">${hi ? STAGES[Math.min(st + 1, 4)][0] : '⭐'}</text>`;
    }),
  },
};

/*
 * Picture styles (treasure chest, sky, caterpillar, pizza, castle, dragon) count things instead of filling
 * to a height. Progress is scaled so the top prize always means "30" in the picture, whatever the prize
 * costs are, and the prize tags stack down the right side instead of the dashed lines.
 */
function scene({ key, color, bal, prevBal = bal, tiers = [], top }, body) {
  const count = (b) => (b > 0 ? Math.max(1, Math.round((Math.min(b, top * 1.2) / top) * 30)) : 0);
  const got = tiers.filter((t) => bal >= t.cost).length;
  const T = tiers.map((t) => [Math.max(1, Math.round((t.cost / top) * 30)), t.emoji]);
  const inner = body({ n: count(bal), prev: count(prevBal), color, key, T, tiers, got, bal, prevBal, full: bal >= top });
  const tags = tiers
    .map((t, i) => {
      const ok = bal >= t.cost;
      return `<g class="tag${ok ? ' got' : ''}" transform="translate(208 ${250 - i * 32})">
        <rect x="0" y="-13" width="54" height="26" rx="13"/><text class="te" x="15" y="1">${t.emoji}</text><text class="tn" x="38" y="1">${t.cost}</text></g>`;
    })
    .join('');
  return `<defs><clipPath id="card-${key}"><rect width="240" height="280" rx="28"/></clipPath></defs>
    <g transform="translate(2 22) scale(0.855)"><g clip-path="url(#card-${key})">${inner}</g></g>${tags}`;
}
// Blend a #rrggbb color toward black (amt 0–1).
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * (1 - amt));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

