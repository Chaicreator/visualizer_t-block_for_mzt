/* loader.js — оверлей загрузки поверх */
(() => {
  const ROOT_ID = "cusvis";

  const CFG = {
    readyAttr: "data-ready",
    readyAttrValue: "1",
    fadeMs: 220,
    maxWaitMs: 30000,
    fallbackHeight: 900, // если #cusvis пока 0px высоты
    debug: false,
  };

  const log = (...a) => CFG.debug && console.log("[mzt-loader]", ...a);

  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  injectStyles();

  // Создаём оверлей в body
  const overlay = document.createElement("div");
  overlay.className = "mzt-loader-overlay-body";
  overlay.innerHTML = `
    <div class="mzt-loader-spot">
      <div class="mzt-spinner" aria-label="Загрузка" role="status">
        ${Array.from({ length: 8 }).map(() => `<i></i>`).join("")}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  let removed = false;
  const start = performance.now();

  function isReady() {
    return root.getAttribute(CFG.readyAttr) === CFG.readyAttrValue;
  }

  function syncPosition() {
    if (removed) return;

    const r = root.getBoundingClientRect();
    const w = Math.max(0, r.width);
    const h = Math.max(0, r.height);

    // если блок ещё “нулевой” — всё равно покажем лоадер видимым
    const H = h < 30 ? CFG.fallbackHeight : h;

    overlay.style.left = `${Math.round(r.left)}px`;
    overlay.style.top = `${Math.round(r.top)}px`;
    overlay.style.width = `${Math.round(w)}px`;
    overlay.style.height = `${Math.round(H)}px`;
  }

  function removeOverlay() {
    if (removed) return;
    removed = true;
    log("remove");
    overlay.classList.add("is-hide");
    setTimeout(() => overlay.remove(), CFG.fadeMs + 80);
    window.removeEventListener("scroll", syncPosition, true);
    window.removeEventListener("resize", syncPosition);
    cancelAnimationFrame(rafId);
    mo.disconnect();
  }

  // Следим за data-ready на #cusvis
  const mo = new MutationObserver(() => {
    if (isReady()) removeOverlay();
  });
  mo.observe(root, { attributes: true, attributeFilter: [CFG.readyAttr] });

  // Обновляем позицию постоянно первые секунды (пока верстка “дышит”)
  let rafId = 0;
  const tick = () => {
    if (removed) return;

    syncPosition();

    if (isReady()) {
      removeOverlay();
      return;
    }

    if (performance.now() - start > CFG.maxWaitMs) {
      // фолбэк — чтобы не висел вечно, если ready не выставили
      removeOverlay();
      return;
    }

    rafId = requestAnimationFrame(tick);
  };

  window.addEventListener("scroll", syncPosition, true);
  window.addEventListener("resize", syncPosition);

  // старт
  syncPosition();
  tick();

  function injectStyles() {
    if (document.getElementById("mzt-loader-style")) return;

    const st = document.createElement("style");
    st.id = "mzt-loader-style";
    st.textContent = `
      /* Оверлей в BODY, но позиционируется по координатам #cusvis */
      .mzt-loader-overlay-body{
        position: fixed;
        z-index: 999999;
        background:#efefef;
        overflow:hidden;
        opacity:1;
        transition: opacity ${CFG.fadeMs}ms ease;
        pointer-events:auto;
      }
      .mzt-loader-overlay-body.is-hide{
        opacity:0;
        pointer-events:none;
      }

      .mzt-loader-overlay-body .mzt-loader-spot{
        width:100%;
        height:100%;
        display:flex;
        align-items:center;
        justify-content:center;
        background:
          radial-gradient(circle at center,
            rgba(255,255,255,1) 0%,
            rgba(255,255,255,1) 18%,
            rgba(255,255,255,0.92) 26%,
            rgba(239,239,239,1) 62%,
            rgba(239,239,239,1) 100%);
      }

      .mzt-loader-overlay-body .mzt-spinner{
        position:relative;
        width:68px;
        height:68px;
        animation: mztSpin 0.9s linear infinite;
      }
      .mzt-loader-overlay-body .mzt-spinner i{
        position:absolute;
        left:50%;
        top:50%;
        width:10px;
        height:18px;
        border-radius:4px;
        background:#b9b9b9;
        transform-origin: 50% calc(100% + 14px);
      }

      .mzt-loader-overlay-body .mzt-spinner i:nth-child(1){ transform: translate(-50%,-50%) rotate(0deg)   translateY(-22px);  opacity:0.25; }
      .mzt-loader-overlay-body .mzt-spinner i:nth-child(2){ transform: translate(-50%,-50%) rotate(45deg)  translateY(-22px);  opacity:0.32; }
      .mzt-loader-overlay-body .mzt-spinner i:nth-child(3){ transform: translate(-50%,-50%) rotate(90deg)  translateY(-22px);  opacity:0.40; }
      .mzt-loader-overlay-body .mzt-spinner i:nth-child(4){ transform: translate(-50%,-50%) rotate(135deg) translateY(-22px);  opacity:0.52; }
      .mzt-loader-overlay-body .mzt-spinner i:nth-child(5){ transform: translate(-50%,-50%) rotate(180deg) translateY(-22px);  opacity:0.65; }
      .mzt-loader-overlay-body .mzt-spinner i:nth-child(6){ transform: translate(-50%,-50%) rotate(225deg) translateY(-22px);  opacity:0.78; }
      .mzt-loader-overlay-body .mzt-spinner i:nth-child(7){ transform: translate(-50%,-50%) rotate(270deg) translateY(-22px);  opacity:0.90; }
      .mzt-loader-overlay-body .mzt-spinner i:nth-child(8){ transform: translate(-50%,-50%) rotate(315deg) translateY(-22px);  opacity:1; }

      @keyframes mztSpin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
    `;
    document.head.appendChild(st);
  }
})();
