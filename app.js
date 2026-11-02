/* =========================================================
 * app.js — 主程式：狀態、導航流程、動畫迴圈
 *
 * 核心概念
 *   state.user         真實（推算）位置 → 紅箭頭永遠畫在它上面
 *   state.marker       虛擬標記（「等等我」用的參考點）
 *   state.arrowHeading 畫在螢幕上的方位角 = 感應器方位 + 校正偏移
 *   走路時 user 移動 → 攝影機跟隨 → 地圖在腳下移動，箭頭固定畫面中心
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
    user: { x: 1750, y: 1450 },
    marker: { x: 1750, y: 1450 },
    arrowHeading: 0,
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

    /* ---------- 定位 / 步進 ---------- */
    addStep: function () {
      const mm = (state.stride / 100) * cfg.step.maxStrideMM;
      const d = G.dir(state.arrowHeading);
      state.user.x = G.clamp(state.user.x + d.x * mm, 0, cfg.map.width);
      state.user.y = G.clamp(state.user.y + d.y * mm, 0, cfg.map.height);
      state.stepCount++;

      this.updateProgress();
      cam.follow(state.user, 0.5);
      if (APP.ui) APP.ui.syncStepCount(state.stepCount);
    },

    setPosition: function (x, y) {
      state.user.x = G.clamp(x, 0, cfg.map.width);
      state.user.y = G.clamp(y, 0, cfg.map.height);
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

      // 紅箭頭自動定位到起點
      state.user.x = state.start.x;
      state.user.y = state.start.y;
      state.marker.x = state.start.x;
      state.marker.y = state.start.y;

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

    /* 方向校正：把「目前感應器朝向」對齊到「導航方位」 */
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

    /* 略過校正：保留現有偏移，直接開始導航 */
    skipCalibration: function () {
      state.phase = 'navigating';
    },

    /* 校正偏差（度）：負 = 箭頭偏左，正 = 偏右 */
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

    /* ---------- 視角 ---------- */
    recenter: function () {
      cam.jumpTo(state.user);
    },

    resetView: function () {
      cam.resetView();
      cam.jumpTo(state.user);
    },

    zoomBy: function (f) { cam.zoomBy(f); },
    rotateBy: function (d) { cam.rotateBy(d); },

    /* ---------- 設定 ---------- */
    setSensitivity: function (v) {
      state.sensitivity = G.clamp(v, 1, 100);
      S.setSensitivity(state.sensitivity);
    },

    setStride: function (v) {
      state.stride = G.clamp(v, 1, 100);
    },

    strideMM: function () {
      return (state.stride / 100) * cfg.step.maxStrideMM;
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
      state.user.x = 1750;
      state.user.y = 1450;
      state.marker.x = 1750;
      state.marker.y = 1450;
      state.stepCount = 0;
      state.headingOffset = 0;
      cam.jumpTo(state.user);
      cam.resetView();
      if (APP.ui) APP.ui.syncStepCount(0);
    },

    /* ---------- 地圖點選 ---------- */
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
      // 只有手機的底部面板才會遮住地圖下半部；桌面的面板在左側，不需偏移
      const isBottomSheet = window.innerWidth < 760;
      cam.setInsetBottom(open && isBottomSheet ? panel.offsetHeight : 0);
    }
  };

  APP.app = app;

  /* =========================================================
   * 尺寸 / 裝置像素比
   * ========================================================= */
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

  /* =========================================================
   * 手勢
   * ========================================================= */
  APP.attachGestures(canvas, cam, {
    onTap: function (x, y) { app.handleTap(x, y); }
  });

  /* =========================================================
   * 感應器回呼
   * ========================================================= */
  S.onStep = function () { app.addStep(); };
  S.onLog = function (msg) { if (APP.ui) APP.ui.setSensorMsg(msg); };

  /* =========================================================
   * 動畫迴圈
   * ========================================================= */
  let last = 0;

  function loop(now) {
    const dt = last ? Math.min(now - last, 100) : 16;
    last = now;

    // 1. 方位角：感應器（或模擬）+ 校正偏移 → 平滑
    const target = G.norm360(S.current() + state.headingOffset);
    state.arrowHeading = G.lerpAngle(state.arrowHeading, target, Math.min(1, dt / 90));

    // 2. 攝影機跟隨（箭頭固定、地圖移動）
    cam.follow(state.user);

    // 3. 進度 / 抵達判定
    if (state.route) app.updateProgress();

    // 4. 繪圖
    R.frame(ctx, cam, state, now);

    // 5. HUD
    if (APP.ui) APP.ui.updateHud(state);

    requestAnimationFrame(loop);
  }

  /* =========================================================
   * 啟動
   * ========================================================= */
  resize();
  APP.ui.init(app);
  app.updatePanelInset();
  cam.jumpTo(state.user);

  // 背景先建好導航網格，避免第一次規劃時卡頓
  setTimeout(function () { Nav.build(); }, 60);

  requestAnimationFrame(loop);
})();
