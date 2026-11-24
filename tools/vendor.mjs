// Regenerate src/vendor/ from the five component checkouts.
//
// The package is self-contained on BOTH sides: the plugin list shows ONE row and
// installing it installs nothing else, which is only possible because the
// components travel inside it - their browser halves in src/vendor/<id>.js and
// their host halves in src/vendor/host/<id>.js. That makes this file load-bearing:
// a hand-maintained copy is a copy that drifts, so everything under src/vendor/ is
// GENERATED, byte for byte, from the component sources, and the test suite fails
// when it is stale.
//
//   node tools/vendor.mjs                     # rewrite src/vendor/
//   node tools/vendor.mjs --check             # verify, write nothing
//   node tools/vendor.mjs --workspace <dir>   # read the components from <dir>
//
// Two transforms, both mechanical and both refusing rather than guessing:
//
//   BROWSER half. A component bundle registers its factory with the host module
//   loader (window.__ModuleLoader__.load({ id, factory })); inside this package the
//   factory is called directly, so the wrapper is replaced by a default export of
//   the SAME factory body. Nothing inside the braces is touched.
//
//   HOST half. An ES module whose only imports are node builtins and relative
//   siblings, so the copy is almost verbatim. Three rewrites, each with a reason:
//
//     a relative import (./logic.js, ./relocate.js, ...) is copied beside the entry
//       under a component-qualified name, so two components that both ship a
//       logic.js cannot collide;
//     a self-reported version read from the component's own package.json
//       (createRequire(import.meta.url)('../package.json').version) is pinned to the
//       version being vendored, because the copy has no package.json beside it and
//       would otherwise answer '0.0.0-unknown';
//     anything else - an @deepseek-ai/* import, a relative module that does not
//       exist, a shape this tool does not recognise - stops the build.
//
// None of the five host halves imports a platform package today. If one starts to,
// the build fails here instead of producing a copy that resolves a second instance
// of dsh-session at runtime.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPONENTS } from '../src/components.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

// The component checkouts live next to this package, in their own staging
// directory: the package's siblings in this workspace are the components' own
// working trees, and vendoring must never read those (they carry uncommitted work).
// --workspace overrides the staging directory so a test can drive this tool against
// a corrupted COPY of the package while still reading real sources.
const DEFAULT_WORKSPACE = join(root, '..', 'dsh-better-sidebar-left-src', 'components')
const workspaceFlag = process.argv.indexOf('--workspace')
const workspace = workspaceFlag === -1 ? DEFAULT_WORKSPACE : process.argv[workspaceFlag + 1]

/** Where each component's two halves live, relative to its package root. */
const CLIENT_PATH = {
  'dsh-delete-session': 'src/client.js',
  'dsh-session-relocate': 'lib/client.js',
  'dsh-session-rename-dblclick': 'client.js',
  'dsh-session-counts': 'client.js',
  'dsh-settings-launcher': 'src/client.js',
  'dsh-declutter': 'src/client.js',
}
const HOST_PATH = {
  'dsh-delete-session': 'src/index.js',
  'dsh-session-relocate': 'src/plugin.js',
  'dsh-session-rename-dblclick': 'index.js',
  'dsh-session-counts': 'index.js',
  'dsh-declutter': 'src/index.js',
  'dsh-settings-launcher': 'src/index.js',
}

const CALL = 'window.__ModuleLoader__.load({'
const checkOnly = process.argv.includes('--check')

/** Everything before the loader call must be comments, or the shape is not ours. */
function isOnlyComments(prefix) {
  return prefix
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .trim() === ''
}

/**
 * One component's browser half, as this package wants it.
 *
 * @param component - a manifest entry.
 * @param source - the component's client bundle text.
 * @returns the factory expression, verbatim.
 */
