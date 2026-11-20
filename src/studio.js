// dsh-session-studio - the studio's own browser half (SOURCE).
//
// An ordinary component-style bundle, kept this way so it can be unit-tested on its
// own. tools/build.mjs stitches it together with the five vendored component
// factories into src/client.js - the single bundle the plugin actually ships -
// placing each factory verbatim into this scope and declaring VENDORED_TABLE.
// After changing this file, run "node tools/build.mjs" (NOT "npm run build",
// which first re-vendors src/vendor/ from the component staging directory).
//
// Self-contained: the plugin list shows ONE row (this package). This bundle is
// served for that row, so it is the only way the five components' browser halves
// can reach the page. They travel in src/vendor/<component>.js, generated from the
// component sources by tools/vendor.mjs.
//
// What is deliberately NOT here: no copy of any component logic. The host halves
// (routes, move transactions, rename bridge) run inside the component packages,
// mounted by the component rows in cordis.patch.yml through src/shell.js; only the
// browser factories travel here, which is the part that cannot be delegated
// because a bundle is served per Loader row.
//
// Mounting is GATED on the host's own report. A component whose host half is not
// really up (its package is missing, its row was disabled, its start failed) has no
// routes behind it, so drawing its buttons would offer an action that cannot work -
// the exact failure this package exists to prevent. So the gate asks
// /api/dsh-session-studio/status first and mounts only what that answer calls
// mounted; a host that cannot answer at all is treated as "unknown" and every
// factory is mounted, which is the pre-gate behaviour.
//
// One surface is added on top: the Settings -> Plugins -> Session Studio page, which
// lists each component's live state. That is where a reader sees which of the five
// are actually reachable, instead of guessing.
window.__ModuleLoader__.load({
  id: 'dsh-session-studio',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const react = require('react')

    /** Plugin identity; also the locale namespace. */
    const NS = 'dsh-session-studio'

    /** Keep in sync with package.json and src/components.js. */
    const PLUGIN_VERSION = '0.1.0'

    /** Presence marker the live verifier reads. */
    const DEBUG_KEY = '__DSH_SESSION_STUDIO__'

    /** The host route this half reads. Relative on purpose: web and desktop share it. */
    const STATUS_ROUTE = '/api/dsh-session-studio/status'

    /** The five vendored factory names, in mount order (= the manifest order). */
    const VENDORED = [
      'dsh-delete-session',
      'dsh-session-relocate',
      'dsh-session-rename-dblclick',
      'dsh-session-counts',
      'dsh-declutter',
    ]

    /**
     * Which components export a settings card this page can render.
     *
     * A component registers its card on the slot key <package>#<row id>, and the
     * row id changes inside this studio, so that registration can never match here.
     * A component that EXPORTS its card can still be reached: this table names
     * where the export lives, and the page renders THAT component function - never
     * a copy - so the two surfaces cannot drift.
     *
     * The other four keep their card only when installed standalone;
     * docs/INTEROP.md section 6 says what a component has to export to appear here.
     */
    const CONFIG_CARDS = [{ id: 'dsh-session-relocate', path: ['__settings', 'ChildrenSetting'] }]

    const h = react.createElement

    // --- copy ------------------------------------------------------------------

    const zh = {
      tab: '会话工作室',
      heading: '会话工作室',
      summaryShort: '五个会话管理组件，装一个包',
      intro:
        '删除会话、跨工作区移动、双击改名、工作区会话数、会话与侧栏收纳 —— 五件事在同一个包里，插件列表里只有这一行。每个组件都可以单独缺席：缺了哪一个，它那一块就不出现，绝不会画出一个点了没反应的按钮。',
      included: '已包含',
      components: '个组件',
      mounted: '已启用',
      installed: '已安装，未启用',
      missing: '未安装',
      reasonNotInstalled: '组件包不在本 profile 里',
      reasonRowMissing: '组件行没有被插入',
      reasonDisabled: '组件行被停用',
      reasonNotStarted: '组件行没有启动',
      reasonStartFailed: '组件行启动失败',
      reasonStopping: '组件行正在卸载',
      reasonDisposed: '组件行已销毁',
      reasonUnknown: '组件行状态未知',
      versionMismatch: '宿主半部与浏览器半部版本不一致，实装的是',
      settingsHeading: '设置',
      interopHeading: '槽位占用',
      interopIntro: '同一槽位上 id 与 order 唯一，是这个包能和别的插件共存的前提。',
      settingsNone: '这个组件没有把设置卡导出给本页；单独安装时它落在自己的插件行上。',
      loading: '读取状态…',
      failed: '状态加载失败，稍后重试。',
      retry: '重试',
    }

    const en = {
      tab: 'Session Studio',
      heading: 'Session Studio',
      summaryShort: 'Five session plugins, one install',
      intro:
        'Delete a session, move it across workspaces, rename it by double-click, count sessions per workspace, and tidy both the sidebar and the conversation - five jobs in one package, one row in the plugin list. Any component may be absent: whatever is missing simply does not appear, and no button is ever drawn that cannot work.',
      included: 'Includes',
      components: 'components',
      mounted: 'Enabled',
      installed: 'Installed, not enabled',
      missing: 'Not installed',
      reasonNotInstalled: 'the component package is not in this profile',
      reasonRowMissing: 'the component row was never inserted',
      reasonDisabled: 'the component row is disabled',
      reasonNotStarted: 'the component row never started',
      reasonStartFailed: 'the component row failed to start',
      reasonStopping: 'the component row is unloading',
      reasonDisposed: 'the component row was disposed',
      reasonUnknown: 'the component row state is unknown',
      versionMismatch: 'the host half and the browser half differ; installed',
      settingsHeading: 'Settings',
      interopHeading: 'Slot allocation',
      interopIntro: 'One id and one order per slot is what lets this package coexist with every other plugin.',
      settingsNone: 'This component does not export its settings card; installed standalone it lands on its own plugin row.',
      loading: 'Reading state…',
      failed: 'Could not read the state. Try again in a moment.',
      retry: 'Retry',
    }

    /** The component table, generated by tools/build.mjs from src/components.js. */
    const MANIFEST = __MANIFEST__

    /** The interop allocation, generated the same way. */
    const INTEROP = __INTEROP__

    // --- styles ----------------------------------------------------------------

    const STYLE = [
      '.dsss-wrap{display:flex;flex-direction:column;gap:10px;font-size:13px;line-height:1.5}',
      '.dsss-lead{color:var(--dsw-alias-label-secondary);margin:0}',
      '.dsss-count{font-weight:600;margin:0}',
      '.dsss-row{display:flex;flex-direction:column;gap:2px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px}',
      '.dsss-title{font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.dsss-code{font-size:11px;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}',
      '.dsss-pitch{color:var(--dsw-alias-label-secondary);margin:0}',
      '.dsss-badge{font-size:11px;padding:1px 6px;border-radius:999px;border:1px solid transparent;white-space:nowrap}',
      '.dsss-badgeOk{color:#0a7c42;border-color:#0a7c4233;background:#0a7c421a}',
      '.dsss-badgeOff{color:#8a5a00;border-color:#8a5a0033;background:#8a5a001a}',
      '.dsss-badgeNone{color:var(--dsw-alias-label-tertiary);border-color:var(--dsw-alias-border-l2)}',
      '.dsss-why{color:#8a5a00;font-size:12px;margin:0}',
      '.dsss-warn{color:#b3261e;font-size:12px;margin:0}',
      '.dsss-sub{font-weight:600;margin:6px 0 0}',
      '.dsss-foot{color:var(--dsw-alias-label-tertiary);font-size:12px;margin:0}',
      '.dsss-btn{font:inherit;padding:2px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;cursor:pointer;align-self:flex-start}',
      '.dsss-slots{display:grid;grid-template-columns:1fr auto;gap:2px 12px;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}',
    ].join('')

    function injectStyles() {
      if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return
      if (document.querySelector('style[data-dsh-session-studio]') !== null) return
      const style = document.createElement('style')
      style.setAttribute('data-dsh-session-studio', '')
      style.textContent = STYLE
      document.head.appendChild(style)
    }

    function removeStyles() {
      if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return
      const style = document.querySelector('style[data-dsh-session-studio]')
      if (style !== null && style.parentNode !== null) style.parentNode.removeChild(style)
    }

    // --- mounting the vendored halves -------------------------------------------

    function vendoredFactory(id) {
      // tools/build.mjs declares VENDORED_TABLE with the five stitched factories;
      // running this file on its own (its own unit tests) has none, and mounts
      // nothing, which is exactly the "nothing vendored" case.
      if (typeof VENDORED_TABLE === 'undefined') return null
      const factory = VENDORED_TABLE[id]
      return typeof factory === 'function' ? factory : null
    }

    function vendoredModule(id) {
      const factory = vendoredFactory(id)
      if (factory === null) return null
      return factory(require)
    }

    function applyVendored(ctx, id) {
      try {
        const plugin = vendoredModule(id)
        if (typeof plugin !== 'object' || plugin === null || typeof plugin.apply !== 'function') {
          console.error('[' + NS + '] vendored ' + id + ' has no apply()', plugin)
          return false
        }
        plugin.apply(ctx)
        return true
      } catch (error) {
        console.error('[' + NS + '] vendored ' + id + ' failed to apply:', error)
        return false
      }
    }

    /**
     * The settings card a vendored component exports, or null.
     *
     * Read from the component's own module namespace: the factory runs once per
     * read here (it is cheap - it only builds the module object), and the function
     * returned is the component's own, so its state, storage keys and copy are the
     * ones its own page uses.
     */
    function vendoredConfigCard(id) {
      const entry = CONFIG_CARDS.filter((candidate) => candidate.id === id)[0]
      if (entry === undefined) return null
      try {
        const plugin = vendoredModule(id)
        if (plugin === null || plugin === undefined) return null
        let value = plugin
        for (let index = 0; index < entry.path.length; index += 1) {
          value = value === null || value === undefined ? undefined : value[entry.path[index]]
        }
        return typeof value === 'function' ? value : null
      } catch (error) {
        console.error('[' + NS + '] vendored ' + id + ' settings card could not be read:', error)
        return null
      }
    }

    function stateOf(component) {
      if (component.hostMounted === true) return 'mounted'
      if (component.installed === true) return 'installed'
      return 'missing'
    }

    /**
     * Whether one component of a status payload is worth drawing: exactly the
     * components the page reports as enabled. The gate and the page therefore
     * cannot disagree - "the status says it is up" and "we mounted it" are the
     * same predicate, in one place.
     */
    function shouldMount(component) {
      return stateOf(component) === 'mounted'
    }

    /**
     * The vendored ids a status payload allows, in mount order.
     *
     * A component the payload does not mention stays off: the host half that
     * generated the payload is the only authority on what is running, and a bundle
     * newer than the host must not draw what the host never mounted.
     */
    function mountableComponents(payload) {
      if (payload === null || payload === undefined) return VENDORED.slice()
      const reported = {}
      for (const component of payload.components) {
        if (component !== null && typeof component === 'object' && typeof component.id === 'string') reported[component.id] = component
      }
      return VENDORED.filter((id) => {
        const component = reported[id]
        return component !== undefined && shouldMount(component)
      })
    }

    /**
     * Read the host's status document once.
     *
     * Every failure reads as "unknown" rather than "nothing is running": a host
     * that cannot answer has said nothing about the components, and guessing "down"
     * would blank the whole UI for a host that is merely busy.
     */
    function readStatus() {
      if (typeof fetch !== 'function') return Promise.resolve(null)
      let pending
      try {
        pending = fetch(STATUS_ROUTE, { headers: { accept: 'application/json' } })
      } catch (error) {
        return Promise.resolve(null)
      }
      return Promise.resolve(pending)
        .then((response) => response.json())
        .then((body) => (body !== null && body !== undefined && body.ok === true && Array.isArray(body.components) ? body : null))
        .catch(() => null)
    }

    /**
     * Mount the vendored browser halves named by the gate, in mount order.
     * @returns which ones mounted, by id; gated-off ones are false.
     */
    function mountComponents(ctx, ids) {
      const mounted = {}
      const gate = Array.isArray(ids) ? ids : VENDORED.slice()
      for (const id of VENDORED) mounted[id] = gate.indexOf(id) === -1 ? false : applyVendored(ctx, id)
      globalThis[DEBUG_KEY] = { version: PLUGIN_VERSION, mounted, gate: gate.slice(), route: STATUS_ROUTE }
      return mounted
    }

    async function mountLiveComponents(ctx) {
      const payload = await readStatus()
      return mountComponents(ctx, mountableComponents(payload))
    }

    // --- the studio page --------------------------------------------------------

    function stateLabel(t, state) {
      if (state === 'mounted') return t('mounted')
      if (state === 'installed') return t('installed')
      return t('missing')
    }

    function reasonText(t, component) {
      if (component.hostMounted === true) return null
      const key = {
        'not-installed': 'reasonNotInstalled',
        'row-missing': 'reasonRowMissing',
        disabled: 'reasonDisabled',
        'not-started': 'reasonNotStarted',
        'start-failed': 'reasonStartFailed',
        stopping: 'reasonStopping',
        disposed: 'reasonDisposed',
      }[component.hostReason]
      return key === undefined ? t('reasonUnknown') : t(key)
    }

    function copyFor(copy, key) {
      const value = copy[key]
      if (value === null || value === undefined) return ''
      return typeof value === 'string' ? value : String(value)
    }

    function renderRow(component, copy, t, locale) {
      const state = stateOf(component)
      const badgeClass =
        state === 'mounted' ? 'dsss-badge dsss-badgeOk' : state === 'installed' ? 'dsss-badge dsss-badgeOff' : 'dsss-badge dsss-badgeNone'
      const title = copyFor(copy.title, locale) || copyFor(copy.title, 'zh')
      const pitch = copyFor(copy.pitch, locale) || copyFor(copy.pitch, 'zh')
      const children = [
        h('div', { className: 'dsss-title', key: 'title' }, [
          h('span', { key: 'name' }, title),
          h('span', { className: badgeClass, key: 'badge' }, stateLabel(t, state)),
          h('span', { className: 'dsss-code', key: 'pkg' }, copy.package),
          component.version === null || component.version === undefined ? null : h('span', { className: 'dsss-code', key: 'ver' }, 'v' + component.version),
        ]),
        h('p', { className: 'dsss-pitch', key: 'pitch' }, pitch),
      ]
      const why = reasonText(t, component)
      if (why !== null) children.push(h('p', { className: 'dsss-why', key: 'why' }, why))
      if (component.versionMatch === false) {
        children.push(h('p', { className: 'dsss-warn', key: 'mismatch' }, t('versionMismatch') + ' ' + String(component.installedVersion)))
      }
      return h('div', { className: 'dsss-row', key: component.id }, children)
    }

    function renderSlots(t) {
      const cells = []
      for (const slot of INTEROP.slots) {
        const who = (slot.id === undefined ? slot.key : slot.id) + (slot.order === undefined ? '' : ' @' + slot.order)
        cells.push(h('span', { key: 's' + cells.length }, slot.name))
        cells.push(h('span', { key: 'v' + cells.length }, who))
      }
      return h('div', { key: 'interop' }, [
        h('p', { className: 'dsss-sub', key: 'title' }, t('interopHeading')),
        h('p', { className: 'dsss-foot', key: 'intro' }, t('interopIntro')),
        h('div', { className: 'dsss-slots', key: 'grid' }, cells),
      ])
    }

    /** The studio page. Set by apply() so the panel never reaches for a global. */
    let studioCtx = null

    function currentLocale() {
      try {
        const snapshot = studioCtx.locale.getLocale()
        const active = snapshot && snapshot.active ? snapshot.active : null
        if (active === null || active === undefined) return 'zh'
        const id = typeof active === 'string' ? active : String(active.id || '')
        return id.toLowerCase().indexOf('en') === 0 ? 'en' : 'zh'
      } catch (error) {
        return 'zh'
      }
    }

    function StudioPanel({ view: slotView, t }) {
      // plugins.row.config asks twice: once for the row's one-liner and once for
      // the page. The one-liner must not fetch - it renders on every plugin row
      // paint - so it is the static description, and the page carries the live
      // state and the settings.
      if (slotView === 'summary') return h('span', null, t('summaryShort'))
      const [request, setRequest] = react.useState(0)
      const [view, setView] = react.useState({ status: 'loading' })

      react.useEffect(() => {
        let live = true
        setView({ status: 'loading' })
        readStatus().then((payload) => {
          if (!live) return
          if (payload === null) setView({ status: 'failed' })
          else setView({ status: 'ready', payload })
        })
        return () => {
          live = false
        }
      }, [request])

      const locale = currentLocale()
      const body = [h('p', { className: 'dsss-lead', key: 'intro' }, t('intro'))]
      if (view.status === 'loading') body.push(h('p', { className: 'dsss-foot', key: 'loading' }, t('loading')))
      if (view.status === 'failed') {
        body.push(h('p', { className: 'dsss-warn', key: 'failed' }, t('failed')))
        body.push(h('button', { className: 'dsss-btn', key: 'retry', onClick: () => setRequest(request + 1) }, t('retry')))
      }
      if (view.status === 'ready') {
        const payload = view.payload
        const reported = {}
        for (const component of payload.components) reported[component.id] = component
        body.push(
          h('p', { className: 'dsss-count', key: 'count' }, t('included') + ' ' + payload.summary.mounted + ' / ' + payload.summary.total + ' ' + t('components')),
        )
        for (const component of MANIFEST) {
          const entry = reported[component.id]
          if (entry !== undefined) body.push(renderRow(entry, component, t, locale))
        }
      }
      body.push(h('p', { className: 'dsss-sub', key: 'settingsTitle' }, t('settingsHeading')))
      let cards = 0
      for (const component of MANIFEST) {
        const Card = vendoredConfigCard(component.id)
        if (Card === null) continue
        cards += 1
        body.push(h(Card, { key: 'card-' + component.id, view: 'full', t }))
      }
      if (cards === 0) body.push(h('p', { className: 'dsss-foot', key: 'noSettings' }, t('settingsNone')))
      body.push(renderSlots(t))
      return h('div', { className: 'dsss-wrap' }, body)
    }

    // --- plugin -----------------------------------------------------------------

    function apply(ctx) {
      studioCtx = ctx
      injectStyles()
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), NS + ': dictionaries')

      const t = ctx.locale.bind(NS)

      // The row's configure control, keyed the way the plugin manager dispatches
      // it: <package name>#<row id>. This package's own row is the bare package
      // name (see cordis.patch.yml), so the key is the package name twice.
      ctx.slots.inject('plugins.row.config', () =>
        ctx.slots.register({ name: 'plugins.row.config', key: NS + '#' + NS, locale: NS }, StudioPanel),
      )

      ctx.effect(
        () => () => {
          delete globalThis[DEBUG_KEY]
          removeStyles()
        },
        NS + ': lifecycle',
      )

      // The components mount last, and the gate is a network read: this package's
      // own page is registered above so a host that never answers delays the
      // components, never the page that reports on them. Awaiting it is what makes
      // the marker (and this plugin's fiber) mean "the gate has settled".
      return mountLiveComponents(ctx)
    }

    exports.apply = apply
    exports.inject = ['slots', 'locale']
    exports.PLUGIN_VERSION = PLUGIN_VERSION
    exports.NS = NS
    exports.STATUS_ROUTE = STATUS_ROUTE
    exports.StudioPanel = StudioPanel
    exports.stateOf = stateOf
    exports.shouldMount = shouldMount
    exports.mountableComponents = mountableComponents
    exports.mountComponents = mountComponents
    exports.mountLiveComponents = mountLiveComponents
    exports.vendoredConfigCard = vendoredConfigCard
    exports.applyVendored = applyVendored
    exports.MANIFEST = MANIFEST
    exports.INTEROP = INTEROP
    exports.VENDORED = VENDORED
    exports.zh = zh
    exports.en = en
    return module.exports
  },
})