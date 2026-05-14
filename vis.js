/* ==========================================================================
   MZT Visualizer (Tilda custom block)
   ========================================================================== */

(() => {
  "use strict";

  /* ==========================================================================
     [1] Конфиг
     ========================================================================== */
  const CONFIG = {
    // ВАЖНО: абсолютный путь к базе
    DB_URL: "https://chaicreator.github.io/visualizer_t-block_for_mzt/dbase.json",

    ROOT_ID: "cusvis",
    MAX_WIDTH: 1920,

    // Требование: пропорционально ужать, чтобы высота была 900px на 1920x1080
    TARGET_DESKTOP_HEIGHT: 900,

    ASPECT_W: 16,
    ASPECT_H: 9
  };

  /* ==========================================================================
     [2] Вспомогательные утилиты
     ========================================================================== */
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    children.forEach((c) => node.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return node;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }


  function preloadImages(urls = []) {
    const uniq = Array.from(new Set(urls.filter(Boolean)));
    return Promise.all(
      uniq.map(
        (src) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ src, ok: true });
            img.onerror = () => resolve({ src, ok: false });
            img.src = src;
          })
      )
    );
  }

  // мини-лоадер на каждой карточке (плитка / рендер) пока img не прогрузится
  const CELL_LOADER_HTML = `
    <div class="mztvld-loader" role="status" aria-label="loading">
      <span class="mztvld-ring mztvld-ring--outer"></span>
      <span class="mztvld-ring mztvld-ring--mid"></span>
      <span class="mztvld-ring mztvld-ring--inner"></span>
    </div>
  `;

  function attachCellLoader(container, img) {
  if (!container || !img) return () => {};

  // контейнер должен быть позиционируемым
  const cs = getComputedStyle(container);
  if (cs.position === "static") container.style.position = "relative";

  // убираем старый лоадер если есть
  const old = container.querySelector(":scope > .mztvld-cell-loader");
  if (old) old.remove();

  const loader = el("div", { class: "mztvld-cell-loader", html: CELL_LOADER_HTML });
  container.appendChild(loader);

  const done = () => {
    img.style.opacity = "1";
    loader.classList.add("is-hide");
    setTimeout(() => loader.remove(), 260);
  };

  const onDone = () => {
    done();
    img.removeEventListener("load", onDone);
    img.removeEventListener("error", onDone);
  };

  img.addEventListener("load", onDone);
  img.addEventListener("error", onDone);

  // если браузер уже считает картинку загруженной (кэш) — доводим до конца сразу
  if (img.complete && img.naturalWidth > 0) {
    // чтобы не попасть в гонку с моментом смены src — делаем в следующем тике
    requestAnimationFrame(onDone);
  }

  return onDone;
}

// =======================================================================
// [2.x] Быстрый swap картинок без пересборки DOM
//  - решает "милисекундный" показ общего лоадера при смене затирки/кадра
//  - меняем только src у существующих <img>, а лоадер показываем ТОЛЬКО в ячейках
// =======================================================================

function setImgSrcWithLoader(container, img, nextSrc) {
  if (!container || !img) return;

  const cur = img.getAttribute("src") || "";
  if (!nextSrc || cur === nextSrc) return;

  let loaderShown = false;
  let done = false;
  let timer = null;

  // покажем лоадер только если реально не успело быстро
  timer = setTimeout(() => {
    if (done) return;
    loaderShown = true;
    attachCellLoader(container, img); // просто оверлей, НЕ прячем img
  }, 120);

  const probe = new Image();
  probe.decoding = "async";
  probe.src = nextSrc;

  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);

    // меняем src только когда картинка уже готова
    img.style.transition = "opacity .14s ease";
    img.style.opacity = "0";

    requestAnimationFrame(() => {
      img.setAttribute("src", nextSrc);
      // на всякий — если браузер уже держит декодированным, вернём сразу
      requestAnimationFrame(() => {
        img.style.opacity = "1";
        // если лоадер показывали — он снимется через attachCellLoader->load,
        // но т.к. img уже с новым src, можно подчистить вручную:
        if (loaderShown) {
          const old = container.querySelector(":scope > .mztvld-cell-loader");
          if (old) {
            old.classList.add("is-hide");
            setTimeout(() => old.remove(), 260);
          }
        }
      });
    });
  };

  if (probe.complete) {
    finish();
  } else {
    probe.onload = finish;
    probe.onerror = () => {
      done = true;
      clearTimeout(timer);
      // на ошибке не трогаем текущую картинку
      const old = container.querySelector(":scope > .mztvld-cell-loader");
      if (old) old.remove();
    };
  }
}


// =======================================================================
// [2.y] Генерация миниатюр через canvas (anti-moiré) + контроль памяти
//  - делаем нормальный downscale 2500px -> ~320px один раз, дальше используем blob URL
//  - кэш с refCount + LRU, чтобы не раздувать память, и revokeObjectURL при освобождении
//  - если CORS не позволит читать картинку (tainted canvas) — тихо фолбэк на оригинальный URL
// =======================================================================

const THUMB_CFG = {
  w: 288,            // целевой размер миниатюры (px)
  h: 180,            // 16:10 под текущий CSS у .mzt-thumb
  quality: 0.76,     // качество jpeg для миниатюры
  maxCache: 80       // максимум записей в кэше (LRU, при refCount=0 будут чиститься)
};

const thumbCache = new Map(); // key -> { url, refCount, lastUsed }

function thumbKey(fullSrc, w = THUMB_CFG.w, h = THUMB_CFG.h) {
  return `${fullSrc}|${w}x${h}`;
}

function touchThumbEntry(entry) {
  entry.lastUsed = performance.now();
}

function pruneThumbCache() {
  const max = THUMB_CFG.maxCache;
  if (thumbCache.size <= max) return;

  // кандидаты на удаление: только refCount=0
  const candidates = [];
  for (const [k, e] of thumbCache.entries()) {
    if ((e.refCount || 0) === 0) candidates.push([k, e]);
  }
  candidates.sort((a, b) => (a[1].lastUsed || 0) - (b[1].lastUsed || 0)); // старые -> новые

  for (const [k, e] of candidates) {
    if (thumbCache.size <= max) break;
    try { URL.revokeObjectURL(e.url); } catch (_) {}
    thumbCache.delete(k);
  }
}

function retainThumb(key) {
  const e = thumbCache.get(key);
  if (!e) return;
  e.refCount = (e.refCount || 0) + 1;
  touchThumbEntry(e);
}

function releaseThumb(key) {
  if (!key) return;
  const e = thumbCache.get(key);
  if (!e) return;
  e.refCount = Math.max(0, (e.refCount || 0) - 1);
  touchThumbEntry(e);

  // если не используется и кэш разросся — почистим
  pruneThumbCache();
}

function releaseThumbFromImg(img) {
  if (!img) return;
  const key = img.dataset.thumbKey || "";
  if (key) releaseThumb(key);
  delete img.dataset.thumbKey;
}

/**
 * Делает миниатюру (cover под 16:10) и возвращает blob URL.
 * Если CORS/Canvas не даст — вернёт исходный fullSrc.
 */
async function getThumbURL(fullSrc, w = THUMB_CFG.w, h = THUMB_CFG.h) {
  if (!fullSrc) return "";

  const key = thumbKey(fullSrc, w, h);
  const existing = thumbCache.get(key);
  if (existing?.url) {
    touchThumbEntry(existing);
    return existing.url;
  }

  // 1) грузим как Blob через fetch (нужно для canvas, чтобы избежать taint)
  let blob;
  try {
    const res = await fetch(fullSrc, { mode: "cors", cache: "force-cache" });
    if (!res.ok) throw new Error(`thumb fetch failed: ${res.status}`);
    blob = await res.blob();
  } catch (e) {
    // фолбэк: CORS/сеть — показываем оригинал (можно оставить CSS blur как запасной анти-муар)
    return fullSrc;
  }

  // 2) декодируем в bitmap (быстрее/чище), либо Image()
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch (e) {
    // Safari/старые — через Image()
    bitmap = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        try { URL.revokeObjectURL(url); } catch (_) {}
        resolve(img);
      };
      img.onerror = () => {
        try { URL.revokeObjectURL(url); } catch (_) {}
        reject(new Error("thumb decode failed"));
      };
      img.src = url;
    });
  }

  // 3) рисуем cover crop в canvas
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) return fullSrc;

  // сглаживание
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const sw = bitmap.width || bitmap.naturalWidth || 0;
  const sh = bitmap.height || bitmap.naturalHeight || 0;
  if (!sw || !sh) return fullSrc;

  // cover: берём центральный кроп под target aspect
  const srcAR = sw / sh;
  const dstAR = w / h;

  let sx = 0, sy = 0, sww = sw, shh = sh;
  if (srcAR > dstAR) {
    // источник шире — режем по ширине
    sww = Math.round(sh * dstAR);
    sx = Math.round((sw - sww) / 2);
  } else if (srcAR < dstAR) {
    // источник выше — режем по высоте
    shh = Math.round(sw / dstAR);
    sy = Math.round((sh - shh) / 2);
  }

  try {
    ctx.drawImage(bitmap, sx, sy, sww, shh, 0, 0, w, h);
  } catch (e) {
    return fullSrc;
  } finally {
    // освобождаем bitmap, если это ImageBitmap
    try { bitmap.close?.(); } catch (_) {}
  }

  // 4) кодируем в blob url
  const outBlob = await new Promise((resolve) => {
    canvas.toBlob(
      (b) => resolve(b),
      "image/jpeg",
      THUMB_CFG.quality
    );
  });

  if (!outBlob) return fullSrc;

  const outUrl = URL.createObjectURL(outBlob);
  thumbCache.set(key, { url: outUrl, refCount: 0, lastUsed: performance.now() });
  pruneThumbCache();

  return outUrl;
}

