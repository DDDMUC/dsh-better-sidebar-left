// dsh-better-sidebar-left - the component manifest.
//
// One table, read by the host half, the browser half and the tests. It is the
// single place that knows which plugins this plugin composes, and the only place
// that has to change when a component is added or retired.
//
// A component is always an independent package with its own repo, its own
// cordis.patch.yml and its own working UI when installed alone. This file does
// not vendor, wrap or re-implement any of them: it names them, and the bundle
// patch enables the rows that mount them.
//
// Each component is mounted by ONE row of the bundle patch, named
// \`<this package>/<suffix>\` (see rowNameOf below) with the component package in
// its config.plugin; src/shell.js is the file every one of those names resolves
// to, and it imports the REAL package - the host half is never copied.
//
// "optional" is the honest word for a component: this plugin boots with any
// subset of them present (none, one, ... five), because every row the patch
// inserts fails in isolation when its package is missing - one entry reports the
// missing module, every other entry still starts (see @cordisjs/plugin-loader:
// Entry#_init catches the import error and returns).

/** This package. Kept in sync with package.json and the client half. */
export const PLUGIN_ID = 'dsh-better-sidebar-left'

/** Keep in sync with package.json and src/sidebar.js. */
export const PLUGIN_VERSION = '0.2.1'

/**
 * The five components, in the order the user meets them in the sidebar.
 *
 * \`slot\` records every slot registration the component owns. It is
 * documentation and an assertion source (test/manifest.test.js proves the
 * allocation is unique; test/combination.test.js proves the running code claims
 * exactly this), never a runtime dependency: each component registers itself.
 *
 * \`routes\` are the loopback routes the component's HOST half serves. They are
 * listed because two components sharing a route path is a hard collision that no
 * test could see from the client side.
 *
 * \`dom\` names the DOM this component owns. \`allocated\` is the namespace this
 * plugin reserves for it (the interop table in docs/INTEROP.md section 2);
 * \`prefixes\` are the actual attribute/class prefixes the vendored code uses,
 * which are NOT renamed - I7 (feature freeze) outranks house style, and for
 * dsh-declutter they are load-bearing twice over (\`data-dsh-sidebar-declutter\`
 * is the style attribute its own self-check and the user's saved settings both
 * key on).
 *
 * \`suffix\` is the bundle-patch row that mounts the component: the row is named
 * \`<this package>/<suffix>\`. Two properties ride on that name, and both are
 * load-bearing (docs/INTEROP.md section 11):
 *
 *   - the plugin list is a deduplicated set of package identities, and a subpath
 *     of this package resolves to this package's identity, so five extra rows
 *     still cost exactly zero extra list rows;
 *   - the client-module scanner accepts only an exact package specifier, so a
 *     subpath row never becomes a second browser source for the component - its
 *     browser half keeps travelling inside this package's bundle.
 */
