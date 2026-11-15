/*
 * emoji.js — the icon picker's choices, and icon suggestions from job/prize names.
 * To teach it a new word, add a line to KEYWORDS: [/\b(word|other word)/, '🙂'].
 */

export const EMOJI_GROUPS = [
  {
    name: 'Jobs & routines',
    list: ['🪥', '🦷', '🛁', '🚿', '🧼', '🚽', '🛏️', '😴', '🌙', '☀️', '👕', '🧦', '👟', '🧥', '🎒', '🏫', '📚', '✏️',
      '🧸', '🧹', '🧺', '🍽️', '🥦', '🥣', '🗑️', '🌱', '🐶', '🐱', '🐟', '🤝', '💖', '👂', '🙏', '🎹', '🎵', '⏰', '🚗', '💇', '✅'],
  },
  {
    name: 'Treats & food',
    list: ['🍭', '🍬', '🍫', '🍦', '🍪', '🍩', '🧁', '🍰', '🍕', '🍟', '🍿', '🥤', '🍓', '🍉', '🥞', '🌮'],
  },
  {
    name: 'Toys & fun',
    list: ['🧸', '🧱', '🪀', '🧩', '🎲', '🎮', '🚂', '🚒', '✈️', '🚀', '🪁', '⚽', '🏀', '🎨', '🖍️', '🎈', '🦖', '🦄',
      '🪆', '🛹', '🚲', '🎁', '🏆', '⭐', '🌟', '✨'],
  },
  {
    name: 'Outings',
    list: ['🛝', '🏞️', '🏊', '🏖️', '🎬', '🎡', '🎳', '⛸️', '🦁', '🐠', '🍔', '🛒'],
  },
  {
    name: 'Pictures for kids',
    list: ['🌈', '🚀', '🦊', '🐼', '🐯', '🐸', '🐙', '🦋', '🐝', '🐢', '🦕', '🦄', '👑', '🦸', '🧚', '🤖', '😎', '🥳', '🙂'],
  },
];

// Checked in order; every match becomes a suggestion, and the first one is used automatically.
const KEYWORDS = [
  [/\b(brush|teeth|tooth)/, '🪥'],
  [/\bfloss/, '🦷'],
  [/\bbath/, '🛁'],
  [/\bshower/, '🚿'],
  [/\b(wash|hands?\b|soap)/, '🧼'],
  [/\b(potty|toilet|bathroom)/, '🚽'],
  [/\b(make (the |your |my )?bed)/, '🛏️'],
  [/\b(bedtime|sleep|nap)/, '😴'],
  [/\bnight/, '🌙'],
  [/\b(morning|wake)/, '☀️'],
  [/\b(dress|clothes|pajama|pjs?\b|outfit)/, '👕'],
  [/\bsock/, '🧦'],
  [/\bshoe/, '👟'],
  [/\b(coat|jacket)/, '🧥'],
  [/\b(backpack|bag\b)/, '🎒'],
  [/\b(school|care\b|daycare|preschool|camp\b|class)/, '🏫'],
  [/\b(read|book|story|library)/, '📚'],
  [/\b(homework|write|writing|letters|spelling)/, '✏️'],
  [/\b(clean up|tidy|pick up|put away)/, '🧸'],
  [/\b(sweep|clean|vacuum)/, '🧹'],
  [/\blaundry/, '🧺'],
  [/\b(dish|table)/, '🍽️'],
  [/\b(veg|eat\b|dinner|lunch|food|plate)/, '🥦'],
  [/\bbreakfast/, '🥣'],
  [/\b(trash|garbage|recycl)/, '🗑️'],
  [/\b(plant|garden|water the)/, '🌱'],
  [/\b(dog|puppy|paw patrol)/, '🐶'],
  [/\b(cat\b|kitty|kitten)/, '🐱'],
  [/\bfish/, '🐟'],
  [/\bhelp/, '🤝'],
  [/\b(kind|share|sharing|nice|gentle|hug)/, '💖'],
  [/\blisten/, '👂'],
  [/\b(please|thank|polite|manners)/, '🙏'],
  [/\b(piano|music|instrument)/, '🎹'],
  [/\b(sing|song)/, '🎵'],
  [/\b(on time|ready|hurry)/, '⏰'],
  [/\b(car seat|seatbelt|buckle)/, '🚗'],
  [/\bhair/, '💇'],
  [/\b(candy|lollipop|sweets?\b|treat)/, '🍭'],
  [/\bchocolate/, '🍫'],
  [/\bice cream/, '🍦'],
  [/\bcookie/, '🍪'],
  [/\b(donut|doughnut)/, '🍩'],
  [/\bcupcake/, '🧁'],
  [/\bcake/, '🍰'],
  [/\bpizza/, '🍕'],
  [/\bfries/, '🍟'],
  [/\bpopcorn/, '🍿'],
  [/\b(lego|blocks)/, '🧱'],
  [/\bpuzzle/, '🧩'],
  [/\b(video game|game|tablet|ipad|screen time)/, '🎮'],
  [/\b(train|thomas)/, '🚂'],
  [/\bfire ?truck/, '🚒'],
  [/\b(hot wheels|car\b|cars\b|truck)/, '🚗'],
  [/\bplane/, '✈️'],
  [/\brocket/, '🚀'],
  [/\bkite/, '🪁'],
  [/\b(ball\b|soccer)/, '⚽'],
  [/\bbasketball/, '🏀'],
  [/\b(paint|art\b|craft)/, '🎨'],
  [/\b(crayon|marker|coloring)/, '🖍️'],
  [/\bballoon/, '🎈'],
  [/\b(dino|dinosaur)/, '🦖'],
  [/\bunicorn/, '🦄'],
  [/\b(doll|barbie)/, '🪆'],
  [/\b(bike|scooter)/, '🚲'],
  [/\bskate/, '🛹'],
  [/\b(stuffy|stuffie|stuffed|plush|teddy)/, '🧸'],
  [/\btoy/, '🧸'],
  [/\b(movie|film|cinema)/, '🎬'],
  [/\b(park|playground|slide|swing)/, '🛝'],
  [/\b(pool|swim)/, '🏊'],
  [/\bbeach/, '🏖️'],
  [/\bbowling/, '🎳'],
  [/\bzoo/, '🦁'],
  [/\baquarium/, '🐠'],
  [/\b(walmart|target|store|shop)/, '🛒'],
  [/\b(surprise|mystery|special|big|prize|present|gift)/, '🎁'],
  [/\btrophy/, '🏆'],
  [/\bsticker/, '⭐'],
];

/** Icons that match words in the text, best match first. */
export function suggestEmoji(text) {
  const t = String(text).toLowerCase();
  const out = [];
  for (const [re, emoji] of KEYWORDS) if (re.test(t) && !out.includes(emoji)) out.push(emoji);
  return out;
}
