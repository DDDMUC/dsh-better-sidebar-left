# INTEROP - 五个会话组件共存的契约

> 这份文档是**契约**，不是说明。改代码前先读；改契约先改这里，再改 `src/components.js`，
> `test/interop.test.js` 会拿本文件的 §2 表去对 manifest，两边对不上就红。

## 0. 参与方

本包聚合五个独立插件。每一个都有各自的仓库、各自的 `cordis.patch.yml`，单独装也是完整可用的插件。

| 组件 | 类型 | 仓库 | 装载行后缀 |
|---|---|---|---|
| `dsh-delete-session` | action | DDDMUC/dsh-delete-session | `delete` |
| `dsh-session-relocate` | action | DDDMUC/dsh-session-relocate | `relocate` |
| `dsh-session-rename-dblclick` | action | DDDMUC/dsh-session-rename-dblclick | `rename` |
| `dsh-session-counts` | decor | DDDMUC/dsh-session-counts | `counts` |
| `dsh-declutter` | maintenance | DDDMUC/dsh-declutter | `declutter` |

插件列表里只有本包一行（`dsh-better-sidebar-left` 0.2.2）。五个组件的装载行是
`dsh-better-sidebar-left/<后缀>`，见 §11 的机制 A / B。

## 1. 铁律

**I1 零硬依赖** —— 组件之间不得互相 import。兄弟协作一律「运行时探测 + 缺席优雅退场」。
本包自身也没有运行时依赖：浏览器半部 vendor 在包内，宿主半部从 profile 里的组件包 import。

**I2 唯一身份** —— 每个 `ctx.slots.register` 用自己的 id，同一 slot 上 order 全平台唯一。
§2 是全表。顺序调整要改的是组件自己的代码，不是这张表。

**I3 只动自己的 DOM** —— 自建节点必带自己的 `data-*` 前缀（§2 的「DOM 归属」列），
不删/改/移别人的节点，不假设自己是唯一或最后一个子节点，注入必须幂等。

**I4 隐藏归因** —— 只有设置了**自己归属属性**的插件才有资格清 `row.style.display`；
恢复前必须确认别的归属属性都不在。见 §4。

**I5 缺席的兄弟不是错误** —— 探测失败走缺席分支：不报错、不弹提示、不 `console.error` 刷屏。

**I6 web / desktop 同构** —— 客户端不依赖 web profile 专有全局量；宿主路由走相对路径；
loopback 校验留在宿主侧。

**I7 功能冻结** —— 合并只做「原样搬运 + 加固」，不改任何既有交互语义：按钮文案、点击序列、
确认步骤、路由契约、日志文案、DOM 前缀，全都保持原样。这也是为什么 §2 里记的 DOM 前缀是
组件**实际使用**的那些，而不是本包另行分配的名字。

**I8 自己那半侧自洽** —— `npm test` 全绿，`npm run verify:vendor` / `npm run verify:build` 在干净
工作区通过。

**I9 版本与文档同步** —— `src/vendor/versions.json` 钉住每个组件版本；README 中英各一份；
本文件的 §0 与 §2 跟着 manifest 走。

## 2. 槽位占用表

来源：`src/components.js` 的 `COMPONENTS[*].slots`，由 `test/manifest.test.js` 保证内部唯一，
由 `test/combination.test.js` 拿**真正跑起来的**浏览器半部逐条核对。

