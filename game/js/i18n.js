// English + Hebrew UI strings. Hebrew switches the UI panels to RTL; the canvas stays LTR.
const D = {
  en: {
    title: 'Homelab Defender',
    tagline: 'Stop the malware before it reaches your server rack.',
    pickMap: 'Choose a network',
    'map.rack-row': 'Rack Row', 'map.spiral': 'Data Center Spiral', 'map.gauntlet': 'Zero-Day Gauntlet',
    'diff.easy': 'Easy', 'diff.medium': 'Medium', 'diff.hard': 'Hard',
    'map.desc.rack-row': 'A long, forgiving serpentine. 25 integrity.',
    'map.desc.spiral': 'Winds into the core. Armoured threats bite. 20 integrity.',
    'map.desc.gauntlet': 'Short path, tough packets. 15 integrity.',
    campaign: 'Campaign (20 waves)', endless: 'Endless',
    best: 'Best', wave: 'Wave', lives: 'Integrity', cash: 'Credits', score: 'Score', none: '—',
    play: 'Play', how: 'Place towers beside the amber bus. Kill every packet. Don\'t let them reach the core.',
    keys: 'Keys: 1–5 build · U upgrade · S sell · T targeting · Space send wave · Q EMP · W Overclock · F speed · P pause · Esc cancel',
    towers: 'Towers',
    'tower.firewall': 'Firewall', 'tower.beam': 'Beam Array', 'tower.mortar': 'Honeypot', 'tower.tesla': 'Arc Coil', 'tower.cryo': 'Cryo Cooler',
    'tdesc.firewall': 'Fast single shots. Cheap and reliable.',
    'tdesc.beam': 'Continuous beam. Ignores armour.',
    'tdesc.mortar': 'Area damage. Great against crowds.',
    'tdesc.tesla': 'Lightning that chains between enemies.',
    'tdesc.cryo': 'Slows everything in range.',
    'enemy.bot': 'Bot', 'enemy.sprinter': 'Sprinter', 'enemy.trojan': 'Trojan', 'enemy.phantom': 'Phantom', 'enemy.worm': 'Crypto Worm', 'enemy.ransomware': 'Ransomware',
    upgrade: 'Upgrade', sell: 'Sell', maxed: 'Max level', level: 'Tier', target: 'Target',
    'tgt.first': 'First', 'tgt.last': 'Last', 'tgt.strong': 'Strongest', 'tgt.weak': 'Weakest', 'tgt.close': 'Closest',
    abilities: 'Abilities', emp: 'EMP Flush', overclock: 'Overclock',
    'emp.desc': 'Stuns every enemy and zaps them.', 'overclock.desc': 'All towers fire 50% faster for 8s.',
    sendWave: 'Send wave', sendBonus: 'Send early', nextIn: 'Next wave in', allSent: 'Final wave',
    pause: 'Pause', resume: 'Resume', paused: 'Paused', mute: 'Sound off', unmute: 'Sound on', speed: 'Speed',
    selected: 'Selected', build: 'Build', cancel: 'Cancel',
    bossIncoming: 'Ransomware incoming!', waveN: 'Wave {n}', waveCleared: 'Wave {n} cleared  +{b}',
    earlyBonus: 'Early send  +{b}',
    'deny.cash': 'Not enough credits', 'deny.path': 'Can\'t build on the data bus', 'deny.occupied': 'Cell occupied', 'deny.bounds': 'Out of bounds',
    victory: 'Network secured!', victoryText: 'All 20 waves repelled.', defeat: 'Breach!', defeatText: 'The core was compromised.',
    finalScore: 'Final score', newBest: 'New best!', wavesReached: 'Waves reached',
    keepGoing: 'Go endless', again: 'Play again', menu: 'Menu',
    badges: 'Badges', unlocked: 'Badge unlocked',
    'badge.first-blood': 'First Blood', 'badge.boss-slayer': 'Boss Slayer', 'badge.worm-hunter': 'Worm Hunter', 'badge.chain-reaction': 'Chain Reaction',
    'badge.max-level': 'Fully Armed', 'badge.tycoon': 'Tycoon', 'badge.quick-draw': 'Quick Draw', 'badge.both-abilities': 'Tactician',
    'badge.flawless-wave': 'Flawless Wave', 'badge.victory': 'Network Secured', 'badge.flawless': 'Untouchable', 'badge.endless-30': 'Marathon',
    'bdesc.first-blood': 'Destroy your first enemy.', 'bdesc.boss-slayer': 'Defeat a Ransomware boss.', 'bdesc.worm-hunter': 'Kill 30 Crypto Worms.',
    'bdesc.chain-reaction': 'Hit 5 enemies with one Arc Coil zap.', 'bdesc.max-level': 'Upgrade a tower to tier 3.', 'bdesc.tycoon': 'Hold 1,500 credits.',
    'bdesc.quick-draw': 'Earn 20+ from one early send.', 'bdesc.both-abilities': 'Use both abilities in one run.',
    'bdesc.flawless-wave': 'Clear wave 10+ without a leak.', 'bdesc.victory': 'Win the campaign.', 'bdesc.flawless': 'Win without losing integrity.', 'bdesc.endless-30': 'Clear wave 30 in Endless.',
    back: 'Back to portfolio', lang: 'עב',
  },
  he: {
    title: 'מגן המעבדה',
    tagline: 'עצרו את הנוזקות לפני שהן מגיעות לארון השרתים.',
    pickMap: 'בחרו רשת',
    'map.rack-row': 'שורת ארונות', 'map.spiral': 'ספירלת חוות השרתים', 'map.gauntlet': 'מסדרון האפס-יום',
    'diff.easy': 'קל', 'diff.medium': 'בינוני', 'diff.hard': 'קשה',
    'map.desc.rack-row': 'נחש ארוך וסלחני. 25 שלמות.',
    'map.desc.spiral': 'מתפתל אל הליבה. איומים משוריינים. 20 שלמות.',
    'map.desc.gauntlet': 'מסלול קצר, חבילות קשוחות. 15 שלמות.',
    campaign: 'קמפיין (20 גלים)', endless: 'אינסופי',
    best: 'שיא', wave: 'גל', lives: 'שלמות', cash: 'קרדיטים', score: 'ניקוד', none: '—',
    play: 'שחקו', how: 'בנו מגדלים לצד הצינור הענבר. השמידו כל חבילה. אל תתנו להן להגיע לליבה.',
    keys: 'מקשים: ‎1–5‎ בנייה · U שדרוג · S מכירה · T מטרה · רווח שליחת גל · Q פולס · W האצה · F מהירות · P השהיה · Esc ביטול',
    towers: 'מגדלים',
    'tower.firewall': 'חומת אש', 'tower.beam': 'מערך קרן', 'tower.mortar': 'פח דבש', 'tower.tesla': 'סליל ברק', 'tower.cryo': 'מצנן',
    'tdesc.firewall': 'ירי יחיד מהיר. זול ואמין.',
    'tdesc.beam': 'קרן רציפה. מתעלמת משריון.',
    'tdesc.mortar': 'נזק באזור. מצוין נגד המונים.',
    'tdesc.tesla': 'ברק שקופץ בין אויבים.',
    'tdesc.cryo': 'מאט את כל מי שבטווח.',
    'enemy.bot': 'בוט', 'enemy.sprinter': 'ספרינטר', 'enemy.trojan': 'סוס טרויאני', 'enemy.phantom': 'רוח רפאים', 'enemy.worm': 'תולעת קריפטו', 'enemy.ransomware': 'כופרה',
    upgrade: 'שדרוג', sell: 'מכירה', maxed: 'רמה מרבית', level: 'דרגה', target: 'מטרה',
    'tgt.first': 'הראשון', 'tgt.last': 'האחרון', 'tgt.strong': 'החזק', 'tgt.weak': 'החלש', 'tgt.close': 'הקרוב',
    abilities: 'יכולות', emp: 'פולס EMP', overclock: 'האצה',
    'emp.desc': 'משתק ופוגע בכל האויבים.', 'overclock.desc': 'כל המגדלים יורים מהר ב-50% למשך 8 שניות.',
    sendWave: 'שלחו גל', sendBonus: 'שלחו מוקדם', nextIn: 'הגל הבא בעוד', allSent: 'הגל האחרון',
    pause: 'השהיה', resume: 'המשך', paused: 'מושהה', mute: 'השתקה', unmute: 'הפעלת קול', speed: 'מהירות',
    selected: 'נבחר', build: 'בנייה', cancel: 'ביטול',
    bossIncoming: 'כופרה בדרך!', waveN: 'גל {n}', waveCleared: 'גל {n} נוקה  +{b}',
    earlyBonus: 'שליחה מוקדמת  +{b}',
    'deny.cash': 'אין מספיק קרדיטים', 'deny.path': 'אי אפשר לבנות על הצינור', 'deny.occupied': 'התא תפוס', 'deny.bounds': 'מחוץ לגבולות',
    victory: 'הרשת מאובטחת!', victoryText: 'כל 20 הגלים הודפו.', defeat: 'פריצה!', defeatText: 'הליבה נפרצה.',
    finalScore: 'ניקוד סופי', newBest: 'שיא חדש!', wavesReached: 'גלים שהושגו',
    keepGoing: 'המשיכו לאינסופי', again: 'שחקו שוב', menu: 'תפריט',
    badges: 'עיטורים', unlocked: 'עיטור נפתח',
    'badge.first-blood': 'דם ראשון', 'badge.boss-slayer': 'קטלן בוסים', 'badge.worm-hunter': 'צייד תולעים', 'badge.chain-reaction': 'תגובת שרשרת',
    'badge.max-level': 'חמוש עד העצם', 'badge.tycoon': 'טייקון', 'badge.quick-draw': 'שליפה מהירה', 'badge.both-abilities': 'טקטיקן',
    'badge.flawless-wave': 'גל מושלם', 'badge.victory': 'רשת מאובטחת', 'badge.flawless': 'בלתי פגיע', 'badge.endless-30': 'מרתון',
    'bdesc.first-blood': 'השמידו את האויב הראשון.', 'bdesc.boss-slayer': 'נצחו כופרה.', 'bdesc.worm-hunter': 'הרגו 30 תולעי קריפטו.',
    'bdesc.chain-reaction': 'פגעו ב-5 אויבים בברק אחד.', 'bdesc.max-level': 'שדרגו מגדל לדרגה 3.', 'bdesc.tycoon': 'החזיקו 1,500 קרדיטים.',
    'bdesc.quick-draw': 'הרוויחו 20+ משליחה מוקדמת אחת.', 'bdesc.both-abilities': 'השתמשו בשתי היכולות בריצה אחת.',
    'bdesc.flawless-wave': 'נקו גל 10+ בלי דליפה.', 'bdesc.victory': 'נצחו את הקמפיין.', 'bdesc.flawless': 'נצחו בלי לאבד שלמות.', 'bdesc.endless-30': 'נקו גל 30 באינסופי.',
    back: 'חזרה לפורטפוליו', lang: 'EN',
  },
};

let lang = 'en';
export const getLang = () => lang;
export const isRTL = () => lang === 'he';

export function t(key, params) {
  let s = (D[lang] && D[lang][key]) ?? D.en[key] ?? key;
  if (params) for (const k in params) s = s.replace('{' + k + '}', params[k]);
  return s;
}

/** Translate [data-i18n] / [data-i18n-title] / [data-i18n-aria] under root and flip UI direction. */
export function applyLang(l, root = document) {
  lang = l === 'he' ? 'he' : 'en';
  document.documentElement.lang = lang;
  document.documentElement.dataset.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', el.title); });
  root.querySelectorAll('.rtl-ui').forEach((el) => { el.dir = lang === 'he' ? 'rtl' : 'ltr'; });
  document.title = t('title');
}
