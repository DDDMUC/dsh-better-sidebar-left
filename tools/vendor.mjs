// Regenerate src/vendor/ from the five component sources.
//
// The studio is self-contained on the BROWSER side: the plugin list shows ONE row
// (dsh-session-studio) and the five components are no longer separate entries,
// which is only possible because their browser halves travel inside this bundle.
// That makes this file load-bearing: a hand-maintained copy is a copy that drifts,
// so the vendored files are GENERATED, byte for byte, from the component sources,
// and the test suite fails when they are stale.
//
//   node tools/vendor.mjs                     # rewrite src/vendor/
//   node tools/vendor.mjs --check             # verify, write nothing
//   node tools/vendor.mjs --workspace <dir>   # read the components from <dir>
//
// Only the BROWSER halves are vendored. The host halves are imported from the
// component packages at mount time (src/shell.js) - see docs/INTEROP.md section 11
// for why copying them would break the absence contract.
//
// The transform is deliberately minimal and mechanical. A component bundle
// registers its factory with the host module loader
// (window.__ModuleLoader__.load({ id, factory })); inside this package the factory
// is called directly, so the wrapper is replaced by a default export of the SAME
// factory body. Nothing inside the braces is touched. Anything that does not match
// that exact shape throws, so a component changing its bundle shape stops the
// build instead of producing a silent no-op.
//
// The five components declare their factory five different ways and two of them
// end the loader call with a semicolon; both are handled explicitly, and anything
// else is refused rather than guessed at.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPONENTS } from '../src/components.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

// The component checkouts live next to this package, in their own staging
// directory: the studio's siblings in this workspace are the components' own
// working trees, and vendoring must never read those (they carry uncommitted
// work). --workspace overrides the staging directory so a test can drive this
// tool against a corrupted COPY of the package while still reading real sources.
const DEFAULT_WORKSPACE = join(root, '..', 'dsh-session-studio-src', 'components')
const workspaceFlag = process.argv.indexOf('--workspace')
const workspace = workspaceFlag === -1 ? DEFAULT_WORKSPACE : process.argv[workspaceFlag + 1]

/** Where each component's browser half lives, relative to its package root. */
const CLIENT_PATH = {
  'dsh-delete-session': 'src/client.js',
  'dsh-session-relocate': 'lib/client.js',
  'dsh-session-rename-dblclick': 'client.js',
  'dsh-session-counts': 'client.js',
  'dsh-declutter': 'src/client.js',
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

/** Component id -> the version that was vendored, for the status route. */
const versions = {}
const generated = []
let stale = 0

for (const component of COMPONENTS) {
  const relativeClient = CLIENT_PATH[component.id]
  if (typeof relativeClient !== 'string') {
    console.error('no client path registered for ' + component.id + '; add it to CLIENT_PATH')
    process.exit(2)
  }
  const sourcePath = join(workspace, component.id, relativeClient)
  const manifestPath = join(workspace, component.id, 'package.json')
  if (!existsSync(sourcePath) || !existsSync(manifestPath)) {
    console.error('missing component source: ' + sourcePath)
    console.error('(the staging directory is ' + workspace + '; pass --workspace to point elsewhere)')
    process.exit(2)
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
  const source = readFileSync(sourcePath, 'utf8')
  const sha = createHash('sha256').update(source).digest('hex').slice(0, 16)
  const expression = factoryOf(component, source)
  const header = [
    '// ' + component.id + ' browser half, VENDORED by tools/vendor.mjs - DO NOT EDIT.',
    '//',
    '// Source: ../dsh-session-studio-src/components/' + component.id + '/' + relativeClient + '  (v' + version + ', sha256 ' + sha + ')',
    '// Regenerate with npm run vendor; test/sync.test.js fails when this is stale.',
    '//',
    '// The component registers its factory with the host module loader; inside this',
    '// package the factory is called directly, so only the outer wrapper is replaced.',
    '// The factory body is the component own code, unchanged.',
    '',
  ].join('\n')
  generated.push({
    id: component.id,
    target: join(root, 'src', 'vendor', component.id + '.js'),
    out: header + 'export default ' + expression + '\n',
    version,
    sha,
  })
}

mkdirSync(join(root, 'src', 'vendor'), { recursive: true })
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
// version of the BROWSER half that is actually running - the copy inside this
// package - because the component package may be a different build or absent
// entirely.
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
if (!checkOnly) console.log('vendored ' + generated.length + ' browser halves from ' + workspace)
