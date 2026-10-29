(function attachObjectOutline(global) {
  "use strict";

  function navigate(items, key, command) {
    if (!items.length) return null;
    const index = Math.max(0, items.findIndex((item) => item.key === key));
    const item = items[index];
    if (command === "Home") return { key: items[0].key };
    if (command === "End") return { key: items.at(-1).key };
    if (command === "ArrowUp") return { key: items[Math.max(0, index - 1)].key };
    if (command === "ArrowDown") return { key: items[Math.min(items.length - 1, index + 1)].key };
    if (command === "ArrowLeft") {
      if (item.branch && item.expanded) return { key: item.key, expanded: false };
      return { key: item.parentKey || item.key };
    }
    if (command === "ArrowRight" && item.branch) {
      if (!item.expanded) return { key: item.key, expanded: true };
      if (items[index + 1]?.parentKey === item.key) return { key: items[index + 1].key };
    }
    return { key: item.key };
  }

  function install(api) {
    const { root } = api;
    let focusedKey = "";
    let restore = null;
    let prefix = "";
    let lastTyped = 0;
    let activating = false;
    const keyOf = (row) => `${row.dataset.objectKind}:${row.dataset.objectId}`;
    const rows = () => Array.from(root.querySelectorAll('[role="treeitem"]')).filter((row) => !row.closest("[hidden]"));
    const reference = (row) => ({ kind: row.dataset.objectKind, id: row.dataset.objectId });

    function focus(row) {
      if (!row) return;
      focusedKey = keyOf(row);
      rows().forEach((entry) => { entry.tabIndex = entry === row ? 0 : -1; });
      row.focus({ preventScroll: true });
      row.scrollIntoView({ block: "nearest" });
    }

    function beforeRender() {
      const active = document.activeElement;
      const row = active?.closest?.('[role="treeitem"]');
      restore = row && root.contains(row) ? {
        key: keyOf(row), parent: row.dataset.parentKey,
        action: active.dataset.outlineAction || "",
      } : null;
    }

    function afterRender() {
      const visible = rows();
      const wanted = restore?.key || focusedKey;
      const row = visible.find((entry) => keyOf(entry) === wanted) ||
        visible.find((entry) => keyOf(entry) === restore?.parent) || visible[0];
      focusedKey = row ? keyOf(row) : "";
      visible.forEach((entry) => { entry.tabIndex = entry === row ? 0 : -1; });
      root.tabIndex = visible.length ? -1 : 0;
      if (restore) {
        const action = restore.action && row
          ? Array.from(row.querySelectorAll("[data-outline-action]")).find((entry) => entry.dataset.outlineAction === restore.action && !entry.disabled)
          : null;
        if (action) action.focus();
        else if (row) focus(row);
        else root.focus();
      }
      restore = null;
    }

    root.addEventListener("focusin", (event) => {
      const row = event.target.closest('[role="treeitem"]');
      if (!row) return;
      focusedKey = keyOf(row);
      rows().forEach((entry) => { entry.tabIndex = entry === row ? 0 : -1; });
    });

    root.addEventListener("keydown", async (event) => {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const row = event.target.closest('[role="treeitem"]');
      if (!row || (event.target !== row && event.key !== "Escape")) return;
      const visible = rows();
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        prefix = "";
        const items = visible.map((entry) => ({
          key: keyOf(entry), parentKey: entry.dataset.parentKey,
          branch: entry.dataset.objectKind === "layer", expanded: entry.getAttribute("aria-expanded") === "true",
        }));
        const next = navigate(items, keyOf(row), event.key);
        if (next && "expanded" in next) api.expand(row.dataset.objectId, next.expanded);
        else focus(visible.find((entry) => keyOf(entry) === next?.key));
        return;
      }
      if (["Enter", " ", "F2", "Escape"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        prefix = "";
        if (activating || event.repeat) return;
        activating = true;
        try {
          if (event.key === "Escape") await api.select(null);
          else if (event.key === "F2") await api.edit(reference(row));
          else await api.select(reference(row));
        } finally { activating = false; }
        return;
      }
      if (event.key.length === 1 && /\S/.test(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const now = Date.now();
        prefix = now - lastTyped > 700 ? event.key.toLowerCase() : prefix + event.key.toLowerCase();
        lastTyped = now;
        const search = Array.from(prefix).every((letter) => letter === prefix[0]) ? prefix[0] : prefix;
        const index = visible.indexOf(row);
        const ordered = [...visible.slice(index + 1), ...visible.slice(0, index + 1)];
        focus(ordered.find((entry) => (entry.dataset.outlineName || "").toLowerCase().startsWith(search)));
      }
    });
    return Object.freeze({ beforeRender, afterRender });
  }

  global.MapitMineOutline = Object.freeze({ navigate, install });
})(typeof window !== "undefined" ? window : globalThis);
