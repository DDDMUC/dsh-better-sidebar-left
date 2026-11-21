import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  apply,
  dshVersion,
  fiberStateOf,
  guard,
  hostStateOf,
  inspectPackage,
  loaderEntries,
  name,
  pluginOf,
  recordHostBuild,
  resolveAnchors,
  statusOf,
  vendoredVersions,
} from '../src/index.js'
import { COMPONENTS, PLUGIN_ID, rowNameOf } from '../src/components.js'

const counting = COMPONENTS.filter((component) => component.id === 'dsh-session-counts')[0]
const rename = COMPONENTS.filter((component) => component.id === 'dsh-session-rename-dblclick')[0]

/** A profile-shaped directory holding one fake package. */
function fakeProfile(packages) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-better-sidebar-left-host-'))
  for (const [pkg, version] of Object.entries(packages)) {
    mkdirSync(join(dir, 'node_modules', pkg), { recursive: true })
    writeFileSync(join(dir, 'node_modules', pkg, 'package.json'), JSON.stringify({ name: pkg, version, main: 'index.js' }))
    writeFileSync(join(dir, 'node_modules', pkg, 'index.js'), 'export function apply() {}\n')
  }
  return dir
}

/** A context whose loader answers with the rows given. */
function ctxWith(rows, baseUrl) {
  return {
    baseUrl,
    get(service) {
      if (service === 'loader') {
        return {
          baseUrl,
          entries() {
            return rows.map((row) => ({
              options: { id: row.id ?? row.name, name: row.name },
              disabled: Boolean(row.disabled),
              fiber: row.fiber === undefined ? { uid: 1, state: 2 } : row.fiber,
            }))
          },
        }
      }
      return undefined
    },
  }
}

test('the host half names this plugin', () => {
  assert.equal(name, PLUGIN_ID)
})

test('the vendored version record covers every component and is what status reports first', () => {
  const versions = vendoredVersions()
  assert.deepEqual(Object.keys(versions).sort(), COMPONENTS.map((component) => component.id).sort())
  for (const component of COMPONENTS) assert.match(versions[component.id], /^[0-9]+\.[0-9]+\.[0-9]+/)
})

test('pluginOf recognises the three shapes and refuses everything else', () => {
  const fn = () => {}
  assert.equal(pluginOf({ default: fn }), fn)
  assert.equal(pluginOf(fn), fn)
  assert.equal(pluginOf({ plugin: fn }), fn)
  const object = { apply() {} }
  assert.equal(pluginOf(object), object)
  assert.equal(pluginOf({}), null)
  assert.equal(pluginOf(null), null)
  assert.equal(pluginOf({ apply: 42 }), null)
})

test('inspectPackage reports an absence instead of throwing', () => {
  const profile = fakeProfile({ 'dsh-session-counts': '0.0.3' })
  try {
    const found = inspectPackage('dsh-session-counts', [profile])
    assert.equal(found.installed, true)
    assert.equal(found.version, '0.0.3')
    assert.equal(inspectPackage('dsh-declutter', [profile]).installed, false)
  } finally {
    rmSync(profile, { recursive: true, force: true })
  }
})

test('resolveAnchors turns a file:// baseUrl into a directory and de-duplicates', () => {
  const anchors = resolveAnchors({ baseUrl: 'file:///tmp/dsh-anchor-test' })
  assert.ok(anchors.includes('/tmp/dsh-anchor-test'), 'the baseUrl was not used as an anchor')
  assert.equal(new Set(anchors).size, anchors.length)
})

test('a throwing service accessor reads as absent', () => {
  const ctx = {
    get() {
      throw new Error('no such service')
    },
  }
  assert.equal(loaderEntries(ctx), null)
})

test('the loader view flattens the tree and carries each row fiber state', () => {
  const rows = loaderEntries(ctxWith([{ name: 'a', fiber: { uid: 1, state: 2 } }, { name: 'b', fiber: { uid: 2, state: 3 } }]))
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((row) => row.fiberState), ['active', 'failed'])
})

test('a fiber state is a word, never a raw constant', () => {
  assert.equal(fiberStateOf(null), 'none')
  assert.equal(fiberStateOf({ uid: 1, state: 2 }), 'active')
  assert.equal(fiberStateOf({ uid: 1, state: 3 }), 'failed')
  assert.equal(fiberStateOf({ uid: 1, state: 5 }), 'stopping')
  assert.equal(fiberStateOf({ uid: 1, state: 0 }), 'starting')
  assert.equal(fiberStateOf({ uid: null, state: 2 }), 'disposed')
  assert.equal(fiberStateOf({ uid: 1, state: 'x' }), 'unknown')
})

