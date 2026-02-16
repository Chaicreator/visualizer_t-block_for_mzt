/* ==========================================================================
   MZT Visualizer (Tilda custom block) — vis.js (UPDATED)
   - Контейнер: <div id="cusvis"></div>
   - Данные: https://chaicreator.github.io/visualizer_t-block_for_mzt/dbase.json
   - Кастомные dropdown'ы + fade-in без лишнего усложнения
   ========================================================================== */

(() => {
  "use strict";

  /* ==========================================================================
     [1] CONFIG
     ========================================================================== */
  const CONFIG = {
    DB_URL: "https://chaicreator.github.io/visualizer_t-block_for_mzt/dbase.json",
    ROOT_ID: "cusvis",

    // stage ratio (пропорционально ужимается; на десктопе 1920x1600)
    ASPECT_W: 1920,
    ASPECT_H: 1600,

    // max width of visualizer content
    MAX_WIDTH: 1920,

    // behavior
    FADE_MS: 240
  };

  /* ==========================================================================
     [2] UTILS
     ========================================================================== */
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return node;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function debounce(fn, ms = 0) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
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

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /* ==========================================================================
     [3] STATE
     ========================================================================== */
  const state = {
    db: null,
    filters: {
      tile_color: "---",
      grout_color: "---",
      price_category: "---"
    },

    filteredTiles: [],
    page: 1,

    selectedTileId: null,
    activeRenderSetId: null,
    activeRenderImages: [],

    dropdownOpenKey: null
  };

  /* ==========================================================================
     [4] CSS (single injected block)
     ========================================================================== */
  function injectStyles() {
    const css = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&display=swap');

#${CONFIG.ROOT_ID}{
  box-sizing:border-box;
  width:100%;
  font-family:'Montserrat', sans-serif;
}
#${CONFIG.ROOT_ID} *{ box-sizing:border-box; }

/* ===================== WRAP / STAGE ===================== */
#${CONFIG.ROOT_ID} .mzt-stage-wrap{
  width:100%;
  display:flex;
  justify-content:center;
  padding:24px 16px 10px;
  background:#f3f4f6;
}
#${CONFIG.ROOT_ID} .mzt-stage{
  width:min(100%, ${CONFIG.MAX_WIDTH}px);
  aspect-ratio:${CONFIG.ASPECT_W}/${CONFIG.ASPECT_H};
  display:flex;
  gap:20px;
  align-items:stretch;
}

/* ===================== CARD ===================== */
#${CONFIG.ROOT_ID} .mzt-card{
  background:#fff;
  border-radius:16px;
  box-shadow:0 10px 30px rgba(0,0,0,.12);
  overflow:hidden;
}

/* ===================== LEFT: RENDER ===================== */
#${CONFIG.ROOT_ID} #visrender{
  flex:3;
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
  transform:translateZ(0);
  opacity:1;
  transition: opacity ${CONFIG.FADE_MS}ms ease;
}
#${CONFIG.ROOT_ID} .mzt-fade-out{ opacity:0 !important; }
#${CONFIG.ROOT_ID} .mzt-fade-in{ opacity:1 !important; }

#${CONFIG.ROOT_ID} .mzt-render-thumbs{
  display:flex;
  gap:10px;
  overflow:auto;
  padding-bottom:2px;
}
#${CONFIG.ROOT_ID} .mzt-thumb{
  flex:0 0 auto;
  width:160px;
  aspect-ratio:16/10;
  border-radius:12px;
  overflow:hidden;
  background:#eaecef;
  border:2px solid transparent;
  cursor:pointer;
  transition: transform .18s ease, border-color .18s ease;
}
#${CONFIG.ROOT_ID} .mzt-thumb:hover{ transform: translateY(-2px); }
#${CONFIG.ROOT_ID} .mzt-thumb img{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
}
#${CONFIG.ROOT_ID} .mzt-thumb.is-active{ border-color:#c5a27a; }

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
  flex:1;
  display:flex;
  flex-direction:column;
  padding:16px;
  gap:14px;
}
#${CONFIG.ROOT_ID} #vispanel-top{
  padding:10px 10px 2px;
}
#${CONFIG.ROOT_ID} .mzt-field{
  margin-bottom:12px;
}
#${CONFIG.ROOT_ID} .mzt-field .mzt-label{
  display:block;
  font-size:13px;
  color:#111827;
  margin:0 0 6px;
}

