(function attachMapData(global) {
  "use strict";

  const MAP_DOCUMENT_VERSION = 2;
  const DEFAULT_LAYER_ID = "default";

  function createDefaultLayer() {
    return {
      id: DEFAULT_LAYER_ID,
      label: "Pins",
      visible: true,
      locked: false,
      color: "",
    };
  }

  function normalizePin(rawPin) {
    const pin = rawPin && typeof rawPin === "object" ? rawPin : {};
    const x = Number(pin.x);
    const hasY = pin.y !== undefined && pin.y !== null && pin.y !== "";
    const y = hasY ? Number(pin.y) : NaN;
    const z = Number(pin.z);
    const color = String(pin.color ?? "").trim();
    return {
      x: Number.isFinite(x) ? x : 0,
      z: Number.isFinite(z) ? z : 0,
      y: Number.isFinite(y) ? y : undefined,
      id: String(pin.id ?? ""),
      label: String(pin.label ?? ""),
      description: String(pin.description ?? ""),
      icon: String(pin.icon ?? ""),
      color: /^#[0-9a-f]{3,8}$/i.test(color) ? color : "",
      layerId: String(pin.layerId || DEFAULT_LAYER_ID),
      tags: Array.isArray(pin.tags) ? pin.tags.map(String) : undefined,
      timestamp: pin.timestamp || new Date().toISOString(),
    };
  }

  function normalizeLayer(rawLayer) {
    const layer = rawLayer && typeof rawLayer === "object" ? rawLayer : {};
    const id = String(layer.id || "").trim();
    if (!id) return null;
    const color = String(layer.color ?? "").trim();
    return {
      id,
      label: String(layer.label || id),
      visible: layer.visible !== false,
      locked: layer.locked === true,
      color: /^#[0-9a-f]{3,8}$/i.test(color) ? color : "",
    };
  }

  function normalizeDrawing(rawDrawing) {
    const drawing =
      rawDrawing && typeof rawDrawing === "object" ? rawDrawing : {};
    const id = String(drawing.id || "").trim();
    const type = String(drawing.type || "").trim();
    if (!id || !type) return null;
    const points = Array.isArray(drawing.points)
      ? drawing.points
          .map((point) => ({ x: Number(point?.x), z: Number(point?.z) }))
          .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z))
      : [];
    const style =
      drawing.style && typeof drawing.style === "object"
        ? { ...drawing.style }
        : {};
    return {
      id,
      type,
      layerId: String(drawing.layerId || DEFAULT_LAYER_ID),
      points,
      style,
    };
  }

  function normalizeMapDocument(data) {
    const source = Array.isArray(data) ? { pins: data } : data;
    if (!source || typeof source !== "object") return null;

    const layersById = new Map();
    const sourceLayers = Array.isArray(source.layers) ? source.layers : [];
    sourceLayers.forEach((rawLayer) => {
      const layer = normalizeLayer(rawLayer);
      if (layer && !layersById.has(layer.id)) layersById.set(layer.id, layer);
    });
    if (!layersById.has(DEFAULT_LAYER_ID)) {
      layersById.set(DEFAULT_LAYER_ID, createDefaultLayer());
    }

    const pins = (Array.isArray(source.pins) ? source.pins : []).map(normalizePin);
    const drawings = (Array.isArray(source.drawings) ? source.drawings : [])
      .map(normalizeDrawing)
      .filter(Boolean);
    for (const item of [...pins, ...drawings]) {
      if (!layersById.has(item.layerId)) item.layerId = DEFAULT_LAYER_ID;
    }

    return {
      version: MAP_DOCUMENT_VERSION,
      pins,
      layers: [...layersById.values()],
      drawings,
      settings:
        source.settings && typeof source.settings === "object"
          ? source.settings
          : null,
    };
  }

  function parseMapPayload(data, fallbackName) {
    const importedName = String(fallbackName || "imported").replace(
      /\.json$/i,
      "",
    );
    const document = normalizeMapDocument(data);
    if (!document) return null;
    return {
      ...document,
      name:
        !Array.isArray(data) && data.name ? String(data.name) : importedName,
    };
  }

  function getUniqueMapName(baseName, exists) {
    const rootName = String(baseName || "imported");
    if (!exists(rootName)) return rootName;
    let suffix = 2;
    while (exists(`${rootName}-${suffix}`)) suffix += 1;
    return `${rootName}-${suffix}`;
  }

  function formatRelativeDate(value, now = Date.now()) {
    if (!value) return "Not edited";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not edited";
    const diffMs = now - date.getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diffMs < minute) return "Updated now";
    if (diffMs < hour) {
      return `Updated ${Math.max(1, Math.floor(diffMs / minute))}m ago`;
    }
    if (diffMs < day) return `Updated ${Math.floor(diffMs / hour)}h ago`;
    if (diffMs < 7 * day) return `Updated ${Math.floor(diffMs / day)}d ago`;
    return `Updated ${date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })}`;
  }

  global.MapitMineData = Object.freeze({
    DEFAULT_LAYER_ID,
    MAP_DOCUMENT_VERSION,
    createDefaultLayer,
    formatRelativeDate,
    getUniqueMapName,
    normalizeDrawing,
    normalizeLayer,
    normalizeMapDocument,
    normalizePin,
    parseMapPayload,
  });
})(typeof window !== "undefined" ? window : globalThis);