| 组件 | 槽位 | 身份 | order |
|---|---|---|---|
| `dsh-delete-session` | `sidebar.workspaces.session.menu.item` | `id: dsh-delete-session-multi` | 409 |
| `dsh-delete-session` | `sidebar.workspaces.session.menu.item` | `id: dsh-delete-session` | 410 |
| `dsh-delete-session` | `shell.overlay` | `id: dsh-delete-session-dialog` | — |
| `dsh-delete-session` | `shell.overlay` | `id: dsh-delete-session-picker` | 1 |
| `dsh-delete-session` | `shell.overlay` | `id: dsh-delete-session-batchplan` | 2 |
| `dsh-delete-session` | `sidebar.footer.action` | `id: dsh-delete-session-bulkbar` | 30 |
| `dsh-delete-session` | `plugins.bundle.config` | `key: dsh-delete-session` | — |
| `dsh-delete-session` | `plugins.row.config` | `key: dsh-delete-session#dsh-delete-session` | — |
| `dsh-session-relocate` | `conversation.input.dock` | `id: session-relocate-workspace` | 10 |
| `dsh-session-relocate` | `sidebar.footer.action` | `id: session-relocate-bulkbar` | 40 |
| `dsh-session-relocate` | `sidebar.workspaces.session.menu.item` | `id: session-relocate-bulk` | 351 |
| `dsh-session-relocate` | `plugins.row.config` | `id: session-relocate-children-row-0` | 100 |
| `dsh-session-relocate` | `plugins.row.config` | `id: session-relocate-children-row-1` | 100 |
| `dsh-session-relocate` | `plugins.bundle.config` | `id: session-relocate-children-bundle` | 100 |
| `dsh-session-relocate` | `contextMenu.icon` | `key: session-relocate.move` | — |
| `dsh-session-counts` | `shell.overlay` | `id: session-counts` | 50 |
| `dsh-session-counts` | `plugins.row.config` | `key: dsh-session-counts#session-counts` | — |
| `dsh-session-counts` | `plugins.row.config` | `key: @local/dsh-session-counts#session-counts` | — |
| `dsh-declutter` | `conversation.input.overlay` | `id: declutter` | 90 |
| `dsh-declutter` | `sidebar.footer.action` | `id: sidebar-declutter-collapse` | 10 |
| `dsh-declutter` | `sidebar.panellist` | `id: hide-rows` | 20 |
| `dsh-declutter` | `main` | `key: hide-rows` | — |
| `dsh-declutter` | `plugins.row.config` | `key: dsh-declutter#dsh-declutter` | — |

本包自己的注册只有一条：`plugins.row.config` / `key: dsh-better-sidebar-left#dsh-better-sidebar-left`。

### 2.1 DOM 归属

组件不改名，所以「分配」列是本包文档用的名字，「实际」列是代码里真正在用的前缀 ——
两列都是可 grep 的，`test/manifest.test.js` 只保证 §2 表与 manifest 一致，前缀以代码为准。

| 组件 | 分配 | 实际前缀 |
|---|---|---|
| `dsh-delete-session` | `dsds` | `data-dsh-delete-session`、`dsdel-` |
| `dsh-session-relocate` | `dssr` | `data-dshsm`、`data-dshsm-toast`、`dshsm-` |
| `dsh-session-rename-dblclick` | `dssn` | `data-dsh-session-rename` |
| `dsh-session-counts` | `dssc` | `data-dsh-count`、`data-dsh-total`、`data-dsh-session-counts` |
| `dsh-declutter` | `dshdc`（**不改**） | `data-dshdc-*`、`data-dsh-sidebar-declutter` |
| 本包 | `dbsl` | `data-dsh-better-sidebar-left`、`.dbsl-*` |

`dsh-declutter` 的三样东西是 load-bearing，一个字符都不能改：
`data-dsh-sidebar-declutter` 是它自检与样式锚点用的属性、
`STORE_KEY = 'dsh-sidebar-declutter'` 是你已保存的侧栏设置、
`data-dshdc-*` 是它收起/展开的状态位。改前缀等于废掉自检和用户设置。

## 3. 兄弟探测：缺席就是缺席，不是错误

组件之间不 import，只探测。探测的三种结果分开处理：

| 结果 | 含义 | 行为 |
|---|---|---|
| 有结果 | 兄弟的宿主路由答了 | 用它的能力 |
| 明确缺席 | 404 / 未注册 | 走缺席分支：不渲染对应 UI，不报错（I5） |
| 探测本身失败 | 网络错、宿主没起来 | **不等于缺席**，按「未知」处理，别据此清空界面 |

本包自己也守这条：`/api/dsh-better-sidebar-left/status` 答不上来时，浏览器半部把五个组件**全挂上**
（未知 ≠ 全都没起来）；只有状态路由**明确说**某个组件 `hostMounted: false`，才不挂它。
这样不会因为一次网络抖动把整条界面刷没。

## 4. 隐藏归因

侧栏会话行是宿主渲染的，多个插件都想藏它的一部分。规则：

1. 只给自己要藏的节点写**自己的**归属属性（如 `data-dshdc-rule`），不写别人的；
2. 清 `style.display` 之前，确认没有任何其它归属属性还立着 ——
   否则会把别人的隐藏一起放开；