function factoryOf(component, source) {
  const trimmed = source.replace(/^\/\/# sourceMappingURL=.*$/gm, '').trimEnd().replace(/;+$/, '')
  if (!trimmed.endsWith('})')) {
    console.error(component.id + ': the file does not end with the loader call; refusing to guess')
    process.exit(3)
  }
  const at = trimmed.indexOf(CALL)
  if (at === -1) {
    console.error(component.id + ': no window.__ModuleLoader__.load call; refusing to guess')
    process.exit(3)
  }
  if (!isOnlyComments(trimmed.slice(0, at))) {
    console.error(component.id + ': the loader call is preceded by something other than comments; refusing to guess')
    process.exit(3)
  }
  // The call ends with the factory close brace, a comma, then the load() close.
  const inner = trimmed.slice(at + CALL.length, -2).replace(/,\s*$/, '')
  if (!inner.trimEnd().endsWith('}')) {
    console.error(component.id + ': the factory body does not end with its own close brace; refusing to guess')
    process.exit(3)
  }
  const head = /^\s*id:\s*'([^']+)'\s*,/.exec(inner)
  if (head === null) {
    console.error(component.id + ': the loader call declares no id; refusing to guess')
    process.exit(3)
  }
  if (head[1] !== component.id) {
    console.error(component.id + ': the loader call declares id ' + JSON.stringify(head[1]) + ', not this package; refusing to guess')
    process.exit(3)
  }
  const rest = inner.slice(head[0].length).trimStart()
  if (!rest.startsWith('factory')) {
    console.error(component.id + ': the loader call declares no factory; refusing to guess')
    process.exit(3)
  }
  const after = rest.slice('factory'.length)
  let expression = null
  if (after.startsWith(':')) {
    // factory: (require) => { ... }  /  factory: function (require) { ... }  /  factory: () => { ... }
    expression = after.slice(1).trim()
  } else if (after.startsWith('(')) {
    // factory(require) { ... } - method shorthand, wrapped as a function expression.
    expression = 'function ' + after.trim()
  }
  if (expression === null || !expression.endsWith('}')) {
    console.error(component.id + ': the factory is in a shape this vendoring does not rewrite; refusing to guess')
    process.exit(3)
  }
  // Parse-only check: compiling the factory proves the braces close, without
  // running a single line of the component.
  try {
    new Function('return (' + expression + '\n);')
  } catch (error) {
    console.error(component.id + ': the extracted factory does not compile (' + String((error && error.message) || error) + '); refusing to guess')
    process.exit(3)
  }
  return expression
}

/**
 * One component's host half, made self-contained.
 *
 * The entry file keeps its module shape; the only changes are the three rewrites
 * named in the header comment. Relative modules are copied beside it and every
 * reference to them is renamed, so the copy stands on its own inside this package.
 *
 * @param component - a manifest entry.
 * @param hostAbs - absolute path of the component's host entry.
 * @param version - the version being vendored, pinned into the copy.
 * @returns [{ name, text }] - the entry first, then what it imports.
 */