/* ===================== CUSTOM DROPDOWN ===================== */
#${CONFIG.ROOT_ID} .mzt-dd{
  position:relative;
  width:100%;
}
#${CONFIG.ROOT_ID} .mzt-dd-btn{
  width:100%;
  height:42px;
  border-radius:14px;
  border:1px solid rgba(0,0,0,.12);
  padding:0 44px 0 12px;
  background:#fff;
  font-size:14px;
  color:#111827;
  display:flex;
  align-items:center;
  justify-content:space-between;
  cursor:pointer;
  transition: border-color .22s ease, box-shadow .22s ease, transform .18s ease;
  user-select:none;
}
#${CONFIG.ROOT_ID} .mzt-dd-btn:focus{
  outline:none;
  border-color:#c5a27a;
  box-shadow:0 0 0 3px rgba(197,162,122,.22);
}
#${CONFIG.ROOT_ID} .mzt-dd.is-open .mzt-dd-btn{
  border-color:#c5a27a;
}
#${CONFIG.ROOT_ID} .mzt-dd-caret{
  position:absolute;
  right:16px;
  top:50%;
  transform: translateY(-45%);
  width:14px;
  height:14px;
  pointer-events:none;
  opacity:.9;
  transition: transform .22s ease;
}
#${CONFIG.ROOT_ID} .mzt-dd.is-open .mzt-dd-caret{
  transform: translateY(-45%) rotate(180deg);
}

#${CONFIG.ROOT_ID} .mzt-dd-menu{
  position:absolute;
  left:0;
  right:0;
  top:calc(100% + 8px);
  background:#fff;
  border:1px solid rgba(0,0,0,.12);
  border-radius:14px;
  box-shadow:0 16px 40px rgba(0,0,0,.14);
  overflow:hidden;
  max-height:0;
  opacity:0;
  transform: translateY(-6px);
  transition: max-height .24s ease, opacity .18s ease, transform .24s ease;
  z-index:30;
}
#${CONFIG.ROOT_ID} .mzt-dd.is-open .mzt-dd-menu{
  max-height:260px;
  opacity:1;
  transform: translateY(0);
}
#${CONFIG.ROOT_ID} .mzt-dd-item{
  padding:10px 12px;
  font-size:14px;
  cursor:pointer;
  color:#111827;
  transition: background .14s ease;
}
#${CONFIG.ROOT_ID} .mzt-dd-item:hover{ background:#f3f4f6; }
#${CONFIG.ROOT_ID} .mzt-dd-item.is-selected{
  background: rgba(197,162,122,.16);
}

/* ===================== TILES GRID ===================== */
#${CONFIG.ROOT_ID} #vispanel-bot{
  flex:1;
  display:flex;
  flex-direction:column;
  gap:10px;
  padding:8px 8px 10px;
}
#${CONFIG.ROOT_ID} .mzt-tiles-grid{
  position:relative;
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:10px;
  flex:1;
}
#${CONFIG.ROOT_ID} .mzt-tile{
  border-radius:14px;
  overflow:hidden;
  background:#eaecef;
  cursor:pointer;
  border:2px solid transparent;
  transition: transform .18s ease, border-color .18s ease, opacity .18s ease;
}
#${CONFIG.ROOT_ID} .mzt-tile:hover{ transform: translateY(-2px); }
#${CONFIG.ROOT_ID} .mzt-tile img{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
}
#${CONFIG.ROOT_ID} .mzt-tile.is-selected{ border-color:#c5a27a; }

#${CONFIG.ROOT_ID} .mzt-tile.is-empty{
  background:#e5e7eb;
  opacity:.35;
  cursor:default;
}
#${CONFIG.ROOT_ID} .mzt-tile.is-empty:hover{ transform:none; }

#${CONFIG.ROOT_ID} .mzt-overlay-message{
  position:absolute;
  inset:0;
  display:flex;
  align-items:center;
  justify-content:center;
  text-align:center;
  padding:20px;
  font-size:14px;
  font-weight:500;
  color:#374151;
  pointer-events:none;
}

