(function attachViewSettings(global) {
  "use strict";
  const validSpacing = (value) => (typeof value === "number" || typeof value === "string" && value.trim() !== "")
    && Number.isFinite(Number(value)) && Number(value) > 0;
  function spacing(value, fallback = 100) {
    return validSpacing(value) ? Number(value) : validSpacing(fallback) ? Number(fallback) : 100;
  }
  function gridLines(min, max, step, limit = 1000) {
    if (![min, max, step, limit].every(Number.isFinite) || step <= 0 || max < min || limit < 1) return [];
    const start = Math.floor(min / step) * step;
    const count = Math.ceil((max - start) / step) + 1;
    if (!Number.isFinite(start) || !Number.isFinite(count) || count > limit) return [];
    return Array.from({ length: count }, (_, index) => start + index * step);
  }
  global.MapitMineViewSettings = Object.freeze({ validSpacing, spacing, gridLines });
})(typeof window !== "undefined" ? window : globalThis);