test('the host half mounts nothing itself: the component rows do', async () => {
  const mounted = []
  const ctx = {
    baseUrl: undefined,
    get(service) {
      if (service === 'webServer') return { register: () => () => {} }
      return undefined
    },
    effect(callback) {
      callback()
    },
    inject() {},
    plugin(plugin) {
      mounted.push(plugin)
    },
  }
  await apply(ctx)
  assert.deepEqual(mounted, [], 'this plugin host half must not mount any component itself')
})

test('a live component row reads as mounted', () => {
  const state = hostStateOf(counting, loaderEntries(ctxWith([{ name: rowNameOf(counting) }])), true)
  assert.equal(state.hostMounted, true)
  assert.equal(state.hostRow, rowNameOf(counting))
})

test('any row that is not active reads as NOT mounted, with its reason', () => {
  const cases = [
    [{ name: rowNameOf(counting), fiber: { uid: 1, state: 3 } }, 'start-failed'],
    [{ name: rowNameOf(counting), fiber: { uid: 1, state: 5 } }, 'stopping'],
    [{ name: rowNameOf(counting), fiber: { uid: null, state: 2 } }, 'disposed'],
    [{ name: rowNameOf(counting), disabled: true }, 'disabled'],
  ]
  for (const [row, reason] of cases) {
    const state = hostStateOf(counting, loaderEntries(ctxWith([row])), true)
    assert.equal(state.hostMounted, false, reason + ': must not report mounted')
    assert.equal(state.hostReason, reason)
  }
})

test('a component installed standalone next to this plugin answers under its own name', () => {
  const state = hostStateOf(counting, loaderEntries(ctxWith([{ name: 'dsh-session-counts' }])), true)
  assert.equal(state.hostMounted, true)
  assert.equal(state.hostRow, 'dsh-session-counts')
})

test('a component with no row at all is reported, never silently mounted', () => {
  const installed = hostStateOf(counting, loaderEntries(ctxWith([])), true)
  assert.equal(installed.hostMounted, false)
  assert.equal(installed.hostReason, 'row-missing')
  const absent = hostStateOf(counting, loaderEntries(ctxWith([])), false)
  assert.equal(absent.hostReason, 'not-installed')
})

test('an invisible loader yields hostMounted null, never a crash', () => {
  assert.deepEqual(hostStateOf(counting, null, true), { hostMounted: null, hostReason: null, hostRow: null })
})

test('the status document reports installed state, version and the own-row count', () => {
  const profile = fakeProfile({ 'dsh-session-counts': '0.0.1' })
  try {
    const ctx = ctxWith([{ name: rowNameOf(counting) }, { name: 'dsh-session-counts' }], 'file://' + profile)
    const status = statusOf(ctx)
    assert.equal(status.ok, true)
    assert.equal(status.plugin, PLUGIN_ID)
    assert.equal(status.loaderVisible, true)
    assert.equal(status.components.length, COMPONENTS.length)
    const counts = status.components.filter((component) => component.id === 'dsh-session-counts')[0]
    assert.equal(counts.installed, true)
    assert.equal(counts.installedVersion, '0.0.1')
    // version is the vendored (browser) one; installedVersion is the host half.
    assert.equal(counts.version, vendoredVersions()['dsh-session-counts'])
    assert.equal(counts.versionMatch, false, 'a mismatched pair must be reported')
    assert.equal(counts.ownRows, 1)
    assert.equal(counts.hostMounted, true)
  } finally {
    rmSync(profile, { recursive: true, force: true })
  }
})

test('the summary counts the rows that are really live', () => {
  const status = statusOf(ctxWith([{ name: rowNameOf(counting) }, { name: rowNameOf(rename), fiber: { uid: 2, state: 3 } }]))
  assert.equal(status.summary.mounted, 1)
  assert.deepEqual(status.summary.combination, ['dsh-session-counts'])
  assert.equal(status.summary.total, COMPONENTS.length)
})

test('the status is read from the loader on every call, never cached', () => {
  let live = false
  const ctx = {
    get(service) {
      if (service !== 'loader') return undefined
      return {
        entries: () => [{ options: { id: 'counts', name: rowNameOf(counting) }, disabled: false, fiber: { uid: 2, state: live ? 2 : 3 } }],
      }
    },
  }
  assert.equal(statusOf(ctx).summary.mounted, 0)
  live = true
  assert.equal(statusOf(ctx).summary.mounted, 1)
})

test('the payload carries the identity the page needs', () => {
  const status = statusOf(ctxWith([]))
  for (const component of status.components) {
    assert.equal(component.package, component.id)
    assert.equal(typeof component.feature, 'string')
    assert.equal(typeof component.kind, 'string')
    assert.equal(component.repo, 'https://github.com/DDDMUC/' + component.id)
  }
})

// --- the route ---------------------------------------------------------------

