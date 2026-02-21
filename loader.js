/* loader.js — оверлей загрузки поверх */
(() => {
  const ROOT_ID = "cusvis";

  const CFG = {
    readyAttr: "data-ready",
    readyAttrValue: "1",

    fadeMs: 260,
    maxWaitMs: 30000,

    // Позиционирование
    fallbackHeight: 900,   // если #cusvis пока 0px
    snapEveryMs: 250,      // как часто "подхватывать" новую геометрию
    smoothMs: 180,         // плавность перемещения (CSS transition)
    lockAfterMs: 2500,     // после этого времени почти не трогаем позицию

    debug: false,
  };

  const log = (...a) => CFG.debug && console.log("[mzt-loader]", ...a);

  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  injectStyles();

  // Оверлей в body (его не снесёт buildLayout)
  const overlay = document.createElement("div");
  overlay.className = "mzt-loader-overlay-body";
  overlay.innerHTML = `
    <div class="mzt-loader-surface">
      <div class="mzt-loader-spot">
        <div class="mzt-spinner" aria-label="Загрузка" role="status">
          ${Array.from({ length: 8 }).map(() => `<i></i>`).join("")}
        </div>
        <div class="mzt-loader-caption">Загрузка…</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  let removed = false;
  const t0 = performance.now();

  function isReady() {
    return root.getAttribute(CFG.readyAttr) === CFG.readyAttrValue;
  }

  // берём "текущую" геометрию
  function measure() {
    const r = root.getBoundingClientRect();
    const w = Math.max(0, r.width);
    const hRaw = Math.max(0, r.height);
    const h = hRaw < 30 ? CFG.fallbackHeight : hRaw;
    return { left: r.left, top: r.top, width: w, height: h };
  }

  // применяем геометрию (плавно, через transition)
  function applyBox(box) {
    overlay.style.left = `${Math.round(box.left)}px`;
    overlay.style.top = `${Math.round(box.top)}px`;
    overlay.style.width = `${Math.round(box.width)}px`;
    overlay.style.height = `${Math.round(box.height)}px`;
  }

  // Плавная стратегия:
  // 1) сразу ставим box
  // 2) первые 2.5с подхватываем раз в snapEveryMs
  // 3) потом почти не трогаем (только resize/scroll)
  let lastSnap = 0;

  function snap(force = false) {
    if (removed) return;

    const now = performance.now();
    const elapsed = now - t0;

    if (!force) {
      if (elapsed > CFG.lockAfterMs && now - lastSnap < 800) return; // реже после lock
      if (now - lastSnap < CFG.snapEveryMs) return;
    }

    lastSnap = now;
    const box = measure();

    // если ширина 0, не "скачем" — ждём нормального состояния
    if (box.width < 10) return;

    applyBox(box);
  }

  function removeOverlay() {
    if (removed) return;
    removed = true;
    log("remove");

    overlay.classList.add("is-hide");
    setTimeout(() => overlay.remove(), CFG.fadeMs + 120);

    mo.disconnect();
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onResize);
    clearInterval(intervalId);
    clearTimeout(maxTimer);
  }

  // ready наблюдение
  const mo = new MutationObserver(() => {
    if (isReady()) removeOverlay();
  });
  mo.observe(root, { attributes: true, attributeFilter: [CFG.readyAttr] });

  // события — но без перекачки
  const onScroll = () => snap(true);
  const onResize = () => snap(true);
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onResize);

  // стартовая установка
  snap(true);

  // периодическая подстройка (редко)
  const intervalId = setInterval(() => snap(false), CFG.snapEveryMs);

  // фолбэк, чтобы не висел вечно
  const maxTimer = setTimeout(() => {
    if (!removed) removeOverlay();
  }, CFG.maxWaitMs);

  function injectStyles() {
    if (document.getElementById("mzt-loader-style")) return;
    const st = document.createElement("style");
    st.id = "mzt-loader-style";
    st.textContent = `
      .mzt-loader-overlay-body{
        position: fixed;
        z-index: 999999;
        overflow: hidden;
        opacity: 1;
        transform: scale(1);
        transition:
          opacity ${CFG.fadeMs}ms ease,
          transform ${CFG.fadeMs}ms ease,
          left ${CFG.smoothMs}ms ease,
          top ${CFG.smoothMs}ms ease,
          width ${CFG.smoothMs}ms ease,
          height ${CFG.smoothMs}ms ease;
        pointer-events: auto;
        border-radius: 18px;
      }
      .mzt-loader-overlay-body.is-hide{
        opacity: 0;
        transform: scale(0.985);
        pointer-events: none;
      }

      /* поверхность: лёгкий blur + мягкая рамка */
      .mzt-loader-surface{
        width:100%;
        height:100%;
        background: rgba(239,239,239,0.92);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        border: 1px solid rgba(0,0,0,0.06);
        box-shadow:
          0 18px 60px rgba(0,0,0,0.12),
          0 2px 10px rgba(0,0,0,0.06);
        display:flex;
        align-items:center;
        justify-content:center;
      }

      /* центральное пятно + shimmer */
      .mzt-loader-spot{
        position: relative;
        width: 240px;
        height: 240px;
        border-radius: 999px;
        display:flex;
        flex-direction: column;
        align-items:center;
        justify-content:center;
        background:
          radial-gradient(circle at center,
            rgba(255,255,255,1) 0%,
            rgba(255,255,255,1) 35%,
            rgba(255,255,255,0.92) 50%,
            rgba(239,239,239,0.0) 72%);
      }
      .mzt-loader-spot::after{
        content:"";
        position:absolute;
        inset: -40px;
        background: linear-gradient(90deg,
          rgba(255,255,255,0) 0%,
          rgba(255,255,255,0.55) 45%,
          rgba(255,255,255,0) 90%);
        transform: translateX(-55%) rotate(12deg);
        animation: mztShimmer 1.6s ease-in-out infinite;
        pointer-events:none;
        filter: blur(2px);
        opacity: 0.55;
      }
      @keyframes mztShimmer{
        0%{ transform: translateX(-60%) rotate(12deg); opacity:0.15; }
        50%{ opacity:0.6; }
        100%{ transform: translateX(60%) rotate(12deg); opacity:0.15; }
      }

      /* премиальный спиннер: 8 стержней с градиентом */
      .mzt-spinner{
        position: relative;
        width: 74px;
        height: 74px;
        animation: mztSpin 0.95s linear infinite;
        filter: drop-shadow(0 6px 16px rgba(0,0,0,0.10));
      }
      .mzt-spinner i{
        position:absolute;
        left:50%;
        top:50%;
        width:10px;
        height:22px;
        border-radius: 999px;
        background: linear-gradient(180deg, rgba(20,20,20,0.60), rgba(20,20,20,0.18));
        transform-origin: 50% calc(100% + 16px);
      }

      /* Расстановка + “дыхание” по opacity */
      .mzt-spinner i:nth-child(1){ transform: translate(-50%,-50%) rotate(0deg)   translateY(-24px);  opacity:0.22; }
      .mzt-spinner i:nth-child(2){ transform: translate(-50%,-50%) rotate(45deg)  translateY(-24px);  opacity:0.30; }
      .mzt-spinner i:nth-child(3){ transform: translate(-50%,-50%) rotate(90deg)  translateY(-24px);  opacity:0.40; }
      .mzt-spinner i:nth-child(4){ transform: translate(-50%,-50%) rotate(135deg) translateY(-24px);  opacity:0.54; }
      .mzt-spinner i:nth-child(5){ transform: translate(-50%,-50%) rotate(180deg) translateY(-24px);  opacity:0.68; }
      .mzt-spinner i:nth-child(6){ transform: translate(-50%,-50%) rotate(225deg) translateY(-24px);  opacity:0.80; }
      .mzt-spinner i:nth-child(7){ transform: translate(-50%,-50%) rotate(270deg) translateY(-24px);  opacity:0.92; }
      .mzt-spinner i:nth-child(8){ transform: translate(-50%,-50%) rotate(315deg) translateY(-24px);  opacity:1.00; }

      @keyframes mztSpin { from{ transform: rotate(0deg); } to { transform: rotate(360deg); } }

      .mzt-loader-caption{
        margin-top: 14px;
        font: 600 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        color: rgba(0,0,0,0.55);
        letter-spacing: 0.2px;
        user-select: none;
      }
    `;
    document.head.appendChild(st);
  }
})();
