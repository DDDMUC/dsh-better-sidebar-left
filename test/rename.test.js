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

/**
 * A DOM just big enough for openEditor: elements with inline styles, children,
 * a parent chain for closest(), and a computed style whose tokens resolve to nothing
 * (so the code has to fall back rather than crash).
 */
/** Just enough CSS matching for the selectors this plugin uses. */
function matches(element, selector) {
  if (element === null || element === undefined) return false
  const className = String(element.className || '')
  if (selector.startsWith('[class*="')) {
    const needle = selector.slice(selector.indexOf('"') + 1, selector.lastIndexOf('"'))
    return className.includes(needle)
  }
  if (selector.startsWith('[data-row-key^="')) {
    const prefix = selector.slice(selector.indexOf('"') + 1, selector.lastIndexOf('"'))
    return String(element.getAttribute('data-row-key') || '').startsWith(prefix)
  }
  if (selector === '[data-conversation-session]') return element.getAttribute('data-conversation-session') !== null
  if (selector === 'input, textarea, [contenteditable="true"]') {
    return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA'
  }
  return false
}

function miniDom() {
  const make = (tag) => {
    const node = {
      tagName: String(tag).toUpperCase(),
      nodeType: 1,
      style: {},
      dataset: {},
      attributes: {},
      className: '',
      textContent: '',
      children: [],
      parentElement: null,
      isConnected: true,
      classList: { add() {}, remove() {}, contains() { return false }, toggle() {} },
      setAttribute(name, value) { this.attributes[name] = String(value) },
      getAttribute(name) { return this.attributes[name] ?? null },
      appendChild(child) { child.parentElement = this; this.children.push(child); return child },
      remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((c) => c !== this) },
      querySelector(selector) {
        const found = []
        const walk = (current) => {
          for (const child of current.children) {
            if (matches(child, selector)) found.push(child)
            walk(child)
          }
        }
        walk(this)
        return found[0] ?? null
      },
      querySelectorAll() { return [] },
      closest(selector) {
        let current = this
        while (current !== null && current !== undefined) {
          for (const one of String(selector).split(',').map((part) => part.trim())) {
            if (matches(current, one)) return current
          }
          current = current.parentElement
        }
        return null
      },
      contains(other) {
        let node = other
        while (node !== null && node !== undefined) {
          if (node === this) return true
          node = node.parentElement
        }
        return false
      },
      getBoundingClientRect() { return { left: 100, top: 50, width: 180, height: 22, right: 280, bottom: 72 } },
      getContext() { return null },
      focus() {},
      select() { this.selectionStart = 0; this.selectionEnd = String(this.value).length },
      setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end },
      addEventListener() {},
      removeEventListener() {},
    }
    return node
  }
  const head = make('head')
  const body = make('body')
  const document = {
    head,
    body,
    createElement: make,
    querySelector() { return null },
    querySelectorAll() { return [] },
    addEventListener() {},
    removeEventListener() {},
  }
  const computed = {
    fontFamily: 'system-ui',
    fontSize: '14px',
    fontWeight: '500',
    fontStyle: 'normal',
    letterSpacing: 'normal',
    lineHeight: '22px',
    textAlign: 'start',
    color: 'rgb(31, 32, 35)',
    paddingLeft: '0px',
    paddingTop: '0px',
    getPropertyValue() { return '' },
  }
  const window = {
    innerWidth: 1280,
    getComputedStyle() { return computed },
    getSelection() { return { removeAllRanges() {} } },
    addEventListener() {},
    removeEventListener() {},
  }
  return { document, window }
}

