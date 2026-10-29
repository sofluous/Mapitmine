(function attachLayerReorder(global) {
  "use strict";
  function plan(ids, source, target, edge) {
    if (source === target || !ids.includes(source) || !ids.includes(target) || !["before", "after"].includes(edge)) return null;
    const result = ids.filter((id) => id !== source);
    result.splice(result.indexOf(target) + (edge === "after" ? 1 : 0), 0, source);
    return result.every((id, index) => id === ids[index]) ? null : result;
  }

  function install(api) {
    const { root } = api;
    let gesture = null;
    let suppressClick = false;
    function clear() {
      const previous = gesture;
      gesture = null;
      root.querySelectorAll("[data-drop-edge]").forEach((row) => delete row.dataset.dropEdge);
      document.body.classList.remove("is-layer-reordering");
      if (previous && root.hasPointerCapture(previous.pointer)) root.releasePointerCapture(previous.pointer);
    }
    root.addEventListener("pointerdown", (event) => {
      suppressClick = false;
      if (event.button !== 0 || event.pointerType === "touch" || !api.enabled()) return;
      const copy = event.target.closest(".layer-copy");
      if (!copy || !root.contains(copy)) return;
      gesture = { source: copy.closest(".object-layer").dataset.objectId, map: api.map(), x: event.clientX, y: event.clientY, pointer: event.pointerId, active: false, drop: null };
    });
    root.addEventListener("pointermove", (event) => {
      if (!gesture || event.pointerId !== gesture.pointer) return;
      if (!(event.buttons & 1)) { clear(); return; }
      if (!api.enabled() || gesture.map !== api.map()) { clear(); return; }
      if (!gesture.active) {
        if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 6) return;
        gesture.active = true;
        root.setPointerCapture(event.pointerId);
        document.body.classList.add("is-layer-reordering");
      }
      event.preventDefault();
      root.querySelectorAll("[data-drop-edge]").forEach((row) => delete row.dataset.dropEdge);
      const row = document.elementFromPoint(event.clientX, event.clientY)?.closest(".layer-row");
      gesture.drop = null;
      if (!row || !root.contains(row)) return;
      const bounds = row.getBoundingClientRect();
      const edge = event.clientY < bounds.y + bounds.height / 2 ? "before" : "after";
      gesture.drop = { target: row.closest(".object-layer").dataset.objectId, edge };
      row.dataset.dropEdge = edge;
    });
    root.addEventListener("pointerup", (event) => {
      if (!gesture || event.pointerId !== gesture.pointer) return;
      const pending = gesture;
      suppressClick = pending.active;
      clear();
      if (pending.active && pending.drop) api.commit(pending.source, pending.drop.target, pending.drop.edge, pending.map);
    });
    root.addEventListener("click", (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    root.addEventListener("pointercancel", () => { suppressClick = !!gesture?.active; clear(); });
    window.addEventListener("pointerup", (event) => {
      if (gesture && !gesture.active && event.pointerId === gesture.pointer) clear();
    });
    root.addEventListener("lostpointercapture", () => { if (gesture) { suppressClick = gesture.active; clear(); } });
    window.addEventListener("blur", clear);
    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !gesture) return;
      suppressClick = gesture.active;
      clear(); event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    return Object.freeze({ cancel: clear });
  }
  global.MapitMineLayerReorder = Object.freeze({ plan, install });
})(typeof window !== "undefined" ? window : globalThis);