/**
 * Ставит миниатюру в <img>, освобождая предыдущую (revoke по refCount/LRU).
 * Внутри — защита от гонок: если пока генерили пользователь уже переключил рендеры.
 */
function setThumbSrcWithMemory(container, img, fullSrc) {
  if (!container || !img) return;

  const w = THUMB_CFG.w, h = THUMB_CFG.h;

  // если это тот же fullSrc — ничего не делаем
  const curFull = img.dataset.fullSrc || "";
  if (curFull && fullSrc && curFull === fullSrc) return;

  // освобождаем предыдущую миниатюру из кэша
  releaseThumbFromImg(img);

  // помним, что хотим показать
  img.dataset.fullSrc = fullSrc || "";

  // локальный токен, чтобы отменять устаревшие промисы
  const token = String((img._mztThumbToken = (img._mztThumbToken || 0) + 1));

  // небольшой лоадер, если генерация/загрузка не мгновенная
  let loaderTimer = setTimeout(() => {
    // показываем только если токен актуален
    if (String(img._mztThumbToken) !== token) return;
    attachCellLoader(container, img);
  }, 120);

  (async () => {
    const url = await getThumbURL(fullSrc, w, h);

    // если пока ждали — img уже хотят использовать под другое
    if (String(img._mztThumbToken) !== token) return;

    clearTimeout(loaderTimer);
    loaderTimer = null;

    // если вернулся blob url — учитываем refCount
    if (url && url !== fullSrc) {
      const key = thumbKey(fullSrc, w, h);
      img.dataset.thumbKey = key;
      retainThumb(key);
    }

    // ставим src аккуратно (с лоадером в ячейке)
    if (url) setImgSrcWithLoader(container, img, url);
    else img.removeAttribute("src");
  })();
}

// на всякий: при уходе со страницы освобождаем всё
window.addEventListener("beforeunload", () => {
  try {
    for (const e of thumbCache.values()) URL.revokeObjectURL(e.url);
    thumbCache.clear();
  } catch (_) {}
});


const renderDOM = {
  mainWrap: null,
  mainMedia: null,
  mainImg: null,
  groutPanel: null,
  tileNamePanel: null,
  zoomHintPanel: null,
  thumbsWrap: null,
  thumbs: [] // [{wrap, img}]
};

function resetRenderDOM() {
  // освободим blob-миниатюры (если были) перед сбросом DOM
  try {
    (renderDOM.thumbs || []).forEach(({ img }) => releaseThumbFromImg(img));
  } catch (_) {}

  renderDOM.mainWrap = null;
  renderDOM.mainMedia = null;
  renderDOM.mainImg = null;
  renderDOM.groutPanel = null;
  renderDOM.tileNamePanel = null;
  renderDOM.zoomHintPanel = null;
  renderDOM.thumbsWrap = null;
  renderDOM.thumbs = [];
}

function ensureRenderDOM() {
  const main = qs("#mztRenderMain");
  const thumbs = qs("#mztRenderThumbs");
  if (!main || !thumbs) return;

  if (renderDOM.mainImg && renderDOM.mainImg.isConnected && renderDOM.thumbs.length === 6) {
    renderDOM.mainWrap = main;
    renderDOM.thumbsWrap = thumbs;
    return;
  }

  resetRenderDOM();
  renderDOM.mainWrap = main;
  renderDOM.thumbsWrap = thumbs;

  main.innerHTML = "";
  thumbs.innerHTML = "";

  const mainMedia = el("div", { class: "mzt-render-media" });
  const mainImg = el("img", { src: "", alt: "render main", loading: "eager" });
  mainMedia.appendChild(mainImg);
  main.appendChild(mainMedia);
  renderDOM.mainMedia = mainMedia;
  renderDOM.mainImg = mainImg;

  const groutPanel = renderGroutPanelInline();
  renderDOM.groutPanel = groutPanel;
  main.appendChild(groutPanel);

  const tileNamePanel = renderTileNamePanelInline();
  renderDOM.tileNamePanel = tileNamePanel;
  main.appendChild(tileNamePanel);

  const zoomHintPanel = renderZoomHintPanelInline();
  renderDOM.zoomHintPanel = zoomHintPanel;
  main.appendChild(zoomHintPanel);

  mainImg.style.cursor = "zoom-in";
  mainImg.addEventListener("click", () => {
    const cur = getCurrentRenderVariant();
    if (!cur) return;
    const tileName = getSelectedTileName();
    const label = tileName || cur.description || "—";
    openFullscreenRenderModal(cur.image, label);
  });

  for (let i = 0; i < 6; i++) {
    const wrap = el("div", { class: "mzt-thumb" });
    const img = el("img", { src: "", alt: `thumb ${i + 1}`, loading: "lazy" });
    wrap.appendChild(img);

    wrap.addEventListener("click", () => {
      state.activeThumbIndex = i;
      updateRenderImages();
      syncGroutUI();
    });

    thumbs.appendChild(wrap);
    renderDOM.thumbs.push({ wrap, img });
  }
}

