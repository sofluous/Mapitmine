(function attachWorkspaceState(global) {
  "use strict";

  function create() {
    let selection = null;
    let tool = "select";
    const listeners = new Set();
    function snapshot() { return { selection: selection ? { ...selection } : null, tool }; }
    function publish() { listeners.forEach((listener) => listener(snapshot())); }
    return Object.freeze({
      get: snapshot,
      select(reference) {
        if (reference && (!["pin", "drawing", "layer"].includes(reference.kind) || typeof reference.id !== "string" || !reference.id)) {
          throw new TypeError("Selection requires a typed, stable object ID.");
        }
        if (selection?.kind === reference?.kind && selection?.id === reference?.id) return;
        selection = reference ? { kind: reference.kind, id: reference.id } : null;
        publish();
      },
      setTool(next) {
        if (!["select", "pin", "line", "path", "pan"].includes(next)) throw new TypeError("Unknown canvas tool.");
        if (next === tool) return;
        tool = next;
        publish();
      },
      reset() { selection = null; tool = "select"; publish(); },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    });
  }

  global.MapitMineWorkspace = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