export const COMPONENTS = [
  {
    id: 'dsh-delete-session',
    package: 'dsh-delete-session',
    suffix: 'delete',
    feature: 'delete',
    kind: 'action',
    repo: 'https://github.com/DDDMUC/dsh-delete-session',
    title: { zh: '删除会话', en: 'Delete a session' },
    pitch: {
      zh: '在侧栏会话行的「…」菜单里删掉一个或多个会话：先出一张风险清单（日志、工作区文件、隔离目录），确认后才动手；也能开一个多选底栏批量删。',
      en: 'Delete one or several sessions from the sidebar row menu: a risk list (log, workspace files, quarantine folder) is shown first and nothing is touched until it is confirmed. A multi-select footer bar handles batches.',
    },
    slots: [
      { name: 'sidebar.workspaces.session.menu.item', id: 'dsh-delete-session-multi', order: 409 },
      { name: 'sidebar.workspaces.session.menu.item', id: 'dsh-delete-session', order: 410 },
      { name: 'shell.overlay', id: 'dsh-delete-session-dialog' },
      { name: 'shell.overlay', id: 'dsh-delete-session-picker', order: 1 },
      { name: 'shell.overlay', id: 'dsh-delete-session-batchplan', order: 2 },
      { name: 'sidebar.footer.action', id: 'dsh-delete-session-bulkbar', order: 30 },
      { name: 'plugins.bundle.config', key: 'dsh-delete-session' },
      { name: 'plugins.row.config', key: 'dsh-delete-session#dsh-delete-session' },
    ],
    routes: [
      'POST /dsh-delete-session/artifacts',
      'POST /dsh-delete-session/delete',
      'POST /dsh-delete-session/delete-many',
      'POST /dsh-delete-session/delete-file',
      'POST /dsh-delete-session/browse',
      'POST /dsh-delete-session/children',
      'POST /dsh-delete-session/pick',
      'POST /dsh-delete-session/reveal',
    ],
    hostInject: [],
    dom: { allocated: 'dsds', prefixes: ['data-dsh-delete-session', 'dsdel-'] },
  },
  {
    id: 'dsh-session-relocate',
    package: 'dsh-session-relocate',
    suffix: 'relocate',
    feature: 'move',
    kind: 'action',
    repo: 'https://github.com/DDDMUC/dsh-session-relocate',
    title: { zh: '跨工作区移动', en: 'Move across workspaces' },
    pitch: {
      zh: '把会话搬到另一个工作区：会话行「…」菜单里的「移动到」、右键菜单的「移出工作区」，以及直接把会话行拖到目标工作区；迁移走崩溃可恢复的事务，打开中但空闲的会话也能搬。',
      en: 'Move a session into another workspace: "move to" in the session row menu, "move out" in the right-click menu, or by dragging the session row onto the target workspace. The move is a crash-recoverable transaction, and an open-but-idle session can be moved too.',
    },
    slots: [
      { name: 'conversation.input.dock', id: 'session-relocate-workspace', order: 10 },
      { name: 'sidebar.footer.action', id: 'session-relocate-bulkbar', order: 40 },
      { name: 'sidebar.workspaces.session.menu.item', id: 'session-relocate-bulk', order: 351 },
      { name: 'plugins.row.config', id: 'session-relocate-children-row-0', order: 100, key: 'dsh-session-relocate#session-relocate' },
      { name: 'plugins.row.config', id: 'session-relocate-children-row-1', order: 100, key: 'dsh-session-relocate#dsh-session-relocate' },
      { name: 'plugins.bundle.config', id: 'session-relocate-children-bundle', order: 100, key: 'dsh-session-relocate' },
      // 0.3.x additionally offers "move out" from the right-click menu.
      { name: 'contextMenu.icon', key: 'session-relocate.move' },
    ],
    contextMenus: [{ id: 'session-relocate.move-out-menu', target: 'session', order: 550 }],
    childSlots: [{ name: 'session-relocate.dock', kind: 'list', scope: 'session' }],
    routes: [
      'POST /api/dsh-session-relocate/describe',
      'POST /api/dsh-session-relocate/move',
      'POST /api/dsh-session-relocate/move-out',
      'POST /api/dsh-session-relocate/move-commit',
      'GET|POST /api/dsh-session-relocate/status',
    ],
    hostInject: ['workspaceRegistry', 'sessionPersistence'],
    dom: { allocated: 'dssr', prefixes: ['data-dshsm', 'data-dshsm-toast', 'dshsm-'] },
  },
  {
    id: 'dsh-session-rename-dblclick',
    package: 'dsh-session-rename-dblclick',
    suffix: 'rename',
    feature: 'rename',
    kind: 'action',
    repo: 'https://github.com/DDDMUC/dsh-session-rename-dblclick',
    title: { zh: '双击改名', en: 'Double-click to rename' },
    pitch: {
      zh: '双击会话标题就地改名 —— 侧栏行和顶栏面包屑两个位置都能改，Enter 存 / Esc 取消；改的是标题，不碰会话日志。',
      en: 'Rename a session in place by double-clicking its title - in the sidebar row and in the header breadcrumb alike. Enter saves, Esc cancels, and only the title is touched.',
    },
    slots: [],
    routes: ['POST /dsh-session-rename/rename'],
    hostInject: [],
    dom: { allocated: 'dssn', prefixes: ['data-dsh-session-rename'] },
  },
  {
    id: 'dsh-session-counts',
    package: 'dsh-session-counts',
    suffix: 'counts',
    feature: 'count',
    kind: 'decor',
    repo: 'https://github.com/DDDMUC/dsh-session-counts',
    title: { zh: '工作区会话数', en: 'Per-workspace counts' },
    pitch: {
      zh: '每个工作区行尾显示会话数，表头显示总数；口径跟随「已归档」筛选，空行和子会话不计。宿主半部是空壳，整件事都在浏览器里做。',
      en: 'A count at the end of every workspace row and a total next to the section label. The ratio follows the archived filter, and blank rows or subagent children are never counted. The host half is an empty shell: the whole thing is view-side.',
    },
    slots: [
      { name: 'shell.overlay', id: 'session-counts', order: 50 },
      { name: 'plugins.row.config', key: 'dsh-session-counts#session-counts' },
      { name: 'plugins.row.config', key: '@local/dsh-session-counts#session-counts' },
    ],
    routes: [],
    hostInject: [],
    dom: { allocated: 'dssc', prefixes: ['data-dsh-count', 'data-dsh-total', 'data-dsh-session-counts'] },
  },
  {
    id: 'dsh-declutter',
    package: 'dsh-declutter',
    suffix: 'declutter',
    feature: 'declutter',
    kind: 'maintenance',
    repo: 'https://github.com/DDDMUC/dsh-declutter',
    title: { zh: '收纳与整理', en: 'Declutter' },
    pitch: {
      zh: '两半合一：①会话内收纳 —— 失败轮、空轮、编辑产生的合成轮按规则表收起，只加 data-dshdc-* 视图属性，完全可逆，绝不改日志；②侧栏整理 —— 藏品牌行/「新会话」/「更多」/顶部空隙，面板显隐与排序。',
      en: 'Two halves in one: (1) in-conversation collapsing - failed, empty and synthesised turns fold away per a rule table, using data-dshdc-* view attributes only, fully reversible, never touching the log; (2) sidebar tidying - hides the brand row, the New session button, the More buttons and the top gap, plus panel visibility and order.',
    },
    slots: [
      { name: 'conversation.input.overlay', id: 'declutter', order: 90 },
      { name: 'sidebar.footer.action', id: 'sidebar-declutter-collapse', order: 10 },
      { name: 'sidebar.panellist', id: 'hide-rows', order: 20 },
      { name: 'main', key: 'hide-rows' },
      { name: 'plugins.row.config', key: 'dsh-declutter#dsh-declutter' },
    ],
    routes: ['GET /dsh-declutter/state', 'POST /dsh-declutter/report'],
    hostInject: [],
    dom: {
      allocated: 'dshdc',
      prefixes: ['data-dshdc-rule', 'data-dshdc-turn', 'data-dshdc-toggle', 'data-dshdc-badge', 'data-dshdc-collapsed', 'data-dsh-sidebar-declutter'],
    },
  },
]

