// docs/INTEROP.md is the contract; src/components.js is the data. This suite makes
// the document unable to drift: the slot table in section 2 is parsed back out of
// the markdown and compared with the manifest, row for row.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { COMPONENTS, INTEROP, PLUGIN_ID, PLUGIN_VERSION } from '../src/components.js'
import { root } from './helpers.js'

const doc = readFileSync(join(root, 'docs', 'INTEROP.md'), 'utf8')

/** The body of one `## <heading>` section, up to the next `## `. */
function section(heading) {
  const lines = doc.split('\n')
  const start = lines.findIndex((line) => line.startsWith('## ') && line.includes(heading))
  if (start === -1) throw new Error('INTEROP.md has no section ' + heading)
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('## '))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n')
}

/** Every markdown table row in a section, as arrays of cells. */
function tableRows(text) {
  const rows = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue
    const cells = trimmed.slice(1, -1).split('|').map((cell) => cell.trim())
    if (cells.every((cell) => /^-+$/.test(cell))) continue
    rows.push(cells)
  }
  return rows
}

test('the participants table names every component and its row suffix', () => {
  const rows = tableRows(section('0. 参与方')).slice(1)
  assert.deepEqual(rows.map((row) => row[0].replace(/`/g, '')), COMPONENTS.map((component) => component.id))
  for (let index = 0; index < COMPONENTS.length; index += 1) {
    assert.equal(rows[index][3].replace(/`/g, ''), COMPONENTS[index].suffix)
    assert.ok(rows[index][2].includes(COMPONENTS[index].package), 'the repo column must name the package')
  }
})

test('the slot table in section 2 is exactly the manifest allocation', () => {
  // The table lives at the top of section 2; the DOM-ownership table below it is a
  // different table and is not part of the allocation.
  const rows = tableRows(section('2. 槽位占用表').split('### ')[0]).slice(1)
  assert.equal(rows.length, INTEROP.slots.length, 'INTEROP.md lists a different number of seats than the manifest')
  for (let index = 0; index < rows.length; index += 1) {
    const [component, name, identity, order] = rows[index]
    const slot = INTEROP.slots[index]
    assert.equal(component.replace(/`/g, ''), slot.component, 'row ' + index + ': component')
    assert.equal(name.replace(/`/g, ''), slot.name, 'row ' + index + ': slot name')
    if (slot.id !== undefined) assert.equal(identity.replace(/`/g, ''), 'id: ' + slot.id, 'row ' + index + ': id')
    else assert.equal(identity.replace(/`/g, ''), 'key: ' + slot.key, 'row ' + index + ': key')
    assert.equal(order, slot.order === undefined ? '—' : String(slot.order), 'row ' + index + ': order')
  }
})

test('the document states this plugin identity it ships with', () => {
  const participants = section('0. 参与方')
  assert.ok(participants.includes(PLUGIN_ID), 'section 0 must name this package')
  assert.ok(participants.includes(PLUGIN_VERSION), 'section 0 must name the version it ships with')
})

test('the document keeps the two load-bearing rules about declutter', () => {
  assert.ok(doc.includes('data-dsh-sidebar-declutter'))
  assert.ok(doc.includes("STORE_KEY = 'dsh-sidebar-declutter'"))
  const conflicts = section('7. 已知外部冲突')
  assert.ok(conflicts.includes('dsh-sidebar-declutter'))
  for (const claim of INTEROP.externalClaims) {
    for (const id of claim.slotIds) assert.ok(conflicts.includes(id), 'the conflict section must name ' + id)
  }
})

test('the document records that both halves are vendored', () => {
  const architecture = section('11. 自包含架构')
  assert.ok(architecture.includes('两半都 vendor'), 'the architecture must say that both halves are vendored')
  assert.ok(architecture.includes('src/vendor/host/'), 'the vendored host directory must be named')
  assert.ok(architecture.includes('装一个就够'), 'the one-install consequence must be stated')
  assert.equal(architecture.includes('宿主半部不复制'), false, 'the old contract must be gone, not merely edited around')
})

test('every rule I1-I9 is present, in order', () => {
  const rules = section('1. 铁律')
  let cursor = -1
  for (let index = 1; index <= 9; index += 1) {
    const at = rules.indexOf('**I' + index + ' ')
    assert.notEqual(at, -1, 'rule I' + index + ' is missing')
    assert.ok(at > cursor, 'rule I' + index + ' is out of order')
    cursor = at
  }
})

test('the settings-card table agrees with the manifest export table', () => {
  const rows = tableRows(section('6. 设置卡')).slice(1)
  const listed = rows.map((row) => row[0].replace(/`/g, ''))
  for (const card of INTEROP.settingsCards) {
    assert.ok(listed.includes(card.component), card.component + ' exports a card but the document does not say so')
  }
})