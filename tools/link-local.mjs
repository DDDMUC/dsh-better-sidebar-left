// Point this profile at this checkout, without publishing anything.
//
//   node tools/link-local.mjs [--profile <dir>] [--dry-run]
//
// It edits two files in the profile and nothing else: package.json (a link:
// dependency) and its dsh.profile.bundles list. The component packages are NOT
// added - they are the studio's own dependencies to vendor, not profile bundles -
// and the standalone bundles whose feature the studio absorbs are reported, not
// removed, because disabling them is the user's decision.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const profileFlag = args.indexOf('--profile')
const profile = resolve(profileFlag === -1 ? join(process.env.HOME ?? '', '.dsh', 'profiles', 'desktop') : args[profileFlag + 1])
const dryRun = args.includes('--dry-run')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const name = manifest.name

const pkgPath = join(profile, 'package.json')
if (!existsSync(pkgPath)) {
  console.error('not a profile: ' + pkgPath)
  process.exit(2)
}
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
pkg.dependencies = pkg.dependencies ?? {}
const wanted = 'link:' + root
const current = pkg.dependencies[name]
const next = JSON.parse(JSON.stringify(pkg))
next.dependencies[name] = wanted
next.dsh = next.dsh ?? {}
next.dsh.profile = next.dsh.profile ?? {}
const bundles = Array.isArray(next.dsh.profile.bundles) ? next.dsh.profile.bundles.slice() : []
if (bundles.indexOf(name) === -1) bundles.push(name)
next.dsh.profile.bundles = bundles

const absorbed = ['dsh-delete-session', 'dsh-session-relocate', 'dsh-session-rename-dblclick', 'dsh-session-counts', 'dsh-declutter', 'dsh-sidebar-declutter']
const stillOn = bundles.filter((bundle) => absorbed.indexOf(bundle) !== -1)

console.log('profile   ' + profile)
console.log('dependency ' + name + ': ' + (current === undefined ? '(absent)' : current) + ' -> ' + wanted)
console.log('bundles   ' + (bundles.length - (next.dsh.profile.bundles.length === bundles.length ? 0 : 1)) + ' -> ' + bundles.length + ' entries')
for (const bundle of stillOn) {
  console.log('WARNING   ' + bundle + ' is still a profile bundle; the studio now mounts the same feature')
}
if (dryRun) {
  console.log('dry run: nothing written')
  process.exit(0)
}
writeFileSync(pkgPath, JSON.stringify(next, null, 2) + '\n')
console.log('written; restart the host (or let patchReload pick it up) and reload the page')
