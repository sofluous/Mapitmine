(function attachEditorFields(global) {
  "use strict";

  let installed = false;
  let measurementContext = null;
  const byId = (id) => document.getElementById(id);
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function field(id, caption, modifier = "") {
    const control = byId(id);
    if (!control) return null;
    const label = element("label", `editor-field ${modifier}`.trim());
    label.htmlFor = id;
    label.append(element("span", "editor-field-label", caption), control);
    return label;
  }

  function disclosure(caption, ...children) {
    const details = element("details", "editor-disclosure");
    details.append(element("summary", "", caption), ...children.filter(Boolean));
    return details;
  }

  function refresh(options = {}) {
    if (options.resetPin) {
      byId("pinEditorPanel")?.querySelectorAll(".editor-disclosure").forEach((node) => { node.open = false; });
    }
    const context = measurementContext || (measurementContext = document.createElement("canvas").getContext("2d"));
    document.querySelectorAll(".editor-coordinates input, #drawingPoints input").forEach((control) => {
      const label = control.closest("label");
      if (!label) return;
      const length = Math.max(3, String(control.value).length);
      const style = getComputedStyle(control);
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      context.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
      const text = String(control.value || "000");
      const minimum = Math.ceil(context.measureText(text).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 4);
      label.style.setProperty("--coordinate-weight", length);
      label.style.setProperty("--coordinate-min", `${minimum}px`);
    });
  }

  function install() {
    if (installed) return global.MapitMineEditorFields;
    const pin = byId("pinEditorPanel");
    const shape = byId("drawingEditor");
    if (!pin || !shape) return global.MapitMineEditorFields;
    installed = true;
    pin.classList.add("compact-editor");
    shape.classList.add("compact-editor");

    const coordinates = element("div", "editor-coordinates");
    ["X", "Y", "Z"].forEach((axis) => coordinates.append(field(`pinEditor${axis}`, axis)));
    const properties = element("div", "editor-property-pair");
    properties.append(field("pinEditorLayer", "Layer"), field("pinEditorID", "Type"));
    const appearance = element("div", "editor-appearance");
    appearance.append(field("pinEditorColor", "Color", "editor-swatch"), field("pinEditorIcon", "Icon", "editor-icon"));
    const secondary = element("div", "editor-secondary");
    secondary.append(disclosure("Notes", field("pinEditorDescription", "Notes")), disclosure("Appearance", appearance));
    pin.querySelector(".pin-editor-body").replaceChildren(coordinates, field("pinEditorLabel", "Name"), properties, secondary);
    const header = byId("pinEditorHeader");
    header.insertBefore(byId("pinEditorHelpBtn"), byId("pinEditorCloseBtn"));
    pin.querySelector(".pin-editor-actions").classList.add("editor-footer");

    const name = byId("drawingName");
    const oldName = name.closest("label");
    const nameField = field("drawingName", "Name");
    oldName.replaceWith(nameField);
    const layer = element("div", "editor-field editor-layer-context");
    layer.append(element("span", "editor-field-label", "Layer"));
    const layerName = element("output", "");
    layerName.id = "drawingEditorLayer";
    layer.append(layerName);
    shape.prepend(nameField, layer);
    const style = byId("drawingStyle");
    style.classList.add("editor-disclosure");
    style.querySelector("summary").textContent = "Appearance";
    const styleFields = element("div", "editor-appearance");
    styleFields.append(field("drawingColor", "Color", "editor-swatch"), field("drawingWidth", "Width", "editor-stroke"));
    style.querySelector("div").replaceWith(styleFields);
    const geometry = disclosure("Vertices");
    geometry.id = "drawingGeometry";
    const tools = shape.querySelector(".vertex-tools");
    tools.before(geometry);
    geometry.append(tools, byId("drawingPoints"));
    const footer = byId("drawingApply").parentElement;
    footer.classList.add("editor-footer");
    const revert = element("button", "ds-btn", "Revert");
    revert.type = "button";
    revert.id = "drawingRevert";
    footer.prepend(revert);
    // Keep the existing destructive command separate from routine completion.
    shape.insertBefore(byId("drawingDelete"), footer);
    [pin, shape].forEach((root) => root.addEventListener("input", () => refresh()));
    refresh();
    return global.MapitMineEditorFields;
  }

  global.MapitMineEditorFields = Object.freeze({ install, refresh });
})(typeof window !== "undefined" ? window : globalThis);
