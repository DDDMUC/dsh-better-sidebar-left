// A vendored browser half must be self-contained: it may reach for the platform
// modules the bundle injects and nothing else. A relative import would dangle (the
// file it names is not shipped), and a bare import of anything else would fail at
// page boot with the module loader reporting a missing module - silently, because
// nothing else in this plugin would notice.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { COMPONENTS } from '../src/components.js'
import { root } from './helpers.js'

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const injected = new Set(manifest.dsh.client.inject)
const sources = COMPONENTS.map((component) => ({
  component,
  source: readFileSync(join(root, 'src', 'vendor', component.id + '.js'), 'utf8'),
}))

test('no vendored half imports a sibling module', () => {
  for (const { component, source } of sources) {
    const relative = [...source.matchAll(/(?:from|import\s*\(|require\s*\()\s*['"](\.[^'"]+)['"]/g)].map((match) => match[1])
    assert.deepEqual(relative, [], component.id + ' reaches for a relative module the bundle does not ship')
  }
})

test('a vendored half declares one export and no imports', () => {
  for (const { component, source } of sources) {
    assert.equal(/^\s*import\s/m.test(source), false, component.id + ' has a top-level import statement')
    const exports_ = [...source.matchAll(/^\s*export\s/gm)]
    assert.equal(exports_.length, 1, component.id + ' must declare exactly one export (the factory)')
  }
})

test('every module a vendored half requires is injected by this bundle', () => {
  for (const { component, source } of sources) {
    for (const match of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      const specifier = match[1]
      if (specifier === 'react') continue
      assert.ok(injected.has(specifier), component.id + ' requires ' + specifier + ', which dsh.client.inject does not list')
    }
  }
})

test('each vendored half is one factory expression', () => {
  for (const { component, source } of sources) {
    const marker = 'export default '
    const at = source.indexOf(marker)
    assert.ok(at > 0, component.id + ' has no default export')
    const body = source.slice(at + marker.length).trimEnd()
    assert.ok(body.endsWith('}'), component.id + ': the factory body does not close')
    assert.equal(body.includes('__ModuleLoader__'), false, component.id + ': the wrapper was not replaced')
  }
})

test('no vendored half registers a second module bundle', () => {
  const bundle = readFileSync(join(root, 'src', 'client.js'), 'utf8')
  const loads = [...bundle.matchAll(/window\.__ModuleLoader__\.load\(/g)]
  assert.equal(loads.length, 1, 'the shipped bundle must register exactly once')
})