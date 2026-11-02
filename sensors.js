/* =========================================================
 * sensors.js — 裝置方向（羅盤）與計步
 *
 * 方位角換算：
 *   iOS   → event.webkitCompassHeading 已經是「由北順時針」，直接用
 *   其他  → deviceorientationabsolute 的 alpha 是逆時針，需換成 360 - alpha
 *   （兩者都以「手機頂部」為前方）
 *
 * 計步：
 *   沿用舊版的加速度峰值偵測，門檻由「靈敏度」1-100 映射到 13.5 ~ 10.0
 * ========================================================= */
(function () {
  'use strict';
  const G = APP.geometry;
  const cfg = APP.config;

  const S = {
    running: false,
    raw: 0,               // 平滑後的原始方位角（未加校正偏移）
    smoothed: 0,
    hasHeading: false,
    hasMotion: false,
    sensitivity: cfg.step.sensitivity,
    simulate: false,      // 無感應器時用滑桿模擬朝向
    simulateHeading: 0,
    onStep: null,
    onLog: null,
    onHeading: null
  };

  let lastPeak = 0;
  let startedAt = 0;
  let orientHandler = null;
  let motionHandler = null;

  function log(msg) {
    if (S.onLog) S.onLog(msg);
  }

  /* 目前應採用的方位角（模擬模式優先） */
  S.current = function () {
    if (S.simulate) return G.norm360(S.simulateHeading);
    return S.raw;
  };

  function pushHeading(h) {
    h = G.norm360(h);
    S.hasHeading = true;
    S.raw = h;
    S.smoothed = G.lerpAngle(S.smoothed, h, 0.3);
    if (S.onHeading) S.onHeading(S.smoothed);
  }

  function handleOrientation(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading) && e.webkitCompassHeading >= 0) {
      h = e.webkitCompassHeading;
    } else if (e.alpha !== null && e.alpha !== undefined && !isNaN(e.alpha)) {
      h = 360 - e.alpha;
    }
    if (h === null) return;
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

  /* 啟動（必須由使用者點擊觸發，iOS 需要授權） */
  S.start = async function () {
    if (S.running) return true;

    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') { log('方向感應器未授權'); return false; }
      }
      if (typeof DeviceMotionEvent !== 'undefined' &&
          typeof DeviceMotionEvent.requestPermission === 'function') {
        const res2 = await DeviceMotionEvent.requestPermission();
        if (res2 !== 'granted') { log('動作感應器未授權，計步可能失效'); }
      }
    } catch (err) {
      log('感應器授權失敗：' + err.message);
    }

    if ('ondeviceorientationabsolute' in window) {
      orientHandler = handleOrientation;
      window.addEventListener('deviceorientationabsolute', orientHandler, true);
    } else {
      orientHandler = handleOrientation;
      window.addEventListener('deviceorientation', orientHandler, true);
    }

    motionHandler = handleMotion;
    window.addEventListener('devicemotion', motionHandler, true);

    S.running = true;
    startedAt = Date.now();

    // 1.5 秒內完全沒有方向資料 → 提示改用模擬模式
    setTimeout(function () {
      if (S.running && !S.hasHeading) {
        log('收不到方向資料，可到「設定」開啟模擬朝向測試');
      }
      if (S.running && !S.hasMotion) {
        log('收不到動作資料，可用「模擬跨一步」測試導航');
      }
    }, 1500);

    return true;
  };

  S.stop = function () {
    if (orientHandler) {
      window.removeEventListener('deviceorientationabsolute', orientHandler, true);
      window.removeEventListener('deviceorientation', orientHandler, true);
    }
    if (motionHandler) window.removeEventListener('devicemotion', motionHandler, true);
    orientHandler = null;
    motionHandler = null;
    S.running = false;
  };

  S.setSensitivity = function (v) {
    S.sensitivity = G.clamp(v, 1, 100);
  };

  APP.sensors = S;
})();
