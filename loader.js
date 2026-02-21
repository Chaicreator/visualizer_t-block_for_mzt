/* loader.js — оверлей загрузки поверх */
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

    let el = root.querySelector(":scope > .mzt-loader-wrap");
    if (el) return;

    el = document.createElement("div");
    el.className = "mzt-loader-wrap";
    el.innerHTML = `<span class="mzt-loader"></span>`;
    root.appendChild(el);
  }

  function removeLoader() {
    if (removed) return;
    removed = true;

    const el = root.querySelector(":scope > .mzt-loader-wrap");
    if (!el) return;

    el.classList.add("is-hide");
    setTimeout(() => el.remove(), FADE_MS + 60);
    observer.disconnect();
  }

  ensureLoader();

  const observer = new MutationObserver(() => {
    if (isReady()) {
      removeLoader();
    } else {
      ensureLoader(); // если buildLayout его удалил
    }
  });

  observer.observe(root, {
    childList: true,
    attributes: true,
    attributeFilter: [READY_ATTR]
  });

  function injectStyles() {
    if (document.getElementById("mzt-loader-style")) return;

    const style = document.createElement("style");
    style.id = "mzt-loader-style";
    style.textContent = `
      #${ROOT_ID} > .mzt-loader-wrap{
        position:absolute;
        inset:0;
        z-index:99999;
        display:flex;
        align-items:center;
        justify-content:center;
        background:#888888;
        transition:opacity ${FADE_MS}ms ease;
        opacity:1;
      }

      #${ROOT_ID} > .mzt-loader-wrap.is-hide{
        opacity:0;
        pointer-events:none;
      }

      .mzt-loader {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display: inline-block;
        position: relative;
        border: 3px solid;
        border-color: #ffffff #ffffff transparent transparent;
        box-sizing: border-box;
        animation: mzt-rotation 1s linear infinite;
      }

      .mzt-loader::after,
      .mzt-loader::before {
        content: '';
        position: absolute;
        inset: 0;
        margin: auto;
        border: 3px solid;
        border-radius: 50%;
        box-sizing: border-box;
        transform-origin: center;
      }

      .mzt-loader::after {
        width: 40px;
        height: 40px;
        border-color: transparent transparent #9a5e3a #9a5e3a;
        animation: mzt-rotation-back 0.5s linear infinite;
      }

      .mzt-loader::before {
        width: 32px;
        height: 32px;
        border-color: #ffffff #ffffff transparent transparent;
        animation: mzt-rotation 1.6s linear infinite;
      }

      @keyframes mzt-rotation {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      @keyframes mzt-rotation-back {
        from { transform: rotate(0deg); }
        to { transform: rotate(-360deg); }
      }
    `;
    document.head.appendChild(style);
  }
})();
