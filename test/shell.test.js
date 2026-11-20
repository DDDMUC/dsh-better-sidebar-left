import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Config, apply, inject, name } from '../src/shell.js'
import { COMPONENTS, PLUGIN_ID } from '../src/components.js'

/** A profile-shaped directory holding one fake component package. */
function fakeProfile(pkg, body) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-better-sidebar-left-shell-'))
  mkdirSync(join(dir, 'node_modules', pkg), { recursive: true })
  writeFileSync(
    join(dir, 'node_modules', pkg, 'package.json'),
    JSON.stringify({ name: pkg, version: '9.9.9', type: 'module', main: 'index.js' }),
  )
  writeFileSync(join(dir, 'node_modules', pkg, 'index.js'), body)
  return dir
}

/** A row context that records what the shell mounted. */
function rowContext(baseUrl, onSubmit) {
  const mounted = []
  return {
    mounted,
    baseUrl,
    async plugin(plugin) {
      mounted.push(plugin)
      if (typeof onSubmit === 'function') await onSubmit(plugin)
    },
  }
}

test('the shell exports the row contract', () => {
  assert.equal(name, PLUGIN_ID + '/component')
  assert.deepEqual(inject, [])
  assert.equal(typeof Config['~standard'].validate, 'function')
  assert.equal(Config['~standard'].vendor, PLUGIN_ID)
})

test('the shell config is a Standard Schema that passes the row through', () => {
  assert.deepEqual(Config['~standard'].validate(undefined), { value: undefined })
  assert.deepEqual(Config['~standard'].validate(null), { value: undefined })
  const config = { plugin: 'dsh-session-counts' }
  assert.deepEqual(Config['~standard'].validate(config), { value: config })
  const refused = Config['~standard'].validate(['dsh-session-counts'])
  assert.equal(Array.isArray(refused.issues), true)
  assert.match(refused.issues[0].message, new RegExp(PLUGIN_ID))
})

test('a row that names no plugin fails loudly instead of mounting nothing', async () => {
  await assert.rejects(() => apply(rowContext(undefined), { plugin: '' }), /names no plugin/)
  await assert.rejects(() => apply(rowContext(undefined), {}), /names no plugin/)
  await assert.rejects(() => apply(rowContext(undefined), undefined), /names no plugin/)
})

test('a row naming a package that is not one of ours is refused by name', async () => {
  await assert.rejects(() => apply(rowContext(undefined), { plugin: 'dsh-something-else' }), /is not one of this plugin components/)
  try {
    await apply(rowContext(undefined), { plugin: 'dsh-something-else' })
    assert.fail('should have thrown')
  } catch (error) {
    // The message must name the offender AND the alternatives, so the Loader's own
    // entry log is the whole diagnostic.
    assert.match(error.message, /dsh-something-else/)
    for (const component of COMPONENTS) assert.ok(error.message.includes(component.package))
  }
})

test('a component that is not installed fails its own row, naming the package', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'dsh-better-sidebar-left-empty-'))
  try {
    await assert.rejects(
      () => apply({ baseUrl: 'file://' + empty }, { plugin: 'dsh-session-counts' }),
      /is not installed/,
    )
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
})

test('a component row mounts the REAL package the config names', async () => {
  const dir = fakeProfile('dsh-session-counts', 'export function apply(ctx) {\n  ctx.__mounted = 1\n}\n')
  try {
    const ctx = rowContext('file://' + dir)
    await apply(ctx, { plugin: 'dsh-session-counts' })
    assert.equal(ctx.mounted.length, 1)
    assert.equal(typeof ctx.mounted[0].apply, 'function')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a module with no usable plugin shape is refused, not mounted', async () => {
  const dir = fakeProfile('dsh-session-counts', 'export const name = "not-a-plugin"\nexport const version = "1"\n')
  try {
    await assert.rejects(() => apply(rowContext('file://' + dir), { plugin: 'dsh-session-counts' }), /no usable plugin shape/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a component that fails to start makes the row fail, not a bare no-op', async () => {
  const dir = fakeProfile('dsh-session-counts', 'export function apply() {\n  throw new Error("component start failed")\n}\n')
  try {
    const ctx = rowContext('file://' + dir, async () => {
      throw new Error('component start failed')
    })
    await assert.rejects(() => apply(ctx, { plugin: 'dsh-session-counts' }), /component start failed/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the shell passes no config: a component mounts with its own defaults', async () => {
  const dir = fakeProfile('dsh-session-counts', 'export function apply(ctx, config) {\n  ctx.__config = config\n}\n')
  try {
    const seen = []
    const ctx = rowContext('file://' + dir, async (plugin) => {
      seen.push(plugin)
    })
    await apply(ctx, { plugin: 'dsh-session-counts', somethingElse: true })
    assert.equal(seen.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
