import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { COMPONENTS, COMPONENT_IDS } from '../src/components.js'
import { fakeRequire, loadBundle, readText, root } from './helpers.js'

const clientText = readFileSync(join(root, 'src', 'client.js'), 'utf8')
const registered = loadBundle(clientText)

test('the bundle registers under this plugin id', () => {
  assert.equal(registered.id, 'dsh-better-sidebar-left')
  const plugin = registered.factory(fakeRequire())
  assert.equal(plugin.NS, 'dsh-better-sidebar-left')
  assert.equal(plugin.STATUS_ROUTE, '/api/dsh-better-sidebar-left/status')
})

test('the manifest and the allocation were baked in, not left as placeholders', () => {
  assert.equal(clientText.includes('__MANIFEST__'), false)
  assert.equal(clientText.includes('__INTEROP__'), false)
  const plugin = registered.factory(fakeRequire())
  assert.deepEqual(plugin.MANIFEST.map((component) => component.id), COMPONENT_IDS)
  for (const component of plugin.MANIFEST) {
    assert.equal(typeof component.title.zh, 'string')
    assert.equal(typeof component.title.en, 'string')
    assert.equal(typeof component.pitch.zh, 'string')
    assert.equal(typeof component.pitch.en, 'string')
  }
  assert.ok(plugin.INTEROP.slots.length > 0, 'the page prints the slot allocation')
})

test('the mount order is the manifest order', () => {
  const plugin = registered.factory(fakeRequire())
  assert.deepEqual(plugin.VENDORED, COMPONENT_IDS)
})

test('the browser half injects every service its components need', async () => {
  // The components run inside THIS plugin's context, so a service one of them
  // declares has to be declared here too - otherwise its apply() runs without the
  // service and the feature half-mounts (dsh-session-relocate needs contextMenus).
  const plugin = registered.factory(fakeRequire())
  const declared = new Set(plugin.SERVICES)
  for (const component of COMPONENTS) {
    const module = await import(pathToFileURL(join(root, 'src', 'vendor', component.id + '.js')).href)
    const vendored = module.default(fakeRequire())
    for (const service of vendored.inject ?? []) {
      assert.ok(declared.has(service), component.id + ' needs ' + service + ', which this bundle does not inject')
    }
  }
  for (const needed of ['slots', 'locale']) assert.ok(declared.has(needed), 'the studio page itself needs ' + needed)
})

test('both dictionaries are complete and parallel', () => {
  const plugin = registered.factory(fakeRequire())
  const zh = Object.keys(plugin.zh).sort()
  const en = Object.keys(plugin.en).sort()
  assert.deepEqual(en, zh)
  for (const key of zh) {
    assert.equal(typeof plugin.zh[key], 'string', 'zh.' + key)
    assert.equal(typeof plugin.en[key], 'string', 'en.' + key)
    assert.ok(plugin.zh[key].length > 0, 'zh.' + key + ' is empty')
    assert.ok(plugin.en[key].length > 0, 'en.' + key + ' is empty')
  }
  for (const key of ['summaryShort', 'intro', 'mounted', 'missing', 'settingsHeading', 'interopHeading']) {
    assert.ok(zh.includes(key), 'the page copy is missing ' + key)
  }
})

test('the state vocabulary is derived from the payload, never assumed', () => {
  const plugin = registered.factory(fakeRequire())
  assert.equal(plugin.stateOf({ hostMounted: true, installed: true }), 'mounted')
  assert.equal(plugin.stateOf({ hostMounted: false, installed: true }), 'installed')
  assert.equal(plugin.stateOf({ hostMounted: false, installed: false }), 'missing')
  // Unknown (no loader reachable) is NOT missing: the host said nothing.
  assert.equal(plugin.stateOf({ hostMounted: null, installed: true }), 'installed')
})

test('the gate keeps only what the host calls mounted', () => {
  const plugin = registered.factory(fakeRequire())
  const payload = {
    ok: true,
    components: [
      { id: 'dsh-delete-session', hostMounted: true, installed: true },
      { id: 'dsh-session-relocate', hostMounted: false, installed: false },
      { id: 'dsh-session-relocate', hostMounted: false, installed: true },
    ],
  }
  assert.deepEqual(plugin.mountableComponents(payload), ['dsh-delete-session'])
  // No payload at all = unknown = the pre-gate behaviour: mount everything.
  assert.deepEqual(plugin.mountableComponents(null), COMPONENT_IDS)
})

test('a component the host never mentions is not mounted', () => {
  const plugin = registered.factory(fakeRequire())
  const payload = { ok: true, components: [{ id: 'dsh-delete-session', hostMounted: true, installed: true }] }
  assert.deepEqual(plugin.mountableComponents(payload), ['dsh-delete-session'])
})

test('the shipped bundle reaches for no web-only global while loading', () => {
  // Loading it above succeeded without a DOM, which is the assertion: the module
  // body must not touch document/window beyond registering with the loader.
  assert.ok(readText('src/sidebar.js').includes("typeof document === 'undefined'"))
})

test('the left rail entry registers a rail row and the page behind it', async () => {
  // The entry is two slot registrations: sidebar.panellist draws the row in the rail,
  // main is what the shell shows when that row is active. Both must be there, and the
  // label must be the localized 左栏管理 rather than the package name.
  const plugin = registered.factory(fakeRequire())
  const registered$ = []
  const dictionaries = {}
  const ctx = {
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') return dispose
      return undefined
    },
    locale: {
      register(namespace, copy) {
        dictionaries[namespace] = copy
      },
      bind(namespace) {
        return (key) => {
          const copy = dictionaries[namespace] ?? { zh: {} }
          return copy.zh[key] ?? key
        }
      },
      getLocale() {
        return { active: 'zh' }
      },
    },
    slots: {
      inject(names, callback) {
        return callback()
      },
      register(meta, component) {
        registered$.push({ meta, component })
        return () => {}
      },
    },
  }
  const saved = globalThis.fetch
  globalThis.fetch = () => Promise.resolve({ json: () => Promise.resolve({ ok: true, components: [], summary: { total: 5, mounted: 0 } }) })
  try {
    await plugin.apply(ctx)
  } finally {
    if (saved === undefined) delete globalThis.fetch
    else globalThis.fetch = saved
  }

  const rail = registered$.filter((entry) => entry.meta.name === 'sidebar.panellist')
  assert.equal(rail.length, 1, 'exactly one rail row')
  assert.equal(rail[0].meta.id, 'dsh-better-sidebar-left')
  assert.equal(typeof rail[0].meta.label, 'function', 'the shell re-reads the label after a locale change')
  assert.equal(rail[0].meta.label(), '左栏管理')
  assert.equal(plugin.en.panelEntry, 'Left rail')
  assert.equal(typeof rail[0].component, 'function', 'the row needs an icon component')

  const page = registered$.filter((entry) => entry.meta.name === 'main')
  assert.equal(page.length, 1, 'the rail row must open a page')
  assert.equal(page[0].meta.key, 'dsh-better-sidebar-left')
  assert.equal(typeof page[0].component, 'function')
  assert.notEqual(page[0].component, plugin.SidebarPanel, 'the rail page is its own surface, not the settings card')
})
