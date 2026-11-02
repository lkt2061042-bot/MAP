/* =========================================================
 * sensors.js — 裝置方向（羅盤）與計步
 *
 * 方位角換算：
 *   iOS   → event.webkitCompassHeading 已經是「由北順時針」，直接用
 *   其他  → alpha 是逆時針，換成 360 - alpha
 *   （兩者都以「手機頂部」為前方）
 *
 * 為什麼要同時監聽兩個事件：
 *   Android Chrome 的 window 上有 ondeviceorientationabsolute，
 *   但很多機型「只送 deviceorientation、不送 deviceorientationabsolute」。
 *   舊寫法用 'ondeviceorientationabsolute' in window 判斷，於是永遠收不到
 *   任何事件 → 紅箭頭不會跟手機轉。現在兩個都註冊，收到絕對方位後忽略另一路。
 * ========================================================= */
(function () {
  'use strict';
  const G = APP.geometry;
  const cfg = APP.config;

  const S = {
    running: false,
    raw: 0,               // 原始方位角（0=北，順時針）
    smoothed: 0,
    hasHeading: false,
    hasMotion: false,
    sensitivity: cfg.step.sensitivity,
    simulate: false,      // 模擬模式：忽略感應器，用滑桿
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
    S.diag.lastAt = Date.now();
    if (S.onHeading) S.onHeading(S.smoothed);
  }

  function readHeading(e) {
    if (!e) return null;
    // iOS Safari：已經是羅盤方位
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading) && e.webkitCompassHeading >= 0) {
      return e.webkitCompassHeading;
    }
    if (e.alpha !== null && e.alpha !== undefined && !isNaN(e.alpha)) {
      return 360 - e.alpha;
    }
    return null;
  }

  /* deviceorientationabsolute：真正的絕對方位，優先採用 */
  function handleAbsolute(e) {
    S.diag.abs++;
    const h = readHeading(e);
    if (h === null) return;
    absSeen = true;
    S.diag.source = 'absolute';
    pushHeading(h);
  }

  /* deviceorientation：多數 Android 只送這個（e.absolute 可能為 true/false） */
  function handleRelative(e) {
    S.diag.rel++;
    if (absSeen) return;                       // 已經有絕對值就忽略
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

  /* 不是 iOS，就不需要使用者手勢才能監聽 → 開頁即可自動啟動 */
  S.canAutoStart = function () {
    return typeof window.DeviceOrientationEvent !== 'undefined' &&
           typeof window.DeviceOrientationEvent.requestPermission !== 'function';
  };

  /* 啟動（iOS 必須由使用者點擊觸發） */
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

    // 兩個都註冊（絕對優先，相對後備）
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

    // 1.6 秒後還沒有方位資料 → 講清楚原因（不要靜靜地不動）
    setTimeout(function () {
      if (!S.running) return;
      if (!S.hasHeading) {
        log('收不到方向資料（' + S.diag.abs + ' 個絕對 / ' + S.diag.rel + ' 個相對事件）— ' +
            '可能是瀏覽器未允許動作感應，或裝置沒有陀螺儀；可先開「模擬朝向」測試');
      } else {
        log('方向感應器正常（' + (S.diag.source === 'absolute' ? '絕對方位' : '相對方位') + '）');
      }
      if (!S.hasMotion) log('收不到動作資料，計步可用「模擬跨一步」測試');
    }, 1600);

    return true;
  };

  /* 非 iOS 自動啟動，省得忘記按按鈕 */
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

  /* 給 UI 顯示的一行狀態 */
  S.describe = function () {
    if (S.simulate) return '模擬模式（已忽略真實感應器）';
    if (!S.running) return '未啟動（按上面按鈕啟動）';
    if (S.hasHeading) {
      return '運作中 · ' + (S.diag.source === 'absolute' ? '絕對方位' : '相對方位') +
             ' · 目前 ' + Math.round(S.raw) + '°';
    }
    return '已啟動但收不到方向資料（絕對 ' + S.diag.abs + ' / 相對 ' + S.diag.rel + ' 個事件）';
  };

  APP.sensors = S;
})();