/** Component ids, in manifest order. */
export const COMPONENT_IDS = COMPONENTS.map((component) => component.id)

/**
 * The bundle-patch row that mounts one component, in this package's namespace.
 * @param component - a manifest entry.
 * @returns the Loader row name, e.g. 'dsh-better-sidebar-left/counts'.
 */
export function rowNameOf(component) {
  return PLUGIN_ID + '/' + component.suffix
}

/** Every component row name, in manifest order. */
export const COMPONENT_ROW_NAMES = COMPONENTS.map(rowNameOf)

/**
 * The interop contract this plugin verifies (docs/INTEROP.md sections 2-4).
 *
 * \`slots\` is the flattened allocation: every registration the five components
 * make, with the slot it claims and the identity it claims it under. Two
 * components may share a slot (a slot is a seat with many seats), but never the
 * same id, and never the same order on a slot that orders by it.
 *
 * \`externalClaims\` is the one collision that is NOT inside this package:
 * dsh-declutter 0.2.0 ships the sidebar half of dsh-sidebar-declutter 0.3.3
 * verbatim (98.3% of its lines are byte-identical; the same STORE_KEY, the same
 * data-dsh-sidebar-declutter attribute, the same two slot ids). Both mounted at
 * once is the same code running twice over the same DOM, so this plugin documents
 * the pair rather than silently allowing it.
 *
 * \`settingsCards\` records which components export a settings card this plugin can
 * render. A component registers its card under \`<package>#<row id>\`, and the row
 * id changes inside this plugin, so that registration can never match here - the
 * card has to be exported and rendered by this plugin instead. A component that
 * does not export one keeps its card only when installed standalone.
 */
export const INTEROP = {
  slots: COMPONENTS.flatMap((component) =>
    component.slots.map((slot) => ({ component: component.id, ...slot })),
  ),
  externalClaims: [
    {
      component: 'dsh-declutter',
      conflictsWith: 'dsh-sidebar-declutter',
      slotIds: ['sidebar-declutter-collapse', 'hide-rows'],
      storageKeys: ['dsh-sidebar-declutter', 'dsh-hide-new-session', 'dsh-sidebar-declutter.menu'],
      resolution: 'disable the standalone dsh-sidebar-declutter bundle while this plugin is enabled',
    },
  ],
  settingsCards: [
    { component: 'dsh-session-relocate', exportPath: '__settings.ChildrenSetting', label: { zh: '连同子对话', en: 'Include child conversations' } },
  ],
  /** This plugin's own registrations: one row config seat, nothing else. */
  pluginSlots: [{ name: 'plugins.row.config', key: PLUGIN_ID + '#' + PLUGIN_ID }],
}