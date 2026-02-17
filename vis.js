/* ==========================================================================
   MZT Visualizer (Tilda custom block)
   ========================================================================== */

(() => {
  "use strict";

  /* ==========================================================================
     [1] Конфиг
     ========================================================================== */
  const CONFIG = {
    DB_URL: "https://chaicreator.github.io/visualizer_t-block_for_mzt/dbase.json",
    ROOT_ID: "cusvis",
    MAX_WIDTH: 1920,

    // Основной визуализатор фиксированной высоты 900px (на десктопе)
    STAGE_HEIGHT_DESKTOP: 900
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
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    children.forEach((c) => node.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return node;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
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

  /* ==========================================================================
     [3] Состояние
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

    // режим плиток: "default" (все ---), "empty" (нет совпадений), "normal"
    tilesMode: "default"
  };

  function isAllDefaultFilters() {
    return (
      state.filters.tile_color === "---" &&
      state.filters.grout_color === "---" &&
      state.filters.price_category === "---"
    );
  }

  /* ==========================================================================
     [4] CSS (в отдельном блоке)
     ========================================================================== */
  function injectStyles() {
    const css = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&display=swap');

/* ===================== ROOT ===================== */
#${CONFIG.ROOT_ID}{
  box-sizing:border-box;
  width:100%;
  font-family: 'Montserrat', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}
#${CONFIG.ROOT_ID} *{ box-sizing:border-box; }

/* ===================== STAGE (фикс высота 900px на десктопе) ===================== */
#${CONFIG.ROOT_ID} .mzt-stage-wrap{
  width:100%;
  display:flex;
  justify-content:center;
  padding:24px 16px;
  background: #f3f4f6;
}
#${CONFIG.ROOT_ID} .mzt-stage{
  width: min(100%, ${CONFIG.MAX_WIDTH}px);
  height: ${CONFIG.STAGE_HEIGHT_DESKTOP}px;      /* ВАЖНО: фикс высота */
  display:flex;
  gap:20px;
  align-items:stretch;
}

/* ===================== CARDS ===================== */
#${CONFIG.ROOT_ID} .mzt-card{
  background:#ffffff;
  border-radius:16px;
  box-shadow: 0 10px 30px rgba(0,0,0,.12);
  overflow:hidden;
}

/* ===================== LEFT: RENDER ===================== */
#${CONFIG.ROOT_ID} #visrender{
  flex: 3;
  display:flex;
  flex-direction:column;
  padding:16px;
  gap:14px;
  min-width:0;
}

/* Главная картинка занимает всё оставшееся место */
#${CONFIG.ROOT_ID} .mzt-render-main{
  position:relative;
  flex: 1 1 auto;
  border-radius:14px;
  overflow:hidden;
  background:#eaecef;
  min-height:0;
}
#${CONFIG.ROOT_ID} .mzt-render-main img{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
}

/* ВНИЗУ: 7 миниатюр без прокрутки, равномерно по ширине */
#${CONFIG.ROOT_ID} .mzt-render-thumbs{
  flex: 0 0 auto;
  display:flex;
  gap:10px;
  overflow:hidden; /* ВАЖНО: убрали прокрутку */
}
#${CONFIG.ROOT_ID} .mzt-thumb{
  flex: 1 1 0;           /* равномерное распределение */
  width: auto;           /* не фиксируем */
  aspect-ratio: 16/10;   /* эстетично, но без скролла */
  border-radius:12px;
  overflow:hidden;
  background:#eaecef;
  border:2px solid transparent;
  cursor:pointer;
  min-width: 0;          /* чтобы реально ужималось */
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

/* empty state */
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
  flex: 1;
  display:flex;
  flex-direction:column;
  padding:16px;
  gap:14px;
  min-width:0;
}
#${CONFIG.ROOT_ID} #vispanel-top{
  padding:10px 10px 2px;
}
#${CONFIG.ROOT_ID} .mzt-field{
  margin-bottom:12px;
}
#${CONFIG.ROOT_ID} .mzt-field label{
  display:block;
  font-size:13px;
  color:#111827;
  margin:0 0 6px;
}

/* Select: скругление + кастом-стрелка + микро-анимации */
#${CONFIG.ROOT_ID} .mzt-field select{
  width:100%;
  height:40px;
  border-radius:14px;
  border:1px solid rgba(0,0,0,.12);
  padding:0 48px 0 12px;
  font-size:14px;
  background-color:#fff;
  outline:none;
  transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;

  appearance:none;
  -webkit-appearance:none;
  -moz-appearance:none;

  background-image: url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M5 7L10 12L15 7' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat;
  background-size:14px;
  background-position: right 18px calc(50% + 2px);
}
#${CONFIG.ROOT_ID} .mzt-field select:focus{
  border-color:#c5a27a;
  box-shadow: 0 0 0 3px rgba(197,162,122,.25);
  transform: translateY(-1px);
}

/* Нижний блок: плитка + пагинация */
#${CONFIG.ROOT_ID} #vispanel-bot{
  flex:1;
  display:flex;
  flex-direction:column;
  gap:10px;
  padding:8px 8px 10px;
  min-height:0;
}

