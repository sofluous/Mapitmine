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

  function nearestSegment(points, point, tolerance) {
    let result = null;
    for (let index = 0; index < points.length - 1; index++) {
      const a = points[index], b = points[index + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const squared = dx * dx + dz * dz;
      if (!squared) continue;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / squared));
      const projected = { x: a.x + t * dx, z: a.z + t * dz };
      const distance = Math.hypot(point.x - projected.x, point.z - projected.z);
      if (t > 0 && t < 1 && distance <= tolerance && (!result || distance < result.distance)) {
        result = { index, point: projected, distance };
      }
    }
    return result;
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
    let draftPointer = null;
    let suppressDraftClick = false;
    let draftHover = -1;
    let draftSelection = -1;
    let editorSnapshot = "";
    let originalEditorValues = "";
    let switching = false;
    let vertexId = null;
    let activeVertex = 0;
    let showAllPoints = false;
    let pointListToggle = null;
    let pointListIcon = null;
    let pointListDrawingId = null;
    let vertexDrag = null;
    let suppressVertexClick = false;
    const toolRoot = api.tools || panel;
    const field = (id) => panel.querySelector(`#${id}`) || toolRoot.querySelector(`#${id}`);
    const selected = () => api.drawings().find((drawing) => drawing.id === selectedDrawingId());
    const editable = (drawing) => {
      const layer = api.layers().find((entry) => entry.id === drawing?.layerId);
      return !!layer && layer.visible && !layer.locked;
    };
    const exactWorld = (event) => api.worldExact
      ? api.worldExact(event.clientX, event.clientY) : api.world(event.clientX, event.clientY);

    function cancel() {
      cancelDraftPointer();
      stopVertices();
      draft = null;
      preview = null;
      draftHover = -1;
      draftSelection = -1;
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
      if (vertexId && (selected()?.id !== vertexId || !editable(selected()))) stopVertices();
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
      layerSelect.value = draft ? draft.layerId : writable.some((layer) => layer.id === previous) ? previous : writable[0]?.id || "";
      const hasDraftContent = !!draft && (draft.points.length > 0 || draft.redoEdits.length > 0);
      const shape = field("drawingShape");
      shape.value = draft?.type || "path";
      shape.disabled = !api.hasMap() || !writable.length || !!draftPointer;
      const shapeLabel = shape.closest?.("label");
      if (shapeLabel) shapeLabel.hidden = hasDraftContent;
      const setup = shape.closest?.("#drawingSetup");
      if (setup) setup.hidden = hasDraftContent;
      field("drawingFinish").disabled = !draft || !!draftPointer || !validPoints(draft.points, draft.type);
      field("drawingCancel").disabled = !draft;
      layerSelect.disabled = hasDraftContent;
      const layerLabel = layerSelect.closest?.("label");
      if (layerLabel) layerLabel.hidden = hasDraftContent;
      const commands = field("drawingFinish").closest?.("#drawingCommands");
      if (commands) commands.dataset.phase = hasDraftContent ? "placing" : "setup";
      const progress = field("drawingProgress");
      progress.textContent = draft ? `${draft.type === "line" ? "Line" : "Path"}: ${draft.points.length} points` : "";
      progress.title = draft ? `Layer: ${api.layers().find((layer) => layer.id === draft.layerId)?.label || draft.layerId}` : "";
      progress.setAttribute("aria-label", draft ? `${progress.textContent}. ${progress.title}` : "");
      api.historyChanged?.();
      refreshDraftPoints();
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
      const layerContext = field("drawingEditorLayer");
      if (layerContext) layerContext.textContent = api.layers().find((layer) => layer.id === drawing.layerId)?.label || "Unknown layer";
      if (pointListDrawingId !== drawing.id) {
        pointListDrawingId = drawing.id;
        activeVertex = 0;
        showAllPoints = false;
        field("drawingStyle").open = false;
        const geometry = field("drawingGeometry");
        if (geometry) geometry.open = false;
      }
      refreshVertexControls(drawing, canEdit);
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
        row.className = `control-inline${[point.x, point.z].some((value) => String(value).length > 12) ? " has-long-coordinates" : ""}`;
        row.dataset.vertex = index;
        row.tabIndex = 0;
        row.setAttribute("role", "group");
        row.setAttribute("aria-label", `Vertex ${index + 1}`);
        const activate = () => { activeVertex = index; highlightVertex(); api.redraw(); };
        row.addEventListener("focus", activate);
        row.addEventListener("click", activate);
        row.addEventListener("keydown", (event) => {
          if (event.target !== row) return;
          const next = event.key === "ArrowDown" ? Math.min(drawing.points.length - 1, index + 1)
            : event.key === "ArrowUp" ? Math.max(0, index - 1)
            : event.key === "Home" ? 0 : event.key === "End" ? drawing.points.length - 1 : null;
          if (next === null) return;
          event.preventDefault(); event.stopPropagation?.();
          activeVertex = next; highlightVertex();
          points.querySelectorAll("[data-vertex]")[next]?.focus();
          api.redraw();
        });
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
          input.addEventListener("focus", () => {
            activeVertex = index;
            highlightVertex();
            api.redraw();
          });
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
      pointListToggle = document.createElement("button");
      pointListToggle.type = "button";
      pointListToggle.className = "ds-btn ds-btn-sm drawing-points-toggle";
      pointListToggle.setAttribute("aria-controls", "drawingPoints");
      pointListIcon = document.createElement("span");
      pointListIcon.setAttribute("aria-hidden", "true");
      const pointListLabel = document.createElement("span");
      pointListLabel.textContent = `All vertices (${drawing.points.length})`;
      pointListToggle.appendChild(pointListIcon);
      pointListToggle.appendChild(pointListLabel);
      pointListToggle.addEventListener("click", () => { showAllPoints = !showAllPoints; highlightVertex(); });
      points.appendChild(pointListToggle);
      editor.querySelectorAll("button, input").forEach((control) => { control.disabled = !canEdit; });
      pointListToggle.disabled = false;
      refreshVertexControls(drawing, canEdit);
      originalEditorValues = JSON.stringify(readEditor());
      highlightVertex();
      global.MapitMineEditorFields?.refresh();
    }

    function refreshDraftPoints() {
      const section = field("draftVertices"), list = field("draftPoints");
      if (!section || !list) return;
      section.hidden = !draft?.points.length;
      if (!draft) section.open = false;
      const focused = document.activeElement;
      const restoreIndex = focused?.dataset?.draftPoint;
      const restoreAxis = focused?.dataset?.axis;
      list.replaceChildren();
      if (!draft) return;
      const session = draft;
      const activate = (index) => {
        draftSelection = index;
        list.querySelectorAll("[data-draft-vertex]").forEach((row) => {
          const active = Number(row.dataset.draftVertex) === index;
          row.tabIndex = active ? 0 : -1;
          row.classList.toggle("is-active-vertex", active);
          row.setAttribute("aria-current", String(active));
        });
        api.redraw();
      };
      draft.points.forEach((point, index) => {
        const row = document.createElement("div");
        row.className = `draft-point-row${[point.x, point.z].some((value) => String(value).length > 12) ? " has-long-coordinates" : ""}`;
        row.dataset.draftVertex = index;
        row.setAttribute("role", "group");
        row.setAttribute("aria-label", `Draft vertex ${index + 1}`);
        row.addEventListener("focus", () => activate(index));
        row.addEventListener("click", () => activate(index));
        row.addEventListener("keydown", (event) => {
          if (event.target !== row) return;
          const next = event.key === "ArrowDown" ? Math.min(session.points.length - 1, index + 1)
            : event.key === "ArrowUp" ? Math.max(0, index - 1)
            : event.key === "Home" ? 0 : event.key === "End" ? session.points.length - 1 : null;
          if (next === null) return;
          event.preventDefault(); event.stopPropagation?.();
          list.querySelectorAll("[data-draft-vertex]")[next]?.focus();
        });
        ["x", "z"].forEach((axis) => {
          const label = document.createElement("label");
          label.className = "drawing-point-field";
          const caption = document.createElement("span");
          caption.textContent = `${axis.toUpperCase()}${index + 1}`;
          const input = document.createElement("input");
          input.className = "ds-input";
          input.type = "number"; input.step = "any";
          input.value = point[axis];
          input.dataset.draftPoint = index; input.dataset.axis = axis;
          input.setAttribute("aria-label", `Draft point ${index + 1} ${axis.toUpperCase()}`);
          input.disabled = !!draftPointer || !editable(session);
          input.addEventListener("focus", () => activate(index));
          input.addEventListener("change", () => {
            if (draft !== session || draftPointer || !editable(session)) return;
            const value = input.value.trim() === "" ? NaN : Number(input.value);
            if (!Number.isFinite(value)) { input.value = session.points[index][axis]; return; }
            moveDraftPoint(index, { ...session.points[index], [axis]: value });
          });
          input.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
              event.preventDefault(); event.stopPropagation?.();
              input.value = session.points[index][axis];
            } else if (event.key === "Enter") {
              event.preventDefault(); event.stopPropagation?.(); input.blur();
            }
          });
          label.appendChild(caption); label.appendChild(input); row.appendChild(label);
        });
        list.appendChild(row);
      });
      activate(Math.max(0, Math.min(draftSelection, draft.points.length - 1)));
      if (restoreIndex !== undefined) {
        list.querySelector(`[data-draft-point="${restoreIndex}"][data-axis="${restoreAxis}"]`)?.focus();
      }
    }

    function moveDraftPoint(index, point) {
      if (!draft || draftPointer || !editable(draft) || !draft.points[index] ||
          !Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
      const before = draft.points[index];
      if (before.x === point.x && before.z === point.z) return;
      draft.points[index] = { ...point };
      draft.undoEdits.push({ kind: "move", index, before: { ...before }, after: { ...point } });
      draft.redoEdits = [];
      draftSelection = index;
      refresh(); api.redraw();
    }

    function highlightVertex() {
      pointListToggle?.setAttribute("aria-expanded", String(showAllPoints));
      if (pointListIcon) pointListIcon.className = "io iconoir-nav-arrow-down";
      field("drawingPoints").querySelectorAll("[data-vertex]").forEach((row) => {
        row.hidden = !showAllPoints && Number(row.dataset.vertex) !== activeVertex;
        const active = Number(row.dataset.vertex) === activeVertex;
        row.classList.toggle("is-active-vertex", active);
        row.tabIndex = active ? 0 : -1;
        row.setAttribute("aria-current", String(active));
      });
      global.MapitMineEditorFields?.refresh();
    }

    function refreshVertexControls(drawing, canEdit) {
      const enabled = vertexId === drawing.id;
      field("drawingVertices").title = enabled ? "Done editing vertices" : "Edit vertices";
      field("drawingVertices").setAttribute("aria-label", field("drawingVertices").title);
      field("drawingVertices").setAttribute("aria-pressed", String(enabled));
      activeVertex = Math.min(activeVertex, drawing.points.length - 1);
      field("drawingVertexInsert").disabled = !enabled || !canEdit || drawing.type !== "path";
      field("drawingVertexDelete").disabled = !enabled || !canEdit || drawing.type !== "path" || drawing.points.length <= 2;
      highlightVertex();
    }

    function cancelVertexDrag() {
      if (!vertexDrag) return;
      const pointerId = vertexDrag.pointerId;
      vertexDrag = null;
      canvas.style.cursor = "";
      try { canvas.releasePointerCapture?.(pointerId); } catch (_) { /* Capture may already be lost. */ }
      editorSnapshot = "";
    }

    function stopVertices() {
      cancelVertexDrag();
      vertexId = null;
      canvas.style.cursor = "";
      if (api.workspace?.get().tool === "vertices") api.workspace.setTool("select");
    }

    async function editVertices(enterOnly = false) {
      if (switching) return;
      switching = true;
      const drawing = selected();
      try {
        if (!drawing || !editable(drawing) || !await resolveEdits()) return;
        if (selected() !== drawing || !editable(drawing)) return;
        if (vertexId && !enterOnly) stopVertices();
        else if (vertexId) return;
        else {
          vertexId = drawing.id;
          api.workspace?.setTool("vertices");
        }
        refresh();
        const geometry = field("drawingGeometry");
        if (geometry && vertexId) geometry.open = true;
        api.redraw();
      } finally { switching = false; }
    }

    function canChangeVertices() {
      if (!vertexId || selected()?.id !== vertexId || !editable(selected()) || vertexDrag || switching) return false;
      if (hasPendingEdits()) { api.toast("Apply or discard drawing fields before editing vertices.", "warn"); return false; }
      return true;
    }

    function changeVertices(label, points, index) {
      const drawing = selected();
      if (!drawing || !editable(drawing) || !validPoints(points, drawing.type)) {
        api.toast("Keep at least two distinct points.", "warn");
        return false;
      }
      if (JSON.stringify(points) === JSON.stringify(drawing.points)) return false;
      activeVertex = index;
      commit(label, () => { drawing.points = points; });
      return true;
    }

    function insertVertex(point = null, segment = null) {
      if (!canChangeVertices() || selected().type !== "path") return;
      const points = selected().points.map((entry) => ({ ...entry }));
      const index = segment ?? Math.min(activeVertex, points.length - 2);
      const a = points[index], b = points[index + 1];
      const next = point || { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      if ((next.x === a.x && next.z === a.z) || (next.x === b.x && next.z === b.z)) return;
      points.splice(index + 1, 0, next);
      changeVertices("Insert Vertex", points, index + 1);
    }

    field("drawingVertices").addEventListener("click", () => editVertices());
    field("drawingVertexInsert").addEventListener("click", () => insertVertex());
    field("drawingVertexDelete").addEventListener("click", deleteVertex);
    function deleteVertex() {
      if (!canChangeVertices() || selected().type !== "path" || selected().points.length <= 2) return;
      const points = selected().points.map((point) => ({ ...point }));
      points.splice(activeVertex, 1);
      changeVertices("Delete Vertex", points, Math.min(activeVertex, points.length - 1));
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
      if (vertexDrag) { cancelVertexDrag(); refresh(); api.redraw(); }
      if (!hasPendingEdits()) return true;
      const choice = api.resolveDraft
        ? await api.resolveDraft({ title: "Unapplied drawing changes", canFinish: editable(selected()), finishText: "Apply" })
        : await api.confirm({ title: "Discard drawing changes?", message: "Discard unapplied drawing properties?", confirmText: "Discard" }) ? "discard" : "keep";
      if (choice === "keep") return false;
      if (choice === "finish") return apply();
      revertEdits();
      return true;
    }

    function revertEdits() {
      if (!selected()) return false;
      if (vertexDrag) cancelVertexDrag();
      editorSnapshot = "";
      refresh();
      api.redraw();
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
      if (!draft || draftPointer || !editable(draft) || !validPoints(draft.points, draft.type)) return;
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
      if (draft?.type === type) return;
      switching = true;
      try {
        if (!await leave()) return;
        if (api.prepareTool && !await api.prepareTool()) return;
        const layerId = field("drawingLayer").value;
        if (!editable({ layerId })) return;
        api.closePinEditor();
        api.workspace?.select(null);
        selectDrawing(null);
        draft = { type, layerId, points: [], undoEdits: [], redoEdits: [] };
        canvas.style.cursor = "crosshair";
        api.workspace?.setTool(draft.type);
        api.onToolStarted?.();
        refresh();
        api.redraw();
      } finally { switching = false; }
    }

    async function leave() {
      cancelDraftPointer();
      if (!draft) {
        if (!await resolveEdits()) return false;
        stopVertices();
        refresh();
        api.redraw();
        return true;
      }
      if (!draft.points.length && !draft.redoEdits.length) { cancel(); return true; }
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

    function draftHistoryState() {
      const available = !!draft && editable(draft) && !switching && !draftPointer;
      return { active: !!draft, canUndo: available && draft.undoEdits.length > 0,
        canRedo: available && draft.redoEdits.length > 0 };
    }

    function traverseDraftHistory(redo) {
      if (!draft || draftPointer || switching || !editable(draft)) return false;
      const source = redo ? draft.redoEdits : draft.undoEdits;
      const destination = redo ? draft.undoEdits : draft.redoEdits;
      if (!source.length) return false;
      const edit = source.pop();
      if (edit.kind === "append") {
        if (redo) draft.points.push({ ...edit.point });
        else draft.points.pop();
      } else draft.points[edit.index] = { ...(redo ? edit.after : edit.before) };
      destination.push(edit);
      draftSelection = edit.kind === "move" ? edit.index : draft.points.length - 1;
      draftHover = -1;
      preview = null;
      refresh();
      api.redraw();
      return true;
    }

    field("drawingShape").addEventListener("change", async () => {
      await start(field("drawingShape").value);
      refresh();
    });
    field("drawingFinish").addEventListener("click", finish);
    field("drawingCancel").addEventListener("click", cancel);
    field("drawingLayer").addEventListener("change", () => {
      if (!draft) return;
      if (!draft.points.length && !draft.redoEdits.length && editable({ layerId: field("drawingLayer").value })) {
        draft.layerId = field("drawingLayer").value;
      }
      refresh();
      api.redraw();
    });
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
      if (!name) { field("drawingName").focus?.(); api.toast("Enter a drawing name.", "warn"); return false; }
      if (!validPoints(points, drawing.type) || !Number.isFinite(width) || width < 1 || width > 12) {
        const invalidPoint = Array.from(field("drawingPoints").querySelectorAll("input"))
          .find((input) => input.value === "" || !Number.isFinite(Number(input.value)));
        if (invalidPoint) {
          const geometry = field("drawingGeometry");
          if (geometry) geometry.open = true;
          activeVertex = Number(invalidPoint.dataset.point);
          highlightVertex();
          invalidPoint.focus?.();
        } else if (!Number.isFinite(width) || width < 1 || width > 12) {
          field("drawingStyle").open = true;
          field("drawingWidth").focus?.();
        }
        api.toast("Enter valid points and a width between 1 and 12.", "warn");
        return false;
      }
      if (!hasPendingEdits()) return true;
      if (name === drawing.name && width === drawing.style?.width && field("drawingColor").value === drawing.style?.color && JSON.stringify(points) === JSON.stringify(drawing.points)) {
        revertEdits(); return true;
      }
      commit("Edit Drawing", () => {
        drawing.name = name;
        drawing.points = points;
        drawing.style = { ...drawing.style, color: field("drawingColor").value, width };
      });
      originalEditorValues = JSON.stringify(readEditor());
      return true;
    }
    field("drawingEditor").addEventListener("change", () => {
      // Opening a guard moves focus: that blur must not commit behind its choices.
      if (!document.getElementById?.("draftResolutionDialog")?.open && hasPendingEdits()) apply();
    });
    field("drawingEditor").addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Enter" && event.target.matches?.("input")) {
        event.preventDefault(); if (hasPendingEdits()) apply();
      } else if (event.key === "Escape" && event.target.matches?.("input")) {
        event.preventDefault(); event.stopImmediatePropagation(); revertEdits();
      }
    });
    async function deleteDrawing() {
      const drawing = selected();
      if (!drawing || !editable(drawing)) return;
      if (!await api.confirm({ title: "Delete drawing?", message: "Remove the selected drawing?", confirmText: "Delete" })) return;
      if (!api.drawings().includes(drawing) || !editable(drawing)) return;
      commit("Delete Drawing", () => api.drawings().splice(api.drawings().indexOf(drawing), 1));
      selectDrawing(null);
      refresh();
    }
    field("drawingDelete").addEventListener("click", deleteDrawing);

    function vertexAt(event) {
      const drawing = selected();
      if (!drawing || vertexId !== drawing.id || !editable(drawing)) return -1;
      const point = exactWorld(event);
      const tolerance = (event.pointerType === "touch" ? 16 : 9) / api.camera().zoom;
      let nearest = -1, distance = tolerance;
      drawing.points.forEach((entry, index) => {
        const next = Math.hypot(point.x - entry.x, point.z - entry.z);
        if (next <= distance) { nearest = index; distance = next; }
      });
      return nearest;
    }

    canvas.addEventListener("pointerdown", (event) => {
      if (!vertexDrag) suppressVertexClick = false;
      if (event.button !== 0 || event.isPrimary === false || api.workspace?.get().tool === "pan") return;
      const index = vertexAt(event);
      if (index < 0) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      if (!canChangeVertices()) return;
      activeVertex = index;
      vertexDrag = { drawing: selected(), index, pointerId: event.pointerId,
        points: selected().points.map((point) => ({ ...point })) };
      canvas.style.cursor = "grabbing";
      suppressVertexClick = true;
      try { canvas.setPointerCapture?.(event.pointerId); } catch (_) { /* Window handlers still finish the gesture. */ }
      refreshVertexControls(selected(), true);
      api.redraw();
    }, true);

    window.addEventListener("pointermove", (event) => {
      if (!vertexDrag && vertexId && api.workspace?.get().tool !== "pan") {
        canvas.style.cursor = vertexAt(event) >= 0 ? "grab" : "";
      }
      if (!vertexDrag || event.pointerId !== vertexDrag.pointerId) return;
      event.stopImmediatePropagation();
      if (selected() !== vertexDrag.drawing || !editable(vertexDrag.drawing)) {
        cancelVertexDrag(); refresh(); api.redraw(); return;
      }
      const point = api.world(event.clientX, event.clientY);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
      vertexDrag.points[vertexDrag.index] = point;
      api.redraw();
    }, true);
    window.addEventListener("pointerup", (event) => {
      if (!vertexDrag || event.pointerId !== vertexDrag.pointerId) return;
      event.stopImmediatePropagation();
      const gesture = vertexDrag;
      cancelVertexDrag();
      if (selected() === gesture.drawing && editable(gesture.drawing)) {
        changeVertices("Move Vertex", gesture.points, gesture.index);
      }
      refresh(); api.redraw();
    }, true);
    const rollbackVertexGesture = () => {
      if (!vertexDrag) return;
      cancelVertexDrag(); refresh(); api.redraw();
    };
    window.addEventListener("pointercancel", (event) => {
      if (event.pointerId === vertexDrag?.pointerId) rollbackVertexGesture();
    }, true);
    canvas.addEventListener("lostpointercapture", rollbackVertexGesture);
    window.addEventListener("blur", rollbackVertexGesture);
    canvas.addEventListener("mousedown", (event) => {
      if (!vertexDrag) return;
      event.stopImmediatePropagation(); event.preventDefault();
    }, true);
    let shapeTap = null, previousShapeTap = null, ignoreTouchDoubleUntil = 0;
    canvas.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch") return;
      if (event.isPrimary === false || draft || vertexId || !api.canSelect()) { shapeTap = previousShapeTap = null; return; }
      shapeTap = { id: event.pointerId, x: event.clientX, y: event.clientY, time: Date.now() };
    }, true);
    window.addEventListener("pointermove", (event) => {
      if (shapeTap?.id === event.pointerId && Math.hypot(event.clientX-shapeTap.x, event.clientY-shapeTap.y) > 8) shapeTap = previousShapeTap = null;
    }, true);
    window.addEventListener("pointercancel", () => { shapeTap = previousShapeTap = null; }, true);
    window.addEventListener("blur", () => { shapeTap = previousShapeTap = null; });
    window.addEventListener("pointerup", (event) => {
      const tap = shapeTap;
      if (!tap || tap.id !== event.pointerId) return;
      shapeTap = null;
      if (draft || vertexId || Date.now()-tap.time > 350 || !api.canSelect() || api.pinHit?.(event)) { previousShapeTap = null; return; }
      const point = api.world(event.clientX, event.clientY);
      const drawing = [...api.drawings()].reverse().find(entry => editable(entry) && hitTest(entry.points, point, 9/api.camera().zoom));
      if (!drawing) { previousShapeTap = null; return; }
      const previous = previousShapeTap;
      previousShapeTap = { drawing, x:event.clientX, y:event.clientY, time:Date.now() };
      if (!previous || previous.drawing !== drawing || Date.now()-previous.time > 350 || Math.hypot(previous.x-event.clientX,previous.y-event.clientY)>16) return;
      previousShapeTap = null; ignoreTouchDoubleUntil = Date.now()+500;
      Promise.resolve(api.inspectDrawing?.(drawing.id)).then((resolved) => { if (resolved !== false && selected() === drawing) editVertices(true); });
    }, true);
    canvas.addEventListener("dblclick", (event) => {
      if (Date.now() < ignoreTouchDoubleUntil) { event.stopImmediatePropagation(); event.preventDefault(); return; }
      if (!vertexId || api.workspace?.get().tool === "pan") return;
      event.stopImmediatePropagation(); event.preventDefault();
      const drawing = selected();
      if (drawing?.type !== "path") return;
      const segment = nearestSegment(drawing.points, exactWorld(event), 9 / api.camera().zoom);
      if (segment) insertVertex(segment.point, segment.index);
    }, true);

    canvas.addEventListener("dblclick", () => {
      if (!draft && !vertexId && api.canSelect() && selected()) {
        const drawing = selected();
        Promise.resolve(api.inspectDrawing?.(drawing.id)).then((resolved) => { if (resolved !== false && selected() === drawing) editVertices(true); });
      }
    }, true);

    // Capture drawing gestures before the existing pin and pan handlers.
    function cancelDraftPointer() {
      const pointer = draftPointer;
      draftPointer = null;
      if (!pointer) return;
      preview = null;
      suppressDraftClick = true;
      canvas.style.cursor = draft ? "crosshair" : "";
      try { canvas.releasePointerCapture?.(pointer.id); } catch (_) { /* Capture may already be lost. */ }
      refresh();
      api.redraw();
    }

    function appendDraftPoint(point) {
      if (!draft || !editable(draft) || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
      const last = draft.points.at(-1);
      if (!last || point.x !== last.x || point.z !== last.z) {
        draft.points.push(point);
        draft.undoEdits.push({ kind: "append", point: { ...point } });
        draft.redoEdits = [];
        draftSelection = draft.points.length - 1;
      }
      if (draft.type === "line" && draft.points.length === 2) finish();
      else { refresh(); api.redraw(); }
    }

    function draftVertexAt(event) {
      if (!draft || !editable(draft)) return -1;
      const point = exactWorld(event);
      let nearest = -1, distance = (event.pointerType === "touch" ? 16 : 9) / api.camera().zoom;
      draft.points.forEach((entry, index) => {
        const next = Math.hypot(point.x - entry.x, point.z - entry.z);
        if (next <= distance) { distance = next; nearest = index; }
      });
      return nearest;
    }

    canvas.addEventListener("pointerdown", (event) => {
      suppressDraftClick = false;
      if (!draft || event.button !== 0 || event.isPrimary === false || !editable(draft)) return;
      const index = draftVertexAt(event);
      if (event.pointerType !== "touch" && index < 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      draftPointer = { id: event.pointerId, draft, index, start: api.world(event.clientX, event.clientY),
        clientX: event.clientX, clientY: event.clientY, moved: false };
      draftSelection = index;
      suppressDraftClick = true;
      preview = index >= 0 ? { ...draft.points[index] } : api.world(event.clientX, event.clientY);
      canvas.style.cursor = index >= 0 ? "grabbing" : "crosshair";
      try { canvas.setPointerCapture?.(event.pointerId); } catch (_) { /* Window handlers still own release. */ }
      refresh();
      api.redraw();
    }, true);
    window.addEventListener("pointermove", (event) => {
      if (!draftPointer && draft && event.target === canvas) {
        draftHover = draftVertexAt(event);
        canvas.style.cursor = draftHover >= 0 ? "grab" : "crosshair";
        api.redraw();
      }
      if (event.pointerId !== draftPointer?.id) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (draftPointer.index >= 0 && Math.hypot(event.clientX - draftPointer.clientX, event.clientY - draftPointer.clientY) >= 4) draftPointer.moved = true;
      if (draftPointer.index < 0 || draftPointer.moved) preview = draftPointerPoint(event);
      api.redraw();
    }, { capture: true, passive: false });
    window.addEventListener("pointerup", (event) => {
      if (event.pointerId !== draftPointer?.id) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const gesture = draftPointer;
      const point = draftPointerPoint(event);
      cancelDraftPointer();
      if (draft !== gesture.draft || !editable(draft)) return;
      if (gesture.index < 0) appendDraftPoint(point);
      else if (gesture.moved) {
        moveDraftPoint(gesture.index, point);
      }
    }, { capture: true, passive: false });
    function draftPointerPoint(event) {
      const point = api.world(event.clientX, event.clientY);
      if (draftPointer.index < 0) return point;
      const before = draftPointer.draft.points[draftPointer.index];
      return { x: before.x + point.x - draftPointer.start.x, z: before.z + point.z - draftPointer.start.z };
    }
    window.addEventListener("pointercancel", (event) => {
      if (event.pointerId === draftPointer?.id) cancelDraftPointer();
    }, true);
    canvas.addEventListener("lostpointercapture", (event) => {
      if (event.pointerId === draftPointer?.id) cancelDraftPointer();
    });
    window.addEventListener("blur", cancelDraftPointer);
    canvas.addEventListener("pointerleave", () => { draftHover = -1; if (!draftPointer) preview = null; api.redraw(); });
    ["mousedown", "pointerdown", "dblclick", "contextmenu"].forEach((name) => {
      canvas.addEventListener(name, (event) => {
        if (!draft) return;
        event.stopImmediatePropagation();
        if (name === "contextmenu") {
          event.preventDefault(); cancelDraftPointer();
          const menuDraft = draft;
          const act = (action) => () => { if (draft === menuDraft) action(); };
          api.showMenu?.([
            { label: "Undo point", disabled: !draftHistoryState().canUndo, action: act(() => traverseDraftHistory(false)) },
            { label: "Redo point", disabled: !draftHistoryState().canRedo, action: act(() => traverseDraftHistory(true)) },
            { label: "Finish", disabled: !editable(draft) || !validPoints(draft.points, draft.type), action: act(finish) },
            { label: "Cancel drawing", action: act(cancel) },
          ], event.clientX, event.clientY);
        }
      }, true);
    });
    canvas.addEventListener("mousemove", (event) => {
      if (!draft || draftPointer || suppressDraftClick) return;
      preview = draftHover >= 0 ? null : api.world(event.clientX, event.clientY);
      api.redraw();
    });
    canvas.addEventListener("click", (event) => {
      if (suppressDraftClick) { event.stopImmediatePropagation(); return; }
      if (suppressVertexClick) { suppressVertexClick = false; event.stopImmediatePropagation(); return; }
      // A completed pan is navigation, not a new object-selection click.
      if (api.consumeClick?.()) { event.stopImmediatePropagation(); return; }
      if (vertexId && api.workspace?.get().tool !== "pan") {
        event.stopImmediatePropagation();
        const index = vertexAt(event);
        if (index >= 0) { activeVertex = index; refreshVertexControls(selected(), true); api.redraw(); }
        return;
      }
      if (draft) {
        event.stopImmediatePropagation();
        if (!editable(draft)) { cancel(); return; }
        appendDraftPoint(api.world(event.clientX, event.clientY));
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
      if (api.selectCanvasDrawing) api.selectCanvasDrawing(drawing?.id || null);
      else selectDrawing(drawing?.id || null);
      if (drawing) event.stopImmediatePropagation();
      refresh();
      api.redraw();
    }
    window.addEventListener("keydown", (event) => {
      if (document.getElementById?.("contextMenu")?.style.display === "block") return;
      if (event.key === "Escape" && event.target.closest?.("#pinFilterPopover, #pinFilterBtn")
        && !document.getElementById?.("pinFilterPopover")?.classList.contains("is-hidden")) return;
      if (document.body?.classList.contains("is-layer-reordering")) return;
      if (event.key === "Escape" && vertexDrag) {
        event.preventDefault(); event.stopImmediatePropagation();
        rollbackVertexGesture();
        return;
      }
      if (event.target.closest?.("input, textarea, select, dialog")) return;
      if (event.target.closest?.('[role="tree"]')) return;
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (vertexId && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault(); event.stopImmediatePropagation(); deleteVertex(); return;
      }
      if (event.key === "Escape" && vertexId) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (vertexDrag) rollbackVertexGesture();
        else resolveEdits().then((resolved) => {
          if (resolved) { stopVertices(); refresh(); api.redraw(); }
        });
        return;
      }
      if (event.key === "Escape" && (draft || selectedDrawingId())) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (draft) reset();
        else resolveEdits().then((resolved) => { if (resolved) reset(); });
      } else if (event.key === "Enter" && draft && !event.target.closest?.("button, summary, a, [role='button']")) {
        event.preventDefault();
        finish();
      }
    }, true);

    function render(ctx) {
      if (draft && !editable(draft)) {
        draft = null;
        preview = null;
        canvas.style.cursor = "";
        api.historyChanged?.();
      }
      const { zoom, offsetX, offsetY } = api.camera();
      const paint = (drawing, temporary = false) => {
        if (!["line", "path"].includes(drawing.type) || !api.layers().find((layer) => layer.id === drawing.layerId)?.visible) return;
        const movingDraft = temporary && draftPointer?.index >= 0 && preview;
        const points = movingDraft ? drawing.points.map((point, index) => index === draftPointer.index ? preview : point)
          : vertexDrag?.drawing === drawing ? vertexDrag.points : temporary && preview ? [...drawing.points, preview] : drawing.points;
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
        if (temporary) {
          if (draftPointer && preview) {
            const x = offsetX + preview.x * zoom, y = offsetY + preview.z * zoom;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(x - 6, y - 6, 12, 12);
          }
          // Accepted points use filled handles; contact candidates use a dashed outline.
          (movingDraft ? points : drawing.points).forEach((point, index) => {
            const size = index === drawing.points.length - 1 ? 12 : 8;
            const x = offsetX + point.x * zoom - size / 2;
            const y = offsetY + point.z * zoom - size / 2;
            ctx.fillStyle = api.markerBackground?.() || api.color();
            ctx.fillRect(x - 2, y - 2, size + 4, size + 4);
            ctx.fillStyle = api.color();
            ctx.fillRect(x, y, size, size);
            if (index === draftSelection || index === draftHover) {
              ctx.setLineDash(index === draftHover ? [2, 2] : []);
              ctx.strokeRect(x - 3, y - 3, size + 6, size + 6);
            }
          });
        }
        if (drawing.id === selectedDrawingId()) {
          points.forEach((point, index) => {
            const size = vertexId === drawing.id ? index === activeVertex ? 12 : 8 : 6;
            ctx.fillStyle = api.color();
            ctx.fillRect(offsetX + point.x * zoom - size / 2, offsetY + point.z * zoom - size / 2, size, size);
          });
        }
        ctx.restore();
      };
      api.layers().forEach((layer) => api.drawings().filter((drawing) => drawing.layerId === layer.id).forEach((drawing) => paint(drawing)));
      if (draft) paint(draft, true);
    }

    refresh();
    return { render, refresh, reset, start, leave, resolveEdits, revertEdits, hasPendingEdits, editVertices, deleteDrawing,
      draftHistoryState, undoDraftPoint: () => traverseDraftHistory(false), redoDraftPoint: () => traverseDraftHistory(true),
      cancelPointerGesture: () => { rollbackVertexGesture(); cancelDraftPointer(); },
      hasPendingChanges: () => !!draft?.points.length || !!vertexDrag || hasPendingEdits(), active: () => !!draft };
  }

  global.MapitMineDrawing = Object.freeze({ hitTest, validPoints, nearestSegment, install });
})(typeof window !== "undefined" ? window : globalThis);