test('opening the editor really builds the pill (the bug this guards)', async () => {
  // The previous revision logged `brand` before its const declared it: openEditor threw
  // a temporal-dead-zone error AFTER the click was already swallowed, so clicking the
  // header did nothing at all - and every other test stayed green because none of them
  // ever opened an editor.
  const saved = { document: globalThis.document, window: globalThis.window }
  const dom = miniDom()
  globalThis.document = dom.document
  globalThis.window = dom.window
  try {
    const factory = (await import(pathToFileURL(join(root, 'src', 'vendor', 'dsh-session-rename-dblclick.js')).href)).default
    const plugin = factory(() => null)
    const titleEl = dom.document.createElement('span')
    titleEl.textContent = 'Review session studio brief file'
    plugin.__openEditor({ sessionId: 'abc', titleEl, surface: 'header' })

    const wrap = dom.document.body.children.filter((node) => node.className === 'dsr-wrap')[0]
    assert.ok(wrap !== undefined, 'the editor box must be appended to the body')
    assert.equal(wrap.children.length, 1, 'the box holds exactly one field')
    assert.equal(wrap.children[0].tagName, 'INPUT', 'the field is an input')
    assert.equal(wrap.style.height, '44px', 'the header pill is 44px tall, like the product field')
    assert.equal(wrap.style.borderRadius, '22px', 'and its caps are true semicircles')
    assert.equal(wrap.style.boxShadow, 'inset 0 0 0 1px #3964fe', 'the ring is the reference blue, inset')
    assert.equal(titleEl.style.visibility, 'hidden', 'the title underneath is hidden while editing')
    const field = wrap.children[0]
    assert.equal(field.selectionStart, 'Review session studio brief file'.length, 'the caret sits after the last character, nothing is selected')
    assert.equal(field.selectionEnd, 'Review session studio brief file'.length, 'no selection band on open')
  } finally {
    if (saved.document === undefined) delete globalThis.document
    else globalThis.document = saved.document
    if (saved.window === undefined) delete globalThis.window
    else globalThis.window = saved.window
  }
})

test('a double click never lets the stock rename dialog open as well', async () => {
  // The product opens ITS dialog on this same event (Rows.tsx: onDoubleClick ->
  // onRenameRequest). Our second click opens the inline editor, so the handler used to
  // return early - without swallowing - and the stock modal appeared on top of it.
  const saved = { document: globalThis.document, window: globalThis.window }
  const dom = miniDom()
  globalThis.document = dom.document
  globalThis.window = dom.window
  try {
    const factory = (await import(pathToFileURL(join(root, 'src', 'vendor', 'dsh-session-rename-dblclick.js')).href)).default
    const plugin = factory(() => null)
    const row = dom.document.createElement('div')
    row.className = 'JoiKIa_sessionRow'
    row.setAttribute('data-row-key', 'session:abc')
    const title = dom.document.createElement('span')
    title.className = 'JoiKIa_title'
    title.textContent = 'A session'
    row.appendChild(title)
    dom.document.body.appendChild(row)

    plugin.__openEditor({ sessionId: 'abc', titleEl: title, surface: 'row' })
    let prevented = false
    let stopped = false
    plugin.__onDoubleClick({
      button: 0,
      target: title,
      preventDefault() { prevented = true },
      stopPropagation() { stopped = true },
    })
    assert.equal(prevented, true, 'the double click must be prevented so the stock dialog cannot open')
    assert.equal(stopped, true, 'and it must not travel on to the product handler')
  } finally {
    if (saved.document === undefined) delete globalThis.document
    else globalThis.document = saved.document
    if (saved.window === undefined) delete globalThis.window
    else globalThis.window = saved.window
  }
})

test('a double click on the header is left alone', async () => {
  // The current crumb is a plain <span>: no onClick, no onDoubleClick. Swallowing the
  // double click there only removed the native select-a-word inside our own input.
  const saved = { document: globalThis.document, window: globalThis.window }
  const dom = miniDom()
  globalThis.document = dom.document
  globalThis.window = dom.window
  try {
    const factory = (await import(pathToFileURL(join(root, 'src', 'vendor', 'dsh-session-rename-dblclick.js')).href)).default
    const plugin = factory(() => null)
    const panel = dom.document.createElement('div')
    panel.setAttribute('data-conversation-session', 'abc')
    dom.document.body.appendChild(panel)
    const crumb = dom.document.createElement('span')
    crumb.className = 'kiGsTW_crumb kiGsTW_crumbCurrent'
    crumb.textContent = 'A session'
    panel.appendChild(crumb)

    plugin.__openEditor({ sessionId: 'abc', titleEl: crumb, surface: 'header' })
    let prevented = false
    let stopped = false
    plugin.__onDoubleClick({
      button: 0,
      target: crumb,
      preventDefault() { prevented = true },
      stopPropagation() { stopped = true },
    })
    assert.equal(prevented, false, 'the header must keep the native double-click behaviour')
    assert.equal(stopped, false, 'and must not swallow the event either')
  } finally {
    if (saved.document === undefined) delete globalThis.document
    else globalThis.document = saved.document
    if (saved.window === undefined) delete globalThis.window
    else globalThis.window = saved.window
  }
})