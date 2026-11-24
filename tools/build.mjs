// Stitch src/client.js from src/sidebar.js and src/vendor/*.js into ONE bundle.
// The three .txt fragments hold the literal prologue, the mount table and the
// epilogue; each vendored factory is lifted out of its own file verbatim, so a
// component's code runs exactly as its own package ships it.
//
//   node tools/build.mjs           # rewrite src/client.js
//   node tools/build.mjs --check   # verify it is current, write nothing
//
// Two tables are injected into this plugin source here, from src/components.js:
// MANIFEST (what the page lists) and INTEROP (the slot allocation it prints).
// Generating them is the point - a hand-written copy of the manifest inside the
// browser half is a copy that disagrees with the host half the day someone adds a
// component.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPONENTS, INTEROP } from '../src/components.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const checkOnly = process.argv.includes('--check')

/** Mount order: the manifest order, which is also the order the user meets them. */
const ORDER = COMPONENTS.map((component) => component.id)
const CALL = 'window.__ModuleLoader__.load({'

const read = (name) => readFileSync(join(root, 'tools', name), 'utf8')

function commentsOnly(prefix) {
  return prefix.split('\n').every((line) => {
    const text = line.trim()
    return text === '' || text.startsWith('//')
  })
}

/** The factory expression inside a file that registers it with the module loader. */
function lift(source, id) {
  const text = source.replace(/\n+$/, '')
  const at = text.indexOf(CALL)
  if (at < 0) throw new Error(id + ': no loader call')
  if (!text.endsWith('})')) throw new Error(id + ': does not end with the loader call')
  if (!commentsOnly(text.slice(0, at))) throw new Error(id + ': code precedes the loader call')
  const inner = text.slice(at + CALL.length, text.length - 2).replace(/,\s*$/, '')
  if (!inner.trimEnd().endsWith('}')) throw new Error(id + ': factory body unterminated')
  // The source registers under its own id; the stitched bundle always registers as
  // this package, so only the id the source DECLARES is checked.
  const declared = /id: '([^']+)'/.exec(inner)
  if (declared === null) throw new Error(id + ': the loader call declares no id')
  const marker = 'factory:'
  return inner.slice(inner.indexOf(marker) + marker.length).trim()
}

/** One vendored factory, as the expression the stitched bundle declares. */
function vendored(id) {
  const path = join(root, 'src', 'vendor', id + '.js')
  if (!existsSync(path)) throw new Error('missing src/vendor/' + id + '.js; run npm run vendor first')
  const source = readFileSync(path, 'utf8')
  const marker = 'export default '
  const at = source.indexOf(marker)
  if (at < 0) throw new Error(id + ': not a vendored factory file')
  return source.slice(at + marker.length).replace(/\n+$/, '')
}

/** The manifest the page renders: identity plus the copy it shows. */
function manifestLiteral() {
  const rows = COMPONENTS.map((component) => ({
    id: component.id,
    package: component.package,
    suffix: component.suffix,
    feature: component.feature,
    kind: component.kind,
    repo: component.repo,
    title: component.title,
    pitch: component.pitch,
  }))
  return JSON.stringify(rows, null, 2).split('\n').join('\n    ')
}

/** The allocation the page prints: slot name plus the identity each component claims. */
function interopLiteral() {
  const slots = INTEROP.slots.map((slot) => {
    const row = { component: slot.component, name: slot.name }
    if (slot.id !== undefined) row.id = slot.id
    if (slot.key !== undefined) row.key = slot.key
    if (slot.order !== undefined) row.order = slot.order
    return row
  })
  const settingsCards = INTEROP.settingsCards.map((card) => ({ component: card.component, exportPath: card.exportPath, label: card.label }))
  return JSON.stringify({ slots, settingsCards }, null, 2).split('\n').join('\n    ')
}

// The package own browser half is a whole bundle of its own; inside the stitched
// body belongs directly in this scope, so the arrow wrapper is removed. The body
// declares its own module/exports, which is exactly the var-hoisted shadowing the
// bundle expects (the same shape the five vendored factories use internally).
const ownArrow = lift(readFileSync(join(root, 'src', 'sidebar.js'), 'utf8'), 'dsh-better-sidebar-left')
if (!/^\(require\) => \{[\s\S]*\}$/.test(ownArrow)) throw new Error('dsh-better-sidebar-left: this plugin source is not a single arrow factory')
const own = ownArrow
  .replace(/^\(require\) => \{/, '')
  .replace(/\}$/, '')
  .replace('__MANIFEST__', manifestLiteral())
  .replace('__INTEROP__', interopLiteral())

const parts = []
parts.push(read('head.txt'))
for (const id of ORDER) {
  parts.push('')
  parts.push('    // ===== vendored ' + id + ' =====')
  parts.push('    const factory_' + id.replace(/-/g, '_') + ' = ' + vendored(id))
}
// The table is keyed by COMPONENT ID, because that is what this plugin looks up
// (VENDORED_TABLE[id] with id like 'dsh-delete-session'). Emitting the bare
// factory names would build an object whose keys are the variable names instead,
// every lookup would be undefined, and every component would silently fail to
// mount - which is exactly the regression this line prevents.
parts.push(
  read('tail.txt').replace(
    '__T__',
    ORDER.map((id) => JSON.stringify(id) + ': factory_' + id.replace(/-/g, '_')).join(', '),
  ),
)
parts.push(own)
parts.push(read('tail2.txt'))

const text = parts.join('\n')
const target = join(root, 'src', 'client.js')
if (checkOnly) {
  const current = existsSync(target) ? readFileSync(target, 'utf8') : ''
  if (current !== text) {
    console.error('src/client.js is stale; run npm run build')
    process.exit(1)
  }
  console.log('src/client.js is in sync')
} else {
  writeFileSync(target, text)
  console.log('wrote src/client.js: ' + text.length + ' bytes, ' + ORDER.length + ' vendored factories')
}
