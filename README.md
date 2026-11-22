# dsh-better-sidebar-left

五个会话管理插件，装一个包。**插件列表里只多一行**，五个功能全部保留。

> 名字只承诺**左侧栏**：删会话、跨工作区搬会话、双击改名、数会话数，都发生在侧栏。
> 但 `dsh-declutter` 的「会话内收纳」收的是**对话里**的失败轮 / 空轮 / 编辑产生的合成轮 ——
> 那一半不在左侧栏，名字里没有它，功能里有。

| 组件 | 你得到什么 |
|---|---|
| `dsh-delete-session` 0.5.0 | 侧栏会话行「…」菜单里的**删除会话**：先给风险清单（日志 / 工作区文件 / 隔离目录），确认后才动手；另有批量多选底栏 |
| `dsh-session-relocate` 0.3.1 | **跨工作区移动**：会话行「…」菜单、右键菜单、直接把会话行拖到目标工作区；崩溃可恢复的事务，打开中但空闲的会话也能搬 |
| `dsh-session-rename-dblclick` 0.2.9 | **就地改名**：顶栏标题单击、侧栏行双击；胶囊尺寸/配色照官方标题（40px、22px 圆角、悬停描边、聚焦品牌色），Enter 存 / Esc 取消 |
| `dsh-session-counts` 0.0.3 | **工作区会话数**：每行行尾显示计数，表头显示总数，口径跟随「已归档」筛选 |
| `dsh-declutter` 0.2.0 | **收纳与整理**：会话内失败轮/空轮/合成轮按规则表收起（只加视图属性，可逆，不改日志）+ 侧栏藏品牌行 /「新会话」/「更多」/顶部空隙，面板显隐与排序 |

## 安装

```sh
npm i dsh-better-sidebar-left
```

然后把 `dsh-better-sidebar-left` 加进 profile 的 `dsh.profile.bundles`。组件**不需要**单独安装成本
包 —— 但它们的宿主半部要能从 profile 里被解析到（见下面「缺一个会怎样」）。

开发时指向本地检出：

```sh
node tools/link-local.mjs --profile ~/.dsh/profiles/desktop --dry-run
node tools/link-local.mjs --profile ~/.dsh/profiles/desktop
```

## 每个组件一个开关

`cordis.patch.yml` 一共插 6 行：本包自己一行（裸包名），加上五行
`dsh-better-sidebar-left/<后缀>`。**包列表只有一行，但行列表里有六行**，所以每个组件都能在插件
管理里单独停用 —— 停用 `dsh-better-sidebar-left/declutter` 就只少收纳，其余四个照常。

## 缺一个会怎样

## 只装一个就够

五个组件的**两半都在本包里**：浏览器半部在 `src/vendor/*.js`，宿主半部在
`src/vendor/host/*.js`，都由 `tools/vendor.mjs` 逐字节生成并盖版本戳。所以 profile 里只要装
`dsh-better-sidebar-left` **一个包** —— 那五个组件包不用装，装了也不影响本包跑哪份代码
（本包跑的是自己 vendor 的那份）。

代价说清楚（这是与「组件行 import 真实包」那种做法的取舍，见 `docs/INTEROP.md` §11）：

- 组件仓库修了 bug，要 `npm run vendor && npm run build` 再发一版本包，才会进到这里；
- 移走组件包**不会**让功能消失（代码本来就在包里），所以「卸载组件 ⇒ 那块功能退场」在
  这种架构下不成立；
- 但五个组件行仍然可以**单独停用**：插件列表里本包一行，行列表里有六行，停用
  `dsh-better-sidebar-left/declutter` 就只少收纳，其余四个照常。这才是这里的「独立开关」。

## 和独立安装的关系

五个组件单独装依然是完整可用的插件。**但不要同时启用同一个功能的两个来源**：

- 装本包时，把 `dsh-delete-session` / `dsh-session-relocate` / `dsh-declutter` 从
  `dsh.profile.bundles` 里去掉（否则同一进程里挂两遍，路由 / slot 必然撞）；
