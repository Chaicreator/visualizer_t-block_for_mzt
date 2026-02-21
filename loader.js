/* loader.js — оверлей загрузки */
(() => {
  const ROOT_ID = "cusvis";

  const CFG = {
    removeFadeMs: 220,
    maxWaitMs: 20000,
    readyAttr: "data-ready",
    readyAttrValue: "1",
    debug: false,
  };

  const log = (...a) => CFG.debug && console.log("[loader]", ...a);

  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  // Вставка/обновление оверлея (если его снесли — вставит снова)
  function ensureOverlay() {
    if (root.getAttribute(CFG.readyAttr) === CFG.readyAttrValue) return null;

    let overlay = root.querySelector(":scope > .mzt-loader-overlay");
    if (overlay) return overlay;

    const cs = getComputedStyle(root);
    if (cs.position === "static") root.style.position = "relative";

    overlay = document.createElement("div");
    overlay.className = "mzt-loader-overlay";
    overlay.innerHTML = `
      <div class="mzt-loader-spot">
        <div class="mzt-spinner" aria-label="Загрузка" role="status">
          ${Array.from({ length: 8 }).map(() => `<i></i>`).join("")}
        </div>
      </div>
    `;
    root.appendChild(overlay);
    return overlay;
  }

  function injectStyles() {
    if (document.getElementById("mzt-loader-style")) return;
    const st = document.createElement("style");
    st.id = "mzt-loader-style";
    st.textContent = `
      #${ROOT_ID} .mzt-loader-overlay{
        position:absolute; inset:0; z-index:9999;
        display:flex; align-items:center; justify-content:center;
        background:#efefef; overflow:hidden;
        opacity:1; transition: opacity ${CFG.removeFadeMs}ms ease;
        pointer-events:auto;
      }
      #${ROOT_ID} .mzt-loader-overlay.is-hide{
        opacity:0; pointer-events:none;
      }
      #${ROOT_ID} .mzt-loader-spot{
        width:100%; height:100%;
        display:flex; align-items:center; justify-content:center;
        background: radial-gradient(circle at center,
          rgba(255,255,255,1) 0%,
          rgba(255,255,255,1) 18%,
          rgba(255,255,255,0.92) 26%,
          rgba(239,239,239,1) 62%,
          rgba(239,239,239,1) 100%);
      }
      #${ROOT_ID} .mzt-spinner{
        position:relative; width:68px; height:68px;
        animation: mztSpin 0.9s linear infinite;
      }
      #${ROOT_ID} .mzt-spinner i{
        position:absolute; left:50%; top:50%;
        width:10px; height:18px; border-radius:4px;
        background:#b9b9b9;
        transform-origin: 50% calc(100% + 14px);
        opacity:0.9;
      }
      #${ROOT_ID} .mzt-spinner i:nth-child(1){ transform: translate(-50%,-50%) rotate(0deg)   translateY(-22px);  opacity:0.25; }
      #${ROOT_ID} .mzt-spinner i:nth-child(2){ transform: translate(-50%,-50%) rotate(45deg)  translateY(-22px);  opacity:0.32; }
      #${ROOT_ID} .mzt-spinner i:nth-child(3){ transform: translate(-50%,-50%) rotate(90deg)  translateY(-22px);  opacity:0.40; }
      #${ROOT_ID} .mzt-spinner i:nth-child(4){ transform: translate(-50%,-50%) rotate(135deg) translateY(-22px);  opacity:0.52; }
      #${ROOT_ID} .mzt-spinner i:nth-child(5){ transform: translate(-50%,-50%) rotate(180deg) translateY(-22px);  opacity:0.65; }
      #${ROOT_ID} .mzt-spinner i:nth-child(6){ transform: translate(-50%,-50%) rotate(225deg) translateY(-22px);  opacity:0.78; }
      #${ROOT_ID} .mzt-spinner i:nth-child(7){ transform: translate(-50%,-50%) rotate(270deg) translateY(-22px);  opacity:0.90; }
      #${ROOT_ID} .mzt-spinner i:nth-child(8){ transform: translate(-50%,-50%) rotate(315deg) translateY(-22px);  opacity:1; }
      @keyframes mztSpin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
    `;
    document.head.appendChild(st);
  }

  injectStyles();

  // Ждём пока buildLayout создаст внутренности / появится высота
  const start = performance.now();
  const waitLayout = () => new Promise((resolve) => {
    const check = () => {
      const h = root.getBoundingClientRect().height;
      const hasChildren = root.children.length > 0;
      // если высота уже нормальная или появились дети — можно ставить оверлей
      if (h > 30 || hasChildren) return resolve();
      if (performance.now() - start > CFG.maxWaitMs) return resolve();
      requestAnimationFrame(check);
    };
    check();
  });

  let overlay = null;
  let removed = false;

  const removeOverlay = () => {
    if (removed) return;
    removed = true;
    overlay = root.querySelector(":scope > .mzt-loader-overlay");
    if (!overlay) return;
    overlay.classList.add("is-hide");
    setTimeout(() => overlay?.remove(), CFG.removeFadeMs + 60);
  };

  // Следим за data-ready
  const moAttr = new MutationObserver(() => {
    if (root.getAttribute(CFG.readyAttr) === CFG.readyAttrValue) {
      log("ready by attr");
      removeOverlay();
    }
  });
  moAttr.observe(root, { attributes: true, attributeFilter: [CFG.readyAttr] });

  // Следим за тем, что buildLayout/перерисовки не снесли оверлей
  const moChild = new MutationObserver(() => {
    if (removed) return;
    if (root.getAttribute(CFG.readyAttr) === CFG.readyAttrValue) return;
    ensureOverlay();
  });
  moChild.observe(root, { childList: true });

  (async () => {
    await waitLayout();
    overlay = ensureOverlay();
    log("overlay ensured");

    // фолбэк: не держим вечно
    setTimeout(() => {
      if (!removed) removeOverlay();
    }, CFG.maxWaitMs);
  })();
})();
