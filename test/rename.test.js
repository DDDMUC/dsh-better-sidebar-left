import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'

const root = join(import.meta.dirname, '..')
const module = await import(pathToFileURL(join(root, 'src', 'vendor', 'dsh-session-rename-dblclick.js')).href)
const plugin = module.default(() => null)

/** A row shaped like the shipped one: a div with data-row-key, no anchor. */
function shippedRow(key) {
  return {
    getAttribute(name) { return name === 'data-row-key' ? key : null },
    querySelector() { return null },
  }
}

test('a session row is identified by data-row-key, not by an anchor', () => {
  // The shipped row is <div role="treeitem" data-row-key="session:<id>"> with an
  // onClick. Requiring an <a href> made every double-click a silent no-op.
  assert.equal(plugin.__sessionIdOfRow(shippedRow('session:01fd0544-0049-44bf-bccf-3c6abe067a31')), '01fd0544-0049-44bf-bccf-3c6abe067a31')
  assert.equal(plugin.__sessionIdOfRow(shippedRow('workspace:abc')), null, 'a workspace row is not a session row')
  assert.equal(plugin.__sessionIdOfRow(shippedRow('session:')), null, 'an empty id is not an id')
})

test('a row that still renders an anchor keeps working as a fallback', () => {
  const oldRow = {
    getAttribute() { return null },
    querySelector(selector) {
      return selector.indexOf('a[href') === 0 ? { getAttribute: () => '#/session/legacy-id' } : null
    },
  }
  assert.equal(plugin.__sessionIdOfRow(oldRow), 'legacy-id')
})

test('the browser half asks for the row by data-row-key', () => {
  const source = readFileSync(join(root, 'src', 'vendor', 'dsh-session-rename-dblclick.js'), 'utf8')
  assert.ok(source.includes('[data-row-key^="session:"]'), 'the row selector must include the shipped contract')
  assert.ok(source.includes('function sessionIdOfRow'), 'the row id must be read from data-row-key')
})

/** A minimal element: real descendants, real closest(), fake attributes only. */
function nodeOf(attrs, children) {
  const node = {
    attributes: attrs,
    children: [],
    parentElement: null,
    getAttribute(name) { return name in attrs ? attrs[name] : null },
    querySelectorAll() {
      const found = []
      const walk = (current) => {
        for (const child of current.children) {
          if ('data-conversation-session' in child.attributes) found.push(child)
          walk(child)
        }
      }
      walk(node)
      return found
    },
    closest(selector) {
      let current = node
      while (current !== null && current !== undefined) {
        if (selector === '[data-conversation-session]' && 'data-conversation-session' in current.attributes) return current
        current = current.parentElement
      }
      return null
    },
  }
  for (const child of children ?? []) {
    child.parentElement = node
    node.children.push(child)
  }
  return node
}

test('the header title resolves its session from the DOM, not from the URL', () => {
  // The web front end has no router: location.href stays http://host:port/ no
  // matter which session is open, so the old location.hash/href lookup was dead.
  const crumb = nodeOf({ class: 'kiGsTW_crumb kiGsTW_crumbCurrent' }, [])
  const header = nodeOf({}, [crumb])
  const content = nodeOf({ 'data-conversation-session': 'abc' }, [])
  nodeOf({}, [header, content])
  assert.equal(plugin.__sessionIdForHeader(crumb), 'abc')
})

test('an embedded conversation panel does not pass for the outer one', () => {
  const crumb = nodeOf({ class: 'kiGsTW_crumbCurrent' }, [])
  const inner = nodeOf({ 'data-conversation-session': 'subagent-session' }, [])
  const outer = nodeOf({ 'data-conversation-session': 'outer-session' }, [inner])
  nodeOf({}, [nodeOf({}, [crumb]), outer])
  assert.equal(plugin.__sessionIdForHeader(crumb), 'outer-session')
})

test('two conversations on screen means no answer at all - never a guess', () => {
  const crumb = nodeOf({ class: 'kiGsTW_crumbCurrent' }, [])
  const left = nodeOf({ 'data-conversation-session': 'left' }, [])
  const right = nodeOf({ 'data-conversation-session': 'right' }, [])
  nodeOf({}, [nodeOf({}, [crumb]), left, right])
  assert.equal(plugin.__sessionIdForHeader(crumb), null)
})
