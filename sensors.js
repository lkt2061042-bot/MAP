/* =========================================================
 * sensors.js — 裝置方向（羅盤）與計步
 * ========================================================= */
(function () {
  'use strict';
  const G = APP.geometry;
  const cfg = APP.config;

  const S = {
    running: false,
    raw: 0,               
    smoothed: 0,
    hasHeading: false,
    hasMotion: false,
    sensitivity: cfg.step.sensitivity,
    simulate: false,      
    simulateHeading: 0,
    onStep: null,
    onLog: null,
    onHeading: null,
    diag: { abs: 0, rel: 0, source: '', lastAt: 0, startedAt: 0 }
  };

  let lastPeak = 0;
  let absSeen = false;
  let orientHandlers = [];
  let motionHandler = null;

  function log(msg) {
    if (S.onLog) S.onLog(msg);
  }

  S.current = function () {
    if (S.simulate) return G.norm360(S.simulateHeading);
    return S.raw;
  };

  function pushHeading(h) {
    h = G.norm360(h);
    S.hasHeading = true;
    S.raw = h;
    S.smoothed = G.lerpAngle(S.smoothed, h, 0.3);
    S.diag.lastAt = Date.now();
    if (S.onHeading) S.onHeading(S.smoothed);
  }

  function readHeading(e) {
    if (!e) return null;
    let h = null;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading) && e.webkitCompassHeading >= 0) {
      h = e.webkitCompassHeading;
    } else if (e.alpha !== null && e.alpha !== undefined && !isNaN(e.alpha)) {
      h = 360 - e.alpha;
    }
    
    // 補正螢幕自身的橫直向旋轉角度（直立 / 橫向），確保手機轉動時方向正確
    if (h !== null) {
      const screenAngle = window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number' 
        ? window.screen.orientation.angle 
        : (window.orientation || 0);
      h = G.norm360(h + screenAngle);
    }
    return h;
  }

  function handleAbsolute(e) {
    S.diag.abs++;
    const h = readHeading(e);
    if (h === null) return;
    absSeen = true;
    S.diag.source = 'absolute';
    pushHeading(h);
  }

  function handleRelative(e) {
    S.diag.rel++;
    if (absSeen) return;                       
    const h = readHeading(e);
    if (h === null) return;
    if (!S.diag.source) S.diag.source = e.absolute ? 'absolute' : 'relative';
    pushHeading(h);
  }

  function handleMotion(e) {
    if (!S.running) return;
    const acc = e.accelerationIncludingGravity;
    if (!acc || acc.x === null) return;
    S.hasMotion = true;

    const mag = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    const thr = cfg.step.thresholdBase - (S.sensitivity / 100) * cfg.step.thresholdSpan;
    const now = Date.now();

    if (mag > thr && now - lastPeak > cfg.step.debounceMs) {
      lastPeak = now;
      if (S.onStep) S.onStep('sensor');
    }
  }

  S.canAutoStart = function () {
    return typeof window.DeviceOrientationEvent !== 'undefined' &&
           typeof window.DeviceOrientationEvent.requestPermission !== 'function';
  };

  S.start = async function () {
    if (S.running) return true;

    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') { log('方向感應器未授權：請在瀏覽器設定允許「動作與方向」'); return false; }
      }
      if (typeof DeviceMotionEvent !== 'undefined' &&
          typeof DeviceMotionEvent.requestPermission === 'function') {
        await DeviceMotionEvent.requestPermission();
      }
    } catch (err) {
      log('感應器授權失敗：' + err.message);
      return false;
    }

    orientHandlers = [
      ['deviceorientationabsolute', handleAbsolute],
      ['deviceorientation', handleRelative]
    ];
    for (let i = 0; i < orientHandlers.length; i++) {
      window.addEventListener(orientHandlers[i][0], orientHandlers[i][1], true);
    }

    motionHandler = handleMotion;
    window.addEventListener('devicemotion', motionHandler, true);

    S.running = true;
    S.diag.startedAt = Date.now();

    setTimeout(function () {
      if (!S.running) return;
      if (!S.hasHeading) {
        log('收不到方向資料，可先開「模擬朝向」測試');
      } else {
        log('方向感應器正常（' + (S.diag.source === 'absolute' ? '絕對方位' : '相對方位') + '）');
      }
    }, 1600);

    return true;
  };

  S.autoStart = function () {
    if (S.running || S.simulate) return;
    if (!S.canAutoStart()) return;
    S.start();
  };

  S.stop = function () {
    for (let i = 0; i < orientHandlers.length; i++) {
      window.removeEventListener(orientHandlers[i][0], orientHandlers[i][1], true);
    }
    if (motionHandler) window.removeEventListener('devicemotion', motionHandler, true);
    orientHandlers = [];
    motionHandler = null;
    S.running = false;
  };

  S.setSensitivity = function (v) {
    S.sensitivity = G.clamp(v, 1, 100);
  };

  S.describe = function () {
    if (S.simulate) return '模擬模式（已忽略真實感應器）';
    if (!S.running) return '未啟動';
    if (S.hasHeading) {
      return '運作中 · 目前 ' + Math.round(S.raw) + '°';
    }
    return '已啟動但收不到方向資料';
  };

  APP.sensors = S;
})();
