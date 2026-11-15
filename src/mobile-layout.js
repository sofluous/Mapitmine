(function attachMobileLayout(global) {
  "use strict";

  function metrics(height, offsetTop, windowHeight, dockHeight) {
    height = Number.isFinite(height) ? Math.max(0, height) : 0;
    offsetTop = Number.isFinite(offsetTop) ? Math.max(0, offsetTop) : 0;
    windowHeight = Number.isFinite(windowHeight) ? Math.max(0, windowHeight) : height;
    dockHeight = Number.isFinite(dockHeight) ? Math.max(0, dockHeight) : 0;
    const available = Math.max(0, height - dockHeight - 8);
    // Reserve map space normally, but keep a usable editing sheet in short viewports.
    const reserve = Math.min(height * 0.35, Math.max(0, available - 160));
    return {
      inset: Math.max(0, windowHeight - height - offsetTop),
      sheet: Math.min(420, available - reserve),
    };
  }

  function install(api) {
    const { hud, status, rail, shell, inspector, minimap } = api;
    const dock = document.createElement("div");
    dock.id = "mobileDock";
    dock.className = "app-panel";
    document.body.appendChild(dock);
    const commands = hud.querySelector("#drawingCommands");
    const homes = [hud, status, rail, commands].filter(Boolean).map((element) => {
      const marker = document.createComment("mobile layout home");
      element.before(marker);
      return { element, marker };
    });
    let mobile = false;
    let frame = null;
    let viewportSignature = "";
    let focusChanged = false;
    function refresh() {
      if (frame !== null) return;
      frame = requestAnimationFrame(layout);
    }
    function layout() {
      frame = null;
      const next = window.innerWidth <= 900;
      if (next !== mobile) {
        mobile = next;
        if (mobile) {
          if (commands) dock.appendChild(commands);
          dock.append(hud, status, rail);
        }
        else homes.forEach(({ element, marker }) => marker.after(element));
      }
      if (!mobile) {
        minimap.removeAttribute("data-responsive-hidden");
        viewportSignature = "";
        return;
      }
      const viewport = window.visualViewport;
      const height = viewport?.height || window.innerHeight;
      const top = viewport?.offsetTop || 0;
      const root = document.documentElement;
      root.style.setProperty("--mobile-view-height", `${height}px`);
      root.style.setProperty("--mobile-view-top", `${top}px`);
      const before = metrics(height, top, window.innerHeight, 0);
      root.style.setProperty("--mobile-keyboard-inset", `${before.inset}px`);
      const dockHeight = dock.getBoundingClientRect().height;
      const result = metrics(height, top, window.innerHeight, dockHeight);
      root.style.setProperty("--mobile-dock-height", `${dockHeight}px`);
      root.style.setProperty("--mobile-sheet-height", `${result.sheet}px`);
      const signature = JSON.stringify([height, top, dockHeight, result.sheet]);
      if (signature !== viewportSignature || focusChanged) revealFocusedControl();
      viewportSignature = signature;
      focusChanged = false;
      let exposedBottom = dock.getBoundingClientRect().top;
      const panel = shell.getBoundingClientRect();
      if (!shell.classList.contains("is-collapsed")) exposedBottom = Math.min(exposedBottom, panel.top);
      if (!inspector.hidden && getComputedStyle(inspector).display !== "none") {
        exposedBottom = Math.min(exposedBottom, inspector.getBoundingClientRect().top);
      }
      minimap.style.setProperty("--mobile-minimap-top", `${top + 24}px`);
      const widgetBottom = minimap.getBoundingClientRect().bottom;
      // Keep editing surfaces reachable; this never changes the stored visibility preference.
      minimap.toggleAttribute("data-responsive-hidden", widgetBottom + 8 > exposedBottom);
    }
    function revealFocusedControl() {
      const active = document.activeElement;
      const owner = shell.contains(active) ? shell : inspector.contains(active) ? inspector : null;
      if (!owner) return;
      // Scroll only owned containers, never the document or visual viewport.
      for (let parent = active.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (/(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) {
          const box = active.getBoundingClientRect(), bounds = parent.getBoundingClientRect();
          const padding = parseFloat(style.scrollPaddingTop) || 6;
          if (box.top < bounds.top + padding) parent.scrollTop += box.top - bounds.top - padding;
          else if (box.bottom > bounds.bottom - padding) parent.scrollTop += box.bottom - bounds.bottom + padding;
        }
        if (parent === owner) break;
      }
    }
    const observer = new ResizeObserver(refresh);
    [dock, hud, rail, shell, inspector].forEach((element) => observer.observe(element));
    const mutations = new MutationObserver(refresh);
    mutations.observe(shell, { attributes: true, attributeFilter: ["class"] });
    mutations.observe(inspector, { attributes: true, attributeFilter: ["hidden"] });
    window.addEventListener("resize", refresh);
    window.addEventListener("focusin", () => { focusChanged = true; refresh(); });
    window.visualViewport?.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("scroll", refresh);
    layout();
    return { refresh };
  }

  global.MapitMineMobileLayout = Object.freeze({ install, metrics });
})(typeof window !== "undefined" ? window : globalThis);
