/* =========================================================
 * layout.js — 測試平面圖：4 個房間 + 2 條走廊
 *
 *   0        3500   4700              8200 (x)
 * 0 ┌────────┬──────┬───────────────┐
 *   │  客廳   │走廊2 │     睡房       │  2900
 *   ├──┬─────┴──────┴─────┬─────────┤
 *   │  │      走廊 1       │         │  4100   ← 全寬走廊
 *   ├──┴─────┬────────────┴─────────┤
 *   │  廚房   │        書房           │
 *   └────────┴──────────────────────┘  7000 (y)
 *
 * 兩條走廊（走廊1 東西向、走廊2 南北向）在中間交會，
 * 四個房間各有門通向走廊，適合測試繞路 / 轉彎 / 路徑重規劃。
 * ========================================================= */
(function () {
  'use strict';
  const G = APP.geometry;
  const cfg = APP.config;
  const W = cfg.wall.thickness;

  /* ---------- 可走區域：房間與走廊都是矩形 ---------- */
  const tiles = [
    { id: 'A',  name: '客廳',   type: 'room',     x: 0,    y: 0,    w: 3500, h: 2900 },
    { id: 'C2', name: '走廊 2', type: 'corridor', x: 3500, y: 0,    w: 1200, h: 2900 },
    { id: 'B',  name: '睡房',   type: 'room',     x: 4700, y: 0,    w: 3500, h: 2900 },
    { id: 'C1', name: '走廊 1', type: 'corridor', x: 0,    y: 2900, w: 8200, h: 1200 },
    { id: 'C',  name: '廚房',   type: 'room',     x: 0,    y: 4100, w: 3500, h: 2900 },
    { id: 'D',  name: '書房',   type: 'room',     x: 3500, y: 4100, w: 4700, h: 2900 }
  ];

  /* ---------- 門洞（牆上的開口） ---------- */
  function hDoor(x1, x2, y) {           // 水平牆（y 固定）上的開口
    return { x1: x1, x2: x2, y1: y - W / 2, y2: y + W / 2, axis: 'h', at: y };
  }
  function vDoor(x, y1, y2) {           // 垂直牆（x 固定）上的開口
    return { x1: x - W / 2, x2: x + W / 2, y1: y1, y2: y2, axis: 'v', at: x };
  }

  const doors = [
    hDoor(1300, 2200, 2900),   // 客廳   ↔ 走廊1
    hDoor(5800, 6700, 2900),   // 睡房   ↔ 走廊1
    hDoor(1300, 2200, 4100),   // 廚房   ↔ 走廊1
    hDoor(5700, 6600, 4100),   // 書房   ↔ 走廊1
    hDoor(3500, 4700, 2900),   // 走廊2  ↔ 走廊1（整個闊度打通）
    vDoor(3500, 900, 1800),    // 客廳   ↔ 走廊2
    vDoor(4700, 900, 1800)     // 睡房   ↔ 走廊2
  ];

  /* ---------- 由房間邊界自動生成牆線，再減去門洞 ---------- */
  function buildWalls(tilesIn, doorsIn) {
    const segKey = (s) => [
      Math.round(Math.min(s.x1, s.x2)), Math.round(Math.max(s.x1, s.x2)),
      Math.round(Math.min(s.y1, s.y2)), Math.round(Math.max(s.y1, s.y2))
    ].join(',');

    // 1. 收集所有矩形的四條邊並去重（相鄰房間共用牆只保留一條）
    const seen = new Set();
    const edges = [];
    for (const t of tilesIn) {
      const cand = [
        { x1: t.x, y1: t.y, x2: t.x + t.w, y2: t.y },
        { x1: t.x + t.w, y1: t.y, x2: t.x + t.w, y2: t.y + t.h },
        { x1: t.x + t.w, y1: t.y + t.h, x2: t.x, y2: t.y + t.h },
        { x1: t.x, y1: t.y + t.h, x2: t.x, y2: t.y }
      ];
      for (const s of cand) {
        const k = segKey(s);
        if (!seen.has(k)) { seen.add(k); edges.push(s); }
      }
    }

    // 2. 逐條邊減去落在線上的門洞區間
    const out = [];
    for (const s of edges) {
      const horiz = Math.abs(s.y1 - s.y2) < 0.5;
      let lo = horiz ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2);
      let hi = horiz ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2);
      const fixed = horiz ? s.y1 : s.x1;

      const cuts = [];
      for (const d of doorsIn) {
        const a = Math.max(lo, horiz ? d.x1 : d.y1);
        const b = Math.min(hi, horiz ? d.x2 : d.y2);
        if (b - a <= 0) continue;
        // 門洞必須真的壓在這條牆線上
        const onLine = horiz
          ? d.y1 <= fixed + 1 && d.y2 >= fixed - 1
          : d.x1 <= fixed + 1 && d.x2 >= fixed - 1;
        if (onLine) cuts.push([a, b]);
      }
      cuts.sort((p, q) => p[0] - q[0]);

      let cur = lo;
      const parts = [];
      for (const c of cuts) {
        if (c[0] > cur) parts.push([cur, Math.min(c[0], hi)]);
        if (c[1] > cur) cur = c[1];
        if (cur >= hi) break;
      }
      if (cur < hi) parts.push([cur, hi]);

      for (const p of parts) {
        if (p[1] - p[0] < 1) continue;
        out.push(horiz
          ? { x1: p[0], y1: fixed, x2: p[1], y2: fixed }
          : { x1: fixed, y1: p[0], x2: fixed, y2: p[1] });
      }
    }

    // 3. 最後再按座標去重（相鄰矩形重疊段會產生重複線）
    const map = new Map();
    for (const s of out) map.set(segKey(s), s);
    return Array.from(map.values());
  }

  const walls = buildWalls(tiles, doors);

  /* ---------- 牆上電掣（校準點） ---------- */
  const devices = {
    'SW-301': { x: 1500, y: 200,  name: '客廳 北牆' },
    'SW-302': { x: 8000, y: 1450, name: '睡房 東牆' },
    'SW-303': { x: 1500, y: 6800, name: '廚房 南牆' },
    'SW-304': { x: 3700, y: 5550, name: '書房 西牆' },
    'SW-305': { x: 2400, y: 3500, name: '走廊1 中段' }
  };

  /* ---------- 起點／終點可選地點 ---------- */
  const landmarks = [
    { id: 'current', name: '◎ 目前位置' },
    { id: 'A',  name: '客廳 中心',   x: 1750, y: 1450 },
    { id: 'B',  name: '睡房 中心',   x: 6450, y: 1450 },
    { id: 'C',  name: '廚房 中心',   x: 1750, y: 5550 },
    { id: 'D',  name: '書房 中心',   x: 5850, y: 5550 },
    { id: 'C1w', name: '走廊1 西段', x: 1200, y: 3500 },
    { id: 'C1e', name: '走廊1 東段', x: 7000, y: 3500 },
    { id: 'C2n', name: '走廊2 北段', x: 4100, y: 800 }
  ];
  for (const code in devices) {
    landmarks.push({ id: code, name: code + '　' + devices[code].name, x: devices[code].x, y: devices[code].y });
  }
  landmarks.push({ id: 'custom', name: '✎ 自訂座標 X / Y' });

  /* ---------- 可走性判斷 ---------- */
  const clearance = W / 2 + 60;   // 離牆中心線至少要多遠才當成可走

  function tileAt(x, y) {
    for (let i = 0; i < tiles.length; i++) {
      if (G.rectContains(tiles[i], x, y)) return tiles[i];
    }
    return null;
  }

  function nearestWallDist(x, y) {
    let best = Infinity;
    for (let i = 0; i < walls.length; i++) {
      const s = walls[i];
      const d = G.pointSegDist(x, y, s.x1, s.y1, s.x2, s.y2);
      if (d < best) best = d;
    }
    return best;
  }

  function isWalkable(x, y) {
    if (!tileAt(x, y)) return false;
    return nearestWallDist(x, y) > clearance;
  }

  APP.layout = {
    tiles: tiles,
    doors: doors,
    walls: walls,
    devices: devices,
    landmarks: landmarks,
    clearance: clearance,
    tileAt: tileAt,
    nearestWallDist: nearestWallDist,
    isWalkable: isWalkable
  };
})();
