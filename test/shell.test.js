import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Config, apply, inject, name } from '../src/shell.js'
import { COMPONENTS, PLUGIN_ID } from '../src/components.js'

/** A row context that records what the shell mounted. */
function rowContext(onSubmit) {
  const mounted = []
  return {
    mounted,
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
  await assert.rejects(() => apply(rowContext(), { plugin: '' }), /names no plugin/)
  await assert.rejects(() => apply(rowContext(), {}), /names no plugin/)
  await assert.rejects(() => apply(rowContext(), undefined), /names no plugin/)
})

test('a row naming a package that is not one of ours is refused by name', async () => {
  await assert.rejects(() => apply(rowContext(), { plugin: 'dsh-something-else' }), /is not one of this package components/)
  try {
    await apply(rowContext(), { plugin: 'dsh-something-else' })
    assert.fail('should have thrown')
  } catch (error) {
    // The message must name the offender AND the alternatives, so the Loader's own
    // entry log is the whole diagnostic.
    assert.match(error.message, /dsh-something-else/)
    for (const component of COMPONENTS) assert.ok(error.message.includes(component.package))
  }
})

// The whole point of vendoring the host halves: mounting one needs nothing
// installed in the profile. This suite runs outside any profile, so a mount here
// is proof that the copy under src/vendor/host/ is complete.
for (const component of COMPONENTS) {
  test('component ' + component.id + ': the row mounts its vendored host half', async () => {
    const ctx = rowContext()
    await apply(ctx, { plugin: component.package })
    assert.equal(ctx.mounted.length, 1, component.id + ' mounted nothing')
    const plugin = ctx.mounted[0]
    const callable = typeof plugin === 'function' || (plugin !== null && typeof plugin === 'object' && typeof plugin.apply === 'function')
    assert.equal(callable, true, component.id + ': the vendored namespace has no usable plugin shape')
  })
}

test('the shell passes no config: a component mounts with its own defaults', async () => {
  let seen = null
  const ctx = rowContext()
  const original = ctx.plugin
  ctx.plugin = async (plugin) => {
    seen = plugin
    await original.call(ctx, plugin)
  }
  await apply(ctx, { plugin: 'dsh-session-counts', somethingElse: true })
  assert.notEqual(seen, null, 'the component was never mounted')
  assert.equal(ctx.mounted.length, 1)
})

test('a component that fails to start makes the row fail, not a bare no-op', async () => {
  const ctx = rowContext(async () => {
    throw new Error('component start failed')
  })
  await assert.rejects(() => apply(ctx, { plugin: 'dsh-session-counts' }), /component start failed/)
})