/* Сетка 3x3. КАЖДАЯ ЯЧЕЙКА СТРОГО 1:1 */
#${CONFIG.ROOT_ID} .mzt-tiles-grid{
  position:relative;
  display:grid;
  grid-template-columns: repeat(3, 1fr);
  gap:10px;
  flex:1;
  min-height:0;
}

/* Плитка: фиксируем квадрат */
#${CONFIG.ROOT_ID} .mzt-tile{
  aspect-ratio: 1 / 1;   /* ВАЖНО: 1:1 всегда */
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
#${CONFIG.ROOT_ID} .mzt-tile.is-empty{
  background:#d1d5db;
  opacity:.28;
  cursor:default;
}

/* Overlay message поверх grid */
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

/* pagination */
#${CONFIG.ROOT_ID} .mzt-pagination{
  flex: 0 0 auto;
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
}
#${CONFIG.ROOT_ID} .mzt-pagebtn.is-active{
  border-color:#c5a27a;
  box-shadow: 0 0 0 3px rgba(197,162,122,.22);
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

/* ===================== CTA BUTTON (ниже визуализатора) ===================== */
#${CONFIG.ROOT_ID} .mzt-cta-wrap{
  display:flex;
  justify-content:center;
  padding: 10px 16px 40px;
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
  transition: transform .25s ease, box-shadow .25s ease, filter .25s ease;
}
#${CONFIG.ROOT_ID} .mzt-cta-btn:hover{
  transform:translateY(-3px);
  box-shadow:0 10px 25px rgba(0,0,0,.15);
  filter: brightness(1.02);
}

