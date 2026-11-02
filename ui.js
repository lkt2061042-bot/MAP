/* =========================================================
 * ui.js — 控制面板、HUD、校準提示條
 * （只做 DOM 操作，所有狀態都由 APP.app 持有）
 * ========================================================= */
(function () {
  'use strict';
  const G = APP.geometry;
  const cfg = APP.config;
  const L = APP.layout;

  const $ = function (id) { return document.getElementById(id); };

  const PHASE_TEXT = {
    idle: '待機',
    calibrating: '方向校正中',
    navigating: '導航中',
    arrived: '已到達'
  };

  let app = null;
  const el = {};
  const cache = { heading: null, steps: null, dist: null, phase: null, sensorAt: 0, sim: null };
  let toastTimer = 0;

  /* ---------------- 建立下拉選單 ---------------- */
  function fillSelect(sel) {
    sel.innerHTML = '';
    for (let i = 0; i < L.landmarks.length; i++) {
      const lm = L.landmarks[i];
      const o = document.createElement('option');
      o.value = lm.id;
      o.textContent = lm.name;
      sel.appendChild(o);
    }
  }

  function applyLandmark(side) {
    const sel = side === 'start' ? el.startSelect : el.destSelect;
    const xi = side === 'start' ? el.startX : el.destX;
    const yi = side === 'start' ? el.startY : el.destY;
    const lm = L.landmarks.find(function (l) { return l.id === sel.value; });

    if (!lm) return;
    if (lm.id === 'current') {
      xi.value = Math.round(app.state.user.x);
      yi.value = Math.round(app.state.user.y);
      return;
    }
    if (lm.id === 'custom') return;
    xi.value = lm.x;
    yi.value = lm.y;
  }

  function markCustom(side) {
    const sel = side === 'start' ? el.startSelect : el.destSelect;
    if (sel.value !== 'custom') sel.value = 'custom';
  }

  /* ---------------- 讀取輸入 ---------------- */
  function readPoint(side) {
    const sel = side === 'start' ? el.startSelect : el.destSelect;
    const xi = side === 'start' ? el.startX : el.destX;
    const yi = side === 'start' ? el.startY : el.destY;
    const id = sel.value;

    if (id === 'current') return { current: true };
    if (id === 'custom') {
      return { x: G.clamp(parseFloat(xi.value) || 0, 0, cfg.map.width), y: G.clamp(parseFloat(yi.value) || 0, 0, cfg.map.height) };
    }
    const lm = L.landmarks.find(function (l) { return l.id === id; });
    if (!lm) return null;
    return { x: lm.x, y: lm.y };
  }

  /* ---------------- 提示訊息 ---------------- */
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 2600);
  }

  /* ---------------- 面板 ---------------- */
  function setPanel(open) {
    el.panel.classList.toggle('open', open);
    el.panelToggle.classList.toggle('active', open);
    app.updatePanelInset();
  }

  /* ---------------- 校準提示條 ---------------- */
  function updateCalib() {
    if (!app.state.route) return;
    const b = app.bearingToNext();
    const dev = app.deviation();

    if (b === null) {
      el.calibBearing.textContent = '--';
      el.calibDev.textContent = '--';
    } else {
      el.calibBearing.textContent = Math.round(b);
      el.calibDev.textContent = (dev === null ? '--' : (dev > 0 ? '+' : '') + Math.round(dev));
      el.calibDev.style.color = (dev !== null && Math.abs(dev) < 8) ? '#00ffcc' : '#ff7b7b';
    }
    el.calibArrow.textContent = Math.round(app.state.arrowHeading);

    if (app.state.phase === 'calibrating') {
      const d = dev;
      if (d === null) el.calibHint.textContent = '請將手機朝向導航方向';
      else if (Math.abs(d) < 8) el.calibHint.textContent = '✓ 已對準，按「確認開始導航」';
      else el.calibHint.textContent = (d > 0 ? '向右轉 ' : '向左轉 ') + Math.abs(Math.round(d)) + '° 對準導航方向';
    }
  }

  /* =========================================================
   * 初始化
   * ========================================================= */
  function init(appRef) {
    app = appRef;

    const ids = [
      'hudHeading', 'hudSteps', 'hudDist', 'hudPhase', 'hudSim',
      'calibBar', 'calibBearing', 'calibArrow', 'calibDev', 'calibHint',
      'calibrateBtn', 'skipCalibBtn',
      'panel', 'panelToggle', 'recenterBtn', 'toast',
      'startSelect', 'startX', 'startY', 'pickStartBtn',
      'destSelect', 'destX', 'destY', 'pickDestBtn',
      'planBtn', 'clearBtn', 'planHint',
      'sensorBtn', 'sensorMsg', 'stepBtn', 'markBtn', 'syncBtn', 'deviceInput', 'deviceBtn',
      'sensitivityInput', 'sensVal', 'strideInput', 'strideVal', 'strideMM',
      'simToggle', 'simHeading', 'simVal', 'gridToggle', 'resetBtn',
      'zoomIn', 'zoomOut', 'rotL', 'rotR', 'resetViewBtn'
    ];
    for (let i = 0; i < ids.length; i++) el[ids[i]] = $(ids[i]);

    /* --- 選單 --- */
    fillSelect(el.startSelect);
    fillSelect(el.destSelect);
    el.startSelect.value = 'current';
    el.destSelect.value = 'D';
    el.startX.value = Math.round(app.state.user.x);
    el.startY.value = Math.round(app.state.user.y);
    applyLandmark('start');
    applyLandmark('dest');

    el.startSelect.addEventListener('change', function () { applyLandmark('start'); });
    el.destSelect.addEventListener('change', function () { applyLandmark('dest'); });
    el.startX.addEventListener('input', function () { markCustom('start'); });
    el.startY.addEventListener('input', function () { markCustom('start'); });
    el.destX.addEventListener('input', function () { markCustom('dest'); });
    el.destY.addEventListener('input', function () { markCustom('dest'); });

    /* --- 地圖點選 --- */
    el.pickStartBtn.addEventListener('click', function () {
      const mode = app.setPickMode('start');
      toast(mode ? '請在地圖上點選起點' : '已取消點選');
    });
    el.pickDestBtn.addEventListener('click', function () {
      const mode = app.setPickMode('dest');
      toast(mode ? '請在地圖上點選終點' : '已取消點選');
    });

    /* --- 確定 / 清除 --- */
    el.planBtn.addEventListener('click', function () {
      const s = readPoint('start');
      const d = readPoint('dest');
      if (!s || !d) { toast('請選擇有效的起點與終點'); return; }

      const start = s.current ? { x: app.state.user.x, y: app.state.user.y } : s;
      if (G.dist(start, d) < 200) { toast('起點與終點太近'); return; }

      const res = app.plan(start, d);
      if (!res.ok) { toast(res.msg); el.planHint.textContent = res.msg; return; }

      el.planHint.textContent = '路線全長 ' + (res.route.total / 1000).toFixed(2) +
        ' m，' + (res.route.pts.length - 1) + ' 個轉折點。紅箭頭已定位到起點，請按「對準導航方向」。';
      el.calibBar.classList.add('show');
      setPanel(false);
      updateCalib();
    });

    el.clearBtn.addEventListener('click', function () {
      app.clearRoute();
      el.calibBar.classList.remove('show');
      el.planHint.textContent = '已清除導航路線。';
      toast('已清除導航');
    });

    /* --- 校準 --- */
    el.calibrateBtn.addEventListener('click', function () {
      if (app.calibrate()) {
        el.calibBar.classList.remove('show');
        toast('方向已校正，開始導航');
      } else {
        toast('目前沒有可用的導航方位');
      }
    });
    el.skipCalibBtn.addEventListener('click', function () {
      app.skipCalibration();
      el.calibBar.classList.remove('show');
      toast('已略過校正');
    });

    /* --- 感應器 / 步進 --- */
    el.sensorBtn.addEventListener('click', async function () {
      // 已啟動就重啟一次（有些機型要重新註冊才開始送事件）
      if (app.sensors.running) app.sensors.stop();
      const ok2 = await app.sensors.start();
      if (ok2) {
        setSensorMsg('狀態：' + app.sensors.describe());
      } else {
        setSensorMsg('狀態：啟動失敗，可開啟「模擬朝向」測試');
      }
    });

    el.stepBtn.addEventListener('click', function () {
      if (!app.sensors.running) {
        setSensorMsg('提示：未啟動感應器也可以模擬步進');
      }
      app.addStep();
    });

    el.markBtn.addEventListener('click', function () {
      app.moveMarkerToUser();
      toast('標記已移到目前位置');
    });

    el.syncBtn.addEventListener('click', function () {
      app.moveUserToMarker();
      toast('已同步到標記位置');
    });

    el.deviceBtn.addEventListener('click', function () {
      const code = (el.deviceInput.value || '').trim().toUpperCase();
      if (!code) { toast('請輸入電掣編號，例如 SW-301'); return; }
      if (app.calibrateByDevice(code)) {
        el.deviceInput.value = '';
        toast('已校準到 ' + code + '（' + L.devices[code].name + '）');
      } else {
        toast('無效的電掣編號，可用：' + Object.keys(L.devices).join('、'));
      }
    });

    /* --- 設定 --- */
    el.sensitivityInput.value = app.state.sensitivity;
    el.sensVal.textContent = app.state.sensitivity;
    el.sensitivityInput.addEventListener('input', function () {
      const v = parseInt(el.sensitivityInput.value, 10) || 60;
      el.sensVal.textContent = v;
      app.setSensitivity(v);
    });

    el.strideInput.value = app.state.stride;
    el.strideVal.textContent = app.state.stride;
    function syncStride() {
      el.strideVal.textContent = app.state.stride;
      el.strideMM.textContent = Math.round(app.strideMM());
    }
    el.strideInput.addEventListener('input', function () {
      app.setStride(parseInt(el.strideInput.value, 10) || 5);
      syncStride();
    });
    syncStride();

    el.simToggle.addEventListener('change', function () {
      app.setSimulate(el.simToggle.checked);
      toast(el.simToggle.checked ? '已開啟模擬朝向' : '已關閉模擬朝向');
    });
    el.simHeading.addEventListener('input', function () {
      const v = parseInt(el.simHeading.value, 10) || 0;
      el.simVal.textContent = v;
      app.setSimHeading(v);
    });

    el.gridToggle.addEventListener('change', function () {
      app.setGrid(el.gridToggle.checked);
    });

    el.resetBtn.addEventListener('click', function () {
      app.resetAll();
      el.calibBar.classList.remove('show');
      el.planHint.textContent = '已重置。';
      setSensorMsg('狀態：已重置位置');
      toast('已重置位置與導航');
    });

    /* --- 視角 --- */
    el.zoomIn.addEventListener('click', function () { app.zoomBy(1.35); });
    el.zoomOut.addEventListener('click', function () { app.zoomBy(1 / 1.35); });
    el.rotL.addEventListener('click', function () { app.rotateBy(-cfg.camera.rotateStepDeg); });
    el.rotR.addEventListener('click', function () { app.rotateBy(cfg.camera.rotateStepDeg); });
    el.resetViewBtn.addEventListener('click', function () { app.resetView(); });

    el.recenterBtn.addEventListener('click', function () {
      app.resetView();
      toast('視角已重設（回中、取消旋轉）');
    });

    el.panelToggle.addEventListener('click', function () {
      setPanel(!el.panel.classList.contains('open'));
    });

    /* --- 分頁 --- */
    const tabs = document.querySelectorAll('.tab');
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        const name = this.getAttribute('data-tab');
        const all = document.querySelectorAll('.tab');
        for (let j = 0; j < all.length; j++) all[j].classList.toggle('active', all[j] === this);
        const panes = document.querySelectorAll('.pane');
        for (let k = 0; k < panes.length; k++) {
          panes[k].classList.toggle('active', panes[k].getAttribute('data-pane') === name);
        }
        app.updatePanelInset();
      });
    }

    setPanel(window.innerWidth >= 760);
    syncStepCount(0);
    updateHud(app.state);

    // 手機第一次開啟時提示面板位置
    if (window.innerWidth < 760) {
      setTimeout(function () { toast('按右下角 ☰ 選擇起點與終點'); }, 800);
    }
  }

  /* ---------------- HUD ---------------- */
  function updateHud(state) {
    const h = Math.round(state.arrowHeading);
    if (h !== cache.heading) { cache.heading = h; el.hudHeading.textContent = h; }

    if (state.stepCount !== cache.steps) {
      cache.steps = state.stepCount;
      el.hudSteps.textContent = state.stepCount;
    }

    const d = state.route ? (state.distanceLeft / 1000).toFixed(2) + ' m' : '--';
    if (d !== cache.dist) { cache.dist = d; el.hudDist.textContent = d; }

    if (state.phase !== cache.phase) {
      cache.phase = state.phase;
      el.hudPhase.textContent = PHASE_TEXT[state.phase] || state.phase;
      el.hudPhase.dataset.phase = state.phase;
      el.calibBar.classList.toggle('show', state.phase === 'calibrating');
    }

    if (state.phase === 'calibrating') updateCalib();

    if (state.phase === 'arrived' && !el.hudPhase.dataset.announced) {
      el.hudPhase.dataset.announced = '1';
      toast('已到達目的地');
    }
    if (state.phase !== 'arrived') el.hudPhase.dataset.announced = '';

    // 感應器狀態（每秒更新一次，讓使用者知道卡在哪一步）
    const ms = Date.now();
    if (ms - cache.sensorAt > 1000) {
      cache.sensorAt = ms;
      const S = APP.sensors;
      if (S) {
        const label = !S.running
          ? '1. 啟動感應器與計步'
          : (S.hasHeading ? '感應器運作中（可重新啟動）' : '再試一次啟動感應器');
        if (el.sensorBtn.textContent !== label) el.sensorBtn.textContent = label;

        if (S.running && el.sensorMsg.textContent.indexOf('狀態：') === 0) {
          el.sensorMsg.textContent = '狀態：' + S.describe();
        }
        const sim = !!S.simulate;
        if (sim !== cache.sim) {
          cache.sim = sim;
          el.hudSim.style.display = sim ? '' : 'none';
        }
      }
    }
  }

  function syncStepCount(n) {
    cache.steps = n;
    el.hudSteps.textContent = n;
  }

  function setSensorMsg(msg) {
    el.sensorMsg.textContent = msg;
  }

  /* ---------------- 地圖點選結果 ---------------- */
  function handlePick(mode, world) {
    const x = Math.round(world.x / 10) * 10;
    const y = Math.round(world.y / 10) * 10;

    if (mode === 'start') {
      el.startSelect.value = 'custom';
      el.startX.value = x;
      el.startY.value = y;
      toast('起點已設為 (' + x + ', ' + y + ')');
    } else {
      el.destSelect.value = 'custom';
      el.destX.value = x;
      el.destY.value = y;
      toast('終點已設為 (' + x + ', ' + y + ')');
    }
  }

  APP.ui = {
    init: init,
    updateHud: updateHud,
    syncStepCount: syncStepCount,
    setSensorMsg: setSensorMsg,
    handlePick: handlePick,
    toast: toast,
    updateCalib: updateCalib
  };
})();
