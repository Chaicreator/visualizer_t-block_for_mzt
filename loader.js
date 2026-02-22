/* loader.js — оверлей загрузки поверх (isolated classnames) */
(() => {
  const ROOT_ID = "cusvis";
  const READY_ATTR = "data-ready";
  const READY_VAL = "1";
  const FADE_MS = 200;

  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  injectStyles();

  if (getComputedStyle(root).position === "static") {
    root.style.position = "relative";
  }

  let removed = false;

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

    const wrap = root.querySelector(":scope > .mztvld-loader-wrap");
    if (!wrap) return;

    wrap.classList.add("is-hide");
    setTimeout(() => wrap.remove(), FADE_MS + 80);
    observer.disconnect();
  }

  ensureLoader();

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
        transition: opacity ${FADE_MS}ms ease;
      }

      #${ROOT_ID} > .mztvld-loader-wrap.is-hide{
        opacity:0;
        pointer-events:none;
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
        animation: mztvld-rot 0.95s linear infinite;
      }

      /* middle ring (вращается в обратку) */
      #${ROOT_ID} > .mztvld-loader-wrap .mztvld-ring--mid{
        width:62px;
        height:62px;
        border:5px solid transparent;
        border-bottom-color:#9a5e3a;
        border-left-color:#9a5e3a;
        opacity:0.95;
        animation: mztvld-rot-back 0.65s linear infinite;
      }

      /* inner ring (более мягкий) */
      #${ROOT_ID} > .mztvld-loader-wrap .mztvld-ring--inner{
        width:46px;
        height:46px;
        border:5px solid transparent;
        border-top-color: rgba(154,94,58,0.55);
        border-right-color: rgba(154,94,58,0.55);
        animation: mztvld-rot 1.35s linear infinite;
      }

      @keyframes mztvld-rot{ from{transform:rotate(0)} to{transform:rotate(360deg)} }
      @keyframes mztvld-rot-back{ from{transform:rotate(0)} to{transform:rotate(-360deg)} }
    `;
    document.head.appendChild(style);
  }
})();
