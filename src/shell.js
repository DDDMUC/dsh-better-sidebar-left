// dsh-session-studio - the component-row shell.
//
// One file, mounted once per component row in cordis.patch.yml. A Loader row
// mounts whatever its "name" resolves to, so every component row is named
// "dsh-session-studio/<suffix>" - package.json maps all five suffixes to THIS
// file - and carries the real component package in config.plugin. The shell is
// what turns that name into a mount:
//
//     const namespace = await importComponent(ctx, component)   // the REAL package
//     await ctx.plugin(pluginOf(namespace))
//
// Why the row is a subpath of this package and not the component's own name:
//
//   * the plugin list is the deduplicated package identity set (name + version),
//     and a subpath of this package resolves to this one identity - so five extra
//     rows still cost exactly ZERO extra list rows;
//   * the client-module scanner only accepts an exact package specifier, so a
//     subpath row is never mistaken for a second browser source. The browser
//     halves keep travelling inside this package's single bundle (src/client.js),
//     served for this package's own row.
//
// Why the HOST half is imported from the component package instead of vendored
// (this is where this package deliberately differs from dsh-as-aistudio, whose
// src/vendor/host/ carries a copy of each component's host code):
//
//   * the host logic exists exactly once, and it is the copy the component's own
//     release ships - a studio that vendored it would keep running last month's
//     routes after a component fix, which is a silent-drift machine;
//   * uninstalling a component really removes its feature (docs/INTEROP.md
//     section 5): its row's import fails, the row's fiber fails, /status reports
//     hostMounted: false with reason "not-installed", and the browser half mounts
//     nothing for it. A vendored copy would keep answering "mounted" for a
//     package that is not installed at all - a button with nothing behind it,
//     which is the one failure mode this package exists to prevent.
//
// The mount itself is the same one a standalone install does at runtime, with the
// same shape judgement (pluginOf) and the same "one entry reports its failure,
// every other entry still starts" contract - only here the Loader owns the row, so
// the failure is recorded on the row's fiber and /status can read it instead of
// trusting a private table. That is why apply AWAITS the child: a component whose
// start rejects leaves this row's fiber failed.
//
// The row config is read once per activation. Editing it in the plugin manager
// restarts the entry, which runs this apply again with the new value.
import { COMPONENTS, STUDIO_ID } from './components.js'
import { componentOf, importComponent, pluginOf } from './index.js'

/** Loader display name of this shell (all five rows share it). */
export const name = STUDIO_ID + '/component'

/** Required services: none. The shell must be able to activate on its own. */
export const inject = []

/**
 * Row config schema, deliberately shapeless: the ONLY key this file reads is
 * "plugin", and everything else belongs to the component package. Written as a
 * Standard Schema so it needs no dependency - the platform validates a row against
 * this before apply runs.
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: STUDIO_ID,
    validate(value) {
      if (value === undefined || value === null) return { value: undefined }
      if (typeof value !== 'object' || Array.isArray(value)) {
        return {
          issues: [
            {
              message: STUDIO_ID + ': a component row config must be a mapping with a "plugin" package name',
              path: [],
            },
          ],
        }
      }
      return { value }
    },
  },
}

/** The package name a row config names, or null when it names none. */
function pluginSpecOf(config) {
  if (config === null || config === undefined || typeof config !== 'object') return null
  const spec = config.plugin
  return typeof spec === 'string' && spec !== '' ? spec : null
}

/** A config value rendered for a diagnostic, never throwing. */
function describeConfig(config) {
  try {
    return JSON.stringify(config ?? null)
  } catch {
    return '[unrepresentable]'
  }
}

/** A failure rendered as one line. */
function messageOf(error) {
  return String((error && error.message) || error)
}

/**
 * Mount the component package the row's config names.
 *
 * Every failure path throws with a message that names this studio and the
 * offending specifier, so the Loader's own entry log is the whole diagnostic -
 * there is no second reporting channel to keep in sync.
 *
 * @param ctx - the row entry's context.
 * @param config - the row config: { plugin: "<package>" }.
 * @returns nothing, once the component's own fiber has settled.
 */
export async function apply(ctx, config) {
  const spec = pluginSpecOf(config)
  if (spec === null) {
    throw new Error(
      STUDIO_ID + ': this component row names no plugin; set config.plugin to the component package (row config: ' + describeConfig(config) + ')',
    )
  }
  const component = componentOf(spec)
  if (component === null) {
    throw new Error(
      STUDIO_ID +
        ': component ' +
        JSON.stringify(spec) +
        ' is not one of this studio components (' +
        COMPONENTS.map((entry) => entry.package).join(', ') +
        ')',
    )
  }
  let namespace
  try {
    namespace = await importComponent(ctx, component)
  } catch (error) {
    throw new Error(
      STUDIO_ID + ': component ' + JSON.stringify(spec) + ' could not be imported: ' + messageOf(error),
      { cause: error },
    )
  }
  const plugin = pluginOf(namespace)
  if (plugin === null) {
    throw new Error(
      STUDIO_ID + ': component ' + JSON.stringify(spec) + ' has no usable plugin shape (expected a function or an object with apply)',
    )
  }
  // No config: a component's own settings belong to its own row when it is
  // installed standalone, and the studio has always mounted it with defaults.
  await ctx.plugin(plugin)
}
