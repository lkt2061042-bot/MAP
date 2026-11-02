/* =========================================================
 * config.js — 全域設定值
 * 所有模組都掛在 window.APP 命名空間下（用傳統 script 標籤載入，
 * 這樣直接用 file:// 雙擊開啟也不會被 ES module 的 CORS 限制擋住）
 * ========================================================= */
window.APP = window.APP || {};

APP.config = {
  /* 平面圖實際尺寸（mm）。y 軸向下 = 南，x 軸向右 = 東 */
  map: { width: 8200, height: 7000 },

  wall: { thickness: 150 },       // 牆厚（mm），以牆線為中心線

  grid: {
    cell: 100,                    // A* 導航網格邊長（mm）
    sightStep: 35,                // 視線檢查取樣間距（mm）
    lineWidth: 14                 // 1m 網格線寬（mm）
  },

  camera: {
    fitPadding: 0.86,             // 初始自動縮放映配留白
    minScaleRatio: 0.45,          // 相對 fit 的最小縮放倍率
    maxScalePxPerMM: 1.6,         // 最大縮放（px/mm）
    followEase: 0.16,             // 位置跟隨平滑係數
    rotateStepDeg: 15             // 按鈕旋轉一次的度數
  },

  step: {
    sensitivity: 60,              // 靈敏度預設
    stride: 5,                    // 步幅預設
    maxStrideMM: 780,             // 步幅 100 對應 780mm（沿用舊版比例）
    thresholdBase: 13.5,          // 加速度門檻上限
    thresholdSpan: 3.5,           // 靈敏度 100 時門檻下降量
    debounceMs: 300               // 兩步之間最短間隔
  },

  nav: {
    arriveRadius: 450,            // 判定抵達終點的距離（mm）
    waypointRadius: 380,          // 判定通過路徑點的距離（mm）
    chevronSpacing: 700,          // 導航線箭頭間距（mm）
    chevronSpeed: 55              // 箭頭流動速度（mm/秒），0 = 不動畫
  },

  colors: {
    bg: '#0b0e13',
    floorRoom: '#18222e',
    floorCorridor: '#1d2a38',
    floorEdge: 'rgba(120,170,220,0.10)',
    grid: 'rgba(255,255,255,0.045)',
    wall: '#93a3b5',
    wallEdge: 'rgba(200,230,255,0.35)',
    door: 'rgba(120,220,255,0.55)',
    device: '#ffaa00',
    marker: '#00ffcc',
    routeGlow: 'rgba(0,255,170,0.18)',
    route: 'rgba(0,255,170,0.85)',
    chevron: 'rgba(140,255,210,0.95)',
    arrow: '#ff3366',
    dest: '#ffd166'
  }
};
