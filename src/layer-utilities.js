/* Presentation only: the host owns guarded mutations and rerenders after commit. */
(function (root) {
  "use strict";
  let installed = false;

  function refreshInputMode(event) {
    const pointer = event?.pointerType;
    if (pointer === "mouse" || pointer === "touch" || pointer === "pen") {
      root.document.documentElement.dataset.layerUtilityInput = pointer;
    }
  }

  function install() {
    if (installed) return;
    installed = true;
    // pointerover/move includes pen hover, before pointerdown/contact.
    for (const name of ["pointerover", "pointermove", "pointerdown"]) {
      root.document.addEventListener(name, refreshInputMode, { capture: true, passive: true });
    }
  }

  function create({ kind, active = false, label, title, activate }) {
    if (kind !== "lock" && kind !== "visibility") throw new TypeError("Unknown layer utility kind");
    if (typeof active !== "boolean") throw new TypeError("active must be locked/hidden boolean");
    if (typeof activate !== "function") throw new TypeError("activate callback required");
    install();
    const button = root.document.createElement("button");
    button.type = "button";
    button.className = "layer-action layer-utility";
    button.dataset.outlineAction = kind;
    button.dataset.utilityKind = kind;
    button.setAttribute("aria-label", label || (kind === "lock" ? "Layer lock" : "Layer hidden"));
    button.setAttribute("aria-pressed", String(active));
    button.title = title || (kind === "lock" ? (active ? "Unlock layer" : "Lock layer") : (active ? "Show layer" : "Hide layer"));
    const state = root.document.createElement("span");
    state.className = `layer-utility-state io iconoir-${kind === "lock" ? "lock" : "eye-closed"}`;
    state.setAttribute("aria-hidden", "true");
    const preview = root.document.createElement("span");
    preview.className = "layer-utility-preview";
    preview.setAttribute("aria-hidden", "true");
    if (kind === "lock") {
      // Match the bundled Iconoir outline; an open shackle distinguishes Unlock.
      preview.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" focusable="false"><rect x="6" y="12" width="12" height="8" rx=".6"/><path d="M8 12V8a4 4 0 0 1 8 0"/></svg>';
    } else {
      preview.className += " io iconoir-eye";
    }
    button.append(state, preview);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      activate(event);
    });
    return button;
  }

  root.MapitMineLayerUtilities = Object.freeze({ create, install, refreshInputMode });
})(window);
