(function attachDrawingTools(global) {
  "use strict";

  function hitTest(points, point, tolerance) {
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSquared = dx * dx + dz * dz;
      const t = lengthSquared
        ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared))
        : 0;
      if (Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz) <= tolerance) return true;
    }
    return false;
  }

  function validPoints(points, type) {
    return Array.isArray(points) && points.length >= 2 &&
      (type !== "line" || points.length === 2) &&
      points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.z)) &&
      points.some((point) => point.x !== points[0].x || point.z !== points[0].z);
  }

  function install(api) {
    const { canvas, panel } = api;
    let draft = null;
    let selectedId = null;
    const selectedDrawingId = () => api.workspace
      ? (api.workspace.get().selection?.kind === "drawing" ? api.workspace.get().selection.id : null)
      : selectedId;
    function selectDrawing(id) {
      if (!api.workspace) { selectedId = id; return; }
      if (id) api.workspace.select({ kind: "drawing", id });
      else if (api.workspace.get().selection?.kind === "drawing") api.workspace.select(null);
    }
    let preview = null;
    let editorSnapshot = "";
    let originalEditorValues = "";
    let switching = false;
    const toolRoot = api.tools || panel;
    const field = (id) => panel.querySelector(`#${id}`) || toolRoot.querySelector(`#${id}`);
    const selected = () => api.drawings().find((drawing) => drawing.id === selectedDrawingId());
    const editable = (drawing) => {
      const layer = api.layers().find((entry) => entry.id === drawing?.layerId);
      return !!layer && layer.visible && !layer.locked;
    };

    function cancel() {
      draft = null;
      preview = null;
      canvas.style.cursor = "";
      api.workspace?.setTool("select");
      refresh();
      api.redraw();
    }

    function reset() {
      selectDrawing(null);
      cancel();
    }

    function refresh() {
      const layerSelect = field("drawingLayer");
      const previous = layerSelect.value;
      layerSelect.replaceChildren();
      api.layers().forEach((layer) => {
        const option = document.createElement("option");
        option.value = layer.id;
        option.textContent = layer.label;
        option.disabled = !layer.visible || layer.locked;
        layerSelect.appendChild(option);
      });
      const writable = api.layers().filter((layer) => layer.visible && !layer.locked);
      layerSelect.value = writable.some((layer) => layer.id === previous) ? previous : writable[0]?.id || "";
      toolRoot.querySelectorAll("[data-draw-tool]").forEach((button) => {
        button.disabled = !api.hasMap() || !writable.length;
        button.setAttribute("aria-pressed", String(draft?.type === button.dataset.drawTool));
      });
      field("drawingFinish").disabled = !draft || !validPoints(draft.points, draft.type);
      field("drawingCancel").disabled = !draft;
      layerSelect.disabled = !!draft;
      field("drawingProgress").textContent = draft ? `${draft.type === "line" ? "Line" : "Path"}: ${draft.points.length} points` : "";
      const selection = field("drawingSelection");
      selection.replaceChildren();
      const none = document.createElement("option");
      none.value = "";
      none.textContent = "None";
      selection.appendChild(none);
      api.drawings().forEach((entry, index) => {
        if (!["line", "path"].includes(entry.type)) return;
        const layer = api.layers().find((layer) => layer.id === entry.layerId);
        const option = document.createElement("option");
        option.value = entry.id;
        option.textContent = `${entry.name || `${entry.type === "line" ? "Line" : "Path"} ${index + 1}`} - ${layer?.label || "Pins"}`;
        option.disabled = !layer?.visible;
        selection.appendChild(option);
      });
      if (!api.drawings().some((entry) => entry.id === selectedDrawingId())) selectDrawing(null);
      selection.value = selectedDrawingId() || "";
      selection.disabled = !!draft;
      const drawing = selected();
      const editor = field("drawingEditor");
      editor.hidden = !drawing;
      if (!drawing) { editorSnapshot = ""; originalEditorValues = ""; return; }
      const canEdit = editable(drawing);
      const snapshot = JSON.stringify([drawing.id, drawing.name, drawing.points, drawing.style, canEdit]);
      if (snapshot === editorSnapshot) return;
      editorSnapshot = snapshot;
      const nameField = field("drawingName");
      nameField.value = drawing.name || drawing.type;
      field("drawingEditorTitle").textContent = `${drawing.type === "line" ? "Line" : "Path"}${canEdit ? "" : " (locked)"}`;
      field("drawingColor").value = /^#[0-9a-f]{6}$/i.test(drawing.style?.color || "") ? drawing.style.color : "#55bb99";
      field("drawingWidth").value = Math.min(12, Math.max(1, Number(drawing.style?.width) || 2));
      const points = field("drawingPoints");
      points.replaceChildren();
      drawing.points.forEach((point, index) => {
        const row = document.createElement("div");
        row.className = "control-inline";
        ["x", "z"].forEach((axis) => {
          const input = document.createElement("input");
          input.className = "ds-input";
          input.type = "number";
          input.step = "any";
          input.value = point[axis];
          input.dataset.axis = axis;
          input.dataset.point = index;
          input.setAttribute("aria-label", `Point ${index + 1} ${axis.toUpperCase()}`);
          input.disabled = !canEdit;
          const label = document.createElement("label");
          label.className = "drawing-point-field";
          const caption = document.createElement("span");
          caption.textContent = `${axis.toUpperCase()}${index + 1}`;
          label.appendChild(caption);
          label.appendChild(input);
          row.appendChild(label);
        });
        points.appendChild(row);
      });
      editor.querySelectorAll("button, input").forEach((control) => { control.disabled = !canEdit; });
      originalEditorValues = JSON.stringify(readEditor());
    }

    function readEditor() {
      return {
        name: field("drawingName").value,
        color: field("drawingColor").value,
        width: field("drawingWidth").value,
        points: Array.from(field("drawingPoints").querySelectorAll("input"), (input) => input.value),
      };
    }

    function hasPendingEdits() {
      return !!selected() && !!originalEditorValues && JSON.stringify(readEditor()) !== originalEditorValues;
    }

    async function resolveEdits() {
      if (!hasPendingEdits()) return true;
      const choice = api.resolveDraft
        ? await api.resolveDraft({ title: "Unapplied drawing changes", canFinish: editable(selected()), finishText: "Apply" })
        : await api.confirm({ title: "Discard drawing changes?", message: "Discard unapplied drawing properties?", confirmText: "Discard" }) ? "discard" : "keep";
      if (choice === "keep") return false;
      if (choice === "finish") return apply();
      editorSnapshot = "";
      refresh();
      return true;
    }

    function commit(label, change) {
      api.history(label);
      change();
      api.save();
      refresh();
      api.redraw();
    }

    function finish() {
      if (!draft || !editable(draft) || !validPoints(draft.points, draft.type)) return;
      const drawing = {
        id: `drawing-${crypto.randomUUID()}`,
        type: draft.type,
        name: `${draft.type === "line" ? "Line" : "Path"} ${api.drawings().length + 1}`,
        layerId: draft.layerId,
        points: draft.points.map((point) => ({ ...point })),
        style: { color: "#55bb99", width: 2 },
      };
      commit("Add Drawing", () => api.drawings().push(drawing));
      selectDrawing(drawing.id);
      cancel();
    }

    async function start(type) {
      if (switching || !["line", "path"].includes(type) || !api.hasMap()) return;
      switching = true;
      try {
        if (!await leave()) return;
        if (api.prepareTool && !await api.prepareTool()) return;
        const layerId = field("drawingLayer").value;
        if (!editable({ layerId })) return;
        api.closePinEditor();
        api.workspace?.select(null);
        selectDrawing(null);
        draft = { type, layerId, points: [] };
        canvas.style.cursor = "crosshair";
        api.workspace?.setTool(draft.type);
        refresh();
        api.redraw();
      } finally { switching = false; }
    }

    async function leave() {
      if (!draft) return resolveEdits();
      const choice = api.resolveDraft
        ? await api.resolveDraft({ title: "Unfinished drawing", canFinish: editable(draft) && validPoints(draft.points, draft.type) })
        : await api.confirm({ title: "Discard drawing draft?", message: "Discard the unfinished drawing and switch tools?", confirmText: "Discard" }) ? "discard" : "keep";
      if (choice === "keep") return false;
      if (choice === "finish") {
        finish();
        return !draft;
      }
      cancel();
      return true;
    }

    toolRoot.querySelectorAll("[data-draw-tool]").forEach((button) => {
      button.addEventListener("click", () => start(button.dataset.drawTool));
    });
    field("drawingFinish").addEventListener("click", finish);
    field("drawingCancel").addEventListener("click", cancel);
    field("drawingSelection").addEventListener("change", () => {
      selectDrawing(field("drawingSelection").value || null);
      refresh();
      api.redraw();
    });
    function apply() {
      const drawing = selected();
      if (!drawing || !editable(drawing)) return false;
      const points = drawing.points.map(() => ({}));
      field("drawingPoints").querySelectorAll("input").forEach((input) => {
        points[Number(input.dataset.point)][input.dataset.axis] = input.value === "" ? NaN : Number(input.value);
      });
      const width = Number(field("drawingWidth").value);
      const name = field("drawingName").value.trim();
      if (!name) { api.toast("Enter a drawing name.", "warn"); return false; }
      if (!validPoints(points, drawing.type) || !Number.isFinite(width) || width < 1 || width > 12) {
        api.toast("Enter valid points and a width between 1 and 12.", "warn");
        return false;
      }
      commit("Edit Drawing", () => {
        drawing.name = name;
        drawing.points = points;
        drawing.style = { ...drawing.style, color: field("drawingColor").value, width };
      });
      originalEditorValues = JSON.stringify(readEditor());
      return true;
    }
    field("drawingApply").addEventListener("click", apply);
    field("drawingDelete").addEventListener("click", async () => {
      const drawing = selected();
      if (!drawing || !editable(drawing)) return;
      if (!await api.confirm({ title: "Delete drawing?", message: "Remove the selected drawing?", confirmText: "Delete" })) return;
      if (!api.drawings().includes(drawing) || !editable(drawing)) return;
      commit("Delete Drawing", () => api.drawings().splice(api.drawings().indexOf(drawing), 1));
      selectDrawing(null);
      refresh();
    });

    // Capture drawing gestures before the existing pin and pan handlers.
    ["mousedown", "pointerdown", "dblclick", "contextmenu"].forEach((name) => {
      canvas.addEventListener(name, (event) => {
        if (!draft) return;
        event.stopImmediatePropagation();
        if (name === "contextmenu") { event.preventDefault(); cancel(); }
      }, true);
    });
    canvas.addEventListener("mousemove", (event) => {
      if (!draft) return;
      preview = api.world(event.clientX, event.clientY);
      api.redraw();
    });
    canvas.addEventListener("click", (event) => {
      // A completed pan is navigation, not a new object-selection click.
      if (api.consumeClick?.()) { event.stopImmediatePropagation(); return; }
      if (draft) {
        event.stopImmediatePropagation();
        if (!editable(draft)) { cancel(); return; }
        const point = api.world(event.clientX, event.clientY);
        const last = draft.points.at(-1);
        if (!last || point.x !== last.x || point.z !== last.z) draft.points.push(point);
        if (draft.type === "line" && draft.points.length === 2) finish();
        else { refresh(); api.redraw(); }
        return;
      }
      if (!api.canSelect()) return;
      if (hasPendingEdits()) {
        event.stopImmediatePropagation();
        resolveEdits().then((resolved) => {
          if (!resolved) return;
          if (api.pinHit?.(event)) { api.selectCanvasPin?.(event); return; }
          chooseAt(event);
        });
        return;
      }
      if (api.pinHit?.(event)) { selectDrawing(null); return; }
      chooseAt(event);
    }, true);

    function chooseAt(event) {
      const point = api.world(event.clientX, event.clientY);
      const drawing = [...api.drawings()].reverse().find((entry) =>
        ["line", "path"].includes(entry.type) &&
        api.layers().find((layer) => layer.id === entry.layerId)?.visible &&
        hitTest(entry.points, point, 7 / api.camera().zoom));
      selectDrawing(drawing?.id || null);
      if (drawing) { event.stopImmediatePropagation(); api.openLayers(); }
      refresh();
      api.redraw();
    }
    window.addEventListener("keydown", (event) => {
      if (document.body?.classList.contains("is-layer-reordering")) return;
      if (event.target.closest?.("input, textarea, select, dialog")) return;
      if (event.target.closest?.('[role="tree"]')) return;
      if (event.key === "Escape" && (draft || selectedDrawingId())) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (draft) reset();
        else resolveEdits().then((resolved) => { if (resolved) reset(); });
      } else if (event.key === "Enter" && draft) {
        event.preventDefault();
        finish();
      }
    }, true);

    function render(ctx) {
      if (draft && !editable(draft)) {
        draft = null;
        preview = null;
        canvas.style.cursor = "";
      }
      const { zoom, offsetX, offsetY } = api.camera();
      const paint = (drawing, temporary = false) => {
        if (!["line", "path"].includes(drawing.type) || !api.layers().find((layer) => layer.id === drawing.layerId)?.visible) return;
        const points = temporary && preview ? [...drawing.points, preview] : drawing.points;
        if (!points.length) return;
        ctx.save();
        ctx.lineWidth = Math.min(12, Math.max(1, Number(drawing.style?.width) || 2));
        ctx.strokeStyle = /^#[0-9a-f]{3,8}$/i.test(drawing.style?.color || "") ? drawing.style.color : api.color();
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.setLineDash(temporary ? [5, 4] : []);
        ctx.beginPath();
        points.forEach((point, index) => {
          const x = offsetX + point.x * zoom;
          const y = offsetY + point.z * zoom;
          if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        if (drawing.id === selectedDrawingId()) {
          ctx.fillStyle = api.color();
          points.forEach((point) => ctx.fillRect(offsetX + point.x * zoom - 3, offsetY + point.z * zoom - 3, 6, 6));
        }
        ctx.restore();
      };
      api.layers().forEach((layer) => api.drawings().filter((drawing) => drawing.layerId === layer.id).forEach((drawing) => paint(drawing)));
      if (draft) paint(draft, true);
    }

    refresh();
    return { render, refresh, reset, start, leave, resolveEdits, hasPendingEdits, active: () => !!draft };
  }

  global.MapitMineDrawing = Object.freeze({ hitTest, validPoints, install });
})(typeof window !== "undefined" ? window : globalThis);
