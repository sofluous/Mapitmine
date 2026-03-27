# Design System Package

This package is generated from `_DesignSystem`.

## Recommended App Setup
1. Delete the old app-local `_DesignSystem` folder.
2. Copy this generated `_DesignSystem` folder into your app root.
3. Add:

```html
<html data-theme="steel-night" data-ds-theme-storage="app-theme" data-ds-theme-default="steel-night">
<link rel="stylesheet" href="./_DesignSystem/theme.css" />
<script src="./_DesignSystem/js/theme-registry.js"></script>
<script src="./_DesignSystem/js/theme-selector.js"></script>
```

4. Add a selector where needed:

```html
<select data-ds-theme-select></select>
```

5. No page-specific theme bootstrapping is required.

## Package Contents
- `theme.css`: bundled tokens + themes + components in one file
- `js/theme-registry.js`
- `js/theme-selector.js`
- `icons/*`

## Why This Package Is Safer
- one folder to replace
- one CSS request instead of chained imports
- fewer copy mistakes than manually replacing `theme.css`, `css/`, and `js/`