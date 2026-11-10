(function attachMobileLayout(global) {
  "use strict";

  function metrics(height, offsetTop, windowHeight, dockHeight) {
    return {
      inset: Math.max(0, windowHeight - height - offsetTop),
      sheet: Math.min(Math.max(0, height - dockHeight - 8), Math.max(56, Math.min(height * 0.55, height - dockHeight - 48))),
    };
  }

  function install(api) {
    const { hud, status, rail, shell, inspector, minimap, scale } = api;
    const dock = document.createElement("div");
    dock.id = "mobileDock";
    dock.className = "app-panel";
    document.body.appendChild(dock);
    const homes = [hud, status, rail].map((element) => {
      const marker = document.createComment("mobile layout home");
      element.before(marker);
      return { element, marker };
    });
    let mobile = false;
    let frame = null;
    function refresh() {
      if (frame !== null) return;
      frame = requestAnimationFrame(layout);
    }
    function layout() {
      frame = null;
      const next = window.innerWidth <= 900;
      if (next !== mobile) {
        mobile = next;
        if (mobile) dock.append(hud, status, rail);
        else homes.forEach(({ element, marker }) => marker.after(element));
      }
      if (!mobile) {
        minimap.removeAttribute("data-responsive-hidden");
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
      let exposedBottom = dock.getBoundingClientRect().top;
      const panel = shell.getBoundingClientRect();
      if (!shell.classList.contains("is-collapsed")) exposedBottom = Math.min(exposedBottom, panel.top);
      if (!inspector.hidden && getComputedStyle(inspector).display !== "none") {
        exposedBottom = Math.min(exposedBottom, inspector.getBoundingClientRect().top);
      }
      scale.style.setProperty("--mobile-scale-top", `${top + 8}px`);
      const scaleBox = scale.getBoundingClientRect();
      const miniBox = minimap.getBoundingClientRect();
      const sharedColumn = miniBox.left < scaleBox.right && miniBox.right > scaleBox.left;
      minimap.style.setProperty("--mobile-minimap-top", `${sharedColumn ? scaleBox.bottom + 8 : top + 8}px`);
      const widgetBottom = minimap.getBoundingClientRect().bottom;
      // Keep editing surfaces reachable; this never changes the stored visibility preference.
      minimap.toggleAttribute("data-responsive-hidden", widgetBottom + 8 > exposedBottom);
    }
    const observer = new ResizeObserver(refresh);
    [dock, hud, rail, shell, inspector].forEach((element) => observer.observe(element));
    const mutations = new MutationObserver(refresh);
    mutations.observe(shell, { attributes: true, attributeFilter: ["class"] });
    mutations.observe(inspector, { attributes: true, attributeFilter: ["hidden"] });
    window.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("scroll", refresh);
    layout();
    return { refresh };
  }

  global.MapitMineMobileLayout = Object.freeze({ install, metrics });
})(typeof window !== "undefined" ? window : globalThis);