3. 恢复是幂等的：连续调用两次与一次结果相同；
4. 不接管宿主自己的 `hidden` / `aria-hidden`，那是宿主的。

五个组件里只有 `dsh-declutter` 的侧栏半部会碰行显示；它用的是
`data-dsh-sidebar-declutter` 一族属性，且它的样式表**只**以这些属性为选择器前提。

## 5. 缺席：现在什么才算缺席

本包**两半都 vendor**（浏览器半部 `src/vendor/*.js`，宿主半部 `src/vendor/host/*.js`），
所以「组件包没装」不再是缺席 —— 运行时根本不碰组件包。能让一块功能消失的只有三件事：

1. 本包没装 / 被禁用 → 六行都不存在，五个功能一起消失（这是整体回滚）；
2. 某条组件行被停用（`dsh-better-sidebar-left/<后缀>`）→ 只有那一块消失，其余四个照常；
3. 行在但没起来（vendored 文件损坏、组件 `apply` 抛错）→ 该行 fiber 变 failed，`/status` 报
   `hostMounted: false` + 原因，浏览器半部据此**不挂载**它那一半。

第 3 条是「不允许出现『按钮在、点了没反应』」的落点。**移走组件包不在上表里**：代码已经在
包内，移走它什么也不会发生（`/status` 里 `installed` 会变 false，`versionMatch` 变 null，仅此而已）。
## 6. 设置卡：为什么有的组件设置不见了

组件把设置卡注册在槽位 key `<包名>#<行 id>` 上。聚合之后行 id 变成
`dsh-better-sidebar-left-<后缀>`，那个 key 永远不会被匹配 —— 所以这些卡**不会**出现在本包行上。

能恢复的原因是：组件把自己的卡**导出**给本包渲染（渲染的是组件自己的函数，不是复制品，
所以两边不会漂移）。当前只有 relocate 导出了（`__settings.ChildrenSetting`），由本包设置页直接渲染；
其余四个的卡只在单独安装时可见。要让某个组件的卡回到本页，组件侧加一行导出，
再在 `src/sidebar.js` 的 `CONFIG_CARDS` 表里登记即可。

| 组件 | 设置卡 | 聚合后可见 |
|---|---|---|
| `dsh-session-relocate` | `__settings.ChildrenSetting`（连同子对话、chip 形态） | ✅ 本包设置页 |
| `dsh-delete-session` | `AskBeforeDeleteOption`（删除前确认） | ⚠ 需组件导出 |
| `dsh-session-counts` | `CountsModeCard`（计数口径） | ⚠ 需组件导出 |
| `dsh-declutter` | `SettingsCard`（规则开关 / 侧栏各项） | ⚠ 需组件导出；但它的侧栏面板入口走
  `sidebar.panellist` + `main` 槽位，**不依赖行 id**，所以侧栏整理的面板仍然可达 |
| `dsh-session-rename-dblclick` | 无 | — |

## 7. 已知外部冲突：`dsh-declutter` ↔ `dsh-sidebar-declutter`

`dsh-declutter` 0.2.0 把 `dsh-sidebar-declutter` 0.3.3 的侧栏半部**原样搬了进来**：
1591 条非空行里 1564 条逐字相同（98.3%），同 `STORE_KEY`、同 `LEGACY_STORE_KEY`、
同 `MENU_STORE_KEY`、同 `STYLE_ATTR`，也注册同样的两个 slot 身份：

- `sidebar.footer.action` / `id: sidebar-declutter-collapse` / order 10
- `sidebar.panellist` / `id: hide-rows` / order 20

两者同时启用 = 同一份代码跑两遍：slot 身份撞车（I2）+ 两套 MutationObserver 观察同一批行。
**启用本包时请把独立的 `dsh-sidebar-declutter` 从 `dsh.profile.bundles` 里去掉。**
这不是本包能替你做决定的（组件是独立正本），所以这里只记录冲突与解法，不改任何一边的代码。

## 11. 自包含架构：六个机制

### A 单一行身份
`cordis.patch.yml` 里自身那一行用**裸包名** `dsh-better-sidebar-left`。客户端模块扫描器只接受精确包名
说明符，会去解析 `<name>/package.json` 找 `dsh.client`；子路径会被缓存成「不是 client 包」，
浏览器半部永久静默不加载。

