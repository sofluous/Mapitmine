(function attachScrollLayout(global) {
  "use strict";

  // Install after EditorFields.install(), before Drawing.install(). Load the
  // companion stylesheet after editor-fields.css. Existing nodes retain listeners.
  function wrapContent(owner) {
    if (!owner || owner.querySelector(":scope > .scroll-layout-content")) return;
    const content = document.createElement("div");
    content.className = "scroll-layout-content";
    content.append(...owner.childNodes);
    owner.append(content);
  }

  function install() {
    document.querySelectorAll(
      "#mapViewPanelSection > .workspace-section-body, " +
      "#settings > .workspace-section-body, " +
      "#pinEditorPanel.compact-editor > .pin-editor-body",
    ).forEach(wrapContent);
    // Gallery and point controllers replace their children on every render.
    // Their content clearance is CSS-owned; never insert a wrapper inside them.
    return global.MapitMineScrollLayout;
  }

  global.MapitMineScrollLayout = Object.freeze({ install });
})(typeof window !== "undefined" ? window : globalThis);
