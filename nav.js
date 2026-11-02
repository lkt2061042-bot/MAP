/* =========================================================
 * nav.js — 導航網格、A* 尋路、路徑平滑、方位計算
 *
 * 做法：
 *   1. 以 100mm 網格把平面圖點陣化，格子中心必須同時
 *      「在房間/走廊內」且「離牆線夠遠」才算可走 → 門洞自然成為唯一通道
 *   2. A*（8 方向、禁止切角）找出格子路徑
 *   3. 用視線檢查把鋸齒路徑簡化成幾個轉折點
 * ========================================================= */
(function () {
  'use strict';
  const G = APP.geometry;
  const cfg = APP.config;
  const L = APP.layout;

  const cell = cfg.grid.cell;

  let cols = 0;
  let rows = 0;
  let walk = null;      // Uint8Array，1 = 可走
  let ready = false;

  const idx = (c, r) => r * cols + c;

  function cellOfX(x) { return G.clamp(Math.floor(x / cell), 0, cols - 1); }
  function cellOfY(y) { return G.clamp(Math.floor(y / cell), 0, rows - 1); }
  const centerX = (c) => (c + 0.5) * cell;
  const centerY = (r) => (r + 0.5) * cell;

  function build() {
    if (ready) return;
    cols = Math.ceil(cfg.map.width / cell);
    rows = Math.ceil(cfg.map.height / cell);
    walk = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        walk[idx(c, r)] = L.isWalkable(centerX(c), centerY(r)) ? 1 : 0;
      }
    }
    ready = true;
  }

  function walkableAt(x, y) {
    if (!ready) build();
    if (x < 0 || y < 0 || x > cfg.map.width || y > cfg.map.height) return false;
    return walk[idx(cellOfX(x), cellOfY(y))] === 1;
  }

  /* 找出最近的可行走格中心（若起點落在牆／家具內） */
  function snap(p) {
    if (!ready) build();
    const c0 = cellOfX(p.x);
    const r0 = cellOfY(p.y);
    if (walk[idx(c0, r0)]) return { x: centerX(c0), y: centerY(r0), c: c0, r: r0 };

    for (let radius = 1; radius < 90; radius++) {
      let best = null;
      let bestD = Infinity;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;  // 只掃外圈
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
          if (!walk[idx(c, r)]) continue;
          const d = Math.hypot(centerX(c) - p.x, centerY(r) - p.y);
          if (d < bestD) { bestD = d; best = { x: centerX(c), y: centerY(r), c, r }; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /* ---------- 最小堆積（優先隊列） ---------- */
  function Heap() {
    this.a = [];
  }
  Heap.prototype.push = function (node, pri) {
    this.a.push({ node, pri });
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.a[p].pri <= this.a[i].pri) break;
      const t = this.a[p]; this.a[p] = this.a[i]; this.a[i] = t;
      i = p;
    }
  };
  Heap.prototype.pop = function () {
    if (!this.a.length) return null;
    const top = this.a[0];
    const last = this.a.pop();
    if (this.a.length) {
      this.a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.a.length && this.a[l].pri < this.a[m].pri) m = l;
        if (r < this.a.length && this.a[r].pri < this.a[m].pri) m = r;
        if (m === i) break;
        const t = this.a[m]; this.a[m] = this.a[i]; this.a[i] = t;
        i = m;
      }
    }
    return top.node;
  };
  Heap.prototype.size = function () { return this.a.length; };

  /* ---------- A* ---------- */
  function astar(startCell, goalCell) {
    const N = cols * rows;
    const gScore = new Float32Array(N).fill(Infinity);
    const cameFrom = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);

    const sIdx = idx(startCell.c, startCell.r);
    const gIdx = idx(goalCell.c, goalCell.r);

    const h = (c, r) => {
      const dc = Math.abs(c - goalCell.c);
      const dr = Math.abs(r - goalCell.r);
      return 10 * (dc + dr) - 6 * Math.min(dc, dr);   // octile
    };

    const open = new Heap();
    gScore[sIdx] = 0;
    open.push(sIdx, h(startCell.c, startCell.r));

    const DIRS = [
      [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10],
      [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]
    ];

    let guard = 0;
    while (open.size()) {
      if (++guard > N * 4) break;
      const cur = open.pop();
      if (cur === gIdx) break;
      if (closed[cur]) continue;
      closed[cur] = 1;

      const cr = Math.floor(cur / cols);
      const cc = cur - cr * cols;

      for (let i = 0; i < DIRS.length; i++) {
        const dc = DIRS[i][0];
        const dr = DIRS[i][1];
        const nCost = DIRS[i][2];
        const nc = cc + dc;
        const nr = cr + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const nI = idx(nc, nr);
        if (!walk[nI] || closed[nI]) continue;

        // 斜走時不允許穿牆角
        if (dc !== 0 && dr !== 0) {
          if (!walk[idx(cc + dc, cr)] || !walk[idx(cc, cr + dr)]) continue;
        }

        const tentative = gScore[cur] + nCost;
        if (tentative < gScore[nI]) {
          gScore[nI] = tentative;
          cameFrom[nI] = cur;
          open.push(nI, tentative + h(nc, nr));
        }
      }
    }

    if (cameFrom[gIdx] === -1 && gIdx !== sIdx) {
      if (gScore[gIdx] === Infinity) return null;
    }

    const path = [];
    let cur = gIdx;
    let guard2 = 0;
    while (cur !== -1 && guard2++ < N) {
      const r = Math.floor(cur / cols);
      const c = cur - r * cols;
      path.push({ x: centerX(c), y: centerY(r) });
      if (cur === sIdx) break;
      cur = cameFrom[cur];
    }
    if (cur !== sIdx) return null;
    path.reverse();
    return path;
  }

  /* ---------- 視線檢查（用網格，快很多） ---------- */
  function lineClear(a, b) {
    const d = G.dist(a, b);
    const n = Math.max(2, Math.ceil(d / cfg.grid.sightStep));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (!walkableAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
    }
    return true;
  }

  /* 把格子鋸齒路徑簡化為少量轉折點 */
  function simplify(pts) {
    if (pts.length <= 2) return pts.slice();
    const out = [pts[0]];
    let i = 0;
    let guard = 0;
    while (i < pts.length - 1 && guard++ < pts.length + 5) {
      let j = pts.length - 1;
      for (; j > i + 1; j--) {
        if (lineClear(pts[i], pts[j])) break;
      }
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  /* ---------- 對外：建立路線 ---------- */
  function findRoute(start, goal) {
    if (!ready) build();

    const s = snap(start);
    const g = snap(goal);
    if (!s || !g) return null;

    const cells = astar(s, g);
    if (!cells || !cells.length) return null;

    let pts = cells;
    // 起點若不是剛好可走，改用實際選擇的點接上去
    if (L.isWalkable(start.x, start.y)) pts = [{ x: start.x, y: start.y }].concat(pts);
    if (L.isWalkable(goal.x, goal.y)) pts = pts.concat([{ x: goal.x, y: goal.y }]);

    const simple = simplify(pts);

    const cum = [0];
    let total = 0;
    for (let i = 1; i < simple.length; i++) {
      total += G.dist(simple[i - 1], simple[i]);
      cum.push(total);
    }

    return { pts: simple, cum: cum, total: total, snappedStart: s, snappedGoal: g };
  }

  /* 目前應該朝向的路徑點索引
   * 除了「接近目前點就前進」之外，也處理走過頭的情況：
   * 下一個點比目前點更近 → 代表已經越過了垂分線，直接前進。 */
  function nextIndex(pos, route, fromIndex) {
    if (!route || !route.pts.length) return 0;
    const pts = route.pts;
    let i = G.clamp(fromIndex || 0, 0, pts.length - 1);
    while (i < pts.length - 1) {
      const dCur = G.dist(pos, pts[i]);
      const dNext = G.dist(pos, pts[i + 1]);
      if (dCur < cfg.nav.waypointRadius || dNext <= dCur) i++;
      else break;
    }
    return i;
  }

  function bearingToNext(pos, route, fromIndex) {
    if (!route || !route.pts.length) return null;
    const i = nextIndex(pos, route, fromIndex);
    const t = route.pts[i];
    if (G.dist(pos, t) < 5) return null;
    return G.bearing(pos, t);
  }

  function remainingDistance(pos, route, fromIndex) {
    if (!route || !route.pts.length) return 0;
    const i = nextIndex(pos, route, fromIndex);
    return G.dist(pos, route.pts[i]) + (route.total - route.cum[i]);
  }

  APP.nav = {
    build: build,
    isReady: () => ready,
    walkableAt: walkableAt,
    snap: snap,
    findRoute: findRoute,
    nextIndex: nextIndex,
    bearingToNext: bearingToNext,
    remainingDistance: remainingDistance
  };
})();