function updateRenderImages() {
  if (!state.activeRenderSetId || !Array.isArray(state.activeRenders) || state.activeRenders.length === 0) return;

  ensureRenderDOM();
  if (!renderDOM.mainWrap || !renderDOM.mainImg) return;

  const renders = state.activeRenders;

  state.activeThumbIndex = clamp(state.activeThumbIndex, 0, Math.min(5, renders.length - 1));

  const activeRender = getRenderByIndex(renders, state.activeThumbIndex);
  const cur = pickVariant(activeRender, state.renderGroutColor) || pickVariant(getRenderByIndex(renders, 0), state.renderGroutColor);

  if (cur?.image) {
    setImgSrcWithLoader(renderDOM.mainWrap, renderDOM.mainImg, cur.image);
  }

  updateRenderTileNamePanel(cur);

  for (let i = 0; i < renderDOM.thumbs.length; i++) {
    const r = getRenderByIndex(renders, i);
    const v = pickVariant(r, state.renderGroutColor);

    const item = renderDOM.thumbs[i];
    item.wrap.classList.toggle("is-active", i === state.activeThumbIndex);

    if (v?.image) {
      setThumbSrcWithMemory(item.wrap, item.img, v.image);
    } else {
      releaseThumbFromImg(item.img);
      delete item.img.dataset.fullSrc;
      item.img.removeAttribute("src");
    }
  }
}

  function allFiltersAreBlank() {
    const f = state.filters;
    return f.tile_color === "---" && f.tile_type === "---" && f.price_category === "---";
  }

  /* ==========================================================================
     [3] Состояние
     ========================================================================== */
  const state = {
    db: null,

    filters: {
      tile_color: "---",
      tile_type: "---",
      price_category: "---"
    },

    filteredTiles: [],
    page: 1,

    selectedTileId: null,
    activeRenderSetId: null,
    activeRenders: [],

    // левый блок: выбранный цвет затирки (для рендеров)
    renderGroutColor: "Белый",
    // какой из 6 кадров сейчас выбран (0..5)
    activeThumbIndex: 0,

    // responsive tiles layout (правый блок)
    tilesCols: 3,
    tilesRows: 3,
    tilesPerPage: 9,
    tilesMode: "normal" // normal | no_matches
  };

  /* ==========================================================================
     [4] Шрифт Montserrat (подключаем аккуратно)
     ========================================================================== */
  function ensureMontserrat() {
    // Если на странице уже есть Montserrat — лишнего не грузим.
    if (document.querySelector('link[data-mzt-font="montserrat"]')) return;

    const pre1 = el("link", { rel: "preconnect", href: "https://fonts.googleapis.com", "data-mzt-font": "montserrat" });
    const pre2 = el("link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "", "data-mzt-font": "montserrat" });
    const link = el("link", {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap",
      "data-mzt-font": "montserrat"
    });

    document.head.appendChild(pre1);
    document.head.appendChild(pre2);
    document.head.appendChild(link);
  }

  /* ==========================================================================
     [5] CSS (в отдельном блоке)
     ========================================================================== */
  function injectStyles() {
    const css = `
/* ===================== ROOT ===================== */
#${CONFIG.ROOT_ID}{
  box-sizing:border-box;
  width:100%;
  font-family: "Montserrat", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}
#${CONFIG.ROOT_ID} *{ box-sizing:border-box; font-family: inherit; }

/* ===================== STAGE (центрирование + фикс высоты 900) ===================== */
#${CONFIG.ROOT_ID} .mzt-stage-wrap{
  width:100%;
  display:flex;
  justify-content:center;
  padding:24px 16px 18px;
  background: #efefef;
}
#${CONFIG.ROOT_ID} .mzt-stage{
  height: min(${CONFIG.TARGET_DESKTOP_HEIGHT}px, calc(100vh - 170px));
  min-height:0;

  /* расширяем примерно на 10% */
  width: min(100%, calc(${CONFIG.TARGET_DESKTOP_HEIGHT}px * 16 / 9 * 1.045));

  max-width: ${CONFIG.MAX_WIDTH}px;

  display:flex;
  gap:22px;
  align-items:stretch;
}

/* ===================== FULLSCREEN RENDER VIEW ===================== */
#${CONFIG.ROOT_ID} .mzt-fs{
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.78);
  backdrop-filter: blur(2px);
  z-index: 1000000;

  /* анимация появления */
  opacity: 0;
  visibility: hidden;
  transition: opacity .18s ease, visibility 0s linear .18s;
}

#${CONFIG.ROOT_ID} .mzt-fs.is-open{
  opacity: 1;
  visibility: visible;
  transition: opacity .18s ease, visibility 0s;
}

#${CONFIG.ROOT_ID} .mzt-fs-inner{
  position:absolute;
  inset:0;
  padding: 3vw;
  display:flex;
  align-items:center;
  justify-content:center;

  /* лёгкий zoom */
  transform: scale(.985);
  transition: transform .18s ease;
}

#${CONFIG.ROOT_ID} .mzt-fs.is-open .mzt-fs-inner{
  transform: scale(1);
}

#${CONFIG.ROOT_ID} .mzt-fs-img{
  max-width: 94vw;
  max-height: 94vh;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 14px;
  box-shadow: 0 18px 60px rgba(0,0,0,.45);
  user-select:none;
  -webkit-user-drag:none;
}

#${CONFIG.ROOT_ID} .mzt-fs-close{
  position:absolute;
  top: 14px;
  right: 14px;
  min-height: 42px;
  padding: 0 16px;

  border-radius: 20px; /* было 999px */

  border: 1px solid rgba(255,255,255,.25);
  background: rgba(0,0,0,.35);
  color: #fff;

  cursor: pointer;
  display:flex;
  gap:8px;
  align-items:center;

  font-weight:600;
  font-size:14px;
  line-height:1;
}
#${CONFIG.ROOT_ID} .mzt-fs-close:hover{ background: rgba(0,0,0,.55); }
#${CONFIG.ROOT_ID} .mzt-fs-close svg{ width:18px; height:18px; }

/* ===== info panel (появляется через 0.2s, растягивается к центру) ===== */
#${CONFIG.ROOT_ID} .mzt-fs-info{
  position:absolute;
  left: 14px;
  bottom: 14px;
  z-index: 1000002;

  transform-origin: left bottom;

  padding: 10px 16px;
  min-height: 42px;

  border-radius: 20px; /* одинаково с кнопкой */

  border: 1px solid rgba(255,255,255,.25);
  background: rgba(0,0,0,.35);
  color:#fff;

  font-weight:600;
  font-size:14px;
  line-height:1.3;

  pointer-events:auto;
  user-select:text;

  width: max-content;
  max-width: 340px;   /* ОГРАНИЧЕНИЕ */

  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;

  opacity: 0;
  transform: translateX(60vw);

  transition:
    opacity .35s ease,
    transform 1.60s cubic-bezier(.18,.9,.2,1);
}

#${CONFIG.ROOT_ID} .mzt-fs-info.is-show{
  opacity: 1;
  transform: translateX(0);
}


#${CONFIG.ROOT_ID} .mzt-fs-info-label{
  color: rgba(197,162,122,.95); /* светло-коричневый */
  font-weight:700;
}


/* ===================== CARD ===================== */
#${CONFIG.ROOT_ID} .mzt-card{
  background:#ffffff;
  border-radius:16px;
  box-shadow: 0 10px 30px rgba(0,0,0,.12);
  overflow:hidden;
  min-width:0;
  min-height:0;
}
/* правая карточка НЕ должна выпускать контент наружу */
#${CONFIG.ROOT_ID} #vispanel{ overflow:hidden; }

/* но выпадающие списки должны быть поверх плиток внутри карточки */
#${CONFIG.ROOT_ID} #vispanel-top{ overflow: visible; position: relative; z-index: 20; }
#${CONFIG.ROOT_ID} .mzt-select-list{ z-index: 50; }

/* важное: разрешаем flex-детям сжиматься по высоте, иначе grid/пагинация "выталкивают" контент */
#${CONFIG.ROOT_ID} #vispanel-bot{ min-height: 0; overflow:hidden; }
#${CONFIG.ROOT_ID} .mzt-tiles-wrap{ min-height: 0; overflow:hidden; }
#${CONFIG.ROOT_ID} .mzt-tiles-grid{ min-height: 0; }
#${CONFIG.ROOT_ID} .mzt-pagination{ flex: 0 0 auto; padding: 0 6px; }

/* ===================== LEFT: RENDER ===================== */
#${CONFIG.ROOT_ID} #visrender{
  flex: 2.6;
  display:flex;
  flex-direction:column;
  min-width:0;
  min-height:0;
  padding:16px;
  gap:14px;
}
#${CONFIG.ROOT_ID} .mzt-render-main{
  position:relative;
  flex:1 1 auto;
  min-height:0;
  border-radius:14px;
  overflow:visible;
  background:#eaecef;
}
#${CONFIG.ROOT_ID} .mzt-render-media{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  border-radius:inherit;
  overflow:hidden;
}
#${CONFIG.ROOT_ID} .mzt-render-media > img{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
  transform: translateZ(0);
}

/* ===== grout panel on main render ===== */
#${CONFIG.ROOT_ID} .mzt-groutbox{
  position:absolute;
  left:12px;
  top:12px;
  z-index:6;
  display:flex;
  flex-direction:column;
  gap:6px;
  padding:10px 10px;
  border-radius:12px;
  background: rgba(255,255,255,.88);
  border: 1px solid rgba(0,0,0,.10);
  box-shadow: 0 10px 20px rgba(0,0,0,.12);
  backdrop-filter: blur(6px);
}
#${CONFIG.ROOT_ID} .mzt-groutbox-title{
  font-size:12px;
  font-weight:600;
  color:#111827;
}
#${CONFIG.ROOT_ID} .mzt-groutbox-select{
  height:34px;
  border-radius:10px;
  border:1px solid rgba(0,0,0,.14);
  padding:0 34px 0 10px;
  background:#fff;
  font-size:13px;
  cursor:pointer;
  width:100%;
  text-align:left;
  appearance:none;
  min-width:120px;
}
#${CONFIG.ROOT_ID} button.mzt-groutbox-select{ background:#fff; }

/* ===== tile name + zoom hint panels on main render ===== */
#${CONFIG.ROOT_ID} .mzt-render-tilebox{
  position:absolute;
  right:12px;
  top:12px;
  z-index:6;
  display:flex;
  flex-direction:column;
  gap:6px;
  padding:10px 10px;
  border-radius:12px;
  background: rgba(255,255,255,.88);
  border: 1px solid rgba(0,0,0,.10);
  box-shadow: 0 10px 20px rgba(0,0,0,.12);
  backdrop-filter: blur(6px);
  width: min(280px, calc(100% - 160px));
  pointer-events:auto;
}
#${CONFIG.ROOT_ID} .mzt-render-tilebox-title{
  font-size:12px;
  font-weight:600;
  color:#111827;
}
#${CONFIG.ROOT_ID} .mzt-render-tilebox-name{
  font-size:13px;
  font-style: normal;
  font-weight: 400;
  line-height:1.25;
  color:#111827;
  display:block;
  white-space:normal;
  overflow:visible;
}
#${CONFIG.ROOT_ID} .mzt-render-zoomhint{
  position:absolute;
  right:12px;
  top: calc(12px + var(--mzt-tilebox-h, 74px) + 8px);
  z-index:6;
  width:48px;
  aspect-ratio:1/1;
  border-radius:12px;
  background: rgba(255,255,255,.88);
  border: 1px solid rgba(0,0,0,.10);
  box-shadow: 0 10px 20px rgba(0,0,0,.12);
  backdrop-filter: blur(6px);
  display:grid;
  place-items:center;
  pointer-events:none;
  overflow:hidden;
}
#${CONFIG.ROOT_ID} .mzt-render-zoomhint svg{
  position:absolute;
  left:50%;
  top:50%;
  width:20px;
  height:20px;
  color:#9a5e3a;
  opacity:0;
  transform: translate(-50%, -50%);
  animation: mztZoomHintA 2.8s ease-in-out infinite;
}
#${CONFIG.ROOT_ID} .mzt-render-zoomhint svg.mzt-zoom-arrow--br{
  animation-name: mztZoomHintB;
}
@keyframes mztZoomHintA{
  0%{ opacity:0; transform: translate(calc(-50% - 4px), calc(-50% - 4px)) scale(.7); }
  12%{ opacity:1; transform: translate(calc(-50% - 4px), calc(-50% - 4px)) scale(1); }
  68%{ opacity:1; transform: translate(calc(-50% - 12px), calc(-50% - 12px)) scale(1); }
  84%,100%{ opacity:0; transform: translate(calc(-50% - 16px), calc(-50% - 16px)) scale(.92); }
}
@keyframes mztZoomHintB{
  0%{ opacity:0; transform: translate(calc(-50% + 4px), calc(-50% + 4px)) scale(.7); }
  12%{ opacity:1; transform: translate(calc(-50% + 4px), calc(-50% + 4px)) scale(1); }
  68%{ opacity:1; transform: translate(calc(-50% + 12px), calc(-50% + 12px)) scale(1); }
  84%,100%{ opacity:0; transform: translate(calc(-50% + 16px), calc(-50% + 16px)) scale(.92); }
}

/* fullscreen grout panel (сверху слева) */
#${CONFIG.ROOT_ID} .mzt-fs-grout{
  position:absolute;
  left: 14px;
  top: 14px;
  transform: none;
  z-index: 1000003;
  padding: 10px 16px;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,.25);
  background: rgba(0,0,0,.35);
  color:#fff;
  display:flex;
  flex-direction:column;
  gap:8px;
  min-width: 180px;
}
#${CONFIG.ROOT_ID} .mzt-fs-grout-title{
  font-weight:600;
  font-size:14px;
  line-height:1;
}
#${CONFIG.ROOT_ID} .mzt-fs-grout-select{
  height:38px;
  border-radius:12px;
  border: 1px solid rgba(255,255,255,.25);
  background: rgba(255,255,255,.10);
  color:#fff;
  padding:0 34px 0 10px;
  outline:none;
  width:100%;
  text-align:left;
  appearance:none;
}
#${CONFIG.ROOT_ID} button.mzt-fs-grout-select{ cursor:pointer; }

#${CONFIG.ROOT_ID} .mzt-fs-grout-select option{ color:#111827; }

#${CONFIG.ROOT_ID} .mzt-render-thumbs{
  display:grid;
  grid-template-columns: repeat(6, minmax(0, 1fr)); /* 7 рендеров: 1 главный + 6 миниатюр */
  gap:10px;
  flex:0 0 auto;
  min-width:0;
  min-height:0;
  align-content:start;
  overflow:hidden;   /* НИКАКОЙ прокрутки */
  padding-bottom:2px;
}
#${CONFIG.ROOT_ID} .mzt-thumb{
  width: 100%;
  min-width:0;
  min-height:0;
  aspect-ratio: 16/10;
  border-radius:12px;
  overflow:hidden;
  background:#eaecef;
  border:2px solid transparent;
  cursor:pointer;
}
/* anti-moiré for thumbnails (минимально «ухудшаем» только миниатюры) */
#${CONFIG.ROOT_ID} .mzt-thumb img{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;

  /* ключевое: убираем муар лёгким блюром и чуть «гасим» картинку */
  filter: blur(0.35px) saturate(0.95) contrast(0.98);
  transform: translateZ(0);           /* иногда даёт лучшее ресэмплирование */
  backface-visibility: hidden;
  -webkit-font-smoothing: antialiased;
}
#${CONFIG.ROOT_ID} .mzt-thumb.is-active{
  border-color:#c5a27a;
}

/* empty / helper text */
#${CONFIG.ROOT_ID} .mzt-empty{
  width:100%;
  height:100%;
  display:flex;
  align-items:center;
  justify-content:center;
  text-align:center;
  padding:24px;
  color:#6b7280;
  font-size:16px;
  line-height:1.35;
}

/* ===================== RIGHT: PANEL ===================== */
#${CONFIG.ROOT_ID} #vispanel{
  flex: 1.4;
  display:flex;
  flex-direction:column;
  padding:16px;
  gap:14px;
}
#${CONFIG.ROOT_ID} #vispanel-top{
  padding:10px 10px 2px;
}

/* ====== custom select (rounded + animated) ====== */
#${CONFIG.ROOT_ID} .mzt-field{
  margin-bottom:12px;
}
#${CONFIG.ROOT_ID} .mzt-field label{
  display:block;
  font-size:13px;
  color:#111827;
  margin:0 0 6px;
}

#${CONFIG.ROOT_ID} .mzt-select{
  position:relative;
}
#${CONFIG.ROOT_ID} .mzt-select-btn{
  width:100%;
  height:42px;
  border-radius:14px;
  border:1px solid rgba(0,0,0,.12);
  padding:0 44px 0 12px;
  background:#fff;
  cursor:pointer;
  font-size:14px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  transition: box-shadow .18s ease, border-color .18s ease, transform .18s ease;
}
#${CONFIG.ROOT_ID} .mzt-select-btn:focus{
  outline:none;
  border-color:#c5a27a;
  box-shadow: 0 0 0 3px rgba(197,162,122,.25);
}
#${CONFIG.ROOT_ID} .mzt-select-btn:hover{
  border-color: rgba(0,0,0,.22);
}

#${CONFIG.ROOT_ID} .mzt-select-arrow{
  position:absolute;
  right: clamp(10px, 1.2vw, 14px);
  top: 52%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  opacity:.7;
  pointer-events:none;
  transition: transform .18s ease;
}
#${CONFIG.ROOT_ID} .mzt-select.is-open .mzt-select-arrow{
  transform: translateY(-50%) rotate(180deg);
}

#${CONFIG.ROOT_ID} .mzt-select-list{
  position:absolute;
  left:0;
  right:0;
  top: calc(100% + 8px);
  background:#fff;
  border-radius:14px;
  border:1px solid rgba(0,0,0,.10);
  box-shadow: 0 12px 26px rgba(0,0,0,.14);
  overflow:hidden;

  /* анимация открытия */
  max-height:0;
  opacity:0;
  transform: translateY(-6px);
  transition: max-height .22s ease, opacity .18s ease, transform .18s ease;
  z-index: 5;
}
#${CONFIG.ROOT_ID} .mzt-select.is-open .mzt-select-list{
  max-height: 400px;
  opacity:1;
  transform: translateY(0);
}
#${CONFIG.ROOT_ID} .mzt-select-item{
  height:40px;
  padding:0 12px;
  display:flex;
  align-items:center;
  cursor:pointer;
  font-size:14px;
  color:#111827;
  transition: background .12s ease;
}
#${CONFIG.ROOT_ID} .mzt-select-item:hover{
  background: rgba(197,162,122,.12);
}
#${CONFIG.ROOT_ID} .mzt-select-item.is-active{
  background: rgba(197,162,122,.18);
  font-weight:600;
}

/* ===================== Tiles grid + placeholders ===================== */
#${CONFIG.ROOT_ID} #vispanel-bot{
  flex:1;
  display:flex;
  flex-direction:column;
  gap:10px;
  padding:8px 8px 10px;
}
#${CONFIG.ROOT_ID} .mzt-tiles-wrap{
  position:relative;
  flex:1;
}
#${CONFIG.ROOT_ID} .mzt-tiles-grid{
  display:grid;
  grid-template-columns: repeat(3, var(--mzt-tile-size, 120px));
  grid-template-rows: repeat(var(--mzt-tiles-rows, 3), var(--mzt-tile-size, 120px));
  gap: var(--mzt-tile-gap, 10px);

  justify-content: center;   /* если остаётся свободное место */
  align-content: start;

  overflow: hidden;          /* никаких вылезаний */
}

#${CONFIG.ROOT_ID} .mzt-tile{
  width: 100%;
  height: 100%;
  border-radius:14px;
  overflow:hidden;
  background:#eaecef;
  cursor:pointer;
  border:2px solid transparent;
  position:relative;
}
#${CONFIG.ROOT_ID} .mzt-tile img{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
}
#${CONFIG.ROOT_ID} .mzt-tile.is-selected{
  border-color:#c5a27a;
}

/* еле видные серые плейсхолдеры */
#${CONFIG.ROOT_ID} .mzt-tile.is-empty{
  background: linear-gradient(135deg, rgba(0,0,0,.035), rgba(0,0,0,.02));
  border: 1px solid rgba(0,0,0,.06);
  cursor:default;
}

/* overlay message */
#${CONFIG.ROOT_ID} .mzt-grid-overlay{
  position:absolute;
  inset:0;
  display:flex;
  align-items:center;
  justify-content:center;
  text-align:center;
  padding:18px;
  border-radius:14px;
  pointer-events:none;
}
#${CONFIG.ROOT_ID} .mzt-grid-overlay-card{
  background: rgba(255,255,255,.92);
  border: 1px solid rgba(0,0,0,.08);
  box-shadow: 0 10px 22px rgba(0,0,0,.12);
  border-radius:14px;
  padding:14px 14px;
  max-width: 340px;
  color:#111827;
  font-size:14px;
  line-height:1.35;
}

/* pagination */
#${CONFIG.ROOT_ID} .mzt-pagination{
  display:flex;
  gap:8px;
  row-gap:8px;
  flex-wrap:wrap;        /* чтобы НЕ вылезала */
  justify-content:center;
  align-items:center;
  padding-top:2px;
  max-width:100%;
}

/* не кликабельный разделитель страниц */
#${CONFIG.ROOT_ID} .mzt-page-ellipsis{
  padding: 0 6px;
  color:#6b7280;
  font-weight:600;
  user-select:none;
}
#${CONFIG.ROOT_ID} .mzt-pagebtn{
  min-width:34px;
  height:34px;
  border-radius:999px;
  border:1px solid rgba(0,0,0,.14);
  background:#fff;
  cursor:pointer;
  font-size:13px;
}
#${CONFIG.ROOT_ID} .mzt-pagebtn.is-active{
  border-color:#c5a27a;
  box-shadow: 0 0 0 3px rgba(197,162,122,.22);
}

/* ===================== CTA Button (bottom) ===================== */
#${CONFIG.ROOT_ID} .mzt-cta-wrap{
  width:100%;
  display:flex;
  justify-content:center;
  background:#f3f4f6;
  padding: 0 16px 26px;
}
#${CONFIG.ROOT_ID} .mzt-cta{
  width: min(520px, 92vw);
  height: 64px;
  border:none;
  border-radius: 999px;
  cursor:pointer;
  font-weight:700;
  letter-spacing: .02em;
  color:#ffffff;
  background: #b78967;
  box-shadow: 0 14px 26px rgba(0,0,0,.18);
  transition: transform .15s ease, box-shadow .15s ease, opacity .15s ease;
}
#${CONFIG.ROOT_ID} .mzt-cta:hover{
  transform: translateY(-1px);
  box-shadow: 0 18px 30px rgba(0,0,0,.20);
}
#${CONFIG.ROOT_ID} .mzt-cta:active{
  transform: translateY(0);
  opacity:.95;
}

/* ===================== LOADER ===================== */
#${CONFIG.ROOT_ID} .mzt-loader{
  position:fixed;
  inset:0;
  background: rgba(243,244,246,.75);
  backdrop-filter: blur(4px);
  display:flex;
  align-items:center;
  justify-content:center;
  z-index:999999;
}
#${CONFIG.ROOT_ID} .mzt-spinner{
  width:42px;
  height:42px;
  border-radius:10px;
  border:3px solid rgba(0,0,0,.15);
  border-top-color: rgba(0,0,0,.55);
  animation: mztspin 1s linear infinite;
}
@keyframes mztspin { to { transform: rotate(360deg); } }

/* ===================== RESPONSIVE ===================== */
@media (max-width: 980px){
  #${CONFIG.ROOT_ID} .mzt-stage{
    height: auto;
    aspect-ratio: auto;
    width: min(100%, ${CONFIG.MAX_WIDTH}px);
    flex-direction:column;
  }
  #${CONFIG.ROOT_ID} #visrender{ flex: none; min-height: 680px; }
  #${CONFIG.ROOT_ID} #vispanel{ flex: none; }
  #${CONFIG.ROOT_ID} .mzt-thumb{ width: 100%; }
}

/* На узких экранах миниатюры рендеров делаем в 2 ряда (3×2) */
@media (max-width: 720px){
  #${CONFIG.ROOT_ID} .mzt-render-thumbs{
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (max-width: 520px){
  #${CONFIG.ROOT_ID} .mzt-stage-wrap{ padding:16px 10px 12px; }
  #${CONFIG.ROOT_ID} #visrender{ padding:12px; }
  #${CONFIG.ROOT_ID} #vispanel{ padding:12px; }
  #${CONFIG.ROOT_ID} #vispanel-top{
    display:block;
    overflow: visible;
    padding:6px 6px 2px;
  }
  #${CONFIG.ROOT_ID} .mzt-field{
    min-width: auto;
    margin-bottom:12px;
  }
}
`;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ==========================================================================
     [6] Разметка (создаём внутри #cusvis)
     ========================================================================== */
  function buildLayout(root) {
    root.innerHTML = "";

    const stageWrap = el("div", { class: "mzt-stage-wrap" });
    const stage = el("div", { class: "mzt-stage" });

    const left = el("div", { id: "visrender", class: "mzt-card" });
    const right = el("div", { id: "vispanel", class: "mzt-card" });

    // render block structure
    const main = el("div", { class: "mzt-render-main", id: "mztRenderMain" });
    const thumbs = el("div", { class: "mzt-render-thumbs", id: "mztRenderThumbs" });

    // initial empty
    main.appendChild(
      el("div", {
        class: "mzt-empty",
        id: "mztRenderEmpty",
        text: "Выберите значения справа для отображения."
      })
    );

    left.appendChild(main);
    left.appendChild(thumbs);

    // panel structure
    const top = el("div", { id: "vispanel-top" });
    const bot = el("div", { id: "vispanel-bot" });

    const tilesWrap = el("div", { class: "mzt-tiles-wrap", id: "mztTilesWrap" });
    const grid = el("div", { class: "mzt-tiles-grid", id: "mztTilesGrid" });
    tilesWrap.appendChild(grid);

    const pagination = el("div", { class: "mzt-pagination", id: "mztPagination" });

    bot.appendChild(tilesWrap);
    bot.appendChild(pagination);

    right.appendChild(top);
    right.appendChild(bot);

    stage.appendChild(left);
    stage.appendChild(right);
    stageWrap.appendChild(stage);

    root.appendChild(stageWrap);

    // CTA (нижняя кнопка будет добавляться отдельным разделом)
  }
   
function setupTilesGridSizer() {
  const root = qs(`#${CONFIG.ROOT_ID}`);
  if (!root) return;

  const wrap = qs("#vispanel-bot", root);       // область, где живут плитки + пагинация
  const grid = qs(".mzt-tiles-grid", root);
  const pag  = qs(".mzt-pagination", root);

  if (!wrap || !grid) return;

  const GAP = 10; // держим как в дизайне
  root.style.setProperty("--mzt-tile-gap", `${GAP}px`);

  const MIN_TILE_SOFT = 72; // если плитка меньше — уменьшаем количество рядов
  const MIN_TILE_HARD = 64; // абсолютный минимум (страховка)
  const SAFE = 2;           // чтобы НИКОГДА не подрезало низ из-за округления
  const STACKED_BP = 980;   // когда правая панель уходит вниз (flex-direction: column)

  function recalc() {
    // Считаем по РЕАЛЬНО доступной зоне именно под сетку (tilesWrap)
    const tilesWrap = qs("#mztTilesWrap", root);
    if (!tilesWrap) return;

    // доступная ширина/высота под сетку
    const w = tilesWrap.clientWidth;
    const h = tilesWrap.clientHeight;
    if (w <= 0 || h <= 0) return;

    const cols = 3;

    // На мобилках/планшетах, когда правая панель УЖЕ снизу (stage column),
    // нет смысла "экономить" высоту — всегда показываем 3 ряда (9 плиток),
    // а размер считаем только от ширины.
    const isStacked = window.matchMedia(`(max-width: ${STACKED_BP}px)`).matches;
    if (isStacked) {
      const sizeByW = Math.floor((w - GAP * (cols - 1)) / cols);
      const tileSize = Math.max(MIN_TILE_HARD, sizeByW - SAFE);
      const rows = 3;

      root.style.setProperty("--mzt-tile-size", `${tileSize}px`);
      root.style.setProperty("--mzt-tiles-rows", String(rows));

      const nextPerPage = cols * rows;
      if (state.tilesRows !== rows || state.tilesPerPage !== nextPerPage) {
        state.tilesCols = cols;
        state.tilesRows = rows;
        state.tilesPerPage = nextPerPage;

        const mode = state.tilesMode || (state.filteredTiles.length ? "normal" : "no_matches");
        renderTilesPage({ mode });
        renderPagination();
      }
      return;
    }

    // считаем размер плитки для заданного количества рядов (side-by-side режим)
    const sizeFor = (rows) => {
      const sizeByW = Math.floor((w - GAP * (cols - 1)) / cols);
      const sizeByH = Math.floor((h - GAP * (rows - 1)) / rows);
      return Math.max(MIN_TILE_HARD, Math.min(sizeByW, sizeByH) - SAFE);
    };

    let rows = 3;
    let tileSize = sizeFor(rows);
    if (tileSize < MIN_TILE_SOFT) {
      rows = 2;
      tileSize = sizeFor(rows);
    }
    if (tileSize < MIN_TILE_SOFT) {
      rows = 1;
      tileSize = sizeFor(rows);
    }

    root.style.setProperty("--mzt-tile-size", `${tileSize}px`);
    root.style.setProperty("--mzt-tiles-rows", String(rows));

    const nextPerPage = cols * rows;

    // если меняется раскладка — перерисуем плитки/пагинацию (чтобы ничего не резалось)
    if (state.tilesRows !== rows || state.tilesPerPage !== nextPerPage) {
      state.tilesCols = cols;
      state.tilesRows = rows;
      state.tilesPerPage = nextPerPage;

      // пере-рендер сетки и пагинации, но без лишней логики фильтров
      const mode = state.tilesMode || (state.filteredTiles.length ? "normal" : "no_matches");
      renderTilesPage({ mode });
      renderPagination();
    }
  }

  // первичный расчёт (после текущего рендера)
  requestAnimationFrame(recalc);

  // пересчёт при любых изменениях размеров
  const ro = new ResizeObserver(() => recalc());
  ro.observe(wrap);
  ro.observe(grid);
  if (pag) ro.observe(pag);

  // на всякий случай
  window.addEventListener("resize", recalc);
}
   
  /* ==========================================================================
     [7] Loader
     ========================================================================== */
  function showLoader() {
    if (qs(".mzt-loader")) return;
    const loader = el("div", { class: "mzt-loader", id: "mztLoader" }, [el("div", { class: "mzt-spinner", "aria-label": "loading" })]);
    document.body.appendChild(loader);
  }

  function hideLoader() {
    const loader = qs("#mztLoader");
    if (loader) loader.remove();
  }

  /* ==========================================================================
     [8] Данные: загрузка dbase.json
     ========================================================================== */
  async function loadDB() {
    const res = await fetch(CONFIG.DB_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Не удалось загрузить DB_URL: ${res.status} (${CONFIG.DB_URL})`);
    return res.json();
  }

  /* ==========================================================================
     [9] Custom Selects (rounded + animated)
     ========================================================================== */
  function closeAllSelects(exceptKey = null) {
    qsa(".mzt-select").forEach((box) => {
      const key = box.getAttribute("data-key");
      if (exceptKey && key === exceptKey) return;
      box.classList.remove("is-open");
    });
  }

  function renderSelects() {
    const top = qs("#vispanel-top");
    top.innerHTML = "";

    const { selects } = state.db;

    const arrowSvg = `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    const makeField = (key) => {
      const field = el("div", { class: "mzt-field" });
      const label = el("label", { text: selects[key].label });

      const box = el("div", { class: "mzt-select", "data-key": key });
      const btn = el("button", { class: "mzt-select-btn", type: "button" });
      const btnText = el("span", { class: "mzt-select-text", text: state.filters[key] });
      btn.appendChild(btnText);

      const arrow = el("div", { class: "mzt-select-arrow", html: arrowSvg });
      box.appendChild(btn);
      box.appendChild(arrow);

      const list = el("div", { class: "mzt-select-list", role: "listbox" });

      selects[key].values.forEach((v) => {
        const item = el("div", {
          class: "mzt-select-item" + (state.filters[key] === v ? " is-active" : ""),
          text: v,
          role: "option",
          "data-value": v
        });

        item.addEventListener("click", () => {
          state.filters[key] = v;
          state.page = 1;

          // обновляем текст кнопки
          btnText.textContent = v;

          // обновляем активный пункт
          qsa(".mzt-select-item", list).forEach((x) => x.classList.remove("is-active"));
          item.classList.add("is-active");

          // закрываем
          box.classList.remove("is-open");

          // применяем фильтры
          applyFiltersAndRenderTiles();
          
        });

        list.appendChild(item);
      });

      box.appendChild(list);

      btn.addEventListener("click", () => {
        const isOpen = box.classList.contains("is-open");
        closeAllSelects(key);
        box.classList.toggle("is-open", !isOpen);
      });

      field.appendChild(label);
      field.appendChild(box);
      return field;
    };

    top.appendChild(makeField("tile_color"));
    top.appendChild(makeField("tile_type"));
    top.appendChild(makeField("price_category"));

    // закрывать селекты при клике вне
    document.addEventListener("click", (e) => {
      const inside = e.target.closest(`#${CONFIG.ROOT_ID} .mzt-select`);
      if (!inside) closeAllSelects();
    });
    // закрывать по ESC
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllSelects();
    });
  }

  /* ==========================================================================
     [10] Фильтрация + Плитка (grid) + пагинация + overlay состояния
     ========================================================================== */
function tileMatchesFilters(tile) {
  const f = state.filters;

  const okColor =
    f.tile_color === "---" ||
    (Array.isArray(tile.tile_color)
      ? tile.tile_color.includes(f.tile_color)
      : tile.tile_color === f.tile_color);

  const okType =
    f.tile_type === "---" ||
    tile.category === f.tile_type;

  const okPrice =
    f.price_category === "---" ||
    (Array.isArray(tile.price_category)
      ? tile.price_category.includes(f.price_category)
      : tile.price_category === f.price_category);

  return okColor && okType && okPrice;
}

  function applyFiltersAndRenderTiles() {
    // ВАЖНО: если все фильтры --- => мы НЕ показываем плитку, а просим выбрать значения
    if (allFiltersAreBlank()) {
  const initial = state.db.initial_state;

  // ПРАВЫЙ БЛОК: 9 популярных плиток
  if (initial?.popular_tiles?.length) {
    state.filteredTiles = state.db.tiles.filter(t => initial.popular_tiles.includes(t.id));
  } else {
    state.filteredTiles = [];
  }

  // ЛЕВЫЙ БЛОК: дефолтный набор рендеров
  if (initial?.render_set_id) {
    state.activeRenderSetId = initial.render_set_id;
    const set = getRenderSetById(initial.render_set_id);
    state.activeRenders = set ? (set.renders || []) : [];
  } else {
    state.activeRenderSetId = null;
    state.activeRenders = [];
  }

  // На дефолтном экране ничего не "выбрано"
  state.selectedTileId = null;
  state.page = 1;

  state.tilesMode = state.filteredTiles.length ? "normal" : "no_matches";
  renderTilesPage({ mode: state.tilesMode });

  // если на маленькой высоте perPage может быть 6/3 — пагинация нужна
  const perPage = state.tilesPerPage || (state.db.ui?.tiles_per_page ?? 9);
  renderPagination({ forceSingle: state.filteredTiles.length <= perPage });
  renderRenderBlock();
  return;
}

    state.filteredTiles = state.db.tiles.filter(tileMatchesFilters);
    state.tilesMode = state.filteredTiles.length ? "normal" : "no_matches";
    renderTilesPage({ mode: state.tilesMode });
    renderPagination();
  }

  function renderTilesPage({ mode }) {
    const grid = qs("#mztTilesGrid");
    const wrap = qs("#mztTilesWrap");
    grid.innerHTML = "";

    // чистим overlay
    const oldOverlay = qs(".mzt-grid-overlay", wrap);
    if (oldOverlay) oldOverlay.remove();

    const perPage = state.tilesPerPage || (state.db.ui?.tiles_per_page ?? 9);
    const total = state.filteredTiles.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    state.page = clamp(state.page, 1, pages);

    // всегда рисуем плейсхолдеры по текущему perPage
    if (mode === "need_selection" || mode === "no_matches") {
      for (let i = 0; i < perPage; i++) {
        grid.appendChild(el("div", { class: "mzt-tile is-empty" }));
      }

      const msg =
        mode === "need_selection"
          ? "Выберите значения для отображения"
          : "По выбранным параметрам совпадений не найдено";

      const overlay = el("div", { class: "mzt-grid-overlay" }, [
        el("div", { class: "mzt-grid-overlay-card", text: msg })
      ]);
      wrap.appendChild(overlay);

      return;
    }

    const start = (state.page - 1) * perPage;
    const pageItems = state.filteredTiles.slice(start, start + perPage);

    pageItems.forEach((t) => {
      const card = el("div", { class: "mzt-tile" + (state.selectedTileId === t.id ? " is-selected" : ""), "data-tile-id": t.id });
      const img = el("img", { src: t.image, alt: t.name, loading: "lazy" });
      card.appendChild(img);
      attachCellLoader(card, img);
      card.addEventListener("click", () => onTileClick(t.id));
      grid.appendChild(card);
    });

    // добиваем до perPage
    for (let i = pageItems.length; i < perPage; i++) {
      grid.appendChild(el("div", { class: "mzt-tile is-empty" }));
    }
  }

  function renderPagination({ forceSingle } = {}) {
    const wrap = qs("#mztPagination");
    wrap.innerHTML = "";

    const perPage = state.tilesPerPage || (state.db.ui?.tiles_per_page ?? 9);
    const total = state.filteredTiles.length;
    const pages = Math.max(1, Math.ceil(total / perPage));

    if (forceSingle || total === 0) {
      wrap.appendChild(el("button", { class: "mzt-pagebtn is-active", text: "1", type: "button" }));
      return;
    }

    // Схема пагинации:
    // - если страниц <= 8 — показываем все
    // - иначе: первая/последняя + текущая со соседями + многоточия
    const model = (() => {
      if (pages <= 8) return Array.from({ length: pages }, (_, i) => i + 1);

      const cur = clamp(state.page, 1, pages);
      if (cur <= 3) return [1, 2, 3, 4, "…", pages];
      if (cur >= pages - 2) return [1, "…", pages - 3, pages - 2, pages - 1, pages];
      return [1, "…", cur - 1, cur, cur + 1, "…", pages];
    })();

    model.forEach((item) => {
      if (item === "…") {
        wrap.appendChild(el("span", { class: "mzt-page-ellipsis", text: "…" }));
        return;
      }

      const p = Number(item);
      const btn = el("button", {
        class: "mzt-pagebtn" + (p === state.page ? " is-active" : ""),
        text: String(p),
        type: "button",
        "aria-label": `page ${p}`
      });
      btn.addEventListener("click", () => {
        state.page = p;
        renderTilesPage({ mode: state.tilesMode || "normal" });
        renderPagination();
      });
      wrap.appendChild(btn);
    });
  }

  /* ==========================================================================
     [11] Клик по плитке -> привязка -> рендеры
     ========================================================================== */
  function normalizeRenderSetData(rs) {
    if (!rs) return null;

    // Новый формат: {id,name,renders:[{id, description?, variants:{Белый:..., ...}}]}
    if (Array.isArray(rs.renders)) return rs;

    // Старый формат: {id,name,images:[{id, image, grout_color, description?}, ...]}
    if (Array.isArray(rs.images)) {
      const order = [];
      const map = new Map();

      rs.images.forEach((it) => {
        const rid = it?.id;
        if (!rid) return;
        if (!map.has(rid)) {
          map.set(rid, []);
          order.push(rid);
        }
        map.get(rid).push(it);
      });

      const renders = order.map((rid) => {
        const items = map.get(rid) || [];
        const variants = {};
        let description = "";
        for (const it of items) {
          if (!description && it?.description) description = it.description;
          if (it?.grout_color && it?.image) variants[it.grout_color] = it.image;
        }
        const obj = { id: rid, variants };
        if (description) obj.description = description;
        return obj;
      });

      return { id: rs.id, name: rs.name, renders };
    }

    return rs;
  }

  function getRenderSetById(id) {
    const raw = state.db.renderSets.find((r) => r.id === id) || null;
    return normalizeRenderSetData(raw);
  }

  function getBoundRenderSetId(tileId) {
    const b = state.db.bindings.find((x) => x.tile_id === tileId);
    return b ? b.render_set_id : null;
  }

    // Быстрое обновление подсветки выбранной плитки без перерендера сетки
  function attrSelectorValue(v) {
  // безопасно для значения внутри [attr="..."]
  return String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

  function updateSelectedTileUI(tileId) {
    const grid = qs("#mztTilesGrid");
    if (!grid) return;

    const prev = grid.querySelector(".mzt-tile.is-selected");
    if (prev) prev.classList.remove("is-selected");

    const next = grid.querySelector(`.mzt-tile[data-tile-id="${attrSelectorValue(tileId)}"]`);
    if (next) next.classList.add("is-selected");
  }
   
async function onTileClick(tileId) {
  state.selectedTileId = tileId;

  // при выборе новой плитки начинаем с 1-го кадра
  state.activeThumbIndex = 0;

   // подсветка выбранной плитки (без перерендера 9 карточек)
   updateSelectedTileUI(tileId);

  const renderSetId = getBoundRenderSetId(tileId);
  state.activeRenderSetId = renderSetId;

  if (!renderSetId) {
    state.activeRenders = [];
    renderRenderBlock();
    return;
  }

  const set = getRenderSetById(renderSetId);
  if (!set) {
    state.activeRenders = [];
    renderRenderBlock();
    return;
  }

  // ВАЖНО: НЕ показываем глобальный лоадер на всю страницу.
  // Просто обновляем нужные <img> (main + 6 миниатюр), а лоадер — только внутри их ячеек.
  state.activeRenders = set.renders || [];
  renderRenderBlock();

  // тихо подогреем кеш (main + 6 миниатюр), чтобы дальше переключения были мгновенные
  try {
    const urls = [];
    const renders = state.activeRenders || [];
    for (let i = 0; i < Math.min(6, renders.length); i++) {
      const v = pickVariant(renders[i], state.renderGroutColor);
      if (v?.image) urls.push(v.image);
    }
    const cur = getCurrentRenderVariant();
    if (cur?.image) urls.push(cur.image);
    preloadImages(urls);
  } catch (e) {
    // noop
  }
}


// ====== левый блок: группы рендеров (6 кадров × 5 цветов затирки = 30) ======
  const GROUT_COLORS = ["Белый", "Серый", "Бежевый", "Коричневый", "Черный"];

  const GROUT_ARROW_SVG = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;


  function getRenderByIndex(renders, idx) {
    if (!Array.isArray(renders) || renders.length === 0) return null;
    const i = clamp(idx, 0, Math.min(5, renders.length - 1));
    return renders[i] || null;
  }

  function pickVariant(render, groutColor) {
    if (!render) return null;

    const variants = render.variants || {};
    const direct = variants[groutColor];

    // fallback: первый доступный вариант
    const first = direct || variants[Object.keys(variants)[0]];

    if (!first) return null;

    return {
      id: render.id,
      description: render.description || "",
      image: first
    };
  }

  
  function buildGroutCustomSelect(buttonClass, extraBoxClass = "") {
    const box = el("div", { class: ("mzt-select " + extraBoxClass).trim() });

    const btn = el("button", { class: buttonClass, type: "button" });
    const btnText = el("span", { class: "mzt-grout-val", text: state.renderGroutColor });
    btn.appendChild(btnText);

    const arrow = el("div", { class: "mzt-select-arrow", html: GROUT_ARROW_SVG });

    const list = el("div", { class: "mzt-select-list", role: "listbox" });

    GROUT_COLORS.forEach((c) => {
      const item = el("div", {
        class: "mzt-select-item" + (c === state.renderGroutColor ? " is-active" : ""),
        text: c,
        role: "option",
        "data-value": c
      });

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        state.renderGroutColor = c;

        // UI
        btnText.textContent = c;
        qsa(".mzt-select-item", list).forEach((x) => x.classList.remove("is-active"));
        item.classList.add("is-active");

        box.classList.remove("is-open");

        // rerender
        updateRenderImages();
        syncGroutUI();
      });

      list.appendChild(item);
    });

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = box.classList.contains("is-open");
      closeAllSelects(null);
      box.classList.toggle("is-open", !isOpen);
    });

    box.appendChild(btn);
    box.appendChild(arrow);
    box.appendChild(list);

    return box;
  }

  function renderGroutPanelInline() {
    const box = el("div", { class: "mzt-groutbox" });
    const title = el("div", { class: "mzt-groutbox-title", text: "Цвет затирки" });

    const selectBox = buildGroutCustomSelect("mzt-groutbox-select", "mzt-grout-select-inline");

    box.appendChild(title);
    box.appendChild(selectBox);
    return box;
  }

  function renderTileNamePanelInline() {
    const box = el("div", { class: "mzt-render-tilebox" });
    const title = el("div", { class: "mzt-render-tilebox-title", text: "Наименование плитки" });
    const name = el("div", { class: "mzt-render-tilebox-name", text: "—" });

    box.appendChild(title);
    box.appendChild(name);
    return box;
  }

  function renderZoomHintPanelInline() {
    const arrowUpLeft = `
      <svg class="mzt-zoom-arrow--tl" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M15 9H9v6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M9 9l7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
    `;
    const arrowBottomRight = `
      <svg class="mzt-zoom-arrow--br" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 15h6V9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M15 15L8 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
    `;

    return el("div", {
      class: "mzt-render-zoomhint",
      title: "Увеличить изображение",
      html: `${arrowUpLeft}${arrowBottomRight}`
    });
  }

  function getCurrentRenderSetName() {
    if (!state.activeRenderSetId || !state.db?.renderSets) return null;
    const set = getRenderSetById(state.activeRenderSetId);
    return set?.name ?? null;
  }

  function updateRenderTileNamePanel(cur = null) {
    if (!renderDOM.tileNamePanel) return;

    const nameNode = qs(".mzt-render-tilebox-name", renderDOM.tileNamePanel);
    const label = getSelectedTileName() || getCurrentRenderSetName() || cur?.description || "—";

    if (nameNode) nameNode.textContent = label;

    requestAnimationFrame(() => {
      if (!renderDOM.tileNamePanel?.isConnected) return;
      renderDOM.mainWrap?.style.setProperty("--mzt-tilebox-h", `${Math.ceil(renderDOM.tileNamePanel.offsetHeight)}px`);
    });
  }


  function getCurrentRenderVariant() {
    const renders = state.activeRenders;
    if (!Array.isArray(renders) || renders.length === 0) return null;

    const r = getRenderByIndex(renders, state.activeThumbIndex);
    return pickVariant(r, state.renderGroutColor);
  }


  // синхронизирует UI выбора затирки ВЕЗДЕ: и на главном рендере, и в fullscreen
  function syncGroutUI() {
    const root = qs(`#${CONFIG.ROOT_ID}`);
    if (!root) return;

    // 1) инлайн-панель (на главном рендере)
    qsa('.mzt-grout-select-inline .mzt-grout-val', root).forEach((n) => {
      n.textContent = state.renderGroutColor;
    });
    qsa('.mzt-grout-select-inline .mzt-select-item', root).forEach((it) => {
      it.classList.toggle('is-active', it.getAttribute('data-value') === state.renderGroutColor);
    });

    // 2) fullscreen-панель (если она есть)
    const modal = qs('.mzt-fs', root);
    if (modal) {
      qsa('.mzt-grout-select-fs .mzt-grout-val', modal).forEach((n) => {
        n.textContent = state.renderGroutColor;
      });
      qsa('.mzt-grout-select-fs .mzt-select-item', modal).forEach((it) => {
        it.classList.toggle('is-active', it.getAttribute('data-value') === state.renderGroutColor);
      });

      // если fullscreen открыт — обновим картинку под текущий кадр + затирку
      if (modal.classList.contains('is-open')) {
        const img = qs('.mzt-fs-img', modal);
        const cur = getCurrentRenderVariant();
        if (img && cur) img.src = cur.image;
      }
    }
  }