/* ===================== PAGINATION ===================== */
#${CONFIG.ROOT_ID} .mzt-pagination{
  display:flex;
  gap:8px;
  justify-content:center;
  align-items:center;
  padding-top:2px;
}
#${CONFIG.ROOT_ID} .mzt-pagebtn{
  min-width:34px;
  height:34px;
  border-radius:999px;
  border:1px solid rgba(0,0,0,.14);
  background:#fff;
  cursor:pointer;
  font-size:13px;
  transition: transform .16s ease, box-shadow .18s ease, border-color .18s ease;
}
#${CONFIG.ROOT_ID} .mzt-pagebtn:hover{ transform: translateY(-1px); }
#${CONFIG.ROOT_ID} .mzt-pagebtn.is-active{
  border-color:#c5a27a;
  box-shadow:0 0 0 3px rgba(197,162,122,.18);
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
@keyframes mztspin{ to { transform: rotate(360deg); } }

/* ===================== CTA BUTTON ===================== */
#${CONFIG.ROOT_ID} .mzt-cta-wrap{
  width:100%;
  display:flex;
  justify-content:center;
  padding:22px 16px 44px;
  background:#f3f4f6;
}
#${CONFIG.ROOT_ID} .mzt-cta-btn{
  background:#c5a27a;
  color:#fff;
  border:none;
  padding:18px 48px;
  border-radius:999px;
  font-size:16px;
  font-weight:600;
  cursor:pointer;
  transition: transform .22s ease, box-shadow .28s ease, filter .18s ease;
}
#${CONFIG.ROOT_ID} .mzt-cta-btn:hover{
  transform: translateY(-3px);
  box-shadow:0 10px 25px rgba(0,0,0,.15);
}
#${CONFIG.ROOT_ID} .mzt-cta-btn:active{
  transform: translateY(-1px);
  filter: brightness(.98);
}

