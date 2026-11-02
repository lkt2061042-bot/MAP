/* =========================================================
 * app.js — 主程式：狀態、導航流程、動畫迴圈（對齊 01.html 平滑邏輯）
 * ========================================================= */
(function () {
  'use strict';
  const G = APP.geometry;
  const cfg = APP.config;
  const L = APP.layout;
  const Nav = APP.nav;
  const R = APP.render;
  const S = APP.sensors;

  const canvas = document.getElementById('mapCanvas');
  const ctx = canvas.getContext('2d');
  const cam = new APP.Camera();

  const state = {
    user: { x: 1500, y: 2500 },     // 真實位置
    marker: { x: 1500, y: 2500 },   // 虛擬標記（等等我用的參考點）
    displayPos: { x: 1500, y: 2500 }, // 畫面顯示用的平滑座標
    arrowHeading: 0,                // 目前顯示的平滑方位角
    userHeading: 0,                 // 感應器回報的實際方位角
    headingOffset: 0,
    stepCount: 0,
    sensitivity: cfg.step.sensitivity,
    stride: cfg.step.stride,
    route: null,
    routeIndex: 0,
    start: null,
    dest: null,
    distanceLeft: 0,
    bearing: null,
    phase: 'idle',          // idle | calibrating | navigating | arrived
    pickMode: null,         // null | 'start' | 'dest'
    showGrid: true
  };

  const app = {
    state: state,
    cam: cam,
    sensors: S,

    /* ---------- 定位 / 步進（對齊 01.html 步幅與向量計算） ---------- */
    addStep: function () {
      state.stepCount++;

      // 讀取步幅設定，將 1-100 對應至 780mm 基準
      const strideInput = Math.max(1, Math.min(100, state.stride));
      const currentStrideMM = (strideInput / 100) * 780;

      // 使用與 01.html 一致的三角函數計算前進方向
      const rad = (-state.userHeading * Math.PI) / 180;
      state.marker.x += Math.sin(rad) * currentStrideMM;
      state.marker.y -= Math.cos(rad) * currentStrideMM;

      // 限制在地圖邊界內
      state.marker.x = G.clamp(state.marker.x, 0, cfg.map.width);
      state.marker.y = G.clamp(state.marker.y, 0, cfg.map.height);

      state.user.x = state.marker.x;
      state.user.y = state.marker.y;

      this.updateProgress();
      cam.follow(state.user, 0.5);
      if (APP.ui) APP.ui.syncStepCount(state.stepCount);
    },

    setPosition: function (x, y) {
      state.user.x = G.clamp(x, 0, cfg.map.width);
      state.user.y = G.clamp(y, 0, cfg.map.height);
      state.marker.x = state.user.x;
      state.marker.y = state.user.y;
      state.displayPos.x = state.user.x;
      state.displayPos.y = state.user.y;
      this.updateProgress();
      cam.jumpTo(state.user);
    },

    moveMarkerToUser: function () {
      state.marker.x = state.user.x;
      state.marker.y = state.user.y;
    },

    moveUserToMarker: function () {
      state.user.x = state.marker.x;
      state.user.y = state.marker.y;
      this.updateProgress();
      cam.jumpTo(state.user);
    },

    calibrateByDevice: function (code) {
      const d = L.devices[code];
      if (!d) return false;
      state.user.x = d.x;
      state.user.y = d.y;
      state.marker.x = d.x;
      state.marker.y = d.y;
      state.displayPos.x = d.x;
      state.displayPos.y = d.y;
      this.updateProgress();
      cam.jumpTo(state.user);
      return true;
    },

    /* ---------- 導航規劃 ---------- */
    plan: function (start, dest) {
      const route = Nav.findRoute(start, dest);
      if (!route) return { ok: false, msg: '找不到路線：起點或終點在牆內／不連通' };

      state.route = route;
      state.start = { x: route.pts[0].x, y: route.pts[0].y };
      state.dest = { x: route.pts[route.pts.length - 1].x, y: route.pts[route.pts.length - 1].y };
      state.routeIndex = 0;

      state.user.x = state.start.x;
      state.user.y = state.start.y;
      state.marker.x = state.start.x;
      state.marker.y = state.start.y;
      state.displayPos.x = state.start.x;
      state.displayPos.y = state.start.y;

      state.phase = 'calibrating';
      cam.jumpTo(state.start);
      this.updateProgress();

      return { ok: true, route: route };
    },

    clearRoute: function () {
      state.route = null;
      state.routeIndex = 0;
      state.start = null;
      state.dest = null;
      state.distanceLeft = 0;
      state.bearing = null;
      state.phase = 'idle';
    },

    calibrate: function () {
      const b = Nav.bearingToNext(state.user, state.route, state.routeIndex);
      if (b === null) return false;
      const raw = S.current();
      state.headingOffset = G.norm360(b - raw);
      state.arrowHeading = b;
      state.bearing = b;
      state.phase = 'navigating';
      return true;
    },

    skipCalibration: function () {
      state.phase = 'navigating';
    },

    deviation: function () {
      const b = Nav.bearingToNext(state.user, state.route, state.routeIndex);
      if (b === null) return null;
      return G.norm180(b - state.arrowHeading);
    },

    bearingToNext: function () {
      return Nav.bearingToNext(state.user, state.route, state.routeIndex);
    },

    updateProgress: function () {
      if (!state.route) { state.distanceLeft = 0; state.bearing = null; return; }
      state.routeIndex = Nav.nextIndex(state.user, state.route, state.routeIndex);
      state.distanceLeft = Nav.remainingDistance(state.user, state.route, state.routeIndex);
      state.bearing = Nav.bearingToNext(state.user, state.route, state.routeIndex) || state.bearing;

      if (state.distanceLeft < cfg.nav.arriveRadius && state.phase === 'navigating') {
        state.phase = 'arrived';
      }
    },

    recenter: function () {
      cam.jumpTo(state.user);
    },

    resetView: function () {
      cam.resetView();
      cam.jumpTo(state.user);
    },

    zoomBy: function (f) { cam.zoomBy(f); },
    rotateBy: function (d) { cam.rotateBy(d); },

    setSensitivity: function (v) {
      state.sensitivity = G.clamp(v, 1, 100);
      S.setSensitivity(state.sensitivity);
    },

    setStride: function (v) {
      state.stride = G.clamp(v, 1, 100);
    },

    strideMM: function () {
      return (state.stride / 100) * 780;
    },

    setSimulate: function (on) {
      S.simulate = !!on;
    },

    setSimHeading: function (deg) {
      S.simulateHeading = G.norm360(deg);
    },

    setGrid: function (on) {
      state.showGrid = !!on;
    },

    resetAll: function () {
      this.clearRoute();
      state.user.x = 1500;
      state.user.y = 2500;
      state.marker.x = 1500;
      state.marker.y = 2500;
      state.displayPos.x = 1500;
      state.displayPos.y = 2500;
      state.stepCount = 0;
      state.headingOffset = 0;
      cam.jumpTo(state.user);
      cam.resetView();
      if (APP.ui) APP.ui.syncStepCount(0);
    },

    setPickMode: function (mode) {
      state.pickMode = state.pickMode === mode ? null : mode;
      return state.pickMode;
    },

    handleTap: function (screenX, screenY) {
      if (!state.pickMode) return;
      const w = cam.screenToWorld({ x: screenX, y: screenY });
      if (w.x < 0 || w.y < 0 || w.x > cfg.map.width || w.y > cfg.map.height) return;
      const mode = state.pickMode;
      state.pickMode = null;
      if (APP.ui && APP.ui.handlePick) APP.ui.handlePick(mode, w);
    },

    updatePanelInset: function () {
      const panel = document.getElementById('panel');
      const open = panel.classList.contains('open');
      const isBottomSheet = window.innerWidth < 760;
      cam.setInsetBottom(open && isBottomSheet ? panel.offsetHeight : 0);
    }
  };

  APP.app = app;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = window.innerWidth;
    const h = window.innerHeight;

    cam.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    cam.resize(w, h);
    app.updatePanelInset();
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 250); });

  APP.attachGestures(canvas, cam, {
    onTap: function (x, y) { app.handleTap(x, y); }
  });

  /* ---------- 感應器回呼 ---------- */
  S.onStep = function () { app.addStep(); };
  S.onLog = function (msg) { if (APP.ui) APP.ui.setSensorMsg(msg); };
  S.onHeading = function (h) { state.userHeading = h; };

  /* =========================================================
   * 動畫迴圈（導入 01.html 的 Lerp 平滑追隨邏輯）
   * ========================================================= */
  let last = 0;

  function loop(now) {
    const dt = last ? Math.min(now - last, 100) : 16;
    last = now;

    // 1. 同步實際感應器方向
    state.userHeading = S.current();

    // 2. 採用 01.html 的平滑內插法 (Lerp) 追隨位置與角度，消除抖動
    state.displayPos.x += (state.marker.x - state.displayPos.x) * 0.2;
    state.displayPos.y += (state.marker.y - state.displayPos.y) * 0.2;

    const targetHeading = G.norm360(state.userHeading + state.headingOffset);
    let diff = targetHeading - state.arrowHeading;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    state.arrowHeading = G.norm360(state.arrowHeading + diff * 0.2);

    // 3. 攝影機跟隨平滑位置
    cam.follow(state.user);

    // 4. 進度 / 抵達判定
    if (state.route) app.updateProgress();

    // 5. 繪圖
    R.frame(ctx, cam, state, now);

    // 6. HUD
    if (APP.ui) APP.ui.updateHud(state);

    requestAnimationFrame(loop);
  }

  resize();
  APP.ui.init(app);
  app.updatePanelInset();
  cam.jumpTo(state.user);

  S.autoStart();
  setTimeout(function () { Nav.build(); }, 60);

  requestAnimationFrame(loop);
})();
