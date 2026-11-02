/* =========================================================
 * render.js — 全部繪圖
 * ========================================================= */
(function () {
  'use strict';
  const G = APP.geometry;
  const cfg = APP.config;
  const L = APP.layout;
  const C = cfg.colors;

  function drawFloor(ctx) {
    for (let i = 0; i < L.tiles.length; i++) {
      const t = L.tiles[i];
      ctx.fillStyle = t.type === 'corridor' ? C.floorCorridor : C.floorRoom;
      ctx.fillRect(t.x, t.y, t.w, t.h);

      ctx.strokeStyle = C.floorEdge;
      ctx.lineWidth = 18;
      ctx.strokeRect(t.x + 9, t.y + 9, t.w - 18, t.h - 18);
    }
  }

  function drawGrid(ctx, show) {
    if (!show) return;
    const step = 1000;
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = cfg.grid.lineWidth;
    ctx.beginPath();
    for (let x = step; x < cfg.map.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cfg.map.height);
    }
    for (let y = step; y < cfg.map.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(cfg.map.width, y);
    }
    ctx.stroke();
  }

  function drawWalls(ctx) {
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';

    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = cfg.wall.thickness + 70;
    strokeAll(ctx);

    ctx.strokeStyle = C.wall;
    ctx.lineWidth = cfg.wall.thickness;
    strokeAll(ctx);

    ctx.strokeStyle = C.wallEdge;
    ctx.lineWidth = 26;
    strokeAll(ctx);
  }

  function strokeAll(ctx) {
    ctx.beginPath();
    for (let i = 0; i < L.walls.length; i++) {
      const s = L.walls[i];
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();
  }

  function drawDoors(ctx) {
    ctx.save();
    ctx.strokeStyle = C.door;
    ctx.lineWidth = 34;
    ctx.setLineDash([110, 90]);
    ctx.beginPath();
    for (let i = 0; i < L.doors.length; i++) {
      const d = L.doors[i];
      if (d.axis === 'h') {
        ctx.moveTo(d.x1, d.at);
        ctx.lineTo(d.x2, d.at);
      } else {
        ctx.moveTo(d.at, d.y1);
        ctx.lineTo(d.at, d.y2);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function walkAlong(pts, spacing, offset, cb) {
    if (!pts || pts.length < 2) return;
    let acc = 0;
    let next = spacing - (offset % spacing);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = G.dist(a, b);
      if (len < 1e-6) continue;
      const br = G.bearing(a, b);
      while (next <= acc + len) {
        const t = (next - acc) / len;
        cb({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, br);
        next += spacing;
      }
      acc += len;
    }
  }

  function drawRoute(ctx, state, now) {
    const route = state.route;
    if (!route || route.pts.length < 2) return;

    const pts = route.pts;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = C.routeGlow;
    ctx.lineWidth = 380;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    ctx.strokeStyle = C.route;
    ctx.lineWidth = 90;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 18;
    ctx.stroke();
    ctx.restore();

    const offset = cfg.nav.chevronSpeed > 0 ? (now / 1000) * cfg.nav.chevronSpeed : 0;
    ctx.save();
    ctx.fillStyle = C.chevron;
    walkAlong(pts, cfg.nav.chevronSpacing, offset, function (p, br) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(G.rad(br));
      ctx.beginPath();
      ctx.moveTo(0, -130);
      ctx.lineTo(-105, 80);
      ctx.lineTo(0, 34);
      ctx.lineTo(105, 80);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
    ctx.restore();

    const sp = pts[0];
    ctx.save();
    ctx.strokeStyle = C.marker;
    ctx.lineWidth = 60;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 210, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,255,204,0.18)';
    ctx.fill();
    ctx.restore();

    const dp = pts[pts.length - 1];
    const pulse = 0.5 + 0.5 * Math.sin(now / 380);
    ctx.save();
    ctx.strokeStyle = C.dest;
    ctx.lineWidth = 45;
    ctx.beginPath();
    ctx.arc(dp.x, dp.y, 240 + pulse * 130, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,209,102,0.22)';
    ctx.beginPath();
    ctx.arc(dp.x, dp.y, 240, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.dest;
    ctx.lineWidth = 45;
    ctx.beginPath();
    ctx.moveTo(dp.x, dp.y + 240);
    ctx.lineTo(dp.x, dp.y - 380);
    ctx.stroke();
    ctx.fillStyle = C.dest;
    ctx.beginPath();
    ctx.moveTo(dp.x, dp.y - 380);
    ctx.lineTo(dp.x + 270, dp.y - 300);
    ctx.lineTo(dp.x, dp.y - 220);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawMarker(ctx, state) {
    if (!state.marker) return;
    const m = state.marker;
    if (G.dist(m, state.user) < 60) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(0,255,204,0.85)';
    ctx.lineWidth = 40;
    ctx.setLineDash([110, 90]);
    ctx.beginPath();
    ctx.arc(m.x, m.y, 240, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(0,255,204,0.30)';
    ctx.lineWidth = 26;
    ctx.setLineDash([90, 110]);
    ctx.beginPath();
    ctx.moveTo(state.user.x, state.user.y);
    ctx.lineTo(m.x, m.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawDevices(ctx) {
    ctx.save();
    for (const code in L.devices) {
      const d = L.devices[code];
      ctx.beginPath();
      ctx.arc(d.x, d.y, 120, 0, Math.PI * 2);
      ctx.fillStyle = C.device;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 26;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLabels(ctx, cam) {
    const showRooms = cam.scale > 0.014;
    const showDevices = cam.scale > 0.03;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (showRooms) {
      for (let i = 0; i < L.tiles.length; i++) {
        const t = L.tiles[i];
        const p = cam.worldToScreen({ x: t.x + t.w / 2, y: t.y + t.h / 2 });
        if (p.x < 20 || p.x > cam.vw - 20 || p.y < 40 || p.y > cam.vh - 20) continue;

        ctx.font = '600 13px -apple-system, "Segoe UI", "Microsoft JhengHei", sans-serif';
        ctx.fillStyle = t.type === 'corridor' ? 'rgba(140,190,230,0.75)' : 'rgba(200,220,240,0.85)';
        ctx.fillText(t.name, p.x, p.y - 7);

        ctx.font = '400 10px -apple-system, "Segoe UI", sans-serif';
        ctx.fillStyle = 'rgba(150,175,200,0.55)';
        ctx.fillText((t.w / 1000).toFixed(1) + ' × ' + (t.h / 1000).toFixed(1) + ' m', p.x, p.y + 9);
      }
    }

    if (showDevices) {
      ctx.font = '600 10px -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(255,190,90,0.95)';
      ctx.textAlign = 'left';
      for (const code in L.devices) {
        const d = L.devices[code];
        const p = cam.worldToScreen(d);
        if (p.x < -40 || p.x > cam.vw + 40 || p.y < 0 || p.y > cam.vh) continue;
        ctx.fillText(code, p.x + 9, p.y - 8);
      }
    }
    ctx.restore();
  }

  function drawNorth(ctx, cam) {
    const r = 52;
    const v = G.rotate({ x: 0, y: -1 }, cam.rot);
    const cx = cam.focus.x + v.x * r;
    const cy = cam.focus.y + v.y * r;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(12,18,26,0.72)';
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,120,0.95)';
    ctx.font = '700 10px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, 0.5);
    ctx.restore();
  }

  /* ---------- 紅箭頭（僅依據感應器方位，不受地圖旋轉影響） ---------- */
  function drawArrow(ctx, cam, state) {
    const cx = cam.focus.x;
    const cy = cam.focus.y;
    // 這裡移除了 + cam.rot，確保手機轉動時箭頭才轉，地圖旋轉不影響箭頭本身的指向
    const ang = G.rad(state.arrowHeading);

    ctx.save();
    ctx.translate(cx, cy);

    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, 56);
    grd.addColorStop(0, 'rgba(255,60,110,0.28)');
    grd.addColorStop(1, 'rgba(255,60,110,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, 56, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.rotate(ang);

    if (state.route) {
      ctx.strokeStyle = 'rgba(255,80,120,0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 9]);
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(0, -104);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(-14, 14);
    ctx.lineTo(0, 5);
    ctx.lineTo(14, 14);
    ctx.closePath();
    ctx.fillStyle = C.arrow;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.restore();
    ctx.restore();
  }

  function frame(ctx, cam, state, now) {
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, cam.vw, cam.vh);

    ctx.save();
    cam.applyTo(ctx);
    drawFloor(ctx);
    drawGrid(ctx, state.showGrid);
    drawWalls(ctx);
    drawDoors(ctx);
    drawDevices(ctx);
    drawRoute(ctx, state, now);
    drawMarker(ctx, state);
    ctx.restore();

    drawLabels(ctx, cam);
    drawNorth(ctx, cam);
    drawArrow(ctx, cam, state);
  }

  APP.render = { frame: frame };
})();
