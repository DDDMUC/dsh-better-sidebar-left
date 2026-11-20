// Shared harness for the browser-half tests.
//
// The components are plain client bundles: they register a factory with
// window.__ModuleLoader__ and expect a handful of browser globals to exist by the
// time their apply() runs. This file supplies the smallest set of those that lets
// their apply() run for real - so the tests exercise the shipped code, not a
// description of it.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export const readText = (relative) => readFileSync(join(root, relative), 'utf8')

/** A DOM element good enough for the parts of the components that touch the page. */
function element(tag) {
  const node = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    textContent: '',
    innerHTML: '',
    parentNode: null,
    style: {},
    dataset: {},
    children: [],
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value)
    },
    removeAttribute(name) {
      delete this.attributes[name]
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name)
    },
    appendChild(child) {
      child.parentNode = this
      this.children.push(child)
      return child
    },
    insertBefore(child) {
      child.parentNode = this
      this.children.unshift(child)
      return child
    },
    removeChild(child) {
      this.children = this.children.filter((entry) => entry !== child)
      child.parentNode = null
      return child
    },
    remove() {
      if (this.parentNode !== null) this.parentNode.removeChild(this)
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector() {
      return null
    },
    querySelectorAll() {
      return []
    },
    closest() {
      return null
    },
    contains() {
      return false
    },
    getBoundingClientRect() {
      return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }
    },
    focus() {},
    blur() {},
    click() {},
  }
  node.classList = {
    add() {},
    remove() {},
    toggle() {},
    contains() {
      return false
    },
  }
  return node
}

/** Install the browser globals the components read, and hand back a teardown. */
export function installDom() {
  const store = new Map()
  const head = element('head')
  const body = element('body')
  const documentElement = element('html')
  const document = {
    nodeType: 9,
    head,
    body,
    documentElement,
    readyState: 'complete',
    createElement: (tag) => element(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
    createDocumentFragment: () => element('fragment'),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    getElementsByTagName: () => [],
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true
    },
    contains() {
      return false
    },
  }
  const localStorage = {
    getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
    setItem: (key, value) => store.set(String(key), String(value)),
    removeItem: (key) => store.delete(String(key)),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  }
  class MutationObserver {
    constructor(callback) {
      this.callback = callback
    }
    observe() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  // Components schedule sweeps and debounces. None of them names such a timer in
  // its disposer, and a 300ms interval would keep the test process alive forever,
  // so every handle created while the stub is installed is tracked, unref'd (it
  // must not hold the event loop open) and cleared on teardown.
  const timers = new Set()
  const wrapTimer = (original) =>
    function wrapped(...args) {
      const handle = original.apply(globalThis, args)
      if (handle !== null && typeof handle === 'object' && typeof handle.unref === 'function') handle.unref()
      timers.add(handle)
      return handle
    }
  const previous = {}
  const globals = {
    document,
    localStorage,
    MutationObserver,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: (handle) => clearTimeout(handle),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    setTimeout: wrapTimer(globalThis.setTimeout),
    setInterval: wrapTimer(globalThis.setInterval),
  }
  for (const [key, value] of Object.entries(globals)) {
    previous[key] = globalThis[key]
    globalThis[key] = value
  }
  return function teardown() {
    for (const handle of timers) {
      try {
        clearTimeout(handle)
        clearInterval(handle)
      } catch (error) {
        // a already-cleared handle is not an error here
      }
    }
    timers.clear()
    for (const key of Object.keys(globals)) {
      if (previous[key] === undefined) delete globalThis[key]
      else globalThis[key] = previous[key]
    }
  }
}

/**
 * The `require` a vendored factory receives.
 *
 * Every member is a no-op function unless a test replaces it: the factories call
 * react.createElement and the primitives inside their render functions, which no
 * test here reaches (nothing is rendered), and a Proxy keeps a component that
 * reaches for one more hook from failing the whole suite for an unrelated reason.
 */
export function fakeRequire(overrides = {}) {
  const cache = new Map()
  return function require(specifier) {
    if (Object.prototype.hasOwnProperty.call(overrides, specifier)) return overrides[specifier]
    if (!cache.has(specifier)) {
      cache.set(
        specifier,
        new Proxy(
          { Fragment: Symbol.for('react.fragment') },
          {
            get(target, key) {
              if (key in target) return target[key]
              if (key === Symbol.toStringTag || key === '__esModule') return undefined
              return function noop() {
                return null
              }
            },
          },
        ),
      )
    }
    return cache.get(specifier)
  }
}

/**
 * Run one client bundle and hand back what it registered with the module loader.
 * @param text - the bundle source.
 * @returns { id, factory }
 */
export function loadBundle(text) {
  let registered = null
  const window = {
    __ModuleLoader__: {
      load(entry) {
        registered = entry
      },
    },
  }
  // eslint-disable-next-line no-new-func
  new Function('window', 'globalThis', text)(window, globalThis)
  if (registered === null) throw new Error('the bundle registered nothing with window.__ModuleLoader__')
  return registered
}

/**
 * A cordis-ish client context that records what a component claims.
 *
 * Slots, locale, effects and disposers behave the way the components expect
 * (register returns a disposer, inject returns a disposer, effect runs and
 * returns a disposer), which is enough to prove an allocation table and enough to
 * unload a component cleanly.
 */
export function fakeClientContext() {
  const registered = []
  const effects = []
  const listeners = []
  const dictionaries = new Map()
  const context = {
    slots: {
      register(options, component) {
        const entry = { options, component, live: true }
        registered.push(entry)
        return function dispose() {
          entry.live = false
        }
      },
      inject(name, callback) {
        const dispose = callback()
        return function disposeInjection() {
          if (typeof dispose === 'function') dispose()
        }
      },
      // The slot service also publishes change notifications; a component that
      // wants to know when a seat appears asks here. Nothing in this suite needs
      // the event to fire, but a missing method is a hard error, not a no-op.
      subscribe(name, callback) {
        return function unsubscribe() {}
      },
    },
    locale: {
      register(namespace, dictionaries_) {
        dictionaries.set(namespace, dictionaries_)
        return function dispose() {}
      },
      bind() {
        return function t(key) {
          return String(key)
        }
      },
      getLocale() {
        return { active: 'zh-CN' }
      },
    },
    contextMenus: {
      register(options) {
        registered.push({ options: { name: 'contextMenus', ...options }, live: true })
        return function dispose() {}
      },
    },
    effect(callback) {
      const dispose = callback()
      effects.push(dispose)
      return function dispose() {}
    },
    on(name, callback) {
      listeners.push({ name, callback })
      return function off() {}
    },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    get() {
      return undefined
    },
    // A component that waits for a service either asks ctx.get (optional) or
    // defers through ctx.inject. Both have to work, or a component that installs
    // itself on the injected branch silently registers nothing - which is exactly
    // what dsh-delete-session does.
    inject(services, callback) {
      const sub = {
        effect: context.effect,
        inject: context.inject,
        on: context.on,
        logger: context.logger,
        get: () => undefined,
      }
      for (const service of services) sub[service] = context[service]
      const dispose = callback(sub)
      return function disposeInjection() {
        if (typeof dispose === 'function') dispose()
      }
    },
  }
  return { context, registered, effects, listeners, dictionaries }
}