/* ==========================================================================
     [12] Render block: большая + миниатюры, swap
     ========================================================================== */
  
  
function renderRenderBlock() {
  const main = qs("#mztRenderMain");
  const thumbs = qs("#mztRenderThumbs");
  if (!main || !thumbs) return;

  // Если пользователь ничего не выбрал и фильтры пустые — подсказка
  if (!state.selectedTileId && allFiltersAreBlank() && (!state.activeRenderSetId || state.activeRenders.length === 0)) {
    resetRenderDOM();
    main.innerHTML = "";
    thumbs.innerHTML = "";
    main.appendChild(el("div", { class: "mzt-empty", text: "Выберите значения для отображения." }));
    return;
  }

  if (!state.activeRenderSetId || state.activeRenders.length === 0) {
    resetRenderDOM();
    main.innerHTML = "";
    thumbs.innerHTML = "";
    main.appendChild(
      el("div", {
        class: "mzt-empty",
        text: state.selectedTileId
          ? "Для выбранной плитки пока нет хороших изображений, но мы постараемся сделать в самое короткое время!"
          : "Выберите плитку справа, чтобы увидеть рендеры дома."
      })
    );
    return;
  }

  if (!Array.isArray(state.activeRenders) || state.activeRenders.length === 0) {

    resetRenderDOM();
    main.innerHTML = "";
    thumbs.innerHTML = "";
    main.appendChild(el("div", { class: "mzt-empty", text: "Нет данных рендера." }));
    return;
  }

  // Собираем DOM один раз и дальше меняем только src (без пересборки)
  ensureRenderDOM();
  updateRenderImages();
}
/* ==========================================================================
     [13] РАЗДЕЛ ПОД ОБРАБОТКУ РАЗВОРАЧИВАНИЯ В ПОПАП ГЛАВНОГО РЕНДЕРА
     ========================================================================== */

