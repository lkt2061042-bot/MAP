/* =========================================================
 * camera.js — 地圖攝影機（縮放 / 旋轉）+ 觸控手勢
 *
 * 核心不變量：
 *   攝影機中心「永遠」等於使用者位置 → 使用者位置永遠投影到 focus（螢幕中心）
 *   所以紅箭頭永遠在畫面正中，走路時移動的是腳下的地圖。
 *   縮放與旋轉都以 focus（＝箭頭）為軸，因此不會把箭頭推離中心。
 *
 * 螢幕座標 = focus + R(rot) * scale * (世界座標 - 使用者位置)
 * ========================================================= */
(function () {
  'use strict';
  const G = APP.geometry;
  const cfg = APP.config;

  class Camera {
    constructor() {
      this.vw = 360;
      this.vh = 640;
      this.insetBottom = 0;             // 底部面板遮住的高度
      this.focus = { x: 180, y: 320 };  // 螢幕上的「箭頭位置」
      this.x = cfg.map.width / 2;       // 攝影機中心（＝使用者位置）
      this.y = cfg.map.height / 2;
      this.scale = 0.05;                // px / mm
      this.minScale = 0.01;
      this.maxScale = 1.6;
      this.rot = 0;                     // 弧度，順時針為正
      this.dpr = 1;
      this.userAdjusted = false;        // 使用者手動縮放過 → 視窗改變時不重新 fit
    }

    /* ---------- 視窗尺寸 / 面板遮擋 ---------- */
    resize(vw, vh) {
      this.vw = vw;
      this.vh = vh;
      this.updateFocus();
      if (!this.userAdjusted) this.fit();
    }

    setInsetBottom(px) {
      if (this.insetBottom === px) return;
      this.insetBottom = px;
      this.updateFocus();
      if (!this.userAdjusted) this.fit();
    }

    updateFocus() {
      const usableH = Math.max(160, this.vh - this.insetBottom);
      this.focus.x = this.vw / 2;
      this.focus.y = usableH / 2;
    }

    fit() {
      const p = cfg.camera.fitPadding;
      const usableH = Math.max(160, this.vh - this.insetBottom);
      const s = Math.min(this.vw / cfg.map.width, usableH / cfg.map.height) * p;
      this.scale = s;
      this.minScale = s;                                  // 最遠 = 整張圖剛好入鏡
      this.maxScale = Math.max(s * 14, cfg.camera.maxScalePxPerMM);
      this.userAdjusted = false;
    }

    resetView() {
      this.rot = 0;
      this.userAdjusted = false;
      this.fit();
    }

    /* ---------- 座標轉換 ---------- */
    worldToScreen(p) {
      const dx = p.x - this.x;
      const dy = p.y - this.y;
      const c = Math.cos(this.rot);
      const s = Math.sin(this.rot);
      return {
        x: this.focus.x + (dx * c - dy * s) * this.scale,
        y: this.focus.y + (dx * s + dy * c) * this.scale
      };
    }

    screenToWorld(sp) {
      const dx = (sp.x - this.focus.x) / this.scale;
      const dy = (sp.y - this.focus.y) / this.scale;
      const c = Math.cos(-this.rot);
      const s = Math.sin(-this.rot);
      return {
        x: this.x + (dx * c - dy * s),
        y: this.y + (dx * s + dy * c)
      };
    }

    /* ---------- 手勢操作（一律以 focus 為軸，不移動中心） ---------- */
    zoomBy(factor) {
      this.scale = G.clamp(this.scale * factor, this.minScale, this.maxScale);
      this.userAdjusted = true;
    }

    rotateBy(dRad) {
      this.rot += dRad;
      this.userAdjusted = true;
    }

    /* ---------- 跟隨：中心永遠鎖在人物身上 ---------- */
    jumpTo(p) {
      this.x = p.x;
      this.y = p.y;
    }

    follow(p, ease) {
      const t = ease == null ? cfg.camera.followEase : ease;
      this.x += (p.x - this.x) * t;
      this.y += (p.y - this.y) * t;
    }

    /* 套用世界變換（呼叫前請先 setTransform 好 dpr） */
    applyTo(ctx) {
      ctx.translate(this.focus.x, this.focus.y);
      ctx.rotate(this.rot);
      ctx.scale(this.scale, this.scale);
      ctx.translate(-this.x, -this.y);
    }
  }

  /* =========================================================
   * attachGestures
   *   單指拖動   → 旋轉地圖（箭頭不動）
   *   雙指捏合   → 旋轉 + 縮放（同樣以箭頭為軸）
   *   滾輪       → 縮放
   *   Shift+拖   → 旋轉（桌面）
   *   輕點       → onTap（地圖點選起點/終點）
   *
   * 刻意不做平移：地圖中心鎖在人物身上，箭頭才會一直在畫面正中。
   * ========================================================= */
  function attachGestures(canvas, cam, opts) {
    opts = opts || {};
    const pts = new Map();
    let prev = null;
    let down = null;

    const ROT_PER_PX = 0.004;      // 單指：每 px 旋轉多少 rad（≈0.23°）

    function pointDist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
    function pointAng(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }

    function onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0 && !e.shiftKey) return;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
        prev = { two: false, p: { x: e.clientX, y: e.clientY } };   // 讓第一下移動就能轉
      } else {
        prev = null;
      }
    }

    function onMove(e) {
      const cur = pts.get(e.pointerId);
      if (!cur) return;
      cur.x = e.clientX;
      cur.y = e.clientY;

      const list = Array.from(pts.values());
      if (down) {
        down.moved = Math.max(down.moved, pointDist({ x: down.x, y: down.y }, { x: e.clientX, y: e.clientY }));
      }

      if (list.length >= 2) {
        const a = list[0];
        const b = list[1];
        const mid = {
          two: true,
          dist: pointDist(a, b),
          ang: pointAng(a, b)
        };
        if (prev && prev.two && prev.dist > 6) {
          const dAng = G.norm180(G.deg(mid.ang - prev.ang));
          if (Math.abs(dAng) > 0.15) cam.rotateBy(G.rad(dAng));
          const f = G.clamp(mid.dist / prev.dist, 0.6, 1.7);
          if (Math.abs(f - 1) > 0.004) cam.zoomBy(f);
        }
        prev = mid;
        return;
      }

      // 單指：繞著箭頭旋轉地圖（水平拖動 = 轉盤）
      const p0 = prev && !prev.two ? prev.p : null;
      if (p0) {
        cam.rotateBy((e.clientX - p0.x) * ROT_PER_PX);
      }
      prev = { two: false, p: { x: e.clientX, y: e.clientY } };
    }

    function onUp(e) {
      const wasSingle = pts.size === 1;
      pts.delete(e.pointerId);
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      prev = null;
      if (wasSingle && down && down.moved < 12 && performance.now() - down.t < 600) {
        if (opts.onTap) opts.onTap(e.clientX, e.clientY);
      }
      if (pts.size === 0) down = null;
    }

    canvas.addEventListener('pointerdown', onDown, { passive: true });
    canvas.addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('pointerup', onUp, { passive: true });
    canvas.addEventListener('pointercancel', onUp, { passive: true });

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      cam.zoomBy(Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });

    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  APP.Camera = Camera;
  APP.attachGestures = attachGestures;
})();
