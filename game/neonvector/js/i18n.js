export const STRINGS = {
  en: {
    title: 'NEON VECTOR 2077', subtitle: 'CYBERSPACE SHMUP', hub: '◂ CYBER HUB', start: 'JACK IN', endless: 'ENDLESS OVERCLOCK',
    hull: 'HULL', shield: 'SHIELD', sector: 'SECTOR', mult: 'MULT', overdrive: 'OVERDRIVE', score: 'SCORE', pause: 'PAUSE', resume: 'RESUME',
    mute: 'MUTE', unmute: 'SOUND', auto: 'AUTO-FIRE', bomb: 'OVERDRIVE PULSE', lang: 'עב',
    warning: 'WARNING // MEGACORP ICE DETECTED', sectorClear: 'SECTOR CLEAR', ready: 'OVERDRIVE READY',
    win: 'BLACKWALL BREACHED', dead: 'FLATLINED', eddies: 'EDDIES', xp: 'XP', wave: 'SECTOR', retry: 'RETRY', unlocked: 'ENDLESS OVERCLOCK UNLOCKED',
    help: 'Drag / WASD to move · Auto-fire ON · Graze magenta bullets to charge OVERDRIVE · SPACE / SHIFT / Right-click = PULSE BOMB',
    paused: 'PAUSED', resumeSaved: '▶ RESUME SAVED RUN', savedProgress: 'Progress auto-saved',
  },
  he: {
    title: 'NEON VECTOR 2077', subtitle: 'קרב חלל בסייברספייס', hub: 'מרכז הסייבר ▸', start: 'התחבר', endless: 'אוברקלוק אינסופי',
    hull: 'שריון', shield: 'מגן', sector: 'סקטור', mult: 'מכפיל', overdrive: 'אוברדרייב', score: 'ניקוד', pause: 'השהה', resume: 'המשך',
    mute: 'השתק', unmute: 'סאונד', auto: 'ירי אוטו׳', bomb: 'פולס אוברדרייב', lang: 'EN',
    warning: 'אזהרה // זוהה קרח מגה-קורפ', sectorClear: 'הסקטור נוקה', ready: 'אוברדרייב מוכן',
    win: 'הבלקוול נפרץ', dead: 'נפלת', eddies: 'אדיז', xp: 'ניסיון', wave: 'סקטור', retry: 'שוב', unlocked: 'מצב אינסופי נפתח',
    help: 'גרור / WASD לתנועה · ירי אוטומטי · התקרב לקליעים כדי להטעין אוברדרייב · רווח / SHIFT / קליק ימני = פצצה',
    paused: 'מושהה', resumeSaved: '▶ המשך ריצה שמורה', savedProgress: 'ההתקדמות נשמרה אוטומטית',
  },
};
export const BOSS_HE = ['ארבע-רגליים של מיליטק', 'פריזמת קאנג טאו', 'עכביש-מך של אראסאקה', 'ארכון נטווצ׳', 'סרף הבלקוול'];
export function t(lang, key) { return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key; }
export function bossName(lang, idx, en) { return lang === 'he' ? BOSS_HE[idx % 5] : en; }
