(function (win, doc) {
  'use strict';
  function createNode(node) {
    if (typeof node === 'string') return doc.createTextNode(node);
    const element = doc.createElementNS('http://www.w3.org/2000/svg', node.tag);
    for (const [name, value] of Object.entries(node.attributes)) element.setAttribute(name, value);
    for (const child of node.children) element.appendChild(createNode(child));
    return element;
  }
  function render(root = doc) {
    const library = win.DesignSystemApprovedIcons;
    if (!library) throw new Error('Load icon-approved.js before icon-runtime.js');
    const targets = [...(root.matches?.('[data-ds-icon]') ? [root] : []), ...root.querySelectorAll('[data-ds-icon]')];
    for (const host of targets) {
      const alias = host.getAttribute('data-ds-icon');
      const icon = library.icons[alias];
      host.replaceChildren();
      host.setAttribute('aria-hidden', 'true');
      if (!icon) { host.dataset.dsIconState = 'missing'; continue; }
      // Only the build-validated, local approved collection enters the runtime bundle.
      host.appendChild(createNode(icon.tree));
      const svg = host.firstElementChild;
      svg.setAttribute('width', '1em'); svg.setAttribute('height', '1em');
      svg.setAttribute('focusable', 'false'); svg.setAttribute('aria-hidden', 'true');
      host.dataset.dsIconState = 'ready';
      host.dataset.dsIconVersion = library.version;
    }
  }
  win.DesignSystemIcons = { render };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => render(), { once: true });
  else render();
})(window, document);
