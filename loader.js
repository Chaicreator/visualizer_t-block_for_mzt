/* loader.js — оверлей загрузки поверх */
(() => {
  const ROOT_ID = "cusvis";

  const CFG = {
    readyAttr: "data-ready",
    readyAttrValue: "1",
    fadeMs: 220,
    // зададим минимум, чтобы было видно
    minHeightPx: 900,
  };

  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  injectStyles();

  // root должен быть якорем для absolute
  const cs = getComputedStyle(root);
  if (cs.position === "static") root.style.position = "relative";
  if (!root.style.minHeight) root.style.minHeight = CFG.minHeightPx + "px";

  let removed = false;

  function isReady() {
    return root.getAttribute(CFG.readyAttr) === CFG.readyAttrValue;
  }

  function ensureOverlay() {
    if (removed || isReady()) return;

    let overlay = root.querySelector(":scope > .mzt-loader");
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.className = "mzt-loader";
    overlay.innerHTML = `
      <div class="mzt-loader__bg">
        <div class="mzt-loader__spinner" role="status" aria-label="loading">
          <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
        </div>
      </div>
    `;
    root.appendChild(overlay);
  }

  function removeOverlay() {
    if (removed) return;
    removed = true;

    const overlay = root.querySelector(":scope > .mzt-loader");
    if (!overlay) return;

    overlay.classList.add("is-hide");
    setTimeout(() => overlay.remove(), CFG.fadeMs + 80);

    mo.disconnect();
  }

  // Вставляем сразу (если buildLayout потом снесёт — восстановим)
  ensureOverlay();

  // Следим: если buildLayout/рендеры перетёрли DOM — вставим снова.
  const mo = new MutationObserver(() => {
    if (isReady()) {
      removeOverlay();
      return;
    }
    // если оверлей пропал — восстановить
    ensureOverlay();
  });

  mo.observe(root, { childList: true, subtree: false, attributes: true, attributeFilter: [CFG.readyAttr] });

  function injectStyles() {
    if (document.getElementById("mzt-loader-style")) return;

    const st = document.createElement("style");
    st.id = "mzt-loader-style";
    st.textContent = `
      #${ROOT_ID} > .mzt-loader{
        position:absolute;
        inset:0;
        z-index:99999;
        opacity:1;
        transition: opacity ${CFG.fadeMs}ms ease;
        pointer-events:auto;
      }
      #${ROOT_ID} > .mzt-loader.is-hide{
        opacity:0;
        pointer-events:none;
      }

      /* фон: снаружи #efefef, в центре мягкое белое пятно */
      #${ROOT_ID} .mzt-loader__bg{
        width:100%;
        height:100%;
        display:flex;
        align-items:center;
        justify-content:center;
        background:
          radial-gradient(circle at center,
            rgba(255,255,255,1) 0%,
            rgba(255,255,255,1) 22%,
            rgba(255,255,255,0.92) 32%,
            rgba(239,239,239,1) 70%,
            rgba(239,239,239,1) 100%);
      }

      /* классическая крутилка 8 прямоугольников */
      #${ROOT_ID} .mzt-loader__spinner{
        position:relative;
        width:64px;
        height:64px;
        animation:mztSpin 0.9s linear infinite;
      }
      #${ROOT_ID} .mzt-loader__spinner i{
        position:absolute;
        left:50%;
        top:50%;
        width:10px;
        height:18px;
        border-radius:4px;
        background: rgba(40,40,40,0.55);
        transform-origin: 50% calc(100% + 14px);
      }

      #${ROOT_ID} .mzt-loader__spinner i:nth-child(1){ transform: translate(-50%,-50%) rotate(0deg)   translateY(-21px); opacity:.20; }
      #${ROOT_ID} .mzt-loader__spinner i:nth-child(2){ transform: translate(-50%,-50%) rotate(45deg)  translateY(-21px); opacity:.28; }
      #${ROOT_ID} .mzt-loader__spinner i:nth-child(3){ transform: translate(-50%,-50%) rotate(90deg)  translateY(-21px); opacity:.36; }
      #${ROOT_ID} .mzt-loader__spinner i:nth-child(4){ transform: translate(-50%,-50%) rotate(135deg) translateY(-21px); opacity:.48; }
      #${ROOT_ID} .mzt-loader__spinner i:nth-child(5){ transform: translate(-50%,-50%) rotate(180deg) translateY(-21px); opacity:.62; }
      #${ROOT_ID} .mzt-loader__spinner i:nth-child(6){ transform: translate(-50%,-50%) rotate(225deg) translateY(-21px); opacity:.76; }
      #${ROOT_ID} .mzt-loader__spinner i:nth-child(7){ transform: translate(-50%,-50%) rotate(270deg) translateY(-21px); opacity:.88; }
      #${ROOT_ID} .mzt-loader__spinner i:nth-child(8){ transform: translate(-50%,-50%) rotate(315deg) translateY(-21px); opacity:1; }

      @keyframes mztSpin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
    `;
    document.head.appendChild(st);
  }
})();
