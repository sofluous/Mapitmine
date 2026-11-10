(function attachTouchNavigation(global) {
  function frame(points) {
    const [a, b] = points;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  function pinchCamera(camera, start, next) {
    if (!(start.distance > 0) || !Number.isFinite(next.distance)) return camera;
    const zoom = Math.max(0.25, Math.min(5, camera.zoom * next.distance / start.distance));
    return { zoom, offsetX: next.x - (start.x - camera.offsetX) / camera.zoom * zoom,
      offsetY: next.y - (start.y - camera.offsetY) / camera.zoom * zoom };
  }

  function install({ canvas, camera, updateCamera, beginPan, movePan, endPan, interruptEdit, suppressClick, resetClick }) {
    const pointers = new Map();
    let single = false, multi = false, cancelled = false, baseline = null, blockClick = false;
    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top,
        clientX: event.clientX, clientY: event.clientY };
    };
    const capture = (id) => { try { canvas.setPointerCapture(id); } catch (_) { /* Synthetic/cancelled pointers may have no capture. */ } };
    const stop = (event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    const rebase = () => {
      baseline = pointers.size >= 2 ? { camera: camera(), frame: frame([...pointers.values()]) } : null;
    };
    const cancel = () => {
      endPan(); single = false; baseline = null;
      cancelled = true; blockClick = true; suppressClick();
    };

    // Window capture runs before drawing/vertex capture: the second finger owns navigation.
    global.addEventListener("pointerdown", (event) => {
      if (event.target !== canvas) return;
      if (event.pointerType !== "touch") {
        if (!pointers.size) { blockClick = false; resetClick(); }
        return;
      }
      if (!pointers.size) { multi = false; cancelled = false; blockClick = false; resetClick(); }
      pointers.set(event.pointerId, point(event));
      if (pointers.size < 2) return;
      stop(event);
      endPan(); single = false;
      if (!multi) interruptEdit();
      multi = true; blockClick = true; suppressClick();
      for (const id of pointers.keys()) capture(id);
      rebase();
    }, { capture: true, passive: false });

    canvas.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch" || multi) return;
      single = true;
      beginPan(event.clientX, event.clientY);
      capture(event.pointerId);
    });
    global.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, point(event));
      if (multi || cancelled) stop(event);
      if (cancelled) return;
      if (multi && baseline) {
        if (baseline.frame.distance === 0) rebase();
        else updateCamera(pinchCamera(baseline.camera, baseline.frame, frame([...pointers.values()])));
      }
      else if (single) movePan(event.clientX, event.clientY);
    }, { capture: true, passive: false });

    function finish(event) {
      if (!pointers.has(event.pointerId)) return;
      if (multi || cancelled) stop(event);
      pointers.delete(event.pointerId);
      endPan(); single = false;
      if (event.type === "pointercancel") cancel();
      if (multi && !cancelled) {
        rebase();
        if (pointers.size === 1) {
          const remaining = [...pointers.values()][0];
          beginPan(remaining.clientX, remaining.clientY); single = true;
        }
      }
      if (multi || cancelled) suppressClick();
      try { canvas.releasePointerCapture(event.pointerId); } catch (_) { /* Already released by the browser. */ }
    }
    global.addEventListener("pointerup", finish, { capture: true, passive: false });
    global.addEventListener("pointercancel", finish, { capture: true, passive: false });
    canvas.addEventListener("lostpointercapture", (event) => {
      if (pointers.has(event.pointerId) && (single || multi) && !canvas.hasPointerCapture(event.pointerId)) cancel();
    });
    global.addEventListener("blur", () => {
      if (!pointers.size) return;
      cancel();
      const ids = [...pointers.keys()]; pointers.clear();
      for (const id of ids) { try { canvas.releasePointerCapture(id); } catch (_) { /* Capture may be lost on blur. */ } }
    });
    // Compatibility mouse events must not turn a completed pinch into pin placement or deselection.
    for (const type of ["mousedown", "mouseup", "click", "dblclick", "contextmenu"]) {
      global.addEventListener(type, (event) => {
        if (event.target !== canvas) return;
        if (event.sourceCapabilities?.firesTouchEvents === false && !pointers.size) blockClick = false;
        if (blockClick || pointers.size) stop(event);
      }, { capture: true, passive: false });
    }
    return { active: () => pointers.size > 0 };
  }

  global.MapitMineTouchNavigation = Object.freeze({ pinchCamera, install });
})(typeof window !== "undefined" ? window : globalThis);
