# src/vendor/host/ - the five host halves, GENERATED

`tools/vendor.mjs` writes every `.js` file in this directory from the component
checkouts in `../../../../dsh-better-sidebar-left-src/components/`. **Do not edit them**;
`npm run vendor --check` (and `test/sync.test.js`) fails when they are stale.

`src/shell.js` mounts `<component id>.js` for the row whose `config.plugin` names that
component, which is why this package installs with **no runtime dependency** on the
component packages: the profile needs exactly one package, this one.

## Naming

```
dsh-delete-session.js              the entry (== component id + .js)
dsh-session-relocate.js            the entry
dsh-session-relocate.paths.js      a sibling the entry imports
dsh-session-relocate.relocate.js   another sibling
dsh-session-relocate.zstd.js       ...
dsh-declutter.logic.js             the rule table, imported (and re-exported) by the entry
```

Siblings are renamed this way so two components that both ship a `logic.js` cannot
collide, and so every relative import inside a vendored file resolves to a file that
is actually shipped (`test/vendor-imports.test.js` proves both).

## What the vendoring rewrites, and why

There are exactly three mechanical rewrites; everything else is byte-for-byte:

1. `from './x.js'` / `import('./x.js')` → the flattened name above (a dangling import
   would fail the row at load time);
2. `createRequire(import.meta.url)('../package.json').version` → the version literal
   being vendored (the copy has no package.json beside it, so the component would
   otherwise report `0.0.0-unknown`);
3. nothing else - an `@deepseek-ai/*` import, a missing sibling, or an unrecognised
   bundle shape stops the build instead of producing a copy that would resolve a
   second module instance at runtime.
