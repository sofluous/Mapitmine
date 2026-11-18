import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Element {
  dataset = {};
  attributes = {};
  children = [];
  listeners = {};
  setAttribute(key, value) { this.attributes[key] = value; }
  append(...children) { this.children.push(...children); }
  addEventListener(name, handler) { this.listeners[name] = handler; }
}
const registrations = [];
const document = {
  documentElement: new Element(),
  createElement: () => new Element(),
  addEventListener: (...args) => registrations.push(args),
};
const window = { document };
vm.runInNewContext(readFileSync(new URL('../src/layer-utilities.js', import.meta.url), 'utf8'), { window });
const api = window.MapitMineLayerUtilities;
let calls = 0;
for (const kind of ['lock', 'visibility']) {
  for (const active of [false, true]) {
    const button = api.create({ kind, active, label: `Stable ${kind}`, activate: () => { calls++; } });
    assert.equal(button.attributes['aria-pressed'], String(active));
    assert.equal(button.attributes['aria-label'], `Stable ${kind}`);
    assert.equal(button.dataset.outlineAction, kind);
    assert.equal(button.className, 'layer-action layer-utility');
    assert.equal(button.type, 'button');
    assert.equal(button.dataset.quiet, undefined, 'legacy sticky focus reveal must not apply');
    assert.equal(button.children.length, 2);
    assert.ok(button.children.every(child => child.attributes['aria-hidden'] === 'true'));
    assert.match(button.children[0].className, kind === 'lock' ? /iconoir-lock$/ : /iconoir-eye-closed$/);
    assert.equal(button.title, kind === 'lock' ? (active ? 'Unlock layer' : 'Lock layer') : (active ? 'Show layer' : 'Hide layer'));
    assert.deepEqual(Object.keys(button.listeners), ['click'], 'hover/focus cannot mutate state');
    let stopped = false;
    button.listeners.click({ stopPropagation() { stopped = true; } });
    assert.ok(stopped, 'utility activation cannot bubble into row selection/disclosure');
    assert.equal(button.attributes['aria-pressed'], String(active), 'host owns commit including cancelled guards');
  }
}
assert.equal(calls, 4);
api.install();
api.install();
assert.deepEqual(registrations.map(([name]) => name), ['pointerover', 'pointermove', 'pointerdown']);
for (const [, handler, options] of registrations) {
  assert.ok(options.capture && options.passive);
  for (const pointerType of ['mouse', 'pen', 'mouse', 'touch']) {
    handler({ pointerType });
    assert.equal(document.documentElement.dataset.layerUtilityInput, pointerType);
  }
  handler({ pointerType: '' });
  assert.equal(document.documentElement.dataset.layerUtilityInput, 'touch');
}
assert.throws(() => api.create({ kind: 'delete', activate() {} }), /kind/);
assert.throws(() => api.create({ kind: 'lock', active: 'false', activate() {} }), /boolean/);
assert.throws(() => api.create({ kind: 'lock' }), /callback/);
const css = readFileSync(new URL('../src/layer-utilities.css', import.meta.url), 'utf8');
assert.match(css, /\.layer-row:has\(:focus-visible\)/);
assert.doesNotMatch(css, /:focus-within\s*[.{]/);
assert.match(css, /opacity: \.55/);
assert.match(css, /any-hover: none/);
assert.match(css, /any-pointer: coarse/);
assert.match(css, /data-layer-utility-input="pen"/);
assert.match(css, /min-width: 44px/);
assert.match(css, /--ds-icon-action-fg-active/);
console.log('Layer utility factory, guarded activation, input transitions and CSS contract checks passed.');
