# dsh-better-sidebar-left

Five session-management plugins in one install. **The plugin list grows by exactly one row**, and every feature survives.

> The name only promises the **left sidebar**: deleting a session, moving it across workspaces,
> renaming it on double-click and counting sessions all happen there. One half does not live in
> the sidebar - dsh-declutter folds away failed, empty and synthesised turns **inside the
> conversation**. The name leaves it out; the feature is in.

| Component | What you get |
|---|---|
| `dsh-delete-session` 0.5.0 | **Delete a session** from the sidebar row menu: a risk list (log, workspace files, quarantine folder) first, nothing touched until you confirm; plus a multi-select footer bar for batches |
| `dsh-session-relocate` 0.3.1 | **Move across workspaces**: row menu, context menu, or drag the session row onto the target workspace - a crash-recoverable transaction, open-but-idle sessions included |
| `dsh-session-rename-dblclick` 0.1.0 | **Rename by double-click**: sidebar row and header breadcrumb alike, Enter saves, Esc cancels |
| `dsh-session-counts` 0.0.3 | **Per-workspace counts**: a badge at the end of each workspace row and a total next to the section label, following the archived filter |
| `dsh-declutter` 0.2.0 | **Declutter**: failed/empty/synthesised turns fold away per a rule table (view attributes only, reversible, log untouched) + sidebar tidying (brand row, New session, More buttons, top gap, panel visibility and order) |

## Install

```sh
npm i dsh-better-sidebar-left
```

Then add `dsh-better-sidebar-left` to the profile's `dsh.profile.bundles`. The components do **not** need to be installed as bundles - but their host halves have to resolve from the profile (see "What happens when one is missing").

During development, point a profile at this checkout:

```sh
node tools/link-local.mjs --profile ~/.dsh/profiles/desktop --dry-run
node tools/link-local.mjs --profile ~/.dsh/profiles/desktop
```

## One switch per component

`cordis.patch.yml` inserts six rows: this package's own row (bare package name) plus five `dsh-better-sidebar-left/<suffix>` rows. **One row in the package list, six in the row list**, so every component can be disabled on its own - disable `dsh-better-sidebar-left/declutter` and you lose the decluttering, not the other four.

## What happens when one is missing

Remove any component package from the profile and restart:

- only that row fails to import - the other four still start;
- `GET /api/dsh-better-sidebar-left/status` reports `hostMounted: false` for it with a reason (`not-installed` / `row-missing` / `disabled` / `start-failed`);
- the browser half therefore mounts nothing for it, so **no button is ever drawn that cannot work**.

That contract is the point of the design: host halves are **not copied**, the component row imports the real package. (`dsh-as-aistudio` does the opposite and vendors the host halves too; the trade-off is written down in `docs/INTEROP.md` section 11.)

## Relationship to standalone installs

Each component is still a complete plugin on its own. **Never enable two sources of the same feature at once**:

- with this package installed, drop `dsh-delete-session` / `dsh-session-relocate` / `dsh-declutter` from `dsh.profile.bundles` (two mounts in one process collide on routes and slots);
- **especially** `dsh-sidebar-declutter`: the sidebar half of `dsh-declutter` 0.2.0 is the same code as 0.3.3 (98.3% identical lines, same `STORE_KEY = 'dsh-sidebar-declutter'`, same `data-dsh-sidebar-declutter`, same slot ids `sidebar-declutter-collapse` and `hide-rows`). Both at once is one piece of code running twice over the same DOM. Disable it while this plugin is enabled.

## Status route

```sh
curl -s http://127.0.0.1:<port>/api/dsh-better-sidebar-left/status | jq .summary
```

It answers one question: is each component installed, which version is running, and is its row **really** live - read from `ctx.loader.entries()` and the row fiber's own state, never from an optimistic self-report. `version` is the browser half (the copy vendored here), `installedVersion` is the host half in the profile, and `versionMatch: false` means they disagree - reported, never silently repaired.

## Development

```sh
npm run check          # verify:manifest + build + test
npm run verify:vendor  # is src/vendor/ in sync with the component sources (read-only)
npm run verify:build   # is src/client.js in sync with src/sidebar.js + src/vendor/ (read-only)
npm test               # tests only
npm run bump 0.2.0     # move the version in all three places
```

`src/client.js` and `src/vendor/*.js` are **GENERATED**: hand edits are overwritten by the next `npm run build`, and `test/sync.test.js` fails first. Fix a component in its own repository; change this plugin's own logic in `src/sidebar.js`.

The vendoring sources live in `../dsh-better-sidebar-left-src/components/<package>/` (override with `--workspace`); the tool never reads the component working trees in this workspace.

## Layout

```
cordis.patch.yml     one own row + five component rows (mechanism A/B notes in the file)
src/components.js    the only manifest: identity, slots, routes, DOM ownership
src/index.js         host half: /api/dsh-better-sidebar-left/status + importComponent
src/shell.js         component-row shell: read config.plugin, import the real package, ctx.plugin
src/sidebar.js        this plugin's own browser half (source)
src/client.js        GENERATED: plugin + five vendored factories, one bundle
src/vendor/*.js      GENERATED: the five browser halves
src/vendor/host/     reserved, deliberately empty (see its README)
tools/vendor.mjs     byte-for-byte src/vendor/ generation (--check)
tools/build.mjs      src/client.js stitching (--check)
docs/INTEROP.md      rules, slot table, absence and hide attribution, self-contained architecture
test/                10 test files
```

## License

MIT. Each component keeps its own copyright.
