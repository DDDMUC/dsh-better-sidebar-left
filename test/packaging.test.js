import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { COMPONENTS, COMPONENT_IDS, COMPONENT_ROW_NAMES, STUDIO_ID, STUDIO_VERSION, rowNameOf } from '../src/components.js'
import { root } from './helpers.js'

const read = (relative) => readFileSync(join(root, relative), 'utf8')
const manifest = JSON.parse(read('package.json'))
const patch = read('cordis.patch.yml')

/** The patch with its comment blocks dropped, so a row is what is left. */
const patchBody = patch
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n')

test('the package declares the bundle and client contract', () => {
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.main, 'src/index.js')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.ok(Array.isArray(manifest.dsh.client.inject))
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-primitives'))
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar'))
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-workspace'))
  // Two components load eagerly (`immediately`) and the bundle travels as one,
  // so the flag has to be on the bundle.
  assert.equal(manifest.dsh.client.immediately, true)
})

test('the studio version is one number in three places', () => {
  assert.equal(manifest.version, STUDIO_VERSION)
  assert.equal(read('src/components.js').includes("export const STUDIO_VERSION = '" + STUDIO_VERSION + "'"), true)
  assert.equal(read('src/studio.js').includes("const PLUGIN_VERSION = '" + STUDIO_VERSION + "'"), true)
})

test('every shipped path exists and is published', () => {
  assert.ok(manifest.files.length > 0)
  for (const entry of manifest.files) {
    assert.equal(existsSync(join(root, entry)), true, 'files[] names a path that does not exist: ' + entry)
  }
  for (const needed of ['src/index.js', 'src/shell.js', 'src/components.js', 'src/client.js', 'src/vendor/versions.json', 'cordis.patch.yml']) {
    assert.ok(manifest.files.includes(needed), 'files[] is missing ' + needed)
  }
})

test('the studio has no runtime dependencies', () => {
  assert.deepEqual(manifest.dependencies ?? {}, {})
  for (const component of COMPONENTS) {
    assert.equal(
      (manifest.dependencies ?? {})[component.package],
      undefined,
      component.package + ' must not be a runtime dependency: it is resolved from the profile, never installed by the studio',
    )
  }
})

test('the exports map sends every component suffix to the shell', () => {
  assert.equal(manifest.exports['.'], './src/index.js')
  assert.equal(manifest.exports['./client'], './src/client.js')
  for (const component of COMPONENTS) {
    assert.equal(manifest.exports['./' + component.suffix], './src/shell.js', component.id + ': suffix must resolve to the shell')
  }
  assert.equal(Object.keys(manifest.exports).length, 3 + COMPONENTS.length)
})

test('the patch inserts the studio row plus exactly one row per component', () => {
  const ids = [...patchBody.matchAll(/^\s*- id:\s*(\S+)\s*$/gm)].map((match) => match[1])
  const names = [...patchBody.matchAll(/^\s*name:\s*'([^']+)'\s*$/gm)].map((match) => match[1])
  assert.equal(ids.length, 1 + COMPONENTS.length)
  assert.equal(names.length, 1 + COMPONENTS.length)
  assert.equal(ids[0], STUDIO_ID)
  assert.equal(names[0], STUDIO_ID, 'the studio row must use the BARE package name')
  assert.deepEqual(names.slice(1), COMPONENT_ROW_NAMES)
  assert.deepEqual(ids.slice(1), COMPONENTS.map((component) => STUDIO_ID + '-' + component.suffix))
})

test('no patch row is named after a component package', () => {
  const names = [...patchBody.matchAll(/^\s*name:\s*'([^']+)'\s*$/gm)].map((match) => match[1])
  for (const component of COMPONENTS) {
    assert.equal(names.includes(component.package), false, 'a row named ' + component.package + ' would add a second list row')
  }
})

test('every component row names its package and resolves to the shell', () => {
  const plugins = [...patchBody.matchAll(/^\s*plugin:\s*'([^']+)'\s*$/gm)].map((match) => match[1])
  assert.deepEqual(plugins, COMPONENTS.map((component) => component.package))
  // The row name must be a subpath this package's exports really answer.
  for (const component of COMPONENTS) {
    const specifier = rowNameOf(component)
    const suffix = './' + specifier.slice(STUDIO_ID.length + 1)
    assert.equal(manifest.exports[suffix], './src/shell.js')
  }
})

test('the patch is pure data with no anchors or tabs', () => {
  assert.equal(patch.includes('\t'), false, 'a tab in YAML is a parse error waiting to happen')
  assert.equal(/^\s*[&*][A-Za-z]/.test(patch), false, 'YAML anchors or aliases would hide a row from a reader')
})

test('the vendored version record covers exactly the components', () => {
  const versions = JSON.parse(read('src/vendor/versions.json'))
  assert.deepEqual(Object.keys(versions).sort(), COMPONENT_IDS.slice().sort())
  for (const component of COMPONENTS) {
    const stamp = read('src/vendor/' + component.id + '.js')
    assert.ok(stamp.startsWith('// ' + component.id + ' browser half, VENDORED by tools/vendor.mjs - DO NOT EDIT.'), component.id + ': vendored header missing')
    assert.ok(stamp.includes('(v' + versions[component.id] + ', sha256 '), component.id + ': vendored file does not carry its version')
    assert.ok(stamp.includes('export default '), component.id + ': vendored file does not export a factory')
  }
})

test('the host half reaches a component only through a resolved path', () => {
  for (const file of ['src/index.js', 'src/shell.js']) {
    const source = read(file)
    for (const component of COMPONENTS) {
      assert.equal(
        new RegExp("from '" + component.package + "'").test(source),
        false,
        file + ' statically imports ' + component.package + ', which would make it a hard dependency',
      )
    }
  }
  assert.ok(read('src/shell.js').includes('importComponent'), 'the shell mounts through importComponent')
})

test('every require a vendored factory makes is declared in the bundle inject list', () => {
  const inject = new Set(manifest.dsh.client.inject)
  for (const component of COMPONENTS) {
    const source = read('src/vendor/' + component.id + '.js')
    for (const match of source.matchAll(/require\('([^']+)'\)/g)) {
      const specifier = match[1]
      if (specifier === 'react') continue
      assert.ok(inject.has(specifier), component.id + ' requires ' + specifier + ', which the bundle does not inject')
    }
  }
})

test('the browser half touches no web-only global', () => {
  const source = read('src/studio.js')
  for (const forbidden of ['window.__DSH_', 'process.env', 'require("node:', "require('node:"]) {
    assert.equal(source.includes(forbidden), false, 'src/studio.js reaches for ' + forbidden)
  }
})

test('the browser half fetches one relative route', () => {
  const source = read('src/studio.js')
  const routes = [...source.matchAll(/'\/api\/[^'\n]+'/g)].map((match) => match[0].slice(1, -1))
  assert.deepEqual([...new Set(routes)], ['/api/dsh-session-studio/status'])
})

test('the host half imports nothing from the DSH SDK', () => {
  for (const file of ['src/index.js', 'src/shell.js', 'src/components.js']) {
    const source = read(file)
    assert.equal(/from '@deepseek-ai\//.test(source), false, file + ' imports the DSH SDK at module scope')
  }
})