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

    let wrap = root.querySelector(":scope > .mzt-loader-wrap");
    if (wrap) return;

    wrap = document.createElement("div");
    wrap.className = "mzt-loader-wrap";
    wrap.innerHTML = `<span class="mzt-loader" role="status"></span>`;
    root.appendChild(wrap);
  }

  function removeLoader() {
    if (removed) return;
    removed = true;

    const wrap = root.querySelector(":scope > .mzt-loader-wrap");
    if (!wrap) return;

    wrap.classList.add("is-hide");
    setTimeout(() => wrap.remove(), FADE_MS + 60);
    observer.disconnect();
  }

  ensureLoader();

  const observer = new MutationObserver(() => {
    if (isReady()) removeLoader();
    else ensureLoader();
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
      /* Оверлей — минимальный слой */
      #${ROOT_ID} > .mzt-loader-wrap{
        position:absolute;
        inset:0;
        z-index:2; /* только над содержимым визуализатора */

        display:grid;
        place-items:center;

        background: radial-gradient(circle at center,
          #CCCCCC 0%,
          #CCCCCC 25%,
          #888888 75%,
          #888888 100%);

        opacity:1;
        transition:opacity ${FADE_MS}ms ease;
      }

      #${ROOT_ID} > .mzt-loader-wrap.is-hide{
        opacity:0;
        pointer-events:none;
      }

      /* Спиннер */
  .mzt-loader{
  width:72px;           /* было 48px */
  height:72px;
  border-radius:50%;
  position:relative;
  box-sizing:border-box;

  border:5px solid;     /* толще линия */
  border-color:#9a5e3a #9a5e3a transparent transparent;
  animation:mzt-rotation 1s linear infinite;
}

.mzt-loader::after,
.mzt-loader::before{
  content:'';
  position:absolute;
  inset:0;
  margin:auto;
  border:5px solid;     /* толще линия */
  border-radius:50%;
  box-sizing:border-box;
}

.mzt-loader::after{
  width:60px;           /* было 40px */
  height:60px;
  border-color:transparent transparent #9a5e3a #9a5e3a;
  animation:mzt-rotation-back 0.7s linear infinite;
}

.mzt-loader::before{
  width:46px;           /* было 32px */
  height:46px;
  border-color:rgba(154,94,58,0.55) rgba(154,94,58,0.55) transparent transparent;
  animation:mzt-rotation 1.4s linear infinite;
}

      @keyframes mzt-rotation{
        from{transform:rotate(0deg)}
        to{transform:rotate(360deg)}
      }

      @keyframes mzt-rotation-back{
        from{transform:rotate(0deg)}
        to{transform:rotate(-360deg)}
      }
    `;
    document.head.appendChild(style);
  }
})();
