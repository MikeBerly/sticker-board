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
    draw({ y, from, key, color, marks }) {
      const palette = [color, '#f472b6', '#facc15', '#4ade80', '#fb923c', '#38bdf8'];
      let balls = '';
      let i = 0;
      for (let row = 0; row < 12; row++) {
        const cy = 238 - row * 17;
        if (cy < y + 6) break;
        for (let cx = 52 + (row % 2 ? 10 : 0); cx <= 170; cx += 20) balls += `<circle cx="${cx}" cy="${cy}" r="10" fill="${palette[i++ % palette.length]}"/>`;
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
    draw({ y, from, key, color, full, marks }) {
      const top = Math.min(y, 230);
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
    draw({ y, from, color, full, marks }) {
      const flavours = [color, '#f9a8d4', '#fde68a', '#86efac', '#a16207', '#fdba74'];
      const n = Math.max(0, Math.round((240 - y) / 22));
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
};
