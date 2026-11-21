import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COMPONENTS } from '../src/components.js'
import { fakeClientContext, fakeRequire, installDom, loadBundle, readText } from './helpers.js'

const bundle = loadBundle(readText('src/client.js'))
const require_ = fakeRequire()
const plugin = bundle.factory(require_)

const MARKER = '__DSH_BETTER_SIDEBAR_LEFT__'
// Read the real version instead of a literal: a bump should not need a test edit.
const VERSION = JSON.parse(readText('package.json')).version
const ALL = COMPONENTS.map((component) => component.id)

function payload(overrides = {}) {
  return {
    ok: true,
    plugin: 'dsh-better-sidebar-left',
    version: VERSION,
    components: COMPONENTS.map((component) => ({
      id: component.id,
      package: component.package,
      installed: true,
      version: '1.0.0',
      installedVersion: '1.0.0',
      versionMatch: true,
      hostMounted: Object.prototype.hasOwnProperty.call(overrides, component.id) ? overrides[component.id] : true,
      hostReason: null,
      hostRow: null,
      ownRows: 0,
    })),
  }
}

/** Run apply() against a stubbed fetch, and always put the world back. */
async function withBundle(statusBody, body) {
  const teardownDom = installDom()
  const previousFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = (url) => {
    const target = String(url)
    requests.push(target)
    // Only this plugin's own route answers the status document; a component asking
    // its own route must get a benign body, never this plugin's payload.
    const body = target.indexOf('/api/dsh-better-sidebar-left/status') === -1 ? { ok: true, rules: [] } : statusBody
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
  }
  const harness = fakeClientContext()
  try {
    const mounted = await plugin.apply(harness.context)
    return await body({ mounted, harness, requests })
  } finally {
    delete globalThis[MARKER]
    globalThis.fetch = previousFetch
    teardownDom()
  }
}

test('applying the bundle mounts all five components', async () => {
  await withBundle(payload(), async ({ mounted, harness, requests }) => {
    assert.deepEqual(Object.keys(mounted), ALL)
    for (const id of ALL) assert.equal(mounted[id], true, id + ' did not mount: see its apply error above')
    assert.equal(requests.length, 1, 'the gate reads the status route once')
    assert.equal(requests[0], '/api/dsh-better-sidebar-left/status')
    assert.ok(harness.registered.length > 0, 'the mounted components registered slots')
  })
})

test('the marker records what mounted, so a live check can read it', async () => {
  await withBundle(payload(), async ({ mounted }) => {
    const marker = globalThis[MARKER]
    assert.equal(marker.version, VERSION)
    assert.deepEqual(marker.mounted, mounted)
    assert.equal(marker.route, '/api/dsh-better-sidebar-left/status')
    assert.deepEqual(marker.gate, ALL)
  })
})

test('with no host answer at all the bundle still mounts everything', async () => {
  await withBundle(null, async ({ mounted }) => {
    for (const id of ALL) assert.equal(mounted[id], true, id + ' must mount when the host cannot answer')
  })
})

test('a component the host reports as not mounted is not drawn', async () => {
  await withBundle(payload({ 'dsh-session-counts': false }), async ({ mounted, harness }) => {
    assert.equal(mounted['dsh-session-counts'], false)
    // Its own registrations must not exist: the overlay seat is the one it claims.
    const claims = harness.registered.map((entry) => entry.options.name + '#' + (entry.options.id ?? entry.options.key))
    assert.equal(claims.includes('shell.overlay#session-counts'), false, 'a gated-off component must claim nothing')
    // The other four are still there.
    for (const id of ALL.filter((x) => x !== 'dsh-session-counts')) assert.equal(mounted[id], true)
  })
})

test('every gated-off component is the only thing missing', async () => {
  await withBundle(payload({ 'dsh-declutter': false, 'dsh-session-relocate': false }), async ({ mounted }) => {
    assert.equal(mounted['dsh-declutter'], false)
    assert.equal(mounted['dsh-session-relocate'], false)
    assert.equal(mounted['dsh-delete-session'], true)
    assert.equal(mounted['dsh-session-rename-dblclick'], true)
    assert.equal(mounted['dsh-session-counts'], true)
  })
})

test('this plugin own page is registered before the gate resolves', async () => {
  await withBundle(payload(), async ({ harness }) => {
    const keys = harness.registered.map((entry) => entry.options.key).filter(Boolean)
    assert.ok(keys.includes('dsh-better-sidebar-left#dsh-better-sidebar-left'), 'this plugin row config must be claimed')
  })
})

test('no vendored component is reached through a subpath require', async () => {
  const harness = fakeClientContext()
  // The bundle factories take their dependencies from the module loader, so every
  // require the stitched bundle makes must already be a declared injection.
  const seen = new Set()
  const recording = (specifier) => {
    seen.add(specifier)
    return require_(specifier)
  }
  const fresh = bundle.factory(recording)
  const teardownDom = installDom()
  const previousFetch = globalThis.fetch
  globalThis.fetch = () => Promise.resolve({ json: () => Promise.resolve(payload()) })
  try {
    await fresh.apply(harness.context)
  } finally {
    delete globalThis[MARKER]
    globalThis.fetch = previousFetch
    teardownDom()
  }
  for (const specifier of seen) {
    assert.equal(specifier.startsWith('.'), false, 'the bundle required a relative module: ' + specifier)
    assert.equal(specifier.includes('dsh-better-sidebar-left'), false, 'the bundle required itself: ' + specifier)
  }
})