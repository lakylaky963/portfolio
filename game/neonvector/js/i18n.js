export const STRINGS = {
  en: {
    title: 'NEON VECTOR 2077', subtitle: 'CYBERSPACE SHMUP', hub: '◢ CYBER HUB', start: 'JACK IN', endless: 'ENDLESS OVERCLOCK',
    hull: 'HULL', shield: 'SHIELD', sector: 'SECTOR', mult: 'MULT', overdrive: 'OVERDRIVE', score: 'SCORE', pause: 'PAUSE', resume: 'RESUME', restart: 'NEW RUN',
    mute: 'MUTE', unmute: 'SOUND', auto: 'AUTO-FIRE', bomb: 'OVERDRIVE PULSE', lang: 'עב',
    warning: 'WARNING // MEGACORP ICE DETECTED', sectorClear: 'SECTOR CLEAR', ready: 'OVERDRIVE READY', phase: 'PHASE',
    win: 'BLACKWALL BREACHED', dead: 'FLATLINED', eddies: 'EDDIES', xp: 'XP', wave: 'SECTOR', retry: 'RETRY', unlocked: 'ENDLESS OVERCLOCK UNLOCKED',
    help: 'Drag / WASD / Arrows to move · Space / Shift / Right-click = Overdrive · P / Esc = Pause · M = Mute · Graze bullets to charge Overdrive',
    paused: 'PAUSED', resumeSaved: '▶ RESUME SAVED RUN', savedProgress: 'Progress auto-saved',
  },
  he: {
    title: 'NEON VECTOR 2077', subtitle: 'קרב חלל בסייברספייס', hub: '◢ מרכז הסייבר', start: 'התחבר', endless: 'אוברקלוק אינסופי',
    hull: 'שריון', shield: 'מגן', sector: 'סקטור', mult: 'מכפיל', overdrive: 'אוברדרייב', score: 'ניקוד', pause: 'השהה', resume: 'המשך', restart: 'ריצה חדשה',
    mute: 'השתק', unmute: 'סאונד', auto: 'ירי אוטו׳', bomb: 'פולס אוברדרייב', lang: 'EN',
    warning: 'אזהרה // זוהה קרח מגה-קורפ', sectorClear: 'הסקטור נוקה', ready: 'אוברדרייב מוכן', phase: 'שלב',
    win: 'הבלקוול נפרץ', dead: 'החיבור נותק', eddies: 'יורודולרים', xp: 'ניסיון', wave: 'סקטור', retry: 'שוב', unlocked: 'מצב אינסופי נפתח',
    help: 'גרור / WASD / חצים לתנועה · רווח / Shift / קליק ימני = אוברדרייב · P / Esc = השהה · M = השתק · התקרב לקליעים לטעינת אוברדרייב',
    paused: 'מושהה', resumeSaved: '▶ המשך ריצה שמורה', savedProgress: 'ההתקדמות נשמרה אוטומטית',
  },
};
export const BOSS_HE = ['מרבה-רגליים של מיליטק', 'פריזמת קאנג טאו', 'עכביש-מך של אראסאקה', 'ארכון נטוואץ׳', 'סרף הבלקוול'];
export function t(lang, key) { return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key; }
export function bossName(a, b, en) {
  const isIdxFirst = typeof a === 'number';
  const idx = isIdxFirst ? a : (typeof b === 'number' ? b : 0);
  const lang = isIdxFirst ? b : a;
  return lang === 'he' ? BOSS_HE[((idx % 5) + 5) % 5] : (en || BOSS_HE[((idx % 5) + 5) % 5]);
}
