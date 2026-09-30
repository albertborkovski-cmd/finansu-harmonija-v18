import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compiled = new Map();

function load(path, imports, globals = {}) {
  if (!compiled.has(path)) {
    compiled.set(path, ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText);
  }
  const module = { exports: {} };
  runInNewContext(compiled.get(path), {
    module,
    exports: module.exports,
    require: id => imports[id] ?? require(id),
    ...globals,
  }, { filename: path });
  return module.exports;
}

class TestNode {
  constructor(parent = null) { this.parent = parent; }

  contains(target) {
    for (let current = target; current; current = current.parent) {
      if (current === this) return true;
    }
    return false;
  }
}

// Isolate DOM events and React's small hook surface without installing a test
// renderer. The handlers/effects under test are the real transpiled components.
function createHarness() {
  const hooks = [];
  const effects = [];
  const listeners = [];
  const registrations = [];
  let cursor = 0;
  let nextId = 0;
  const react = {
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }];
    },
    useId() {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = `dropdown-test-${nextId++}`;
      return hooks[index];
    },
    useMemo(compute, dependencies) {
      const index = cursor++;
      const previous = hooks[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        hooks[index] = { dependencies, value: compute() };
      }
      return hooks[index].value;
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = hooks[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        effects.push(() => {
          previous?.cleanup?.();
          hooks[index] = { dependencies, cleanup: effect() };
        });
      }
    },
  };
  const document = {
    addEventListener(type, callback, capture = false) {
      const listener = { type, callback, capture };
      listeners.push(listener);
      registrations.push(listener);
    },
    removeEventListener(type, callback, capture = false) {
      const index = listeners.findIndex(listener => listener.type === type && listener.callback === callback && listener.capture === capture);
      assert.notEqual(index, -1, 'cleanup must remove the same listener and capture phase');
      listeners.splice(index, 1);
    },
  };
  const globals = { document, Node: TestNode };
  const { useDropdownDismiss } = load('../src/components/useDropdownDismiss.ts', { react }, globals);

  return {
    listeners,
    registrations,
    useDropdownDismiss,
    loadComponent: path => load(path, { react, './useDropdownDismiss': { useDropdownDismiss } }, globals).default,
    render(render) {
      cursor = 0;
      const result = render();
      effects.splice(0).forEach(effect => effect());
      return result;
    },
    dispatch(type, target, fields = {}, atTarget) {
      const event = { type, target, stopped: false, ...fields, stopPropagation() { this.stopped = true; } };
      for (const listener of [...listeners]) {
        if (listener.type === type && listener.capture) listener.callback(event);
      }
      if (!event.stopped) atTarget?.(event);
      if (!event.stopped) {
        for (const listener of [...listeners]) {
          if (listener.type === type && !listener.capture) listener.callback(event);
        }
      }
      return event;
    },
    unmount() {
      hooks.forEach(hook => hook?.cleanup?.());
    },
  };
}

function mountedHook({ additionalRefs, open = true } = {}) {
  const harness = createHarness();
  const root = new TestNode();
  const rootRef = { current: root };
  let closeCount = 0;
  const close = () => { closeCount++; };
  const render = (nextOpen = open, nextClose = close, nextRefs = additionalRefs) => harness.render(() => harness.useDropdownDismiss(nextOpen, rootRef, nextClose, nextRefs));
  render();
  return { ...harness, root, rootRef, renderHook: render, closeCount: () => closeCount };
}

test('closed dropdowns attach no listeners; opening attaches capture-pointer and Escape listeners', () => {
  const harness = mountedHook({ open: false });
  assert.equal(harness.listeners.length, 0);
  harness.renderHook(true);
  assert.deepEqual(harness.listeners.map(({ type, capture }) => ({ type, capture })), [
    { type: 'pointerdown', capture: true },
    { type: 'keydown', capture: true },
  ]);
  harness.renderHook(false);
  assert.equal(harness.listeners.length, 0);
  harness.dispatch('pointerdown', new TestNode());
  harness.dispatch('keydown', new TestNode(), { key: 'Escape' });
  assert.equal(harness.closeCount(), 0);
});

test('pointer events on the trigger root and its descendants preserve the open menu', () => {
  const harness = mountedHook();
  harness.dispatch('pointerdown', harness.root);
  harness.dispatch('pointerdown', new TestNode(new TestNode(harness.root)));
  assert.equal(harness.closeCount(), 0);
  harness.dispatch('pointerdown', new TestNode());
  assert.equal(harness.closeCount(), 1);
  harness.unmount();
});