/* ===================== RESPONSIVE ===================== */
@media (max-width: 980px){
  #${CONFIG.ROOT_ID} .mzt-stage{
    aspect-ratio:auto;
    flex-direction:column;
  }
  #${CONFIG.ROOT_ID} #visrender{ flex:none; min-height:420px; }
  #${CONFIG.ROOT_ID} #vispanel{ flex:none; }
  #${CONFIG.ROOT_ID} .mzt-thumb{ width:140px; }
}
@media (max-width: 520px){
  #${CONFIG.ROOT_ID} .mzt-stage-wrap{ padding:16px 10px 8px; }
  #${CONFIG.ROOT_ID} #visrender{ padding:12px; }
  #${CONFIG.ROOT_ID} #vispanel{ padding:12px; }

  /* мобильная раскладка фильтров в строку */
  #${CONFIG.ROOT_ID} #vispanel-top{
    display:flex;
    gap:10px;
    overflow:auto;
    padding:6px 6px 2px;
  }
  #${CONFIG.ROOT_ID} .mzt-field{
    min-width: 220px;
    margin-bottom:0;
  }
  #${CONFIG.ROOT_ID} .mzt-dd-menu{
    position:fixed;
    left:12px;
    right:12px;
    top:auto;
    bottom:12px;
    max-height:0;
  }
  #${CONFIG.ROOT_ID} .mzt-dd.is-open .mzt-dd-menu{
    max-height: 55vh;
  }
}
`;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ==========================================================================
     [5] BUILD LAYOUT
     ========================================================================== */
  function buildLayout(root) {
    root.innerHTML = "";

    const stageWrap = el("div", { class: "mzt-stage-wrap" });
    const stage = el("div", { class: "mzt-stage" });

    const left = el("div", { id: "visrender", class: "mzt-card" });
    const right = el("div", { id: "vispanel", class: "mzt-card" });

    // render block
    const main = el("div", { class: "mzt-render-main", id: "mztRenderMain" });
    const thumbs = el("div", { class: "mzt-render-thumbs", id: "mztRenderThumbs" });
    main.appendChild(
      el("div", { class: "mzt-empty", id: "mztRenderEmpty", text: "Выберите значения справа, затем плитку, чтобы увидеть рендеры дома." })
    );
    left.appendChild(main);
    left.appendChild(thumbs);

    // panel block
    const top = el("div", { id: "vispanel-top" });
    const bot = el("div", { id: "vispanel-bot" });
    const grid = el("div", { class: "mzt-tiles-grid", id: "mztTilesGrid" });
    const pagination = el("div", { class: "mzt-pagination", id: "mztPagination" });
    bot.appendChild(grid);
    bot.appendChild(pagination);

    right.appendChild(top);
    right.appendChild(bot);

    stage.appendChild(left);
    stage.appendChild(right);
    stageWrap.appendChild(stage);
    root.appendChild(stageWrap);

    /* ==========================================================================
       [SECTION: BOTTOM CTA BUTTON]
       Этот раздел — заготовка под кнопку внизу.
       Можно полностью закомментировать весь блок ниже без вреда для скрипта.
       ========================================================================== */
    const ctaWrap = el("div", { class: "mzt-cta-wrap", id: "mztCtaWrap" });
    const ctaBtn = el("button", {
      class: "mzt-cta-btn",
      id: "mztCtaBtn",
      type: "button",
      text: "ПОЛУЧИТЬ РАСЧЁТ СТОИМОСТИ"
    });
    // действие пока не задано (пустая кнопка)
    ctaWrap.appendChild(ctaBtn);
    root.appendChild(ctaWrap);
  }

  /* ==========================================================================
     [6] LOADER
     ========================================================================== */
  function showLoader() {
    if (qs(".mzt-loader")) return;
    document.body.appendChild(el("div", { class: "mzt-loader", id: "mztLoader" }, [el("div", { class: "mzt-spinner" })]));
  }
  function hideLoader() {
    const l = qs("#mztLoader");
    if (l) l.remove();
  }

  /* ==========================================================================
     [7] LOAD DB
     ========================================================================== */
  async function loadDB() {
    const res = await fetch(CONFIG.DB_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`DB fetch error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  /* ==========================================================================
     [8] CUSTOM DROPDOWN (minimal)
     - Close on outside click / ESC
     ========================================================================== */
  function closeAllDropdowns() {
    qsa(".mzt-dd.is-open", qs(`#${CONFIG.ROOT_ID}`)).forEach((d) => d.classList.remove("is-open"));
    state.dropdownOpenKey = null;
  }

  function makeDropdown({ key, label, values }) {
    const wrapper = el("div", { class: "mzt-field" });
    wrapper.appendChild(el("div", { class: "mzt-label", text: label }));

    const dd = el("div", { class: "mzt-dd", "data-key": key });

    const btn = el("button", {
      class: "mzt-dd-btn",
      type: "button",
      "aria-haspopup": "listbox",
      "aria-expanded": "false"
    });
    const valSpan = el("span", { class: "mzt-dd-value", text: state.filters[key] ?? "---" });
    btn.appendChild(valSpan);

    const caret = el("span", {
      class: "mzt-dd-caret",
      html:
        "<svg width='14' height='14' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M5 7L10 12L15 7' stroke='#6b7280' stroke-width='2'/></svg>"
    });

    const menu = el("div", { class: "mzt-dd-menu", role: "listbox" });

    const rebuildItems = () => {
      menu.innerHTML = "";
      values.forEach((v) => {
        const item = el("div", {
          class: "mzt-dd-item" + (state.filters[key] === v ? " is-selected" : ""),
          role: "option",
          "data-value": v,
          text: v
        });
        item.addEventListener("click", () => {
          state.filters[key] = v;
          valSpan.textContent = v;
          closeAllDropdowns();
          state.page = 1;
          applyFiltersAndRenderTiles();
        });
        menu.appendChild(item);
      });
    };

    rebuildItems();

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = dd.classList.contains("is-open");
      closeAllDropdowns();
      if (!isOpen) {
        dd.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
        state.dropdownOpenKey = key;
        // refresh selection highlight
        rebuildItems();
      } else {
        btn.setAttribute("aria-expanded", "false");
      }
    });

    dd.appendChild(btn);
    dd.appendChild(caret);
    dd.appendChild(menu);

    wrapper.appendChild(dd);
    return wrapper;
  }

  function bindGlobalDropdownHandlers() {
    document.addEventListener("click", () => closeAllDropdowns());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllDropdowns();
    });
  }

  /* ==========================================================================
     [9] RENDER FILTERS (dropdowns)
     ========================================================================== */
  function renderSelects() {
    const top = qs("#vispanel-top");
    top.innerHTML = "";

    const { selects } = state.db;
    top.appendChild(makeDropdown({ key: "tile_color", label: selects.tile_color.label, values: selects.tile_color.values }));
    top.appendChild(makeDropdown({ key: "grout_color", label: selects.grout_color.label, values: selects.grout_color.values }));
    top.appendChild(makeDropdown({ key: "price_category", label: selects.price_category.label, values: selects.price_category.values }));
  }

  /* ==========================================================================
     [10] FILTERING + TILES + PAGINATION + OVERLAYS
     ========================================================================== */
  function allFiltersDefault() {
    return (
      state.filters.tile_color === "---" &&
      state.filters.grout_color === "---" &&
      state.filters.price_category === "---"
    );
  }

  function tileMatchesFilters(tile) {
    const f = state.filters;
    const okColor = f.tile_color === "---" || tile.tile_color === f.tile_color;
    const okGrout = f.grout_color === "---" || tile.grout_color === f.grout_color;
    const okPrice = f.price_category === "---" || tile.price_category === f.price_category;
    return okColor && okGrout && okPrice;
  }

  function applyFiltersAndRenderTiles() {
    if (allFiltersDefault()) {
      state.filteredTiles = [];
      renderTilesPage("default");
      renderPagination();
      // рендер слева не трогаем (пусть остаётся как есть)
      return;
    }

    state.filteredTiles = state.db.tiles.filter(tileMatchesFilters);
    renderTilesPage("normal");
    renderPagination();
  }

  function renderTilesPage(mode = "normal") {
    const grid = qs("#mztTilesGrid");
    grid.innerHTML = "";

    const perPage = state.db.ui?.tiles_per_page ?? 9;
    const total = state.filteredTiles.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    state.page = clamp(state.page, 1, pages);

    // helper: grey placeholders
    const fillEmptySlots = () => {
      for (let i = 0; i < perPage; i++) {
        grid.appendChild(el("div", { class: "mzt-tile is-empty" }));
      }
    };

    if (mode === "default") {
      fillEmptySlots();
      grid.appendChild(el("div", { class: "mzt-overlay-message", text: "Выберите значения для отображения" }));
      return;
    }

    const start = (state.page - 1) * perPage;
    const pageItems = state.filteredTiles.slice(start, start + perPage);

    if (pageItems.length === 0) {
      fillEmptySlots();
      grid.appendChild(el("div", { class: "mzt-overlay-message", text: "По выбранным параметрам совпадений не найдено" }));
      return;
    }

    pageItems.forEach((t) => {
      const card = el("div", { class: "mzt-tile" + (state.selectedTileId === t.id ? " is-selected" : "") });
      card.appendChild(el("img", { src: t.image, alt: t.name, loading: "lazy" }));
      card.addEventListener("click", () => onTileClick(t.id));
      grid.appendChild(card);
    });

    // pad to 9 without text
    for (let i = pageItems.length; i < perPage; i++) {
      grid.appendChild(el("div", { class: "mzt-tile is-empty" }));
    }
  }

  function renderPagination() {
    const wrap = qs("#mztPagination");
    wrap.innerHTML = "";

    const perPage = state.db.ui?.tiles_per_page ?? 9;
    const total = state.filteredTiles.length;
    const pages = Math.max(1, Math.ceil(total / perPage));

    // если дефолтные фильтры — пагинацию можно скрыть (или оставить "1")
    if (allFiltersDefault()) {
      const btn = el("button", { class: "mzt-pagebtn is-active", text: "1", type: "button" });
      wrap.appendChild(btn);
      return;
    }

    if (total === 0) {
      const btn = el("button", { class: "mzt-pagebtn is-active", text: "1", type: "button" });
      wrap.appendChild(btn);
      return;
    }

    for (let p = 1; p <= pages; p++) {
      const btn = el("button", {
        class: "mzt-pagebtn" + (p === state.page ? " is-active" : ""),
        text: String(p),
        type: "button"
      });
      btn.addEventListener("click", () => {
        state.page = p;
        renderTilesPage("normal");
        renderPagination();
      });
      wrap.appendChild(btn);
    }
  }

  /* ==========================================================================
     [11] BINDINGS / RENDER SETS
     ========================================================================== */
  function getRenderSetById(id) {
    return state.db.renderSets.find((r) => r.id === id) || null;
  }

  function getBoundRenderSetId(tileId) {
    const b = state.db.bindings.find((x) => x.tile_id === tileId);
    return b ? b.render_set_id : null;
  }

  async function fadeSwapMainImage(newSrc) {
    const main = qs("#mztRenderMain");
    const img = qs("img", main);
    if (!img) return;

    // fade out
    img.classList.add("mzt-fade-out");
    await wait(CONFIG.FADE_MS);

    // swap src
    img.src = newSrc;

    // ensure fade in after load (safe)
    img.onload = () => {
      img.classList.remove("mzt-fade-out");
      img.classList.add("mzt-fade-in");
      // cleanup
      setTimeout(() => img.classList.remove("mzt-fade-in"), CONFIG.FADE_MS + 30);
    };
  }

  async function onTileClick(tileId) {
    state.selectedTileId = tileId;
    renderTilesPage("normal"); // refresh highlight

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

    showLoader();
    await preloadImages(set.images.map((x) => x.image));
    hideLoader();

    state.activeRenderImages = set.images.map((x) => x.image);
    renderRenderBlock();
  }

  /* ==========================================================================
     [12] RENDER BLOCK (left)
     ========================================================================== */
  function renderRenderBlock() {
    const main = qs("#mztRenderMain");
    const thumbs = qs("#mztRenderThumbs");

    main.innerHTML = "";
    thumbs.innerHTML = "";

    if (!state.activeRenderSetId || state.activeRenderImages.length === 0) {
      const msg = state.selectedTileId
        ? "Для выбранной плитки пока нет хороших изображений, но мы постараемся сделать в самое короткое время!"
        : "Выберите значения справа, затем плитку, чтобы увидеть рендеры дома.";
      main.appendChild(el("div", { class: "mzt-empty", text: msg }));
      return;
    }

    // main image
    main.appendChild(el("img", { src: state.activeRenderImages[0], alt: "render main", loading: "eager" }));

    // thumbs
    state.activeRenderImages.forEach((src, idx) => {
      const t = el("div", { class: "mzt-thumb" + (idx === 0 ? " is-active" : "") });
      t.appendChild(el("img", { src, alt: `thumb ${idx + 1}`, loading: "lazy" }));

      t.addEventListener("click", async () => {
        if (idx === 0) return;

        // reorder images
        const next = [...state.activeRenderImages];
        const picked = next.splice(idx, 1)[0];
        next.unshift(picked);
        state.activeRenderImages = next;

        // update thumbs instantly
        renderThumbsOnly();

        // fade swap main image
        await fadeSwapMainImage(state.activeRenderImages[0]);
      });

      thumbs.appendChild(t);
    });

    function renderThumbsOnly() {
      thumbs.innerHTML = "";
      state.activeRenderImages.forEach((src, idx) => {
        const t = el("div", { class: "mzt-thumb" + (idx === 0 ? " is-active" : "") });
        t.appendChild(el("img", { src, alt: `thumb ${idx + 1}`, loading: "lazy" }));
        t.addEventListener("click", async () => {
          if (idx === 0) return;
          const next = [...state.activeRenderImages];
          const picked = next.splice(idx, 1)[0];
          next.unshift(picked);
          state.activeRenderImages = next;
          renderThumbsOnly();
          await fadeSwapMainImage(state.activeRenderImages[0]);
        });
        thumbs.appendChild(t);
      });
    }
  }

  /* ==========================================================================
     [13] INIT
     ========================================================================== */
  async function init() {
    const root = qs(`#${CONFIG.ROOT_ID}`);
    if (!root) return;

    injectStyles();
    buildLayout(root);
    bindGlobalDropdownHandlers();

    showLoader();
    try {
      state.db = await loadDB();

      renderSelects();
      applyFiltersAndRenderTiles();
      renderRenderBlock();
    } catch (e) {
      console.error(e);
      const main = qs("#mztRenderMain");
      if (main) {
        main.innerHTML = "";
        main.appendChild(
          el("div", { class: "mzt-empty", text: "Ошибка загрузки данных визуализатора. Проверьте доступность dbase.json и консоль браузера." })
        );
      }
    } finally {
      hideLoader();
    }
  }

  document.addEventListener("DOMContentLoaded", init);

  // Safety: если Tilda вставляет с задержкой
  window.addEventListener("load", debounce(() => {
    const root = qs(`#${CONFIG.ROOT_ID}`);
    if (root && !qs(".mzt-stage", root)) init();
  }, 100));
})();
