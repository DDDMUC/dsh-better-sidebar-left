import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { COMPONENTS, COMPONENT_IDS, COMPONENT_ROW_NAMES, INTEROP, PLUGIN_ID, PLUGIN_VERSION, rowNameOf } from '../src/components.js'
import { root } from './helpers.js'

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

test('this plugin names itself and keeps one version', () => {
  assert.equal(PLUGIN_ID, manifest.name)
  assert.equal(PLUGIN_VERSION, manifest.version)
  assert.match(PLUGIN_VERSION, /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/)
})

test('this plugin composes exactly the six session components', () => {
  assert.deepEqual(COMPONENT_IDS, [
    'dsh-delete-session',
    'dsh-session-relocate',
    'dsh-session-rename-dblclick',
    'dsh-session-counts',
    'dsh-declutter',
    'dsh-settings-launcher',
  ])
})

test('every component is an independent package with its own repo', () => {
  for (const component of COMPONENTS) {
    assert.equal(component.package, component.id, component.id + ': package must equal id')
    assert.equal(component.repo, 'https://github.com/DDDMUC/' + component.package)
    assert.equal(typeof component.feature, 'string')
    assert.ok(component.feature.length > 0)
    assert.ok(['action', 'decor', 'maintenance'].includes(component.kind), component.id + ': unexpected kind')
  }
})

test('component ids, suffixes and row names are unique', () => {
  assert.equal(new Set(COMPONENT_IDS).size, COMPONENTS.length)
  assert.equal(new Set(COMPONENTS.map((component) => component.suffix)).size, COMPONENTS.length)
  assert.equal(new Set(COMPONENT_ROW_NAMES).size, COMPONENTS.length)
  for (const component of COMPONENTS) assert.equal(rowNameOf(component), PLUGIN_ID + '/' + component.suffix)
})

test('every component speaks both languages', () => {
  for (const component of COMPONENTS) {
    for (const key of ['title', 'pitch']) {
      for (const locale of ['zh', 'en']) {
        const value = component[key][locale]
        assert.equal(typeof value, 'string', component.id + ': ' + key + '.' + locale)
        assert.ok(value.length >= (key === 'title' ? 2 : 20), component.id + ': ' + key + '.' + locale + ' is too short to be copy')
      }
    }
  }
})

test('no two components claim the same slot identity', () => {
  const seen = new Map()
  for (const slot of INTEROP.slots) {
    const identity = slot.name + '#' + (slot.id === undefined ? slot.key : slot.id)
    assert.equal(seen.has(identity), false, 'identity claimed twice: ' + identity + ' (' + seen.get(identity) + ', ' + slot.component + ')')
    seen.set(identity, slot.component)
  }
})

test('no two components claim the same order on one slot', () => {
  // Only id-keyed registrations are sorted against each other: the manager picks a
  // key-keyed entry BY its key, so two of those sharing an order can never both
  // render. dsh-session-relocate really does register its settings card twice, once
  // per row-id spelling, both at order 100 - that is correct, and this test would be
  // wrong to fail it.
  const orders = new Map()
  for (const slot of INTEROP.slots) {
    if (slot.order === undefined || slot.key !== undefined) continue
    const key = slot.name + '@' + slot.order
    assert.equal(orders.has(key), false, 'order claimed twice: ' + key + ' (' + orders.get(key) + ', ' + slot.component + ')')
    orders.set(key, slot.component)
  }
})

test('this plugin own registration collides with nothing', () => {
  const claimed = new Set(
    INTEROP.slots.map((slot) => slot.name + '#' + (slot.id === undefined ? slot.key : slot.id)),
  )
  for (const slot of INTEROP.pluginSlots) {
    const identity = slot.name + '#' + (slot.id === undefined ? slot.key : slot.id)
    assert.equal(claimed.has(identity), false, 'this plugin claims an identity a component already has: ' + identity)
    claimed.add(identity)
  }
  assert.equal(INTEROP.pluginSlots.length, 1, 'this plugin registers one seat and nothing else')
})

test('the allocation mirrors the component tables exactly', () => {
  const fromComponents = []
  for (const component of COMPONENTS) {
    for (const slot of component.slots) {
      fromComponents.push(JSON.stringify({ component: component.id, name: slot.name, id: slot.id ?? null, key: slot.key ?? null, order: slot.order ?? null }))
    }
  }
  const fromInterop = INTEROP.slots.map((slot) =>
    JSON.stringify({ component: slot.component, name: slot.name, id: slot.id ?? null, key: slot.key ?? null, order: slot.order ?? null }),
  )
  assert.deepEqual(fromInterop, fromComponents)
})

test('the one external collision is documented, with evidence', () => {
  assert.equal(INTEROP.externalClaims.length, 1)
  const claim = INTEROP.externalClaims[0]
  assert.equal(claim.component, 'dsh-declutter')
  assert.equal(claim.conflictsWith, 'dsh-sidebar-declutter')
  for (const theme of ['dsh-sidebar-declutter']) {
    assert.ok(claim.storageKeys.includes(theme), 'the shared storage key must be listed')
  }
  const declutter = COMPONENTS.filter((component) => component.id === 'dsh-declutter')[0]
  const ids = declutter.slots.map((slot) => slot.id).filter(Boolean)
  for (const id of claim.slotIds) assert.ok(ids.includes(id), 'declutter must really claim ' + id)
})

test('a component that exports a settings card is listed once', () => {
  for (const card of INTEROP.settingsCards) {
    assert.ok(COMPONENT_IDS.includes(card.component), card.component + ' is not a component')
    assert.equal(typeof card.exportPath, 'string')
  }
  const ids = INTEROP.settingsCards.map((card) => card.component)
  assert.equal(new Set(ids).size, ids.length)
})