test('outside pointers dismiss before another control stops propagation', () => {
  const harness = mountedHook();
  let countAtTarget = 0;
  const event = harness.dispatch('pointerdown', new TestNode(), {}, event => {
    countAtTarget = harness.closeCount();
    event.stopPropagation();
  });
  assert.equal(event.stopped, true);
  assert.equal(countAtTarget, 1, 'dismissal must happen during document capture');
  assert.equal(harness.closeCount(), 1);
  harness.unmount();
});

test('Escape dismisses from inside or outside; other keys and non-node pointers do not', () => {
  const harness = mountedHook();
  for (const key of ['Enter', 'Tab', 'ArrowDown', ' ']) harness.dispatch('keydown', harness.root, { key });
  for (const target of [null, {}, 'outside']) harness.dispatch('pointerdown', target);
  assert.equal(harness.closeCount(), 0);
  harness.dispatch('keydown', new TestNode(harness.root), { key: 'Escape' });
  harness.dispatch('keydown', new TestNode(), { key: 'Escape' });
  assert.equal(harness.closeCount(), 2);
  harness.unmount();
});

test('Escape dismisses before a focused input stops keyboard propagation', () => {
  const harness = mountedHook();
  let countAtTarget = 0;
  const event = harness.dispatch('keydown', new TestNode(harness.root), { key: 'Escape' }, event => {
    countAtTarget = harness.closeCount();
    event.stopPropagation();
  });
  assert.equal(event.stopped, true);
  assert.equal(countAtTarget, 1, 'Escape dismissal must happen during document capture');
  assert.equal(harness.closeCount(), 1);
  harness.unmount();
});

test('a separately portaled menu and its descendants count as inside through a single extra ref', () => {
  const portal = new TestNode();
  const harness = mountedHook({ additionalRefs: { current: portal } });
  assert.equal(harness.root.contains(portal), false);
  harness.dispatch('pointerdown', portal);
  harness.dispatch('pointerdown', new TestNode(portal));
  assert.equal(harness.closeCount(), 0);
  harness.dispatch('pointerdown', new TestNode());
  assert.equal(harness.closeCount(), 1);
  harness.unmount();
});

test('multiple portal refs are respected and null portal refs are safe', () => {
  const first = new TestNode();
  const second = new TestNode();
  const harness = mountedHook({ additionalRefs: [{ current: first }, { current: null }, { current: second }] });
  harness.dispatch('pointerdown', new TestNode(first));
  harness.dispatch('pointerdown', new TestNode(second));
  assert.equal(harness.closeCount(), 0);
  harness.rootRef.current = null;
  harness.dispatch('pointerdown', new TestNode(second));
  assert.equal(harness.closeCount(), 0);
  harness.dispatch('pointerdown', new TestNode());
  assert.equal(harness.closeCount(), 1);
  harness.unmount();
});

test('rerenders use the latest close callback and portal refs without duplicate listeners', () => {
  const oldPortal = new TestNode();
  const nextPortal = new TestNode();
  const harness = mountedHook({ additionalRefs: { current: oldPortal } });
  const originalListeners = [...harness.listeners];
  let latestCloseCount = 0;
  harness.renderHook(true, () => { latestCloseCount++; }, [{ current: nextPortal }]);
  assert.deepEqual(harness.listeners, originalListeners);
  assert.equal(harness.registrations.length, 2);
  harness.dispatch('pointerdown', new TestNode(nextPortal));
  assert.equal(latestCloseCount, 0);
  harness.dispatch('pointerdown', oldPortal);
  harness.dispatch('keydown', harness.root, { key: 'Escape' });
  assert.equal(latestCloseCount, 2);
  assert.equal(harness.closeCount(), 0);
  harness.unmount();
  assert.equal(harness.listeners.length, 0);
  harness.dispatch('pointerdown', new TestNode());
  assert.equal(latestCloseCount, 2);
});

function elements(tree, predicate = () => true, ancestors = []) {
  if (!tree || typeof tree !== 'object' || !tree.props) return [];
  const current = predicate(tree) ? [{ element: tree, ancestors }] : [];
  return current.concat(...[tree.props.children].flat(Infinity).map(child => elements(child, predicate, [...ancestors, tree])));
}

const one = (tree, predicate) => {
  const matches = elements(tree, predicate);
  assert.equal(matches.length, 1, 'expected exactly one matching element');
  return matches[0].element;
};
const option = (tree, label) => one(tree, element => element.props.role === 'option' && text(element) === label);
const text = tree => tree == null || typeof tree === 'boolean' ? '' : typeof tree !== 'object' ? String(tree) : [tree.props?.children].flat(Infinity).map(text).join('');

