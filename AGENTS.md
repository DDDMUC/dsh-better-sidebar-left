# AGENTS.md - dsh-better-sidebar-left

本仓库是聚合插件 **dsh-better-sidebar-left** 的唯一正本，**自包含**：插件列表里只有它一行。

## 架构

```
cordis.patch.yml    插 6 行：本包自己（裸包名）+ 五条 dsh-better-sidebar-left/<后缀> 组件行
src/components.js   唯一 manifest：身份 / 槽位 / 路由 / DOM 归属
src/index.js        宿主半侧：/api/dsh-better-sidebar-left/status（读 Loader 行 fiber）
src/shell.js        组件行的壳：读 config.plugin，挂 src/vendor/host/<id>.js
src/sidebar.js       本包自己的浏览器半侧（源，注册 id dsh-better-sidebar-left）
src/vendor/*.js     五个组件的浏览器半部，由 tools/vendor.mjs 逐字剥离生成，DO NOT EDIT
src/client.js       生成的单一大 bundle：本包浏览器半部 + 五个 vendored factory，DO NOT EDIT
src/vendor/host/    GENERATED：五个组件的宿主半部（含被搬过来的相对模块）
```

三条不变量（改之前先读懂，测试都在盯）：

1. **只有一条 profile 行。** 插件列表是「活跃 Loader 行背后的包身份（name+version）去重集合」，
   `dsh-better-sidebar-left/counts` 这类子路径用 `barePackageName()` 解析回本包，所以多五条行
   **不多占列表行**。行名一旦写成组件自己的包名（`dsh-session-counts`），列表立刻多一行。
2. **组件行的 name 必须是本包子路径。** 客户端模块扫描器只认精确包说明符，子路径会被跳过、
   且被缓存成「不是客户端包」——所以组件行永远不会变成第二份浏览器源。只有本包那一行（裸包名）
   带 `./client`，那份 bundle 里装着五个 factory。
3. **两半都 vendor，宿主半侧不许回流。** `src/shell.js` 挂 `src/vendor/host/<id>.js`，不 import
   组件包 —— 这就是「装一个包就够」的实现方式。反过来说：本包的主机半侧**不许**再 `ctx.plugin`
   挂一遍组件（同进程挂两遍、路由必冲突）；`/status` 的 hostMounted 只从 `ctx.loader.entries()`
   的行 fiber 读（docs/INTEROP.md §5、§11-D）。

## 源从哪来

**全部来自 GitHub 仓库的本地检出**，不从 npm registry 取。五个组件分别在
`../dsh-better-sidebar-left-src/components/<包名>/`，各是一个 git 仓库，基线提交记着对应的上游
commit；`package.json` 的 `dsh.vendorSources` 是这张表的正本，`npm run verify:manifest`
（离线）核对「声明 = 检出 = vendored 版本」三者一致。

| 改了 | 要跑 |
| --- | --- |
| 组件仓库（五个检出） | `npm run vendor && npm run build` |
| `src/sidebar.js` | `node tools/build.mjs` |
| `src/index.js` / `src/shell.js` / `src/components.js` / `cordis.patch.yml` / `package.json` | 不用重建，重启宿主即生效 |
| `tools/vendor.mjs` | `npm run vendor && node tools/build.mjs`（宿主半部也在它生成） |

只想重建 bundle 时**别**用 `npm run build`：它会先从 GitHub 检出重取 vendor 副本。

## 固定流程

```sh
npm run vendor          # 重新生成 src/vendor/（从 GitHub 检出逐字复制）
node tools/build.mjs    # 重新生成 src/client.js
npm run verify:vendor && npm run verify:build   # 只读校验，过期就 exit 1
npm run check           # verify:manifest + build + test，全绿才往下走
npm run bump 0.2.0      # 三处版本号一起动
```

## 协作规则

- **组件是独立正本**：修组件去组件仓库（并推 GitHub），别在这边改 `src/vendor/`。
- 不要删 `test/combination.test.js` 的任何断言 —— 它把**真正跑起来的**五个浏览器半部与
  `docs/INTEROP.md` §2 的槽位表逐条对齐，是架构变更时唯一的连续性保障。
- 不要替用户重启 / 发布（npm）/ force-push，除非用户明确要求。
- 已知外部冲突：`dsh-declutter` 0.2.0 的侧栏半部与 `dsh-sidebar-declutter` 0.3.3 是同一份代码，
  启用本包时要停用后者（docs/INTEROP.md §7）。
