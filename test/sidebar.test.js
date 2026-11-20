import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { COMPONENT_IDS } from '../src/components.js'
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