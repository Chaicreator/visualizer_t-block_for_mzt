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
    wrap.innerHTML = `
      <div class="mzt-loader" role="status" aria-label="loading">
        <span class="mzt-ring mzt-ring--outer"></span>
        <span class="mzt-ring mzt-ring--mid"></span>
        <span class="mzt-ring mzt-ring--inner"></span>
      </div>
    `;
    root.appendChild(wrap);
  }

  function removeLoader() {
    if (removed) return;
    removed = true;

    const wrap = root.querySelector(":scope > .mzt-loader-wrap");
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
    const STYLE_ID = "mzt-loader-style-v3";
    if (document.getElementById(STYLE_ID)) return;

    // (не обязательно, но полезно) удалить старые версии, если были
    ["mzt-loader-style", "mzt-loader-style-v2"].forEach((id) => {
      const old = document.getElementById(id);
      if (old) old.remove();
    });

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
/* ===== MZT VIS LOADER (no conflicts) ===== */
#cusvis > .mztVisLoaderWrap{
  position:absolute;
  inset:0;
  z-index:30; /* умеренно, чтобы перекрыть UI внутри cusvis */
  display:grid;
  place-items:center;
  pointer-events:auto;

  /* фон: радиальный, центр #CCCCCC, края #888888 */
  background: radial-gradient(circle at center,
    #CCCCCC 0%,
    #CCCCCC 25%,
    #888888 75%,
    #888888 100%);

  opacity:1;
  transition: opacity 200ms ease;
}

#cusvis > .mztVisLoaderWrap.is-hide{
  opacity:0;
  pointer-events:none;
}

/* Спиннер: твой 3-кольцевой вариант, без белых сегментов */
#cusvis > .mztVisLoaderWrap .mztVisSpin{
  width:72px;
  height:72px;
  border-radius:50%;
  display:block;
  position:relative;
  box-sizing:border-box;

  border:5px solid;
  border-color:#9a5e3a #9a5e3a transparent transparent;
  animation:mztVisRot 1s linear infinite;
}

#cusvis > .mztVisLoaderWrap .mztVisSpin::after,
#cusvis > .mztVisLoaderWrap .mztVisSpin::before{
  content:'';
  position:absolute;
  inset:0;
  margin:auto;
  border:5px solid;
  border-radius:50%;
  box-sizing:border-box;
}

#cusvis > .mztVisLoaderWrap .mztVisSpin::after{
  width:60px;
  height:60px;
  border-color:transparent transparent #9a5e3a #9a5e3a;
  animation:mztVisRotBack 0.7s linear infinite;
  opacity:0.95;
}

#cusvis > .mztVisLoaderWrap .mztVisSpin::before{
  width:46px;
  height:46px;
  border-color:rgba(154,94,58,0.55) rgba(154,94,58,0.55) transparent transparent;
  animation:mztVisRot 1.4s linear infinite;
  opacity:0.9;
}

@keyframes mztVisRot{
  from{ transform: rotate(0deg); }
  to  { transform: rotate(360deg); }
}

@keyframes mztVisRotBack{
  from{ transform: rotate(0deg); }
  to  { transform: rotate(-360deg); }
}
})();
