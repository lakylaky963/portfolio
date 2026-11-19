// Maps: 16 x 10 grid. `path` lists waypoints (col,row). The first/last waypoint may sit one
// cell outside the grid (entry / exit); every segment must be axis-aligned.
export const COLS = 16;
export const ROWS = 10;

export const MAPS = [
  {
    id: 'rack-row', difficulty: 'easy',
    lives: 25, cash: 260, hpMul: 1.0,
    path: [[-1, 1], [13, 1], [13, 4], [2, 4], [2, 7], [16, 7]],
  },
  {
    id: 'spiral', difficulty: 'medium',
    lives: 20, cash: 220, hpMul: 1.3,
    path: [[-1, 8], [14, 8], [14, 1], [2, 1], [2, 6], [11, 6], [11, 3], [7, 3]],
  },
  {
    id: 'gauntlet', difficulty: 'hard',
    lives: 15, cash: 200, hpMul: 1.4,
    path: [[-1, 5], [4, 5], [4, 2], [8, 2], [8, 7], [12, 7], [12, 3], [16, 3]],
  },
];

const inGrid = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;

/** All in-grid cells the path occupies, as "c,r" strings. */
export function pathCells(map) {
  const cells = new Set();
  const p = map.path;
  for (let i = 0; i < p.length - 1; i++) {
    const [c0, r0] = p[i], [c1, r1] = p[i + 1];
    const dc = Math.sign(c1 - c0), dr = Math.sign(r1 - r0);
    let c = c0, r = r0;
    for (;;) {
      if (inGrid(c, r)) cells.add(c + ',' + r);
      if (c === c1 && r === r1) break;
      c += dc; r += dr;
    }
  }
  return cells;
}

/** Returns a list of problems (empty array = valid). */
export function validateMap(map) {
  const errs = [];
  const p = map.path;
  if (!Array.isArray(p) || p.length < 2) return ['path needs at least 2 waypoints'];
  for (let i = 0; i < p.length - 1; i++) {
    const [c0, r0] = p[i], [c1, r1] = p[i + 1];
    if (c0 !== c1 && r0 !== r1) errs.push(`segment ${i} is not axis-aligned`);
    if (c0 === c1 && r0 === r1) errs.push(`segment ${i} has zero length`);
  }
  p.forEach(([c, r], i) => {
    const edge = i === 0 || i === p.length - 1;
    const ok = edge ? c >= -1 && c <= COLS && r >= -1 && r <= ROWS : inGrid(c, r);
    if (!ok) errs.push(`waypoint ${i} out of bounds`);
  });
  // no cell may be visited twice (a corner shared by two segments counts once)
  const seen = new Set();
  let total = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const [c0, r0] = p[i], [c1, r1] = p[i + 1];
    const dc = Math.sign(c1 - c0), dr = Math.sign(r1 - r0);
    let c = c0, r = r0;
    if (i > 0) { c += dc; r += dr; }
    for (;;) {
      const k = c + ',' + r;
      if (seen.has(k)) errs.push(`path revisits cell ${k}`);
      seen.add(k); total++;
      if (c === c1 && r === r1) break;
      c += dc; r += dr;
    }
  }
  if (total < 10) errs.push('path too short');
  return errs;
}
