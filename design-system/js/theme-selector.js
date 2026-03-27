(function (win, doc) {
  function getRegistry() {
    return win.DesignSystemThemeRegistry || {
      themes: [],
      defaultTheme: "steel-night",
    };
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

  function rootElement(opts) {
    return (opts && opts.root) || doc.documentElement;
  }

  function rootThemeConfig(root, opts) {
    const registry = getRegistry();
    return {
      root,
      storageKey:
        (opts && opts.storageKey) ||
        root.getAttribute("data-ds-theme-storage") ||
        "ds-theme",
      defaultTheme:
        (opts && opts.defaultTheme) ||
        root.getAttribute("data-ds-theme-default") ||
        root.getAttribute("data-theme") ||
        registry.defaultTheme ||
        "steel-night",
    };
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
    const root = rootElement(opts);
    const settings = rootThemeConfig(root, opts);
    const resolved = resolveThemeId(themeId, settings.defaultTheme);
    root.setAttribute("data-theme", resolved);
    storeTheme(settings.storageKey, resolved);
    return resolved;
  }

  function autoApplyRootTheme(opts) {
    const root = rootElement(opts);
    const settings = rootThemeConfig(root, opts);
    const nextTheme = resolveThemeId(
      readStoredTheme(settings.storageKey) || root.getAttribute("data-theme"),
      settings.defaultTheme,
    );
    root.setAttribute("data-theme", nextTheme);
    storeTheme(settings.storageKey, nextTheme);
    return {
      root,
      currentTheme: nextTheme,
      storageKey: settings.storageKey,
      defaultTheme: settings.defaultTheme,
    };
  }

  function initThemeSelector(select, opts) {
    if (!select) return null;
    const root = rootElement(opts);
    const rootSettings = rootThemeConfig(root, opts);
    const storageKey =
      (opts && opts.storageKey) ||
      select.getAttribute("data-ds-theme-storage") ||
      rootSettings.storageKey;
    const defaultTheme =
      (opts && opts.defaultTheme) ||
      select.getAttribute("data-ds-theme-default") ||
      rootSettings.defaultTheme;
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
          defaultTheme,
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
      defaultTheme,
      applyTheme: function (themeId) {
        const nextTheme = applyTheme(themeId, {
          root,
          storageKey,
          defaultTheme,
        });
        select.value = nextTheme;
        return nextTheme;
      },
    };
  }

  function autoInitThemeSelectors() {
    const boot = autoApplyRootTheme();
    doc.querySelectorAll("select[data-ds-theme-select]").forEach(function (select) {
      initThemeSelector(select, {
        root: boot.root,
        storageKey: select.getAttribute("data-ds-theme-storage") || boot.storageKey,
        defaultTheme:
          select.getAttribute("data-ds-theme-default") || boot.defaultTheme,
      });
    });
    return boot;
  }

  win.DesignSystemThemeSelector = {
    getThemes,
    initThemeSelector,
    applyTheme,
    autoApplyRootTheme,
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
