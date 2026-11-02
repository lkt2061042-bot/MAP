/* =========================================================
 * geometry.js — 角度 / 距離 / 座標數學工具
 *
 * 座標系約定（全專案統一）：
 *   x 向東增加、y 向南增加（螢幕座標方向），單位 mm
 *   方位角 heading：0° = 北(-y)、90° = 東(+x)、順時針增加
 *   canvas 的 rotate(θ) 為順時針，因此 dir(h) = (sin h, -cos h)
 * ========================================================= */
(function () {
  'use strict';
  const G = {};

  G.TAU = Math.PI * 2;
  G.rad = (d) => (d * Math.PI) / 180;
  G.deg = (r) => (r * 180) / Math.PI;
  G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  G.lerp = (a, b, t) => a + (b - a) * t;

  /* 正規化到 [0, 360) */
  G.norm360 = function (a) {
    a %= 360;
    return a < 0 ? a + 360 : a;
  };

  /* 正規化到 (-180, 180] */
  G.norm180 = function (a) {
    a = G.norm360(a);
    return a > 180 ? a - 360 : a;
  };

  /* 角度平滑（走最短路徑，不會從 359 繞回 0 時轉一大圈） */
  G.lerpAngle = function (from, to, t) {
    return G.norm360(from + G.norm180(to - from) * t);
  };

  G.dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  /* 從 from 看 to 的方位角 */
  G.bearing = function (from, to) {
    return G.norm360(G.deg(Math.atan2(to.x - from.x, from.y - to.y)));
  };

  /* 方位角 → 單位向量 */
  G.dir = function (h) {
    const r = G.rad(h);
    return { x: Math.sin(r), y: -Math.cos(r) };
  };

  /* 點到線段最短距離 */
  G.pointSegDist = function (px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
    t = G.clamp(t, 0, 1);
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  };

  G.rectContains = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  /* 向量旋轉（順時針為正，配合 canvas） */
  G.rotate = function (v, a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
  };

  APP.geometry = G;
})();
