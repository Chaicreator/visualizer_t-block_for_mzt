/* loader.js (clean, isolated) */
(() => {
  const ROOT_ID = "cusvis";
  const READY_ATTR = "data-ready";
  const READY_VAL = "1";

  const CFG = {
    zIndex: 30,          // minimal but reliably above inner UI
    fadeMs: 180,
    bgEdge: "#888888",
    bgCenter: "#CCCCCC",
    accent: "#9a5e3a",
    size: 72,            // spinner outer size
    stroke: 6            // ring thickness
  };

  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  injectStyles();

  // Make #cusvis the positioning context
  if (getComputedStyle(root).position === "static") {
    root.style.position = "relative";
  }

  let removed = false;

  function isReady() {
    return root.getAttribute(READY_ATTR) === READY_VAL;
  }

  function ensureOverlay() {
    if (removed || isReady()) return;

    let overlay = root.querySelector(":scope > .mztvld-overlay");
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.className = "mztvld-overlay";
    overlay.innerHTML = `<span class="mztvld-spinner" role="status" aria-label="loading"></span>`;
    root.appendChild(overlay);
  }

  function removeOverlay() {
    if (removed) return;
    removed = true;

    const overlay = root.querySelector(":scope > .mztvld-overlay");
    if (!overlay) return;

    overlay.classList.add("is-hide");
    setTimeout(() => overlay.remove(), CFG.fadeMs + 80);
    mo.disconnect();
  }

  // Initial insert
  ensureOverlay();

  // If buildLayout() wipes #cusvis, re-insert; if ready, remove
  const mo = new MutationObserver(() => {
    if (isReady()) removeOverlay();
    else ensureOverlay();
  });

  mo.observe(root, {
    childList: true,
    attributes: true,
    attributeFilter: [READY_ATTR]
  });

  function injectStyles() {
    if (document.getElementById("mztvld-style")) return;

    const st = document.createElement("style");
    st.id = "mztvld-style";
    st.textContent = `
      /* Overlay */
      #${ROOT_ID} > .mztvld-overlay{
        position:absolute;
        inset:0;
        z-index:${CFG.zIndex};
        display:grid;
        place-items:center;
        pointer-events:auto;
        opacity:1;
        transition: opacity ${CFG.fadeMs}ms ease;

        background:#efefef
      }

      #${ROOT_ID} > .mztvld-overlay.is-hide{
        opacity:0;
        pointer-events:none;
      }

      /* Spinner (single ring, no light/white segments) */
      #${ROOT_ID} .mztvld-spinner{
        width:${CFG.size}px;
        height:${CFG.size}px;
        border-radius:50%;
        box-sizing:border-box;

        border:${CFG.stroke}px solid rgba(154,94,58,0.22);
        border-top-color:${CFG.accent};
        border-right-color:${CFG.accent};

        background:none;
        display:block;
        animation:mztvld-spin 0.85s linear infinite;
      }

      @keyframes mztvld-spin{
        from{ transform: rotate(0deg); }
        to  { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(st);
  }
})();
