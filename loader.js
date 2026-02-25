/* loader.js — оверлей загрузки поверх (isolated classnames) */
(() => {
  const ROOT_ID = "cusvis";
  const READY_ATTR = "data-ready";
  const READY_VAL = "1";
  const FADE_MS = 200;

// UX-настройки
const SHOW_DELAY_MS = 120;   // ждать перед показом (если загрузка быстрая — не покажем)
const MIN_SHOW_MS   = 350;   // минимальное время показа, если уже показали

  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  injectStyles();

  if (getComputedStyle(root).position === "static") {
    root.style.position = "relative";
  }

  let removed = false;
  let shownAt = 0;
  let showTimer = null;

  function isReady() {
    return root.getAttribute(READY_ATTR) === READY_VAL;
  }

  function ensureLoader() {
    if (removed || isReady()) return;

    let wrap = root.querySelector(":scope > .mztvld-loader-wrap");
    if (wrap) return;

    wrap = document.createElement("div");
    wrap.className = "mztvld-loader-wrap";
    wrap.innerHTML = `
      <div class="mztvld-loader" role="status" aria-label="loading">
        <span class="mztvld-ring mztvld-ring--outer"></span>
        <span class="mztvld-ring mztvld-ring--mid"></span>
        <span class="mztvld-ring mztvld-ring--inner"></span>
      </div>
    `;
    root.appendChild(wrap);
  }

function removeLoader() {
  if (removed) return;
  removed = true;

  // если лоадер ещё даже не показался — просто отменяем таймер
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }

  const wrap = root.querySelector(":scope > .mztvld-loader-wrap");
  if (!wrap) {
    observer.disconnect();
    return;
  }

  const elapsed = performance.now() - shownAt;
  const wait = Math.max(0, MIN_SHOW_MS - elapsed);

  setTimeout(() => {
    wrap.classList.add("is-hide");
    setTimeout(() => wrap.remove(), FADE_MS + 80);
    observer.disconnect();
  }, wait);
}

// показываем с задержкой (чтобы не мигал при быстрой загрузке)
showTimer = setTimeout(() => {
  if (!isReady()) {
    ensureLoader();
    shownAt = performance.now();
  }
}, SHOW_DELAY_MS);

  // если buildLayout() перезатрёт детей — восстановим оверлей
  const observer = new MutationObserver(() => {
    if (isReady()) removeLoader();
    else ensureLoader();
  });

  observer.observe(root, {
    childList: true,
    attributes: true,
    attributeFilter: [READY_ATTR],
  });

  function injectStyles() {
    // Важно: меняем id, чтобы стили не "залипали" из старой версии
    const STYLE_ID = "mztvld-loader-style-v3";
    if (document.getElementById(STYLE_ID)) return;

    // (не обязательно, но полезно) удалить старые версии, если были
    ["mzt-loader-style", "mzt-loader-style-v2", "mzt-loader-style-v3"].forEach((id) => {
      const old = document.getElementById(id);
      if (old) old.remove();
    });

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* overlay */
      #${ROOT_ID} > .mztvld-loader-wrap{
        position:absolute;
        inset:0;
        z-index:50;              /* умеренно: только перекрыть UI внутри */
        display:grid;
        place-items:center;
        pointer-events:auto;     /* блокируем клики по меню под ним */

        background:#efefef;

        opacity:1;
        transition: none;
      }

      #${ROOT_ID} > .mztvld-loader-wrap.is-hide{
        opacity:0;
        pointer-events:none;
        transition: opacity 200ms ease;
      }

      /* spinner container */
      #${ROOT_ID} > .mztvld-loader-wrap .mztvld-loader{
        position:relative;
        width:76px;
        height:76px;
        background:none;
      }

      /* ring base */
      #${ROOT_ID} > .mztvld-loader-wrap .mztvld-ring{
        position:absolute;
        inset:0;
        margin:auto;
        border-radius:50%;
        box-sizing:border-box;
        background: transparent;
      }

      /* outer ring */
      #${ROOT_ID} > .mztvld-loader-wrap .mztvld-ring--outer{
        width:76px;
        height:76px;
        border:5px solid transparent;
        border-top-color:#9a5e3a;
        border-right-color:#9a5e3a;
        animation: mztvld-rot 1.8s linear infinite;
      }

      /* middle ring (вращается в обратку) */
      #${ROOT_ID} > .mztvld-loader-wrap .mztvld-ring--mid{
        width:62px;
        height:62px;
        border:5px solid transparent;
        border-bottom-color:#9a5e3a;
        border-left-color:#9a5e3a;
        opacity:0.95;
        animation: mztvld-rot-back 1.4s linear infinite;
      }

      /* inner ring (более мягкий) */
      #${ROOT_ID} > .mztvld-loader-wrap .mztvld-ring--inner{
        width:46px;
        height:46px;
        border:5px solid transparent;
        border-top-color: rgba(154,94,58,0.55);
        border-right-color: rgba(154,94,58,0.55);
        animation: mztvld-rot 2.4s linear infinite;
      }


      /* ===================== reusable cell loader (tiles/renders) ===================== */
      #${ROOT_ID} .mztvld-cell-loader{
        position:absolute;
        inset:0;
        z-index:5;             /* только внутри карточки */
        display:grid;
        place-items:center;
        pointer-events:none;

        /* лёгкий радиальный фон под спиннером */
        background: radial-gradient(circle at center, #cccccc 0%, #efefef 68%);

        opacity:1;
        transition: opacity ${FADE_MS}ms ease;
      }
      #${ROOT_ID} .mztvld-cell-loader.is-hide{ opacity:0; }

      #${ROOT_ID} .mztvld-cell-loader .mztvld-loader{
        width:54px;
        height:54px;
      }
      #${ROOT_ID} .mztvld-cell-loader .mztvld-ring{
        position:absolute;
        inset:0;
        margin:auto;
        border-radius:50%;
        box-sizing:border-box;
        background: transparent;
      }

      #${ROOT_ID} .mztvld-cell-loader .mztvld-ring--outer{
        width:54px;
        height:54px;
        border:4px solid transparent;
        border-top-color:#9a5e3a;
        border-right-color:#9a5e3a;
        animation: mztvld-rot 1.8s linear infinite;
      }
      #${ROOT_ID} .mztvld-cell-loader .mztvld-ring--mid{
        width:42px;
        height:42px;
        border:4px solid transparent;
        border-bottom-color:#9a5e3a;
        border-left-color:#9a5e3a;
        opacity:0.95;
        animation: mztvld-rot-back 1.4s linear infinite;
      }
      #${ROOT_ID} .mztvld-cell-loader .mztvld-ring--inner{
        width:30px;
        height:30px;
        border:4px solid transparent;
        border-top-color: rgba(154,94,58,0.55);
        border-right-color: rgba(154,94,58,0.55);
        animation: mztvld-rot 2.4s linear infinite;
      }

      @keyframes mztvld-rot{ from{transform:rotate(0)} to{transform:rotate(360deg)} }
      @keyframes mztvld-rot-back{ from{transform:rotate(0)} to{transform:rotate(-360deg)} }
    `;
    document.head.appendChild(style);
  }
})();