function assertOptionGeometry(tree) {
  for (const { element, ancestors } of elements(tree, element => element.props.role === 'option')) {
    assert.equal(element.type, 'button');
    assert.ok('data-static-selection' in element.props);
    assert.ok(!ancestors.some(parent => parent.type === 'button'), 'options must not nest inside another button');
    const checkbox = element.props.children[0];
    assert.equal(checkbox.type, 'span');
    assert.equal(checkbox.props['aria-hidden'], 'true');
    for (const token of ['h-[18px]', 'w-[18px]', 'rounded-[6px]']) assert.ok(checkbox.props.className.includes(token));
    if (element.props['aria-selected']) {
      assert.ok(element.props.className.includes('bg-[#E5EDF9]'));
      assert.ok(checkbox.props.className.includes('bg-[#007EA7]'));
    }
  }
}

test('multi-select preserves fixed trigger geometry, overlay menu, and open state while toggling', () => {
  const harness = createHarness();
  const Component = harness.loadComponent('../src/components/MultiSelectField.tsx');
  let selected = ['Alpha'];
  const props = { label: 'Groups', options: ['Alpha', 'Beta'], onChange: next => { selected = Array.from(next); } };
  const render = () => harness.render(() => Component({ ...props, value: selected }));
  let tree = render();
  const trigger = one(tree, element => element.props['aria-label'] === 'Groups');
  assert.ok(trigger.props.className.includes('h-[42px]'));
  assert.ok(one(trigger, element => element.type === 'span').props.className.includes('truncate'));
  trigger.props.onClick();
  tree = render();
  const openTrigger = one(tree, element => element.props['aria-label'] === 'Groups' && element.type === 'button');
  const listbox = one(tree, element => element.props.role === 'listbox');
  assert.equal(listbox.props['aria-multiselectable'], 'true');
  assert.ok(elements(tree, element => element === listbox)[0].ancestors.some(parent => parent.props.className?.includes('absolute')));
  assertOptionGeometry(tree);
  option(tree, 'Beta').props.onClick();
  tree = render();
  assert.deepEqual(selected, ['Alpha', 'Beta']);
  assert.equal(one(tree, element => element.props['aria-label'] === 'Groups' && element.type === 'button').props['aria-expanded'], true);
  assert.equal(one(tree, element => element.props['aria-label'] === 'Groups' && element.type === 'button').props.className, openTrigger.props.className, 'selection must not alter trigger geometry');
  assertOptionGeometry(tree);
  option(tree, 'Alpha').props.onClick();
  render();
  assert.deepEqual(selected, ['Beta']);
  harness.unmount();
});

test('multi-select search retains removable selected values missing from current options', () => {
  const harness = createHarness();
  const Component = harness.loadComponent('../src/components/MultiSelectField.tsx');
  let selected = ['Retired group'];
  const render = () => harness.render(() => Component({ label: 'Groups', options: ['Alpha', 'Beta'], value: selected, onChange: next => { selected = Array.from(next); } }));
  let tree = render();
  one(tree, element => element.type === 'button').props.onClick();
  tree = render();
  one(tree, element => element.type === 'input').props.onChange({ target: { value: 'retired' } });
  tree = render();
  assert.equal(elements(tree, element => element.props.role === 'option').length, 1);
  option(tree, 'Retired group').props.onClick();
  assert.deepEqual(selected, []);
  harness.unmount();
});

test('single select keeps uniform option geometry and closes only after an enabled choice', () => {
  const harness = createHarness();
  const Component = harness.loadComponent('../src/components/SearchableSelect.tsx');
  let selected = 'a';
  const options = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }, { value: 'c', label: 'Disabled', disabled: true }];
  const render = () => harness.render(() => Component({ ariaLabel: 'Model', value: selected, options, onChange: value => { selected = value; } }));
  let tree = render();
  const input = one(tree, element => element.props.role === 'combobox');
  input.props.onFocus({ currentTarget: { select() {} } });
  tree = render();
  assertOptionGeometry(tree);
  option(tree, 'Disabled').props.onClick();
  tree = render();
  assert.equal(selected, 'a');
  assert.equal(one(tree, element => element.props.role === 'combobox').props['aria-expanded'], true);
  option(tree, 'Beta').props.onClick();
  tree = render();
  const nextInput = one(tree, element => element.props.role === 'combobox');
  assert.equal(selected, 'b');
  assert.equal(nextInput.props.value, 'Beta');
  assert.equal(nextInput.props['aria-expanded'], false);
  assert.equal(nextInput.props.className, input.props.className);
  assert.equal(elements(tree, element => element.props.role === 'listbox').length, 0);
  harness.unmount();
});
