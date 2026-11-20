// Gate the manifest before publishing.
//
// Everything this package vendors comes from a GITHUB GIT REPOSITORY, not from the
// npm registry, so this gate is offline and checks provenance instead of ranges:
//
//   1. every component names the repository, ref, commit and version it was taken
//      from (dsh.vendorSources), and there is no entry the manifest does not use;
//   2. each of those components exists locally as a git checkout whose baseline
//      commit names that same upstream commit, at that same version, with a clean
//      working tree - i.e. the source is exactly the GitHub content, not a copy,
//      not a hand edit, not something half-updated;
//   3. the vendored copy (src/vendor/versions.json) reports the same version;
//   4. this package's own version is one number in the three places that carry it;
//   5. the DSH compatibility keys look like DSH releases, not like this package.
//
//   node tools/verify-manifest.mjs        # exit 1 on any disagreement
//
// The failure this replaces: a release once shipped a component range that resolved
// to no published version, so the package could not be installed at all - while
// every test inside it passed, because unpacking a tarball never resolves
// dependencies.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPONENTS, STUDIO_ID, STUDIO_VERSION } from '../src/components.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const versions = JSON.parse(readFileSync(join(root, 'src', 'vendor', 'versions.json'), 'utf8'))
const staging = process.env.DSH_SESSION_STUDIO_SRC
  ? process.env.DSH_SESSION_STUDIO_SRC
  : join(root, '..', 'dsh-session-studio-src', 'components')

let failed = 0
const fail = (message) => {
  console.error('  ' + message)
  failed += 1
}
const read = (file) => readFileSync(join(root, file), 'utf8')

/** The subject line of a checkout's single baseline commit, or null when it is not one. */
function baselineOf(dir) {
  if (!existsSync(join(dir, '.git'))) return null
  try {
    return execFileSync('git', ['-C', dir, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
  } catch (error) {
    return null
  }
}

/** Whether the checkout still matches its baseline commit exactly. */
function isClean(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' }).trim() === ''
  } catch (error) {
    return false
  }
}

// 1. the source table names exactly the components the manifest uses.
const sources = manifest.dsh?.vendorSources ?? {}
if (Object.keys(sources).length === 0) fail('NO VENDOR SOURCES declared; every component must name its repository, ref, commit and version')
for (const [name, source] of Object.entries(sources)) {
  if (!COMPONENTS.some((component) => component.package === name)) fail('UNUSED SOURCE  ' + name + ' is declared but is not a manifest component')
  for (const field of ['repo', 'ref', 'commit', 'version']) {
    if (typeof source[field] !== 'string' || source[field] === '') fail('INCOMPLETE     ' + name + ' has no ' + field)
  }
  if (!/^https:\/\/github\.com\//.test(String(source.repo))) fail('NOT GITHUB     ' + name + ': the source must be a GitHub repository, not ' + source.repo)
  if (!/^[0-9a-f]{40}$/.test(String(source.commit))) fail('BAD COMMIT     ' + name + ': ' + source.commit + ' is not a full git commit id')
}
for (const component of COMPONENTS) {
  if (sources[component.package] === undefined) fail('NO SOURCE      ' + component.package + ' has no dsh.vendorSources entry')
}
if (manifest.devDependencies !== undefined && Object.keys(manifest.devDependencies).length > 0) {
  fail('REGISTRY DEPS  devDependencies names ' + Object.keys(manifest.devDependencies).join(', ') + '; the vendoring sources are git checkouts, not packages')
}

// 2. each component really is a local git checkout of that upstream commit.
for (const component of COMPONENTS) {
  const source = sources[component.package]
  if (source === undefined) continue
  const dir = join(staging, component.package)
  if (!existsSync(dir)) {
    fail('MISSING        ' + component.package + ' is not checked out at ' + dir)
    continue
  }
  const subject = baselineOf(dir)
  if (subject === null) {
    fail('NOT A CHECKOUT ' + component.package + ' has no .git; re-fetch it from GitHub instead of copying files')
    continue
  }
  if (!subject.includes(source.commit)) fail('WRONG COMMIT   ' + component.package + ': the checkout is not at ' + source.commit + ' (baseline: ' + subject + ')')
  if (!isClean(dir)) fail('DIRTY CHECKOUT ' + component.package + ' has changes on top of its baseline; the vendoring source must be the GitHub content')
  let staged = null
  try {
    staged = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version
  } catch (error) {
    staged = null
  }
  if (staged !== source.version) fail('VERSION DRIFT  ' + component.package + ': declared ' + source.version + ', checkout has ' + staged)
  if (versions[component.package] !== source.version) {
    fail('NOT VENDORED   ' + component.package + ': declared ' + source.version + ', vendored ' + String(versions[component.package]))
  }
  if (failed === 0) console.log('  ok            ' + component.package + ' ' + source.version + ' @ ' + String(source.commit).slice(0, 10) + ' from ' + source.repo)
}
if (failed === 0) console.log('  ok            ' + COMPONENTS.length + ' GitHub checkouts, clean and at the declared commits')

// 3/4. this package's own version must be one number in the three places that carry it.
const sites = [
  ['package.json', /(^\s*"version":\s*")([^"]+)(")/m],
  ['src/components.js', /(export const STUDIO_VERSION = ')([^']+)(')/],
  ['src/studio.js', /(const PLUGIN_VERSION = ')([^']+)(')/],
]
const found = sites.map(([file, pattern]) => {
  const match = pattern.exec(read(file))
  return { file, version: match === null ? null : match[2] }
})
const distinct = [...new Set(found.map((site) => site.version))]
if (distinct.length !== 1 || distinct[0] === null || distinct[0] !== STUDIO_VERSION) {
  fail('VERSION DRIFT ' + found.map((site) => site.file + '=' + site.version).join(', '))
} else {
  console.log('  ok            version ' + distinct[0] + ' in all three places')
}

// 5. DSH compatibility keys must look like DSH releases, not like this package.
const releases = Object.keys(manifest.dsh?.compatibility?.dshReleases || {})
if (releases.length === 0) fail('NO DSH RELEASES declared in dsh.compatibility.dshReleases')
for (const release of releases) {
  if (!/^0\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/.test(release)) fail('BAD DSH KEY   ' + release + ' does not look like a DSH release')
}

console.log('')
if (failed > 0) {
  console.error(failed + ' manifest problem(s); do not publish')
  process.exit(1)
}
console.log(
  'manifest ok: ' +
    COMPONENTS.length +
    ' components vendored from GitHub commits, no runtime dependencies, version ' +
    distinct[0] +
    ' consistent, ' +
    'studio ' +
    STUDIO_ID,
)
