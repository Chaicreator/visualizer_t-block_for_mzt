/* loader.js — оверлей загрузки */
(() => {
  const ROOT_ID = "cusvis";

  // Настройки
  const CFG = {
    removeFadeMs: 220,           // скорость исчезновения
    maxWaitMs: 20000,            // фолбэк: убрать через 20с на всякий
    readyAttr: "data-ready",     // атрибут готовности на #cusvis
    readyAttrValue: "1",         // значение готовности
    minLoadedImages: 1,          // сколько картинок должно реально загрузиться, чтобы считать "готов"
    debug: false,
  };

  const log = (...a) => CFG.debug && console.log("[loader]", ...a);

  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  // root должен быть позиционирован для абсолютного оверлея
  const cs = getComputedStyle(root);
  if (cs.position === "static") root.style.position = "relative";

  // Создаём оверлей
  const overlay = document.createElement("div");
  overlay.className = "mzt-loader-overlay";
  overlay.innerHTML = `
    <div class="mzt-loader-spot">
      <div class="mzt-spinner" aria-label="Загрузка" role="status">
        ${Array.from({ length: 8 }).map(() => `<i></i>`).join("")}
      </div>
    </div>
  `;
  root.appendChild(overlay);

  injectStyles();

  let removed = false;
  const removeOverlay = () => {
    if (removed) return;
    removed = true;
    log("remove");

    overlay.classList.add("is-hide");
    setTimeout(() => overlay.remove(), CFG.removeFadeMs + 60);
  };

  // 1) Самый надежный способ: vis.js выставляет data-ready="1" на #cusvis
  const mo = new MutationObserver(() => {
    const val = root.getAttribute(CFG.readyAttr);
    if (val === CFG.readyAttrValue) {
      log("ready by attr");
      removeOverlay();
    }
  });
  mo.observe(root, { attributes: true, attributeFilter: [CFG.readyAttr] });

  // 2) Фолбэк: ждём появления контента и загрузки хотя бы одной картинки
  const isProbablyReady = async () => {
    // есть хоть какая-то “начинка” (не только наш оверлей)
    const hasRealChildren = Array.from(root.children).some(
      (el) => !el.classList.contains("mzt-loader-overlay")
    );

    if (!hasRealChildren) return false;

    // если внутри есть картинки — ждём их load/decode
    const imgs = Array.from(root.querySelectorAll("img"))
      .filter((img) => !img.closest(".mzt-loader-overlay"));

    if (imgs.length === 0) {
      // нет img — возможно канвас/дивы, тогда считаем готовым по наличию контента
      return true;
    }

    // ждём, чтобы загрузилось минимум CFG.minLoadedImages
    let loaded = 0;

    await Promise.race([
      Promise.all(
        imgs.map(async (img) => {
          try {
            if (img.complete && img.naturalWidth > 0) {
              loaded++;
              return;
            }
            // decode быстрее и надёжнее, но не везде
            if (img.decode) {
              await img.decode();
              loaded++;
              return;
            }
            await new Promise((res) => {
              img.addEventListener("load", res, { once: true });
              img.addEventListener("error", res, { once: true });
            });
            if (img.naturalWidth > 0) loaded++;
          } catch {
            // ignore
          }
        })
      ),
      new Promise((res) => setTimeout(res, 1500)),
    ]);

    return loaded >= CFG.minLoadedImages;
  };

  // периодический чек готовности (быстро, но не грузит)
  const start = performance.now();
  const tick = async () => {
    if (removed) return;

    // если уже поставили data-ready — снимем мгновенно
    if (root.getAttribute(CFG.readyAttr) === CFG.readyAttrValue) {
      log("ready by attr (tick)");
      removeOverlay();
      return;
    }

    const ok = await isProbablyReady();
    if (ok) {
      log("ready by dom/img");
      removeOverlay();
      return;
    }

    if (performance.now() - start > CFG.maxWaitMs) {
      log("maxWait fallback");
      removeOverlay();
      return;
    }
    requestAnimationFrame(() => setTimeout(tick, 120));
  };
  tick();

  // 3) Если страница полностью загрузилась — ещё один шанс снять
  window.addEventListener("load", () => {
    setTimeout(async () => {
      if (removed) return;
      if (await isProbablyReady()) {
        log("ready by window.load");
        removeOverlay();
      }
    }, 0);
  }, { once: true });

  function injectStyles() {
    if (document.getElementById("mzt-loader-style")) return;

    const st = document.createElement("style");
    st.id = "mzt-loader-style";
    st.textContent = `
      /* ===== Loader Overlay ===== */
      #${ROOT_ID} .mzt-loader-overlay{
        position:absolute;
        inset:0;
        z-index:9999;
        display:flex;
        align-items:center;
        justify-content:center;
        background:#efefef;
        overflow:hidden;
        opacity:1;
        transition: opacity ${CFG.removeFadeMs}ms ease;
        pointer-events:auto; /* чтобы пользователь не кликал в полуготовый UI */
      }
      #${ROOT_ID} .mzt-loader-overlay.is-hide{
        opacity:0;
        pointer-events:none;
      }

      /* Центровое "пятно" (градиент) */
      #${ROOT_ID} .mzt-loader-spot{
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

      /* Спиннер: 8 прямоугольников вокруг центра */
      #${ROOT_ID} .mzt-spinner{
        position:relative;
        width:68px;
        height:68px;
        transform: translateZ(0);
        animation: mztSpin 0.9s linear infinite;
      }
      #${ROOT_ID} .mzt-spinner i{
        position:absolute;
        left:50%;
        top:50%;
        width:10px;
        height:18px;
        border-radius:4px;
        background:#b9b9b9;
        transform-origin: 50% calc(100% + 14px); /* "средняя нижняя точка" тянется к центру */
        opacity:0.9;
      }

      /* Расставляем 8 элементов по кругу */
      #${ROOT_ID} .mzt-spinner i:nth-child(1){ transform: translate(-50%,-50%) rotate(0deg)   translateY(-22px);  opacity:0.25; }
      #${ROOT_ID} .mzt-spinner i:nth-child(2){ transform: translate(-50%,-50%) rotate(45deg)  translateY(-22px);  opacity:0.32; }
      #${ROOT_ID} .mzt-spinner i:nth-child(3){ transform: translate(-50%,-50%) rotate(90deg)  translateY(-22px);  opacity:0.40; }
      #${ROOT_ID} .mzt-spinner i:nth-child(4){ transform: translate(-50%,-50%) rotate(135deg) translateY(-22px);  opacity:0.52; }
      #${ROOT_ID} .mzt-spinner i:nth-child(5){ transform: translate(-50%,-50%) rotate(180deg) translateY(-22px);  opacity:0.65; }
      #${ROOT_ID} .mzt-spinner i:nth-child(6){ transform: translate(-50%,-50%) rotate(225deg) translateY(-22px);  opacity:0.78; }
      #${ROOT_ID} .mzt-spinner i:nth-child(7){ transform: translate(-50%,-50%) rotate(270deg) translateY(-22px);  opacity:0.90; }
      #${ROOT_ID} .mzt-spinner i:nth-child(8){ transform: translate(-50%,-50%) rotate(315deg) translateY(-22px);  opacity:1; }

      @keyframes mztSpin{
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(st);
  }

})();
