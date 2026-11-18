(function attachObjectRows(global) {
  "use strict";

  const viewKey = "mapitmine.pinRowView";
  function setView(root, control, value, persist = true) {
    const view = value === "summary" ? "summary" : "detailed";
    root.dataset.view = view;
    control.value = view;
    if (persist) { try { localStorage.setItem(viewKey, view); } catch (_) { /* Presentation remains usable without storage. */ } }
    return view;
  }

  function installView(root, control) {
    let view = "detailed";
    try { view = localStorage.getItem(viewKey); } catch (_) { /* Use the default. */ }
    setView(root, control, view, false);
    control.addEventListener("change", () => setView(root, control, control.value));
  }

  function create(entry, layer, api) {
    const pin = entry.kind === "pin", object = entry.object;
    const row = document.createElement("div");
    row.className = `object-entry item-card${pin ? " pin-card" : " shape-card"}`;
    row.dataset.objectId = entry.id;
    row.dataset.objectKind = entry.kind;
    row.dataset.parentKey = `layer:${layer.id}`;
    row.dataset.outlineName = entry.name;
    if (pin) row.dataset.index = api.pinIndex(object);
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-level", "2");
    row.setAttribute("aria-label", entry.name);
    row.tabIndex = -1;
    const selected = api.selection();
    row.classList.toggle("is-selected", selected?.kind === entry.kind && selected.id === entry.id);
    row.classList.toggle("is-editing", pin && api.editing(object));
    row.setAttribute("aria-selected", String(selected?.kind === entry.kind && selected.id === entry.id));
    const date = object.timestamp ? new Date(object.timestamp).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
    const status = !layer.visible ? "Hidden" : layer.locked ? "Locked" : "";
    row.innerHTML = `<div class="pin-card-content"><div class="pin-card-main">
      <span class="pin-icon">${pin ? api.icon(object.icon) : '<span class="io iconoir-edit-pencil" aria-hidden="true"></span>'}</span>
      <div class="pin-text"><div class="pin-card-date">${api.escape(date)}${status ? `<span class="object-state">${api.escape(status)}</span>` : ""}</div>
      <div class="pin-line-secondary"><span class="pin-label object-name" title="${api.escape(entry.name)}">${api.escape(entry.name)}</span>
      <span class="pin-tag">${api.escape(pin ? object.id ? `[${object.id}]` : "" : object.type === "line" ? "Line" : "Path")}</span>
      <span class="${pin ? "pin-coords" : "shape-summary"}">${pin ? api.coordinates(object) : `${object.points.length} vertices`}</span></div>
      ${object.description ? `<div class="pin-description">${api.escape(object.description)}</div>` : ""}</div></div></div>`;

    const controls = document.createElement("div");
    controls.className = "pin-controls";
    const action = (name, label, icon, callback) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `ds-btn ds-btn-icon ds-btn-sm ds-icon-action ${name === "copy" ? "btn-copy-coords" : "btn-more"}`;
      button.dataset.outlineAction = name;
      button.dataset.action = name;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.innerHTML = `<span class="io ${icon}" aria-hidden="true"></span>`;
      button.addEventListener("click", event => { event.stopPropagation(); callback(button); });
      controls.appendChild(button);
    };
    if (pin) action("copy", "Copy coordinates", "iconoir-copy", () => api.copy(entry));
    action("more", pin ? "More pin actions" : "More shape actions", "iconoir-more-horiz", button => {
      const rect = button.getBoundingClientRect(); api.menu(entry, rect.right, rect.bottom + 4);
    });
    row.appendChild(controls);
    row.addEventListener("click", event => {
      if (event.target.closest("button")) return;
      row.focus({ preventScroll: true }); api.activate(entry, false);
    });
    row.addEventListener("dblclick", event => {
      if (event.target.closest("button")) return;
      event.preventDefault(); api.activate(entry, true);
    });
    row.addEventListener("contextmenu", event => {
      event.preventDefault(); event.stopPropagation(); api.menu(entry, event.clientX, event.clientY);
    });
    if (pin) {
      row.addEventListener("mouseenter", () => api.hover(object));
      row.addEventListener("mouseleave", () => api.hover(null));
      row.addEventListener("focusin", () => api.focus(object));
      row.addEventListener("focusout", event => { if (!row.contains(event.relatedTarget)) api.focus(null); });
    }
    return row;
  }

  global.MapitMineObjectRows = Object.freeze({ create, installView, setView });
})(typeof window !== "undefined" ? window : globalThis);
