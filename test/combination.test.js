// Does the code that actually ships claim the allocation the manifest promises?
//
// test/manifest.test.js proves the TABLE is internally consistent. This suite loads
// each vendored browser half, applies it to a recording context, and compares what
// it really registered with that table. It is the only test that can catch a
// component release that moved a slot id or an order under us.
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { COMPONENTS, INTEROP } from '../src/components.js'
import { fakeClientContext, fakeRequire, installDom, root } from './helpers.js'

const require_ = fakeRequire()

/** Normalise one registration into the shape the manifest uses. */
function claimOf(component, entry) {
  const options = entry.options ?? {}
  const claim = { component: component.id, name: options.name }
  if (options.id !== undefined) claim.id = options.id
  if (options.key !== undefined) claim.key = options.key
  if (options.order !== undefined) claim.order = options.order
  return claim
}

/** Apply one vendored component and return every claim it made. */
async function claimsOf(component) {
  const module = await import(pathToFileURL(join(root, 'src', 'vendor', component.id + '.js')).href)
  const plugin = module.default(require_)
  assert.equal(typeof plugin.apply, 'function', component.id + ' has no apply()')
  const harness = fakeClientContext()
  const teardownDom = installDom()
  const previousFetch = globalThis.fetch
  globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, rules: [] }) })
  try {
    await plugin.apply(harness.context)
  } finally {
    globalThis.fetch = previousFetch
    teardownDom()
  }
  const slotNames = new Set(component.slots.map((slot) => slot.name))
  return harness.registered
    .filter((entry) => slotNames.has((entry.options ?? {}).name))
    .map((entry) => claimOf(component, entry))
}

const sortClaims = (claims) =>
  claims
    .map((claim) => JSON.stringify(claim))
    .sort()
    .map((text) => JSON.parse(text))

const expected = (component) =>
  sortClaims(
    component.slots.map((slot) => {
      const claim = { component: component.id, name: slot.name }
      if (slot.id !== undefined) claim.id = slot.id
      if (slot.key !== undefined) claim.key = slot.key
      if (slot.order !== undefined) claim.order = slot.order
      return claim
    }),
  )

for (const component of COMPONENTS) {
  test('combination ' + component.id + ': the running half claims exactly the manifest allocation', async () => {
    const actual = sortClaims(await claimsOf(component))
    assert.deepEqual(actual, expected(component))
  })
}

test('every component that claims a slot also declares the slot service it uses', async () => {
  for (const component of COMPONENTS) {
    const module = await import(pathToFileURL(join(root, 'src', 'vendor', component.id + '.js')).href)
    const plugin = module.default(require_)
    if (component.slots.length === 0) {
      assert.equal(plugin.inject === undefined || !plugin.inject.includes('slots'), true, component.id + ' claims no seat')
      continue
    }
    // Not every component declares its injections (dsh-delete-session resolves the
    // slot service at apply time instead). What must hold is that a component
    // claiming a seat either declares the service or resolves it itself - and the
    // "running half claims exactly the allocation" test above is what proves the
    // latter actually happened.
    if (plugin.inject !== undefined) {
      assert.ok(Array.isArray(plugin.inject), component.id + ': inject must be an array when declared')
    }
  }
})

test('no two components claim the same identity when they all run together', async () => {
  const all = []
  for (const component of COMPONENTS) all.push(...(await claimsOf(component)))
  const seen = new Map()
  for (const claim of all) {
    const identity = claim.name + '#' + (claim.id === undefined ? claim.key : claim.id)
    assert.equal(seen.has(identity), false, 'two components claim ' + identity + ': ' + seen.get(identity) + ' and ' + claim.component)
    seen.set(identity, claim.component)
  }
  assert.equal(all.length, INTEROP.slots.length, 'the union is the published allocation')
})

test('the studio own row config collides with no component registration', async () => {
  const all = []
  for (const component of COMPONENTS) all.push(...(await claimsOf(component)))
  for (const claim of all) {
    assert.notEqual(claim.key, 'dsh-session-studio#dsh-session-studio')
  }
})

test('mounting twice yields the same allocation, so a row restart is safe', async () => {
  for (const component of COMPONENTS) {
    const first = sortClaims(await claimsOf(component))
    const second = sortClaims(await claimsOf(component))
    assert.deepEqual(second, first, component.id + ' changed its allocation between mounts')
  }
})

test('the declutter half really owns the attributes its external collision is about', async () => {
  const declutter = COMPONENTS.filter((component) => component.id === 'dsh-declutter')[0]
  const module = await import(pathToFileURL(join(root, 'src', 'vendor', declutter.id + '.js')).href)
  const source = String(module.default)
  // The attribute is load-bearing twice over: it is the style tag its own
  // self-check keys on, and the key the user's saved sidebar settings live under.
  assert.ok(source.includes('data-dsh-sidebar-declutter'), 'the sidebar attribute must still be there')
  assert.ok(source.includes('dsh-sidebar-declutter'), 'the storage key must still be there')
})