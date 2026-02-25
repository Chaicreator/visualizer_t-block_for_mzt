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

const renderDOM = {
  mainWrap: null,
  mainImg: null,
  groutPanel: null,
  thumbsWrap: null,
  thumbs: [] // [{wrap, img}]
};

function resetRenderDOM() {
  renderDOM.mainWrap = null;
  renderDOM.mainImg = null;
  renderDOM.groutPanel = null;
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

  const mainImg = el("img", { src: "", alt: "render main", loading: "eager" });
  main.appendChild(mainImg);
  renderDOM.mainImg = mainImg;

  const groutPanel = renderGroutPanelInline();
  renderDOM.groutPanel = groutPanel;
  main.appendChild(groutPanel);

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
      syncFullscreenGroutUI();
    });

    thumbs.appendChild(wrap);
    renderDOM.thumbs.push({ wrap, img });
  }
}

function updateRenderImages() {
  if (!state.activeRenderSetId || !Array.isArray(state.activeRenderImages) || state.activeRenderImages.length === 0) return;

  ensureRenderDOM();
  if (!renderDOM.mainWrap || !renderDOM.mainImg) return;

  const groups = splitRenderGroups(state.activeRenderImages);
  if (!groups.length) return;

  state.activeThumbIndex = clamp(state.activeThumbIndex, 0, Math.min(5, groups.length - 1));

  const cur = pickByGrout(groups[state.activeThumbIndex], state.renderGroutColor) || (groups[0] && groups[0][0]);
  if (cur?.image) {
    setImgSrcWithLoader(renderDOM.mainWrap, renderDOM.mainImg, cur.image);
  }

  for (let i = 0; i < renderDOM.thumbs.length; i++) {
    const g = groups[i];
    const v = g ? (pickByGrout(g, state.renderGroutColor) || g[0]) : null;
    const item = renderDOM.thumbs[i];

    item.wrap.classList.toggle("is-active", i === state.activeThumbIndex);

    if (v?.image) {
      setImgSrcWithLoader(item.wrap, item.img, v.image);
    } else {
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
    activeRenderImages: [],

    // левый блок: выбранный цвет затирки (для рендеров)
    renderGroutColor: "Белый",
    // какой из 6 кадров сейчас выбран (0..5)
    activeThumbIndex: 0
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
  background: #f3f4f6;
}
#${CONFIG.ROOT_ID} .mzt-stage{
  height: min(${CONFIG.TARGET_DESKTOP_HEIGHT}px, calc(100vh - 170px));

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
  padding:16px;
  gap:14px;
}
#${CONFIG.ROOT_ID} .mzt-render-main{
  position:relative;
  flex:1;
  border-radius:14px;
  overflow:hidden;
  background:#eaecef;
}
#${CONFIG.ROOT_ID} .mzt-render-main img{
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
  grid-template-columns: repeat(6, 1fr); /* 7 рендеров: 1 главный + 6 миниатюр */
  gap:10px;
  overflow:hidden;   /* НИКАКОЙ прокрутки */
  padding-bottom:2px;
}
#${CONFIG.ROOT_ID} .mzt-thumb{
  width: 100%;
  aspect-ratio: 16/10;
  border-radius:12px;
  overflow:hidden;
  background:#eaecef;
  border:2px solid transparent;
  cursor:pointer;
}
#${CONFIG.ROOT_ID} .mzt-thumb img{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
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
  grid-auto-rows: var(--mzt-tile-size, 120px);
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
  #${CONFIG.ROOT_ID} #visrender{ flex: none; min-height: 420px; }
  #${CONFIG.ROOT_ID} #vispanel{ flex: none; }
  #${CONFIG.ROOT_ID} .mzt-thumb{ width: 100%; }
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

  function recalc() {
// Считаем по РЕАЛЬНО доступной зоне именно под сетку (tilesWrap)
const tilesWrap = qs("#mztTilesWrap", root);
if (!tilesWrap) return;

const pagH = pag ? pag.getBoundingClientRect().height : 0;

// доступная ширина/высота под 3×3 (без padding'ов)
const w = tilesWrap.clientWidth;
const h = tilesWrap.clientHeight;

if (w <= 0 || h <= 0) return;

// 3 плитки + 2 промежутка (gap) по каждой оси
const sizeByW = Math.floor((w - GAP * 2) / 3);
const sizeByH = Math.floor((h - GAP * 2) / 3);

// страховка от субпикселей/округления, чтобы НИКОГДА не подрезало низ
const SAFE = 2;

const tileSize = Math.max(64, Math.min(sizeByW, sizeByH) - SAFE);

root.style.setProperty("--mzt-tile-size", `${tileSize}px`);
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
    state.activeRenderImages = set ? (set.images || []) : [];
  } else {
    state.activeRenderSetId = null;
    state.activeRenderImages = [];
  }

  // На дефолтном экране ничего не "выбрано"
  state.selectedTileId = null;
  state.page = 1;

  renderTilesPage({ mode: state.filteredTiles.length ? "normal" : "no_matches" });
  renderPagination({ forceSingle: true }); // 9 плиток без пагинации
  renderRenderBlock();
  return;
}

    state.filteredTiles = state.db.tiles.filter(tileMatchesFilters);
    renderTilesPage({ mode: state.filteredTiles.length ? "normal" : "no_matches" });
    renderPagination();
  }

  function renderTilesPage({ mode }) {
    const grid = qs("#mztTilesGrid");
    const wrap = qs("#mztTilesWrap");
    grid.innerHTML = "";

    // чистим overlay
    const oldOverlay = qs(".mzt-grid-overlay", wrap);
    if (oldOverlay) oldOverlay.remove();

    const perPage = state.db.ui?.tiles_per_page ?? 9;
    const total = state.filteredTiles.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    state.page = clamp(state.page, 1, pages);

    // всегда рисуем 9 плейсхолдеров (еле видные серые блоки)
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

    // добиваем до 9
    for (let i = pageItems.length; i < perPage; i++) {
      grid.appendChild(el("div", { class: "mzt-tile is-empty" }));
    }
  }

  function renderPagination({ forceSingle } = {}) {
    const wrap = qs("#mztPagination");
    wrap.innerHTML = "";

    const perPage = state.db.ui?.tiles_per_page ?? 9;
    const total = state.filteredTiles.length;
    const pages = Math.max(1, Math.ceil(total / perPage));

    if (forceSingle || total === 0) {
      wrap.appendChild(el("button", { class: "mzt-pagebtn is-active", text: "1", type: "button" }));
      return;
    }

    for (let p = 1; p <= pages; p++) {
      const btn = el("button", { class: "mzt-pagebtn" + (p === state.page ? " is-active" : ""), text: String(p), type: "button" });
      btn.addEventListener("click", () => {
        state.page = p;
        renderTilesPage({ mode: "normal" });
        renderPagination();
      });
      wrap.appendChild(btn);
    }
  }

  /* ==========================================================================
     [11] Клик по плитке -> привязка -> рендеры
     ========================================================================== */
  function getRenderSetById(id) {
    return state.db.renderSets.find((r) => r.id === id) || null;
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
    state.activeRenderImages = [];
    renderRenderBlock();
    return;
  }

  const set = getRenderSetById(renderSetId);
  if (!set) {
    state.activeRenderImages = [];
    renderRenderBlock();
    return;
  }

  // ВАЖНО: НЕ показываем глобальный лоадер на всю страницу.
  // Просто обновляем нужные <img> (main + 6 миниатюр), а лоадер — только внутри их ячеек.
  state.activeRenderImages = set.images || [];
  renderRenderBlock();

  // тихо подогреем кеш (7 картинок), чтобы дальше переключения были мгновенные
  try {
    const groups = splitRenderGroups(state.activeRenderImages);
    const urls = [];
    for (let i = 0; i < Math.min(6, groups.length); i++) {
      const v = pickByGrout(groups[i], state.renderGroutColor) || groups[i][0];
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


  function splitRenderGroups(images) {
    if (!Array.isArray(images) || images.length === 0) return [];
    // ожидаем порядок: 5 подряд на один кадр
    if (images.length >= 30) {
      const groups = [];
      for (let i = 0; i < 6; i++) groups.push(images.slice(i * 5, i * 5 + 5));
      return groups;
    }
    // fallback: группируем по image url
    const map = new Map();
    images.forEach((it) => {
      const key = it.image || it.id || JSON.stringify(it);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    });
    return Array.from(map.values()).slice(0, 6);
  }

  function pickByGrout(group, groutColor) {
    if (!Array.isArray(group) || group.length === 0) return null;
    return group.find((x) => x.grout_color === groutColor) || group[0];
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
        syncFullscreenGroutUI();
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


  function getCurrentRenderVariant() {
    const groups = splitRenderGroups(state.activeRenderImages);
    if (!groups.length) return null;
    const idx = clamp(state.activeThumbIndex, 0, groups.length - 1);
    return pickByGrout(groups[idx], state.renderGroutColor);
  }

  
  function syncFullscreenGroutUI() {
    const root = qs(`#${CONFIG.ROOT_ID}`);
    if (!root) return;
    const modal = qs(".mzt-fs", root);
    if (!modal) return;

    // обновляем UI кастом-селекта в fullscreen
    const valSpan = qs(".mzt-fs-grout .mzt-grout-val", modal);
    if (valSpan) valSpan.textContent = state.renderGroutColor;

    const list = qs(".mzt-fs-grout .mzt-select-list", modal);
    if (list) {
      qsa(".mzt-select-item", list).forEach((it) => {
        it.classList.toggle("is-active", it.getAttribute("data-value") === state.renderGroutColor);
      });
    }

    if (modal.classList.contains("is-open")) {
      const img = qs(".mzt-fs-img", modal);
      const cur = getCurrentRenderVariant();
      if (img && cur) img.src = cur.image;
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
  if (!state.selectedTileId && allFiltersAreBlank() && (!state.activeRenderSetId || state.activeRenderImages.length === 0)) {
    resetRenderDOM();
    main.innerHTML = "";
    thumbs.innerHTML = "";
    main.appendChild(el("div", { class: "mzt-empty", text: "Выберите значения для отображения." }));
    return;
  }

  if (!state.activeRenderSetId || state.activeRenderImages.length === 0) {
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

  const groups = splitRenderGroups(state.activeRenderImages);
  if (!groups.length) {
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
  syncFullscreenGroutUI();

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