function fakeResponse() {
  const captured = { status: null, body: null, headers: null }
  return {
    captured,
    writeHead(status, headers) {
      captured.status = status
      captured.headers = headers
    },
    end(payload) {
      captured.body = JSON.parse(payload)
    },
  }
}

function request({ method = 'GET', remote = '127.0.0.1', host = '127.0.0.1:1234', origin } = {}) {
  return {
    method,
    socket: { remoteAddress: remote },
    headers: origin === undefined ? { host } : { host, origin },
  }
}

/** Register the route against a fake web server and hand back the handler. */
async function routeHandler(ctx) {
  let handler = null
  const webServer = {
    register(options) {
      assert.equal(options.path, '/api/dsh-better-sidebar-left/status')
      handler = options.handler
      return () => {}
    },
  }
  const base = {
    ...ctx,
    get(service) {
      if (service === 'webServer') return webServer
      return ctx.get(service)
    },
    effect(callback) {
      callback()
    },
    inject() {},
  }
  await apply(base)
  assert.notEqual(handler, null, 'apply must register the status route')
  return handler
}

test('the route answers GET on loopback with the status document', async () => {
  const handler = await routeHandler(ctxWith([]))
  const res = fakeResponse()
  await handler(request(), res)
  assert.equal(res.captured.status, 200)
  assert.equal(res.captured.body.ok, true)
  assert.equal(res.captured.body.plugin, PLUGIN_ID)
})

test('the route refuses a non-GET method', async () => {
  const handler = await routeHandler(ctxWith([]))
  const res = fakeResponse()
  await handler(request({ method: 'POST' }), res)
  assert.equal(res.captured.status, 405)
})

test('the route refuses a non-loopback caller', async () => {
  const handler = await routeHandler(ctxWith([]))
  const res = fakeResponse()
  await handler(request({ remote: '10.0.0.2' }), res)
  assert.equal(res.captured.status, 403)
  assert.equal(res.captured.body.error, 'loopback only')
})

test('the route refuses a foreign Host header', async () => {
  const handler = await routeHandler(ctxWith([]))
  const res = fakeResponse()
  await handler(request({ host: 'evil.example:80' }), res)
  assert.equal(res.captured.status, 403)
})

test('the route refuses a cross-origin caller', async () => {
  const handler = await routeHandler(ctxWith([]))
  const res = fakeResponse()
  await handler(request({ origin: 'http://evil.example' }), res)
  assert.equal(res.captured.status, 403)
})

test('guard is a pure refusal, so a caller can test it directly', () => {
  const res = fakeResponse()
  assert.equal(guard(request(), res), true)
  const refused = fakeResponse()
  assert.equal(guard(request({ remote: '8.8.8.8' }), refused), false)
  assert.equal(refused.captured.status, 403)
})

test('apply defers to the webServer injection when the service is absent', async () => {
  let injected = null
  let registered = 0
  const ctx = {
    get: () => undefined,
    effect(callback) {
      callback()
    },
    inject(services, callback) {
      injected = services
      // A real injection hands back a fresh context, which owns effect() the same
      // way this one does - the route has to be registered through it.
      callback({
        effect(callback_) {
          callback_()
        },
        webServer: {
          register() {
            registered += 1
            return () => {}
          },
        },
      })
    },
  }
  await apply(ctx)
  assert.deepEqual(injected, ['webServer'])
  assert.equal(registered, 1)
})

test('dshVersion answers a version string or null, never throws', () => {
  const version = dshVersion()
  assert.ok(version === null || typeof version === 'string')
})

test('status separates the build in memory from the build on disk', () => {
  // A vendored file changing on disk does not reload the module that is running.
  // That is exactly how a host ended up serving one component version while the
  // package shipped another, so /status has to report it.
  const dir = fakeProfile({})
  const ctx = ctxWith([{ name: rowNameOf(counting) }, { name: rowNameOf(rename) }], dir)
  const untouched = statusOf(ctx).components.filter((component) => component.id === counting.id)[0]
  assert.equal(untouched.hostLoaded, false, 'a row that never mounted here is not loaded')
  assert.equal(untouched.hostStale, null, 'unknown is not the same as stale')
  assert.equal(statusOf(ctx).summary.stale, 0)

  recordHostBuild(counting.id)
  const fresh = statusOf(ctx).components.filter((component) => component.id === counting.id)[0]
  assert.equal(fresh.hostLoaded, true)
  assert.equal(fresh.hostStale, false, 'the copy in memory is the copy on disk')

  const table = globalThis[Symbol.for(PLUGIN_ID + ':hostBuilds')]
  table[counting.id] = { hash: 'older-build-000', at: Date.now() }
  const stale = statusOf(ctx)
  assert.equal(stale.components.filter((component) => component.id === counting.id)[0].hostStale, true)
  assert.equal(stale.summary.stale, 1)
  delete table[counting.id]
})