function hostHalfOf(component, hostAbs, version) {
  const seen = new Map([[hostAbs, component.id + '.js']])
  const files = []
  const flattened = (abs, rel) => {
    const known = seen.get(abs)
    if (known !== undefined) return known
    const name = component.id + '.' + rel.slice(2).replace(/\//g, '.')
    seen.set(abs, name)
    files.push({ abs, name, rel })
    return name
  }

  const rewrite = (source, abs) => {
    let out = source.replace(/^\/\/# sourceMappingURL=.*$/gm, '')
    // The self-reported version: the component reads its own package.json, which
    // the copy does not have next to it. Pin what was vendored instead of shipping
    // a copy that answers '0.0.0-unknown'.
    out = out.replace(
      /createRequire\(import\.meta\.url\)\('\.\.\/package\.json'\)\.version/g,
      JSON.stringify(version),
    )
    if (/^\s*import\b[^\n]*from '@deepseek-ai\//m.test(out) || /^\s*export\b[^\n]*from '@deepseek-ai\//m.test(out)) {
      console.error(component.id + ': ' + abs + ' imports a platform package; this vendoring does not rewrite those (see the header)')
      process.exit(3)
    }
    const resolveRel = (rel) => {
      const target = join(dirname(abs), rel)
      if (!existsSync(target)) {
        console.error(component.id + ': ' + abs + ' imports ' + rel + ', which does not exist')
        process.exit(3)
      }
      return flattened(target, rel)
    }
    out = out.replace(/from '(\.\/[^']+\.m?js)'/g, (whole, rel) => "from './" + resolveRel(rel) + "'")
    out = out.replace(/import\('(\.\/[^']+\.m?js)'\)/g, (whole, rel) => "import('./" + resolveRel(rel) + "')")
    out = out.replace(/new URL\('(\.\/[^']+\.m?js)', import\.meta\.url\)/g, (whole, rel) => "new URL('./" + resolveRel(rel) + "', import.meta.url)")
    return out
  }

  const queue = [{ abs: hostAbs, name: component.id + '.js' }]
  const out = [{ name: component.id + '.js', text: rewrite(readFileSync(hostAbs, 'utf8'), hostAbs).trimEnd() + '\n' }]
  while (files.length > 0) {
    const next = files.shift()
    out.push({ name: next.name, text: rewrite(readFileSync(next.abs, 'utf8'), next.abs).trimEnd() + '\n' })
  }
  return out
}

/** Component id -> the version that was vendored, for the status route. */
const versions = {}
const generated = []
let stale = 0

const BUILD_TIME_REWRITES = {
  'dsh-declutter': [[/const PANEL_ENTRY_ENABLED = true/, 'const PANEL_ENTRY_ENABLED = false']],
}

for (const component of COMPONENTS) {
  const relativeClient = CLIENT_PATH[component.id]
  const relativeHost = HOST_PATH[component.id]
  if (typeof relativeClient !== 'string' || typeof relativeHost !== 'string') {
    console.error('no path registered for ' + component.id + '; add it to CLIENT_PATH and HOST_PATH')
    process.exit(2)
  }
  const clientPath = join(workspace, component.id, relativeClient)
  const hostPath = join(workspace, component.id, relativeHost)
  const manifestPath = join(workspace, component.id, 'package.json')
  for (const path of [clientPath, hostPath, manifestPath]) {
    if (!existsSync(path)) {
      console.error('missing component source: ' + path)
      console.error('(the staging directory is ' + workspace + '; pass --workspace to point elsewhere)')
      process.exit(2)
    }
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.name !== component.package) {
    console.error(component.id + ': the staged package is named ' + JSON.stringify(manifest.name) + ', not this manifest entry')
    process.exit(2)
  }
  const version = typeof manifest.version === 'string' ? manifest.version : null
  if (version === null) {
    console.error(component.id + ': the staged package declares no version')
    process.exit(2)
  }
  versions[component.id] = version

  // --- the browser half -------------------------------------------------------
  let clientSource = readFileSync(clientPath, 'utf8')
  for (const [pattern, replacement] of BUILD_TIME_REWRITES[component.id] ?? []) {
    if (!pattern.test(clientSource)) {
      console.error(component.id + ': the build-time rewrite ' + pattern + ' does not apply; the component changed shape')
      process.exit(3)
    }
    clientSource = clientSource.replace(pattern, replacement)
  }
  const clientSha = createHash('sha256').update(clientSource).digest('hex').slice(0, 16)
  const expression = factoryOf(component, clientSource)
  const clientHeader = [
    '// ' + component.id + ' browser half, VENDORED by tools/vendor.mjs - DO NOT EDIT.',
    '//',
    '// Source: ../dsh-better-sidebar-left-src/components/' + component.id + '/' + relativeClient + '  (v' + version + ', sha256 ' + clientSha + ')',
    '// Regenerate with npm run vendor; test/sync.test.js fails when this is stale.',
    '//',
    '// The component registers its factory with the host module loader; inside this',
    '// package the factory is called directly, so only the outer wrapper is replaced.',
    '// The factory body is the component own code, unchanged.',
    '',
  ].join('\n')
  generated.push({ id: component.id, target: join(root, 'src', 'vendor', component.id + '.js'), out: clientHeader + 'export default ' + expression + '\n', version, sha: clientSha })

  // --- the host half ----------------------------------------------------------
  const hostFiles = hostHalfOf(component, hostPath, version)
  for (const file of hostFiles) {
    const hostSha = createHash('sha256').update(file.text).digest('hex').slice(0, 16)
    const label = file.name === component.id + '.js' ? component.id : component.id + ' (' + file.name + ')'
    const header = [
      '// ' + component.id + ' host half (' + file.name + '), VENDORED by tools/vendor.mjs - DO NOT EDIT.',
      '//',
      '// Source: ../dsh-better-sidebar-left-src/components/' + component.id + '/' + (file.name === component.id + '.js' ? relativeHost : 'a sibling module') + '  (v' + version + ', sha256 ' + hostSha + ')',
      '// Regenerate with npm run vendor; test/sync.test.js fails when this is stale.',
      '//',
      '// src/shell.js mounts the copy named after the component, which is why this',
      '// package installs with no runtime dependency on the component package.',
      '',
    ].join('\n')
    generated.push({ id: label, target: join(root, 'src', 'vendor', 'host', file.name), out: header + file.text, version, sha: hostSha })
  }
}

mkdirSync(join(root, 'src', 'vendor', 'host'), { recursive: true })
for (const file of generated) {
  const current = existsSync(file.target) ? readFileSync(file.target, 'utf8') : null
  if (current === file.out) continue
  if (checkOnly) {
    stale += 1
    console.log('STALE  ' + file.id + ' (component v' + file.version + ')')
    continue
  }
  writeFileSync(file.target, file.out)
  console.log('wrote  ' + relative(root, file.target) + '  <- v' + file.version + ' sha256 ' + file.sha)
}

// What is vendored, in a form the HOST half can read. The status route reports the
// version of the browser half that is actually running - the copy inside this
// package - because the component package need not be installed at all.
const versionsPath = join(root, 'src', 'vendor', 'versions.json')
const versionsText = JSON.stringify(versions, null, 2) + '\n'
const currentVersions = existsSync(versionsPath) ? readFileSync(versionsPath, 'utf8') : null
if (currentVersions !== versionsText) {
  if (checkOnly) {
    stale += 1
    console.log('STALE  src/vendor/versions.json')
  } else {
    writeFileSync(versionsPath, versionsText)
    console.log('wrote  src/vendor/versions.json')
  }
}

if (checkOnly && stale > 0) {
  console.error(stale + ' vendored file(s) are stale; run npm run vendor')
  process.exit(1)
}
if (!checkOnly) console.log('vendored ' + generated.length + ' files from ' + workspace)