function ensureFullscreenRenderModal() {
  const root = qs(`#${CONFIG.ROOT_ID}`);
  if (!root) return null;

  let modal = qs(".mzt-fs", root);
  if (modal) return modal;

  const closeSvg = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;

  modal = el("div", { class: "mzt-fs" });

  const inner = el("div", { class: "mzt-fs-inner" });
  const img = el("img", { class: "mzt-fs-img", alt: "fullscreen render" });

  const btn = el("button", {
    class: "mzt-fs-close",
    type: "button",
    html: `${closeSvg}<span>Закрыть</span>`
  });

  const info = el("div", { class: "mzt-fs-info", id: "mztFsInfo", text: "" });

  // панель выбора цвета затирки (fullscreen)
  const groutBox = el("div", { class: "mzt-fs-grout" }, [
    el("div", { class: "mzt-fs-grout-title", text: "Цвет затирки" }),
    (() => {
      const selBox = buildGroutCustomSelect("mzt-fs-grout-select", "mzt-grout-select-fs");
      return selBox;
    })()
  ]);
   
  // Закрытие по кнопке
  btn.addEventListener("click", () => {
    closeFullscreenRenderModal();
  });

// Закрытие по клику вне картинки, кнопки и инфо-плашки
modal.addEventListener("click", (e) => {
  const clickedOnImage = e.target.closest(".mzt-fs-img");
  const clickedOnClose = e.target.closest(".mzt-fs-close");
  const clickedOnInfo  = e.target.closest(".mzt-fs-info");
  const clickedOnGrout = e.target.closest(".mzt-fs-grout");

  if (!clickedOnImage && !clickedOnClose && !clickedOnInfo && !clickedOnGrout) {
    closeFullscreenRenderModal();
  }
});

  // Закрытие по ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeFullscreenRenderModal();
    }
  });

   modal.appendChild(info);
  modal.appendChild(groutBox);
  inner.appendChild(img);
  modal.appendChild(inner);
  modal.appendChild(btn);
  root.appendChild(modal);

  return modal;
}

   function openFullscreenRenderModal(src, tileName) {
  const modal = ensureFullscreenRenderModal();
  if (!modal) return;

  const img = qs(".mzt-fs-img", modal);
  const info = qs(".mzt-fs-info", modal);

  img.src = src;

  // текст инфо-плашки
  if (info) {
    const safeName = tileName || "—";
    info.innerHTML = `<span class="mzt-fs-info-label">Наименование плитки:</span><br>${escapeHtml(safeName)}`;
    info.classList.remove("is-show");
  }

  modal.classList.add("is-open");

  // синхронизируем селект затирки + картинку
  syncGroutUI();

  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";

  // показать плашку через 0.2 сек
  if (info) {
    void info.offsetWidth;

    setTimeout(() => {
      if (modal.classList.contains("is-open")) {
        info.classList.add("is-show");
      }
    }, 200);
  }
}