### B 组件行用子路径名
每组件一行 `dsh-better-sidebar-left/<后缀>`，`config.plugin` 指组件包名。两条性质都是 load-bearing：
插件列表是去重的**包身份**集合，本包子路径解析回本包身份 → 五条额外行在列表里成本 0 行；
扫描器对子路径说明符判否 → 组件浏览器半部不会被当成第二个入口。

### C 浏览器半部逐字节生成
`tools/vendor.mjs` 只做一处机械变换：组件把 factory 注册给 `window.__ModuleLoader__.load({id, factory})`，
聚合包里改成 default export 同一个 factory 体，**花括号里一个字节都不动**。五种 factory 写法
（`(require) =>`、`function (require)`、`()`、`forward(require)` 简写、带/不带结尾分号）都显式处理，
形状不匹配就 `exit 3`。`--check` 只验证不写盘，`test/sync.test.js` 用它保证不漂移。

### D 两半都 vendor，所以「装一个就够」
`src/shell.js` 挂的是 `src/vendor/host/<id>.js`，不是组件包 —— profile 里只要本包一个，五个组件包
不必安装。这是与「组件行 import 真实包」的取舍：

- 收益：真正的一次安装；组件包缺失不影响功能；零运行时依赖；
- 代价：组件修复要 `npm run vendor && npm run build` + 重发版本；「卸载组件 ⇒ 功能退场」
  在这种架构下不成立（要靠停用组件行，见 §5）；组件自报的版本号由 vendor 时钉死
  （`createRequire(import.meta.url)('../package.json').version` 被替换成字面量，否则那份拷贝
  旁边没有 package.json，只会答 `0.0.0-unknown`）。

`tools/vendor.mjs` 对宿主半部只做三处机械改写：相对模块改名搬运、版本钉死、平台包一律拒绝
（今天五个宿主半部都不 import `@deepseek-ai/*`，哪天 import 了，构建会在这里失败而不是生成一份
在运行时解析出第二个 `dsh-session` 实例的拷贝）。其余逐字节复制。

### E 缺席不致命
一条组件行启动失败只影响它自己：Loader 报错、其它四行照常启动、`/status` 报
`hostMounted: false` + 原因；浏览器半部据此把对应按钮/装饰关掉。
**不允许出现「按钮在、点了没反应」**。
### F 状态路由只回答那一个问题
`GET /api/dsh-better-sidebar-left/status`：每个组件装没装、什么版本、它那一行**是不是真的活着** ——
从 `ctx.loader.entries()` 和行 fiber 自己的状态读，不读自己记的「我挂上了」的乐观记录。
`version` 是浏览器半部的版本（本包 vendor 的那份），`installedVersion` 是 profile 里宿主半部的版本，
`hostLoaded` / `hostStale` 回答的是另一件事：**这个进程里跑的是不是磁盘上那份**。vendored 文件改了不会
自我重载（ESM 按 URL 缓存），所以「包升级了但宿主没重启」是完全可能的：`hostStale: true` 就是它，
`summary.stale` 数出有几个。`null` 表示那一行在这个进程里没挂过，未知不等于过期。

`versionMatch: false` 只被报出来，不会被悄悄修补 —— 注意它**不是故障**：跑的是 vendor 那份，
profile 里另装一份不同版本对本包没有影响（那份若作为独立插件启用，反而会和本包重复挂载）。

### G 服务注入要取并集
组件是跑在**本插件自己的 ctx** 上的（一个 bundle 只能注册一次），所以组件声明要用的 cordis 服务
必须在本包的 `exports.inject` 里一起声明 —— 否则它会在一个缺服务的 ctx 上执行 apply()，
注册到一半抛错，功能半残。`dsh-session-relocate` 声明 `['slots', 'contextMenus']` 且无条件调用
`ctx.contextMenus.register()`，这就是它曾经单独不生效的原因。

`src/sidebar.js` 的 `SERVICES` 是这张并集表；`test/sidebar.test.js` 逐个组件读它自己的 `inject`
并断言被 `SERVICES` 覆盖。加组件时先跑那条测试。

### 版本错配的判定
两侧都可能落后：profile 里的组件包（宿主半部）与本包 vendor 的浏览器半部。`versions.json` 记的是
后者。两者不等时 `/status` 报 `versionMatch: false`，设置页用红字写出来 —— 因为「半部对半部」的
错配是唯一一种测试看不出来、但用户一定会撞上的故障。