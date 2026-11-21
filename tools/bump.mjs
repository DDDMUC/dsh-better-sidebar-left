// Move the version in every place that carries it, and prove nothing else moved.
//
//   node tools/bump.mjs 0.2.0
//
// Publishing is a human decision (never run by npm run check); this tool only
// makes sure the three copies cannot drift apart.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const next = process.argv[2]
if (!/^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/.test(String(next ?? ''))) {
  console.error('usage: node tools/bump.mjs <version>   (x.y.z)')
  process.exit(2)
}

const sites = [
  { file: 'package.json', pattern: /(^\s*"version":\s*")([^"]+)(")/m, label: 'manifest' },
  { file: 'src/components.js', pattern: /(export const PLUGIN_VERSION = ')([^']+)(')/, label: 'PLUGIN_VERSION' },
  { file: 'src/sidebar.js', pattern: /(const PLUGIN_VERSION = ')([^']+)(')/, label: 'PLUGIN_VERSION' },
  // The interop document names the identity it ships with, and a test enforces it.
  { file: 'docs/INTEROP.md', pattern: /(`dsh-better-sidebar-left` )([0-9]+\.[0-9]+\.[0-9]+)([）])/, label: 'identity' },
]

for (const site of sites) {
  const path = join(root, site.file)
  const before = readFileSync(path, 'utf8')
  const match = site.pattern.exec(before)
  if (match === null) {
    console.error(site.file + ': no ' + site.label + ' found')
    process.exit(1)
  }
  if (match[2] === next) {
    console.log('  same    ' + site.file + ' ' + site.label)
    continue
  }
  const after = before.slice(0, match.index) + match[1] + next + match[3] + before.slice(match.index + match[0].length)
  // One-line assertion: the only difference between before and after is the
  // version string, so a bump can never silently rewrite something else.
  const changed = before.split('\n').filter((line, index) => line !== after.split('\n')[index])
  if (changed.length !== 1) {
    console.error(site.file + ': the bump would touch ' + changed.length + ' lines, not 1')
    process.exit(1)
  }
  writeFileSync(path, after)
  console.log('  bumped  ' + site.file + ' ' + match[2] + ' -> ' + next)
}
console.log('now run: npm run build && npm test')