function closeFullscreenRenderModal() {
  const root = qs(`#${CONFIG.ROOT_ID}`);
  if (!root) return;

  const modal = qs(".mzt-fs", root);
  if (!modal) return;

  const info = qs(".mzt-fs-info", modal);
  if (info) info.classList.remove("is-show");

  modal.classList.remove("is-open");

  // важно: после закрытия попапа обновляем инлайн-селект (иначе может остаться старый текст)
  syncGroutUI();

  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
}
   
   function getSelectedTileName() {
  const id = state.selectedTileId;
  if (!id || !state.db?.tiles) return null;
  const t = state.db.tiles.find(x => x.id === id);
  return t?.name ?? null;
}
   
  /* ==========================================================================
     [14] Init
     ========================================================================== */
  async function init() {
    const root = qs(`#${CONFIG.ROOT_ID}`);
    if (!root) return;

    ensureMontserrat();
    injectStyles();
    buildLayout(root);

    showLoader();
    try {
      state.db = await loadDB();

      // базовые значения для сетки плиток (дальше setupTilesGridSizer подстроит под высоту)
      const ui = state.db?.ui || {};
      state.tilesCols = Number(ui.tiles_grid_cols || 3) || 3;
      state.tilesRows = Number(ui.tiles_grid_rows || 3) || 3;
      state.tilesPerPage = Number(ui.tiles_per_page || state.tilesCols * state.tilesRows) || 9;

      renderSelects();
      applyFiltersAndRenderTiles();
       setupTilesGridSizer();

  // сигнал внешнему loader.js: визуализатор готов
  qs(`#${CONFIG.ROOT_ID}`)?.setAttribute("data-ready", "1");
       
    } catch (e) {
      console.error(e);
      const main = qs("#mztRenderMain");
      if (main) {
        main.innerHTML = "";
        main.appendChild(
          el("div", {
            class: "mzt-empty",
            text: "Ошибка загрузки данных визуализатора. Проверьте доступность dbase.json и консоль браузера."
          })
        );
      }
    } finally {
      hideLoader();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