/* ===================== RESPONSIVE ===================== */
@media (max-width: 980px){
  #${CONFIG.ROOT_ID} .mzt-stage{
    height: auto;            /* на моб/планшет — авто */
    flex-direction:column;
  }
  #${CONFIG.ROOT_ID} #visrender{ min-height: 420px; }
}
@media (max-width: 520px){
  #${CONFIG.ROOT_ID} .mzt-stage-wrap{ padding:16px 10px; }
  #${CONFIG.ROOT_ID} #visrender{ padding:12px; }
  #${CONFIG.ROOT_ID} #vispanel{ padding:12px; }

  /* На мобилке верх панели (селекты) — в горизонтальную раскладку */
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
}
`;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ==========================================================================
     [5] Разметка (создаём внутри #cusvis)
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

    main.appendChild(
      el("div", {
        class: "mzt-empty",
        id: "mztRenderEmpty",
        text: "Выберите плитку справа, чтобы увидеть рендеры дома."
      })
    );

    left.appendChild(main);
    left.appendChild(thumbs);

    // panel structure
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
       Этот блок можно полностью закомментировать/удалить без вреда для скрипта
       ========================================================================== */
    const ctaWrap = el("div", { class: "mzt-cta-wrap" });
    const ctaBtn = el("button", {
      class: "mzt-cta-btn",
      text: "ПОЛУЧИТЬ РАСЧЁТ СТОИМОСТИ",
      type: "button"
    });
    // Пока без экшена
    // ctaBtn.addEventListener("click", () => { ... });

    ctaWrap.appendChild(ctaBtn);
    root.appendChild(ctaWrap);
  }

  /* ==========================================================================
     [6] Loader
     ========================================================================== */
  function showLoader() {
    if (qs(".mzt-loader")) return;
    const loader = el("div", { class: "mzt-loader", id: "mztLoader" }, [
      el("div", { class: "mzt-spinner", "aria-label": "loading" })
    ]);
    document.body.appendChild(loader);
  }

  function hideLoader() {
    const loader = qs("#mztLoader");
    if (loader) loader.remove();
  }

  /* ==========================================================================
     [7] Данные: загрузка dbase.json
     ========================================================================== */
  async function loadDB() {
    const res = await fetch(CONFIG.DB_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Не удалось загрузить dbase.json: ${res.status}`);
    return res.json();
  }

  /* ==========================================================================
     [8] UI: Селекты
     ========================================================================== */
  function renderSelects() {
    const top = qs("#vispanel-top");
    top.innerHTML = "";

    const { selects } = state.db;

    const makeField = (key) => {
      const field = el("div", { class: "mzt-field" });
      const label = el("label", { for: `mztSel_${key}`, text: selects[key].label });
      const select = el("select", { id: `mztSel_${key}` });

      selects[key].values.forEach((v) => {
        const opt = el("option", { value: v, text: v });
        if (state.filters[key] === v) opt.selected = true;
        select.appendChild(opt);
      });

      select.addEventListener("change", () => {
        state.filters[key] = select.value;
        state.page = 1;
        applyFiltersAndRenderTiles();
      });

      field.appendChild(label);
      field.appendChild(select);
      return field;
    };

    top.appendChild(makeField("tile_color"));
    top.appendChild(makeField("grout_color"));
    top.appendChild(makeField("price_category"));
  }

  /* ==========================================================================
     [9] Фильтрация + Плитка (grid) + пагинация
     ========================================================================== */
  function tileMatchesFilters(tile) {
    const f = state.filters;

    const okColor = f.tile_color === "---" || tile.tile_color === f.tile_color;
    const okGrout = f.grout_color === "---" || tile.grout_color === f.grout_color;
    const okPrice = f.price_category === "---" || tile.price_category === f.price_category;

    return okColor && okGrout && okPrice;
  }

  function applyFiltersAndRenderTiles() {
    if (isAllDefaultFilters()) {
      state.tilesMode = "default";
      state.filteredTiles = [];
      state.page = 1;
      renderTilesPage();
      renderPagination();
      return;
    }

    state.filteredTiles = state.db.tiles.filter(tileMatchesFilters);

    if (state.filteredTiles.length === 0) state.tilesMode = "empty";
    else state.tilesMode = "normal";

    renderTilesPage();
    renderPagination();
  }

  function renderTilesPage() {
    const grid = qs("#mztTilesGrid");
    grid.innerHTML = "";

    const perPage = state.db.ui?.tiles_per_page ?? 9;

    // Сначала рисуем 9 одинаковых квадратных placeholder'ов
    for (let i = 0; i < perPage; i++) {
      grid.appendChild(el("div", { class: "mzt-tile is-empty" }));
    }

    if (state.tilesMode === "default") {
      grid.appendChild(el("div", { class: "mzt-overlay-message", text: "Выберите значения для отображения" }));
      return;
    }

    if (state.tilesMode === "empty") {
      grid.appendChild(el("div", { class: "mzt-overlay-message", text: "По выбранным параметрам совпадений не найдено" }));
      return;
    }

    // normal
    const total = state.filteredTiles.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    state.page = clamp(state.page, 1, pages);

    const start = (state.page - 1) * perPage;
    const pageItems = state.filteredTiles.slice(start, start + perPage);

    const cells = qsa(".mzt-tile", grid);

    pageItems.forEach((t, idx) => {
      const card = el("div", {
        class: "mzt-tile" + (state.selectedTileId === t.id ? " is-selected" : "")
      });

      const img = el("img", { src: t.image, alt: t.name, loading: "lazy" });
      card.appendChild(img);

      card.addEventListener("click", () => onTileClick(t.id));

      if (cells[idx]) cells[idx].replaceWith(card);
    });
  }

  function renderPagination() {
    const wrap = qs("#mztPagination");
    wrap.innerHTML = "";

    if (state.tilesMode !== "normal") {
      wrap.appendChild(el("button", { class: "mzt-pagebtn is-active", text: "1", type: "button" }));
      return;
    }

    const perPage = state.db.ui?.tiles_per_page ?? 9;
    const total = state.filteredTiles.length;
    const pages = Math.max(1, Math.ceil(total / perPage));

    for (let p = 1; p <= pages; p++) {
      const btn = el("button", {
        class: "mzt-pagebtn" + (p === state.page ? " is-active" : ""),
        text: String(p),
        type: "button"
      });

      btn.addEventListener("click", () => {
        state.page = p;
        renderTilesPage();
        renderPagination();
      });

      wrap.appendChild(btn);
    }
  }

  /* ==========================================================================
     [10] Клик по плитке -> найти привязку -> показать рендеры
     ========================================================================== */
  function getRenderSetById(id) {
    return state.db.renderSets.find((r) => r.id === id) || null;
  }

  function getBoundRenderSetId(tileId) {
    const b = state.db.bindings.find((x) => x.tile_id === tileId);
    return b ? b.render_set_id : null;
  }

  async function onTileClick(tileId) {
    state.selectedTileId = tileId;

    // подсветка выбранной плитки
    renderTilesPage();

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
     [11] Render block: большая + 7 миниатюр, swap
     ========================================================================== */
  function renderRenderBlock() {
    const main = qs("#mztRenderMain");
    const thumbs = qs("#mztRenderThumbs");

    main.innerHTML = "";
    thumbs.innerHTML = "";

    if (!state.activeRenderSetId || state.activeRenderImages.length === 0) {
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

    // main image = first
    const mainImg = el("img", { src: state.activeRenderImages[0], alt: "render main", loading: "eager" });
    main.appendChild(mainImg);

    // thumbs (ровно столько, сколько в массиве — у вас 7)
    state.activeRenderImages.forEach((src, idx) => {
      const t = el("div", { class: "mzt-thumb" + (idx === 0 ? " is-active" : "") });
      const img = el("img", { src, alt: `thumb ${idx + 1}`, loading: "lazy" });
      t.appendChild(img);

      t.addEventListener("click", () => {
        if (idx === 0) return;
        const next = [...state.activeRenderImages];
        const picked = next.splice(idx, 1)[0];
        next.unshift(picked);
        state.activeRenderImages = next;
        renderRenderBlock();
      });

      thumbs.appendChild(t);
    });
  }

  /* ==========================================================================
     [12] Init
     ========================================================================== */
  async function init() {
    const root = qs(`#${CONFIG.ROOT_ID}`);
    if (!root) return;

    injectStyles();
    buildLayout(root);

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
