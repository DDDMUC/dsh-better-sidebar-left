# CHANGELOG

## 0.1.0

首个版本。把五个「会话管理类」插件合并成一个聚合包，插件列表里只出现一行。

- 组件（全部从 **GitHub 仓库的本地检出** vendor，不从 npm 取）：
  `dsh-delete-session` 0.5.0、`dsh-session-relocate` 0.3.1、`dsh-session-rename-dblclick` 0.1.0、
  `dsh-session-counts` 0.0.3、`dsh-declutter` 0.2.0。
  每个的上游 commit 钉在 `package.json` 的 `dsh.vendorSources`，`npm run verify:manifest` 离线核对。
- 单一行身份：`cordis.patch.yml` 插 1 行裸包名 + 5 行 `dsh-session-studio/<后缀>`；
  插件列表按包身份去重，所以五个组件不各自成行。
- 浏览器半部逐字节 vendor；宿主半部不复制，由组件行 `import` 真实包 ——
  这样组件缺席时它那一行真的会失败、`/status` 报 `hostMounted: false`，对应按钮不出现。
- `GET /api/dsh-session-studio/status`：每个组件装没装、什么版本、那一行是不是真的活着
  （读 Loader 行 fiber），并报 `versionMatch`（宿主半部与浏览器半部是否同版）。
- 设置页：插件列表里本包那一行的配置页显示五个组件的实时状态与槽位占用表；
  能导出设置卡的组件（本版只有 relocate 的「连同子对话」）在那里直接渲染它自己的卡。
- 已知冲突：`dsh-declutter` 0.2.0 的侧栏半部与独立插件 `dsh-sidebar-declutter` 0.3.3
  是同一份代码（同 `STORE_KEY`、同 `data-dsh-sidebar-declutter`、同两个 slot id）。
  两者同时启用会重复注册同一个 slot 身份，启用本包时请停用独立的 `dsh-sidebar-declutter`。

### 与本机部件的编号差异（记录，不是兼容问题）

`dsh-declutter` 的 npm 历史曾经和仓库不一致：`0.1.2` / `0.1.3` 只有**侧栏半部**
（`src/index.js` 是 98 字节空壳）。`0.2.0`（两半合一 + 命名会话修复）已于 2026-11-21
发布到 npm，`latest` 指向它；但本包的取源仍然按 GitHub commit 钉住，理由与另外四个一致：
commit 是可复现的，dist-tag 不是。