(function attachObjectMenuGesture(global) {
  "use strict";
  function install({ canvas, enabled, targetAt, interrupt, activate, delay = 550 }) {
    let pending = null;
    const cancel = () => { if (pending) global.clearTimeout(pending.timer); pending = null; };
    global.addEventListener("pointerdown", (event) => {
      cancel();
      if (event.pointerType !== "touch" || event.isPrimary === false || event.target !== canvas || !enabled()) return;
      const target = targetAt(event.clientX, event.clientY);
      if (!target) return;
      const gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, target };
      gesture.timer = global.setTimeout(() => {
        if (pending !== gesture || !enabled()) return cancel();
        pending = null; interrupt(); activate(gesture.target, gesture.x, gesture.y);
      }, delay);
      pending = gesture;
    }, true);
    global.addEventListener("pointermove", (event) => {
      if (event.pointerId === pending?.id && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) >= 4) cancel();
    }, true);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture", "blur", "wheel"]) global.addEventListener(type, cancel, true);
    return { cancel };
  }
  global.MapitMineObjectMenuGesture = Object.freeze({ install });
})(typeof window !== "undefined" ? window : globalThis);
