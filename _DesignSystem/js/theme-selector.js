(function (win, doc) {
  function getRegistry() {
    return win.DesignSystemThemeRegistry || { themes: [], defaultTheme: "steel-night" };
  }

  function getThemes() {
    return getRegistry().themes.slice();
  }

  function getThemeMap() {
    const map = new Map();
    getThemes().forEach((theme) => map.set(theme.id, theme));
    return map;
  }

  function resolveThemeId(themeId, fallbackId) {
    const themes = getThemes();
    const map = getThemeMap();
    if (themeId && map.has(themeId)) return themeId;
    if (fallbackId && map.has(fallbackId)) return fallbackId;
    if (themes.length) return themes[0].id;
    return fallbackId || "steel-night";
  }

  function buildThemeOptions(select, selectedId) {
    const themes = getThemes();
    const groups = [];
    const buckets = new Map();
    themes.forEach((theme) => {
      const group = theme.group || "Themes";
      if (!buckets.has(group)) {
        buckets.set(group, []);
        groups.push(group);
      }
      buckets.get(group).push(theme);
    });
    select.innerHTML = "";
    groups.forEach((group) => {
      const optgroup = doc.createElement("optgroup");
      optgroup.label = group;
      buckets.get(group).forEach((theme) => {
        const option = doc.createElement("option");
        option.value = theme.id;
        option.textContent = theme.label;
        if (theme.id === selectedId) option.selected = true;
        optgroup.appendChild(option);
      });
      select.appendChild(optgroup);
    });
  }

  function storeTheme(storageKey, themeId) {
    if (!storageKey) return;
    try {
      win.localStorage.setItem(storageKey, themeId);
    } catch (err) {
      // Ignore storage failures for file:// or privacy-restricted contexts.
    }
  }

  function readStoredTheme(storageKey) {
    if (!storageKey) return null;
    try {
      return win.localStorage.getItem(storageKey);
    } catch (err) {
      return null;
    }
  }

  function applyTheme(themeId, opts) {
    const root = (opts && opts.root) || doc.documentElement;
    const storageKey = opts && opts.storageKey;
    const resolved = resolveThemeId(themeId, root.getAttribute("data-theme"));
    root.setAttribute("data-theme", resolved);
    storeTheme(storageKey, resolved);
    return resolved;
  }

  function initThemeSelector(select, opts) {
    if (!select) return null;
    const settings = opts || {};
    const root = settings.root || doc.documentElement;
    const registry = getRegistry();
    const storageKey =
      settings.storageKey ||
      select.getAttribute("data-ds-theme-storage") ||
      "ds-theme";
    const defaultTheme =
      settings.defaultTheme ||
      select.getAttribute("data-ds-theme-default") ||
      root.getAttribute("data-theme") ||
      registry.defaultTheme ||
      "steel-night";
    const currentTheme = resolveThemeId(
      readStoredTheme(storageKey) || root.getAttribute("data-theme"),
      defaultTheme,
    );

    buildThemeOptions(select, currentTheme);
    select.value = currentTheme;
    root.setAttribute("data-theme", currentTheme);
    storeTheme(storageKey, currentTheme);

    if (select.dataset.dsThemeBound !== "1") {
      select.addEventListener("change", function () {
        const nextTheme = applyTheme(select.value, {
          root,
          storageKey,
        });
        select.value = nextTheme;
        select.dispatchEvent(
          new CustomEvent("ds-theme-change", {
            bubbles: true,
            detail: {
              theme: nextTheme,
              storageKey,
            },
          }),
        );
      });
      select.dataset.dsThemeBound = "1";
    }

    return {
      select,
      currentTheme,
      storageKey,
      applyTheme: function (themeId) {
        const nextTheme = applyTheme(themeId, { root, storageKey });
        select.value = nextTheme;
        return nextTheme;
      },
    };
  }

  function autoInitThemeSelectors() {
    doc.querySelectorAll("select[data-ds-theme-select]").forEach(function (select) {
      initThemeSelector(select, {});
    });
  }

  win.DesignSystemThemeSelector = {
    getThemes,
    initThemeSelector,
    applyTheme,
    autoInitThemeSelectors,
  };

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", autoInitThemeSelectors, {
      once: true,
    });
  } else {
    autoInitThemeSelectors();
  }
})(window, document);
