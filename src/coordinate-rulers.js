(function attachCoordinateRulers(global) {
  "use strict";

  function ticks(start, end, offset, zoom, spacing = 80) {
    if (![start, end, offset, zoom, spacing].every(Number.isFinite) || zoom <= 0 || spacing <= 0 || end <= start) return [];
    const target = spacing / zoom;
    const power = 10 ** Math.floor(Math.log10(target));
    const step = [1, 2, 5, 10].map((factor) => factor * power).find((value) => value >= target);
    if (!Number.isFinite(step) || step <= 0) return [];
    const first = Math.ceil((start - offset) / zoom / step);
    const result = [];
    for (let index = 0; index < 512; index++) {
      const raw = (first + index) * step;
      const value = Object.is(raw, -0) ? 0 : raw;
      const position = offset + value * zoom;
      if (!Number.isFinite(value) || !Number.isFinite(position) || position > end + 0.001) break;
      if (position < start - 0.001 || result.at(-1)?.value === value) continue;
      const decimals = Math.max(0, Math.min(12, -Math.floor(Math.log10(step))));
      const label = String(Number(value.toFixed(decimals)));
      result.push({ value, position, label, step });
    }
    return result;
  }

  function intersects(a, b, gap = 4) {
    return a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
  }

  function install(api) {
    const root = document.createElement("div");
    root.id = "coordinateRulers";
    root.setAttribute("aria-hidden", "true");
    const horizontal = document.createElement("div"), vertical = document.createElement("div");
    horizontal.className = "coordinate-ruler ruler-x";
    vertical.className = "coordinate-ruler ruler-z";
    root.append(horizontal, vertical);
    document.body.appendChild(root);
    const measure = document.createElement("canvas").getContext("2d");
    let frame = null;
    let previous = "";
    function refresh() {
      if (frame === null) frame = requestAnimationFrame(render);
    }
    function render() {
      frame = null;
      root.hidden = !api.enabled();
      if (root.hidden) {
        document.documentElement.style.setProperty("--ruler-content-left", "0px");
        return;
      }
      const camera = api.camera();
      const viewport = window.visualViewport;
      const mobile = window.innerWidth <= 900;
      const visible = api.obstacles().filter((element) => {
        const style = getComputedStyle(element);
        return !element.hidden && style.display !== "none" && style.visibility !== "hidden";
      }).map((element) => ({ id: element.id, ...rect(element.getBoundingClientRect()) }));
      const topEdge = viewport?.offsetTop || 0;
      let left = 2, right = window.innerWidth - 2, top = topEdge + 2;
      let bottom = Math.min(window.innerHeight, topEdge + (viewport?.height || window.innerHeight)) - 8;
      for (const box of visible) {
        if (!mobile && box.id === "workspaceShell") left = Math.max(left, box.right + 8);
        if (!mobile && box.id === "contextInspector" && box.left - left > 180) right = Math.min(right, box.left - 8);
        if (mobile && ["mobileDock", "workspaceShell", "contextInspector"].includes(box.id)) bottom = Math.min(bottom, box.top - 8);
      }
      if (bottom - top < 80) top = topEdge + 2;
      const style = getComputedStyle(horizontal);
      measure.font = `${style.fontSize} ${style.fontFamily}`;
      const minZ = (top - camera.offsetY) / camera.zoom, maxZ = (bottom - camera.offsetY) / camera.zoom;
      const sample = ticks(top, bottom, camera.offsetY, camera.zoom, 44);
      const gutter = Math.max(24, ...sample.map((tick) => measure.measureText(tick.label).width + 10));
      document.documentElement.style.setProperty("--ruler-content-left", `${left + gutter + 4}px`);
      let horizontalLeft = left + gutter;
      for (const box of visible) {
        if (box.top < top + 18 && box.bottom > top && box.left < horizontalLeft + 16 && box.right > horizontalLeft) horizontalLeft = box.right + 4;
      }
      const bounds = { left, right, top, bottom, gutter, horizontalLeft };
      const signature = JSON.stringify([camera, bounds, visible, style.fontSize, style.fontFamily]);
      if (signature === previous) return;
      previous = signature;
      root.dataset.bounds = JSON.stringify(bounds);
      horizontal.hidden = right - horizontalLeft < 72 || bottom - top < 18;
      vertical.hidden = bottom - top < 80 || right - left < gutter + 24 || !Number.isFinite(minZ + maxZ);
      Object.assign(horizontal.style, { left: `${horizontalLeft}px`, top: `${top}px`, width: `${Math.max(0, right - horizontalLeft)}px` });
      Object.assign(vertical.style, { left: `${left}px`, top: `${top + 18}px`, width: `${gutter}px`, height: `${Math.max(0, bottom - top - 18)}px` });
      drawAxis(horizontal, "X", horizontalLeft, right, camera.offsetX, camera.zoom, visible, bounds);
      drawAxis(vertical, "Z", top + 18, bottom, camera.offsetY, camera.zoom, visible, bounds);
    }
    function rect(box) { return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }; }
    function drawAxis(element, axis, start, end, offset, zoom, obstacles, bounds) {
      const badge = document.createElement("span"); badge.className = "ruler-axis"; badge.textContent = axis;
      element.replaceChildren(badge);
      if (element.hidden) return;
      const horizontal = axis === "X";
      const endpointLabels = ticks(start, end, offset, zoom, 80);
      const spacing = horizontal ? Math.max(60, ...endpointLabels.map((tick) => measure.measureText(tick.label).width + 16)) : 36;
      const majorTicks = ticks(start + 20, end - 4, offset, zoom, spacing);
      const step = majorTicks[0]?.step;
      // Marks are independent of label omission, with five subdivisions per major interval.
      if (step) for (let index = Math.ceil((start - offset) / zoom / (step / 5)), count = 0; count < 512; index++, count++) {
        const position = offset + index * (step / 5) * zoom;
        if (position > end) break;
        const mark = document.createElement("span");
        mark.className = `ruler-mark${index % 5 === 0 ? " is-major" : ""}`;
        mark.style[horizontal ? "left" : "top"] = `${position - start}px`;
        element.appendChild(mark);
      }
      for (const tick of majorTicks) {
        const width = measure.measureText(tick.label).width;
        const labelBox = horizontal
          ? { left: tick.position - width / 2, right: tick.position + width / 2, top: bounds.top, bottom: bounds.top + 18 }
          : { left: bounds.left, right: bounds.left + bounds.gutter, top: tick.position - 6, bottom: tick.position + 6 };
        if ((horizontal && (labelBox.left < start || labelBox.right > end)) || labelBox.bottom > bounds.bottom || obstacles.some((box) => intersects(labelBox, box))) continue;
        const mark = document.createElement("span");
        mark.className = "ruler-tick";
        mark.dataset.value = String(tick.value);
        mark.dataset.position = String(tick.position);
        mark.textContent = tick.label;
        mark.title = `${axis} ${tick.value}`;
        mark.style[horizontal ? "left" : "top"] = `${tick.position - start}px`;
        element.appendChild(mark);
      }
    }
    const observer = new ResizeObserver(refresh);
    api.obstacles().forEach((element) => observer.observe(element));
    const mutations = new MutationObserver(refresh);
    api.obstacles().forEach((element) => mutations.observe(element, { attributes: true, attributeFilter: ["hidden", "class", "data-responsive-hidden", "style"] }));
    window.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("scroll", refresh);
    document.fonts?.ready.then(refresh);
    refresh();
    return { refresh };
  }

  global.MapitMineRulers = Object.freeze({ ticks, intersects, install });
})(typeof window !== "undefined" ? window : globalThis);