- **特别注意** `dsh-sidebar-declutter`：`dsh-declutter` 0.2.0 的侧栏半部与它 0.3.3 是同一份
  代码（逐行 98.3% 相同，同 `STORE_KEY = 'dsh-sidebar-declutter'`、同
  `data-dsh-sidebar-declutter`、同 slot id `sidebar-declutter-collapse` 与 `hide-rows`）。
  两个都开就是同一份代码跑两遍、两个 MutationObserver 抢同一批行。启用本包时请停用它。

## 状态路由

```sh
curl -s http://127.0.0.1:<port>/api/dsh-better-sidebar-left/status | jq .summary
```

只回答一个问题：每个组件装没装、跑的是哪一版、它那一行**是不是真的活着**。
读的是 `ctx.loader.entries()` 与行 fiber 自己的状态，不是插件自报的「我挂上了」。
`version` 是**浏览器半部**（本包 vendor 的那份）的版本，`installedVersion` 是 profile 里装的
宿主半部版本，`versionMatch: false` 说明两边错版 —— 只会被报出来，不会被悄悄修补。

还有两个字段专门拆「磁盘上是哪一版」和「进程里跑的是哪一版」：`hostLoaded` 表示这一行在这个进程里
有没有挂过，`hostStale` 表示**内存里那份的哈希和磁盘上现在这份不一样**（`null` = 那个进程还没挂过它）。
`summary.stale` 是这类组件的个数。vendored 文件改了不会自我重载，这个字段就是为它准备的 ——
非 0 就说明宿主该重启了。

## 开发

```sh
npm run check          # verify:manifest + build + test
npm run verify:vendor  # src/vendor/ 是否与组件源码一致（只读）
npm run verify:build   # src/client.js 是否与 src/sidebar.js + src/vendor/ 一致（只读）
npm test               # 只跑测试
npm run bump 0.2.0     # 三处版本号一起动
```

`src/client.js` 与 `src/vendor/*.js` 都是 **GENERATED**，手改会被下一次 `npm run build` 覆盖，
`test/sync.test.js` 也会先失败。改组件请去组件仓库，改本包自己的逻辑改 `src/sidebar.js`。

vendor 的源是 **GitHub 仓库的本地检出**：`../dsh-better-sidebar-left-src/components/<包名>/`，
每个都是一个 git 仓库，基线提交里记着它对应 GitHub 上的哪个 commit（默认路径，可用
`--workspace` 覆盖）。它**不会**读你工作区里那些正在开发的组件工作树。

`npm run verify:manifest` 因此是**离线**的：不查 npm registry，只核对「声明了哪个仓库/哪个
commit/哪个版本」与「本地那份检出是不是真的干净地停在那个 commit 上」，再和
`src/vendor/versions.json` 对一遍。要换组件版本，流程是：从 GitHub 拉那个 commit → 更新
`package.json` 的 `dsh.vendorSources` → `npm run vendor` → `npm run check`。

## 目录

```
cordis.patch.yml     1 自身行 + 5 组件行（机制 A/B 的注释在文件里）
src/components.js    唯一 manifest：五个组件的身份、槽位、路由、DOM 归属
src/index.js         宿主半部：/api/dsh-better-sidebar-left/status + importComponent
src/shell.js         组件行挂载器：读 config.plugin，挂 `src/vendor/host/<id>.js`
src/sidebar.js        自身浏览器半部（源）
src/client.js        GENERATED：plugin + 五个 vendored factory 的一个 bundle
src/vendor/*.js      GENERATED：五个组件的浏览器半部
src/vendor/host/     GENERATED：五个组件的宿主半部（含相对模块）
tools/vendor.mjs     逐字节生成 src/vendor/（--check）
tools/build.mjs      合成 src/client.js（--check）
docs/INTEROP.md      铁律、槽位表、缺席与隐藏归因、自包含架构
test/                10 个测试文件
```

## 许可

MIT。五个组件的版权归各自仓库。
